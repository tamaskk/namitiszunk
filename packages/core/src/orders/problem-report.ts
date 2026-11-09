import "server-only";

import {
  Bar,
  Order,
  type OrderStatus,
  type ProblemCategory,
  Venue,
} from "@namitiszunk/db";

import type { Actor } from "../auth/permissions";
import { AppError, NotFoundError } from "../errors";
import { formatShortNumber, requireShortNumber } from "./short-number";

type GuestActor = Extract<Actor, { kind: "guest" }>;

/** At most this many problem reports per order (T-046); the fourth answers 429. */
export const PROBLEM_REPORT_LIMIT = 3;

export type ProblemReportInput = {
  category: ProblemCategory;
  message?: string;
  email?: string;
};

/**
 * Stores a guest's problem report on their paid order (T-046). The limit is part of the update's
 * filter, so parallel requests can never store a fourth. Returns the report's index for the mail job.
 */
export async function reportProblem(
  actor: GuestActor,
  orderId: string,
  input: ProblemReportInput,
  now = new Date(),
): Promise<{ index: number }> {
  const order = await Order.findById(orderId)
    .select("paidAt problemReports +guestTokenHash")
    .lean();
  // Not theirs, or never paid (nothing to complain about yet): the same 404.
  if (
    !order ||
    actor.guestId === "" ||
    order.guestTokenHash !== actor.guestId ||
    !order.paidAt
  )
    throw new NotFoundError();

  const updated = await Order.findOneAndUpdate(
    {
      _id: order._id,
      $expr: {
        $lt: [
          { $size: { $ifNull: ["$problemReports", []] } },
          PROBLEM_REPORT_LIMIT,
        ],
      },
    },
    {
      $push: {
        problemReports: {
          category: input.category,
          ...(input.message ? { message: input.message } : {}),
          ...(input.email ? { email: input.email } : {}),
          createdAt: now,
        },
      },
    },
    { returnDocument: "after", projection: { problemReports: 1 } },
  ).lean();
  if (!updated) throw new AppError(429, "problem_report_limit");
  return { index: (updated.problemReports?.length ?? 1) - 1 };
}

export type ProblemReportMail = {
  template: "problemReport";
  to: string;
  data: {
    locale: "hu";
    venueName: string;
    barName: string;
    shortNumber: string;
    status: OrderStatus;
    totalHuf: number;
    category: ProblemCategory;
    message: string;
    guestEmail?: string;
    adminUrl: string;
    platformEmail: string;
  };
};

/**
 * The mails for one stored report: to the venue's contact address when it has one, and always to the
 * platform, so a missing or stale venue address never loses a report.
 */
export async function problemReportMails(
  orderId: string,
  index: number,
  links: { platformEmail: string; adminOrder: (orderId: string) => string },
): Promise<ProblemReportMail[]> {
  const order = await Order.findById(orderId)
    .select("venueId barId shortNumber status totalHuf problemReports")
    .lean();
  const report = order?.problemReports?.[index];
  if (!order || !report)
    throw new Error(`order ${orderId} has no problem report ${index}`);
  const [venue, bar] = await Promise.all([
    Venue.findById(order.venueId).select("name contactEmail").lean(),
    Bar.findById(order.barId).select("name").lean(),
  ]);
  const data: ProblemReportMail["data"] = {
    // Both readers are Hungarian in the pilot.
    locale: "hu",
    venueName: venue?.name ?? "",
    barName: bar?.name ?? "",
    shortNumber: formatShortNumber(requireShortNumber(order.shortNumber)),
    status: order.status,
    totalHuf: order.totalHuf,
    category: report.category,
    message: report.message ?? "",
    ...(report.email ? { guestEmail: report.email } : {}),
    adminUrl: links.adminOrder(orderId),
    platformEmail: links.platformEmail,
  };
  const recipients = [venue?.contactEmail, links.platformEmail].filter(
    (to): to is string => Boolean(to),
  );
  return [...new Set(recipients)].map((to) => ({
    template: "problemReport",
    to,
    data,
  }));
}

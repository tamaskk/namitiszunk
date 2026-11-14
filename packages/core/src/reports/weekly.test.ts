import {
  Bar,
  connectDb,
  Order,
  Payment,
  Refund,
  User,
  Venue,
  VenueMember,
} from "@namitiszunk/db";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Types } from "mongoose";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { Actor } from "../auth/permissions";
import { summarizeOrders } from "./aggregations";
import {
  getWeeklyReport,
  lastWeek,
  setWeeklyReport,
  weeklyReportMail,
  weeklyReportRecipients,
  weeklyReportClosesAt,
  weeklyReportVenues,
} from "./weekly";

vi.mock("server-only", () => ({}));

let replSet: MongoMemoryReplSet;
let mongoose: Awaited<ReturnType<typeof connectDb>>;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose = await connectDb(replSet.getUri("namitiszunk_weekly_test"));
  await Promise.all(
    [Venue, Bar, Order, Payment, Refund, User, VenueMember].map((m) =>
      m.createCollection(),
    ),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany()),
  );
});

// Monday 2026-11-16 09:00 in Budapest (UTC+1): the job reports Monday 9 to Sunday 15 November.
const MONDAY_9AM = new Date("2026-11-16T08:00:00Z");
const WEEK = { from: "2026-11-09", to: "2026-11-15" };
const BEFORE = { from: "2026-11-02", to: "2026-11-08" };
const links = {
  period: (week: { from: string }, before: { from: string }) =>
    `https://admin.test/reports/period?from=${week.from}&cfrom=${before.from}`,
  daily: (date: string) => `https://admin.test/reports?date=${date}`,
};

let shortNumber = 0;

async function seed() {
  const venueId = new Types.ObjectId();
  await Venue.create({
    _id: venueId,
    slug: `club-${venueId}`,
    name: "Club",
    status: "active",
  });
  const bar = await Bar.create({ venueId, name: "Főpult" });
  const user = async (email: string | undefined, locale: "hu" | "en") =>
    (await User.create({ email, locale }))._id;
  const member = async (
    role: "owner" | "manager" | "bartender",
    displayName: string,
    fields: {
      userId?: Types.ObjectId;
      weeklyReport?: boolean;
      isActive?: boolean;
    },
  ) => VenueMember.create({ venueId, role, displayName, ...fields });
  const order = (businessDate: string, totalHuf: number, name = "Sör") => {
    shortNumber += 1;
    return Order.create({
      venueId,
      barId: bar._id,
      shortNumber,
      businessDate,
      status: "picked_up",
      items: [
        {
          itemId: new Types.ObjectId(),
          name,
          quantity: 1,
          unitPriceHuf: totalHuf,
          lineTotalHuf: totalHuf,
        },
      ],
      subtotalHuf: totalHuf,
      tipHuf: 0,
      totalHuf,
      pickupCode: "K7Q",
      guestTokenHash: new Types.ObjectId().toHexString(),
      acceptedTermsVersion: "draft-2026-11",
      paidAt: new Date(`${businessDate}T21:00:00Z`),
    });
  };
  return { venueId: String(venueId), user, member, order };
}

const userActor = (
  venueId: string,
  member: { _id: Types.ObjectId; userId?: Types.ObjectId | null },
  role: "owner" | "manager" | "bartender",
): Actor => ({
  kind: "user",
  userId: String(member.userId),
  memberships: [{ venueId, memberId: String(member._id), role }],
});

describe("lastWeek", () => {
  it("is Monday to Sunday of the calendar week before, whatever day it is now", () => {
    expect(lastWeek("2026-11-16")).toEqual(WEEK);
    expect(lastWeek("2026-11-22")).toEqual(WEEK);
    expect(lastWeek("2026-11-15")).toEqual(BEFORE);
  });
});

describe("weeklyReportClosesAt", () => {
  it("is nothing once Sunday's business day closed, and Monday at the start of the day before that", async () => {
    const early = await seed();
    const late = await seed();
    await Venue.updateOne({ _id: late.venueId }, { businessDayStart: "10:00" });

    const closed = await weeklyReportClosesAt(early.venueId, MONDAY_9AM);
    const open = await weeklyReportClosesAt(late.venueId, MONDAY_9AM);

    expect(closed).toBeNull();
    // Monday 10:00 in Budapest.
    expect(open).toBe("2026-11-16T09:00:00.000Z");
  });
});

/** Every subscribed recipient's mail, as the job builds them one by one. */
async function mailsOf(venueId: string, now = MONDAY_9AM) {
  const ids = await weeklyReportRecipients(venueId, now);
  const mails = await Promise.all(
    ids.map((id) => weeklyReportMail(venueId, now, id, links)),
  );
  return { ids, mails: mails.filter((m) => m !== null) };
}

describe("the weekly report mails", () => {
  it("mail last week's figures, the change and the top products to subscribed owners and managers", async () => {
    const s = await seed();
    const anna = await s.user("anna@test.hu", "hu");
    await s.member("owner", "Anna", { userId: anna });
    await s.member("manager", "Péter", {
      userId: await s.user("peter@test.hu", "hu"),
    });
    await s.member("manager", "Kata", {
      userId: await s.user("kata@test.hu", "en"),
      weeklyReport: true,
    });
    await s.member("owner", "Gábor", {
      userId: await s.user("gabor@test.hu", "hu"),
      weeklyReport: false,
    });
    await s.member("owner", "Régi", {
      userId: await s.user("regi@test.hu", "hu"),
      isActive: false,
    });
    await s.member("owner", "Nincs cím", {
      userId: await s.user(undefined, "hu"),
    });
    await s.member("bartender", "Bence", { weeklyReport: true });
    await s.order("2026-11-09", 1200);
    await s.order("2026-11-15", 3000, "Mojito");
    await s.order("2026-11-16", 9900);
    await s.order("2026-11-06", 2000);

    const { ids, mails } = await mailsOf(s.venueId);

    expect(ids).toHaveLength(3);
    expect(mails.map((m) => [m.to, m.data.locale]).sort()).toEqual([
      ["anna@test.hu", "hu"],
      ["kata@test.hu", "en"],
    ]);
    const owner = mails.find((m) => m.to === "anna@test.hu")!;
    const manager = mails.find((m) => m.to === "kata@test.hu")!;
    expect(owner.data).toMatchObject({
      venueName: "Club",
      ...WEEK,
      current: { orders: 2, revenueHuf: 4200, avgBasketHuf: 2100 },
      previous: { orders: 1, revenueHuf: 2000 },
      change: { orders: 100, revenueHuf: 110, avgPrepSeconds: null },
      products: [
        { name: "Mojito", quantity: 1, revenueHuf: 3000 },
        { name: "Sör", quantity: 1, revenueHuf: 1200 },
      ],
      url: links.period(WEEK, BEFORE),
    });
    expect(manager.data.url).toBe(links.daily(WEEK.to));
    expect(owner.idempotencyKey).toBe(
      `weekly-report:${s.venueId}:${WEEK.from}:${String(anna)}`,
    );
    expect(await summarizeOrders(s.venueId, WEEK)).toMatchObject(
      owner.data.current,
    );
  });

  it("go to nobody after a week without orders", async () => {
    const s = await seed();
    await s.member("owner", "Anna", {
      userId: await s.user("anna@test.hu", "hu"),
    });
    await s.order("2026-11-06", 2000);

    const { ids } = await mailsOf(s.venueId);

    expect(ids).toEqual([]);
  });

  it("skip a member who switched it off after the list was made", async () => {
    const s = await seed();
    const anna = await s.user("anna@test.hu", "hu");
    const owner = await s.member("owner", "Anna", { userId: anna });
    await s.order("2026-11-10", 1500);
    const [id] = await weeklyReportRecipients(s.venueId, MONDAY_9AM);
    await VenueMember.updateOne({ _id: owner._id }, { weeklyReport: false });

    const mail = await weeklyReportMail(s.venueId, MONDAY_9AM, id!, links);

    expect(mail).toBeNull();
  });

  it("report the calendar week that ended, also when built before Monday's business day starts", async () => {
    const s = await seed();
    await s.member("owner", "Anna", {
      userId: await s.user("anna@test.hu", "hu"),
    });
    await s.order("2026-11-15", 1500);

    // Monday 05:00 in Budapest: Sunday's business day (starts 06:00) is still open.
    const { mails } = await mailsOf(
      s.venueId,
      new Date("2026-11-16T04:00:00Z"),
    );

    expect(mails[0]?.data).toMatchObject({ ...WEEK, current: { orders: 1 } });
  });
});

describe("weeklyReportVenues", () => {
  it("lists only active venues", async () => {
    const s = await seed();
    await Venue.create({ slug: "draft-club", name: "Draft", status: "draft" });

    const venues = await weeklyReportVenues();

    expect(venues).toEqual([s.venueId]);
  });
});

describe("the weekly report switch", () => {
  it("is on for an owner and off for a manager until they change their own", async () => {
    const s = await seed();
    const owner = await s.member("owner", "Anna", {
      userId: await s.user("a@test.hu", "hu"),
    });
    const manager = await s.member("manager", "Péter", {
      userId: await s.user("p@test.hu", "hu"),
    });
    const asOwner = userActor(s.venueId, owner, "owner");
    const asManager = userActor(s.venueId, manager, "manager");

    const before = [
      await getWeeklyReport(asOwner, s.venueId),
      await getWeeklyReport(asManager, s.venueId),
    ];
    await setWeeklyReport(asOwner, s.venueId, false);
    await setWeeklyReport(asManager, s.venueId, true);
    const after = [
      await getWeeklyReport(asOwner, s.venueId),
      await getWeeklyReport(asManager, s.venueId),
    ];

    expect(before).toEqual([true, false]);
    expect(after).toEqual([false, true]);
  });

  it("is not offered to a bartender, a tablet or another venue's member", async () => {
    const s = await seed();
    const other = await seed();
    const bartender = await s.member("bartender", "Bence", {});
    const owner = await other.member("owner", "Anna", {
      userId: await other.user("a@test.hu", "hu"),
    });
    const tablet: Actor = {
      kind: "staff",
      venueId: s.venueId,
      memberId: String(bartender._id),
      role: "bartender",
    };
    const outsider = userActor(other.venueId, owner, "owner");

    const read = await Promise.all([
      getWeeklyReport(userActor(s.venueId, bartender, "bartender"), s.venueId),
      getWeeklyReport(tablet, s.venueId),
      getWeeklyReport(outsider, s.venueId),
    ]);
    const write = await Promise.allSettled([
      setWeeklyReport(tablet, s.venueId, true),
      setWeeklyReport(outsider, s.venueId, true),
    ]);

    expect(read).toEqual([null, null, null]);
    expect(
      write.map((r) => r.status === "rejected" && r.reason.status),
    ).toEqual([403, 403]);
  });
});

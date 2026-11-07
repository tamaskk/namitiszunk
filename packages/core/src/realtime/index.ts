import "server-only";

import { Bar, Order } from "@namitiszunk/db";
import * as Ably from "ably";

import { type Actor, can } from "../auth/permissions";
import { AppError } from "../errors";
import type { StatusChanged } from "../orders/transition";
import {
  barChannel,
  orderChannel,
  STATUS_EVENT,
  type StatusMessage,
  vipChannel,
} from "./channels";

export * from "./channels";

// The client asks for a new token (authUrl) before this runs out.
const TOKEN_TTL_MS = 60 * 60 * 1000;

let rest: Ably.Rest | undefined;

function ably(): Ably.Rest {
  const key = process.env.ABLY_API_KEY;
  if (!key) throw new Error("ABLY_API_KEY is missing");
  return (rest ??= new Ably.Rest({ key }));
}

export type TokenInput = {
  /** The venue a signed-in user opens; a staff tablet is bound to its own venue. */
  venueId?: string;
};

async function channelsFor(actor: Actor, input: TokenInput): Promise<string[]> {
  switch (actor.kind) {
    case "system":
      return [];
    case "guest": {
      // guestId is the hash of the order's guest token, unique per order.
      if (!actor.guestId) return [];
      const order = await Order.findOne({ guestTokenHash: actor.guestId })
        .select("_id")
        .lean();
      return order ? [orderChannel(String(order._id))] : [];
    }
    case "staff":
    case "user": {
      const venueId = actor.kind === "staff" ? actor.venueId : input.venueId;
      if (!venueId) return [];
      const channels = can(actor, "order.viewTakeOutList", { venueId })
        ? [vipChannel(venueId)]
        : [];
      if (can(actor, "order.start", { venueId })) {
        const bars = await Bar.find({ venueId }).select("_id").lean();
        channels.push(
          ...bars.map((bar) => barChannel(venueId, String(bar._id))),
        );
      }
      return channels;
    }
  }
}

/**
 * An Ably TokenRequest for the channels the actor may see, subscribe only: no client ever publishes.
 * Throws 403 when there is none.
 */
export async function createTokenRequest(
  actor: Actor,
  input: TokenInput = {},
): Promise<Ably.TokenRequest> {
  const channels = await channelsFor(actor, input);
  if (channels.length === 0) throw new AppError(403, "forbidden");
  const capability = Object.fromEntries(
    channels.map((channel) => [channel, ["subscribe"]]),
  );
  return ably().auth.createTokenRequest({
    capability: JSON.stringify(capability),
    ttl: TOKEN_TTL_MS,
  });
}

/** Publishes a committed status change to the order's guest channel, its bar and, for VIP, the VIP host. */
export async function publishStatusChange(
  change: Pick<
    StatusChanged,
    "orderId" | "venueId" | "barId" | "isVip" | "to" | "version"
  >,
): Promise<void> {
  const venueId = String(change.venueId);
  const message: StatusMessage = {
    orderId: String(change.orderId),
    status: change.to,
    version: change.version,
  };
  const channels = [
    orderChannel(message.orderId),
    barChannel(venueId, String(change.barId)),
    ...(change.isVip ? [vipChannel(venueId)] : []),
  ];
  const client = ably();
  await Promise.all(
    channels.map((name) =>
      client.channels.get(name).publish(STATUS_EVENT, message),
    ),
  );
}

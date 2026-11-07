import { z } from "zod";

import * as auth from "./auth";
import * as menu from "./menu";
import * as orders from "./orders";
import * as payments from "./payments";
import * as promos from "./promos";
import * as realtime from "./realtime";
import { errorResponseSchema } from "./shared";
import * as staff from "./staff";
import * as uploads from "./uploads";
import * as venues from "./venues";

export const pingResponseSchema = z.object({ pong: z.literal(true) });
export const openApiDocumentSchema = z.looseObject({ openapi: z.string() });

const components = {
  ErrorResponse: errorResponseSchema,
  CreateOrderInput: orders.createOrderInputSchema,
  CreateOrderResponse: orders.createOrderResponseSchema,
  OrderResponse: orders.orderResponseSchema,
  CategoryInput: menu.categoryInputSchema,
  ItemInput: menu.itemInputSchema,
  MenuResponse: menu.menuResponseSchema,
  VenueInput: venues.venueInputSchema,
  OrderRulesInput: venues.orderRulesInputSchema,
  BarInput: venues.barInputSchema,
  ZoneInput: venues.zoneInputSchema,
  PublicVenueResponse: venues.publicVenueResponseSchema,
  VenueListResponse: venues.venueListResponseSchema,
  StaffMemberInput: staff.staffMemberInputSchema,
  SetStaffPinInput: staff.setStaffPinInputSchema,
  StaffMemberResponse: staff.staffMemberResponseSchema,
  PromoInput: promos.promoInputSchema,
  PromoResponse: promos.promoResponseSchema,
  EmailSignInInput: auth.emailSignInInputSchema,
  EmailOtpVerifyInput: auth.emailOtpVerifyInputSchema,
  PinSignInInput: auth.pinSignInInputSchema,
  SessionUserResponse: auth.sessionUserResponseSchema,
  UploadTokenInput: uploads.uploadTokenInputSchema,
  UploadTokenResponse: uploads.uploadTokenResponseSchema,
  StripeConnectInput: payments.stripeConnectInputSchema,
  ConnectAccountResponse: payments.connectAccountResponseSchema,
  AccountLinkResponse: payments.accountLinkResponseSchema,
  RefundOrderInput: payments.refundOrderInputSchema,
  RefundResponse: payments.refundResponseSchema,
  RealtimeTokenInput: realtime.realtimeTokenInputSchema,
  RealtimeTokenResponse: realtime.realtimeTokenResponseSchema,
  PingResponse: pingResponseSchema,
  OpenApiDocument: openApiDocumentSchema,
} satisfies Record<string, z.ZodType>;

type ComponentName = keyof typeof components;

type Operation = {
  method: "get" | "post";
  path: string;
  operationId: string;
  summary: string;
  tag: string;
  request?: ComponentName;
  response: ComponentName;
  status: 200 | 201;
};

// Endpoints that exist in the spec today; every new route (T-029 onwards) adds its line here.
const operations: Operation[] = [
  {
    method: "post",
    path: "/v1/orders",
    operationId: "createOrder",
    summary: "Create an order awaiting payment and its PaymentIntent",
    tag: "orders",
    request: "CreateOrderInput",
    response: "CreateOrderResponse",
    status: 201,
  },
  {
    method: "post",
    path: "/v1/orders/{id}/refunds",
    operationId: "refundOrder",
    summary:
      "Refund a paid order in full or in part (Manager, Owner, or HQ support with write confirmation)",
    tag: "orders",
    request: "RefundOrderInput",
    response: "RefundResponse",
    status: 200,
  },
  {
    method: "get",
    path: "/v1/venues",
    operationId: "listVenues",
    summary: "List public venues",
    tag: "venues",
    response: "VenueListResponse",
    status: 200,
  },
  {
    method: "post",
    path: "/v1/stripe/connect/account",
    operationId: "createConnectAccount",
    summary: "Create the venue's Stripe Express account (Owner only)",
    tag: "payments",
    request: "StripeConnectInput",
    response: "ConnectAccountResponse",
    status: 200,
  },
  {
    method: "post",
    path: "/v1/stripe/connect/link",
    operationId: "createConnectAccountLink",
    summary:
      "Create a Stripe onboarding link back to the Admin Payouts page (Owner only)",
    tag: "payments",
    request: "StripeConnectInput",
    response: "AccountLinkResponse",
    status: 200,
  },
  {
    method: "post",
    path: "/v1/realtime/token",
    operationId: "createRealtimeToken",
    summary:
      "Sign an Ably TokenRequest that may only subscribe to the caller's channels",
    tag: "realtime",
    request: "RealtimeTokenInput",
    response: "RealtimeTokenResponse",
    status: 200,
  },
  {
    method: "get",
    path: "/v1/ping",
    operationId: "ping",
    summary: "Check that the API answers",
    tag: "meta",
    response: "PingResponse",
    status: 200,
  },
  {
    method: "get",
    path: "/v1/openapi.json",
    operationId: "getOpenApiDocument",
    summary: "This OpenAPI document",
    tag: "meta",
    response: "OpenApiDocument",
    status: 200,
  },
  {
    method: "post",
    path: "/v1/uploads",
    operationId: "createUploadToken",
    summary: "Issue a client token for one image upload to Vercel Blob",
    tag: "uploads",
    request: "UploadTokenInput",
    response: "UploadTokenResponse",
    status: 200,
  },
];

const ref = (name: ComponentName) => ({
  $ref: `#/components/schemas/${name}`,
});
const json = (name: ComponentName) => ({
  content: { "application/json": { schema: ref(name) } },
});

function buildPaths() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of operations) {
    paths[op.path] ??= {};
    paths[op.path]![op.method] = {
      operationId: op.operationId,
      summary: op.summary,
      tags: [op.tag],
      ...(op.path.includes("{id}") && {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
      }),
      // shortcut: all listed endpoints are public; T-029/T-030 add security schemes for staff routes.
      security: [],
      ...(op.request && {
        requestBody: { required: true, ...json(op.request) },
      }),
      responses: {
        [op.status]: { description: "Success", ...json(op.response) },
        400: { description: "Invalid input", ...json("ErrorResponse") },
        429: { description: "Rate limited", ...json("ErrorResponse") },
        500: { description: "Unexpected error", ...json("ErrorResponse") },
      },
    };
  }
  return paths;
}

/** OpenAPI 3.1 document from the Zod schemas; served at /v1/openapi.json (T-029). */
export function buildOpenApiDocument() {
  const registry = z.registry<{ id: string }>();
  for (const [id, schema] of Object.entries(components)) {
    registry.add(schema, { id });
  }
  const { schemas } = z.toJSONSchema(registry, {
    uri: (id) => `#/components/schemas/${id}`,
  });
  for (const schema of Object.values(schemas)) {
    // 3.1 uses the 2020-12 dialect for the whole document; a per-schema $schema is noise.
    delete schema.$schema;
    delete schema.$id;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Na, mit iszunk? API",
      version: "1.0.0",
      license: { name: "Proprietary", identifier: "LicenseRef-Proprietary" },
    },
    servers: [{ url: "https://api.namitiszunk.hu" }],
    tags: [
      { name: "orders", description: "Guest orders" },
      { name: "venues", description: "Venues" },
      { name: "meta", description: "API health and description" },
    ],
    paths: buildPaths(),
    components: { schemas },
  };
}

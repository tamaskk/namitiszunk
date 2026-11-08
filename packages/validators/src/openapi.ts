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
  QuoteOrderInput: orders.quoteOrderInputSchema,
  OrderQuoteResponse: orders.orderQuoteResponseSchema,
  OrderResponse: orders.orderResponseSchema,
  ReviewInput: orders.reviewInputSchema,
  ReviewResponse: orders.reviewResponseSchema,
  ReportProblemInput: orders.reportProblemInputSchema,
  ReportProblemResponse: orders.reportProblemResponseSchema,
  ConfirmationEmailInput: orders.confirmationEmailInputSchema,
  ConfirmationEmailResponse: orders.confirmationEmailResponseSchema,
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
  /** "staff": a signed-in admin or HQ session; adds 401, 403 and 409. "guest": the order's token in x-guest-token; adds 404 and 409. */
  auth?: "staff" | "guest";
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
    path: "/v1/orders/quote",
    operationId: "quoteOrder",
    summary:
      "Price a cart for the checkout as the order will be priced; stores nothing",
    tag: "orders",
    request: "QuoteOrderInput",
    response: "OrderQuoteResponse",
    status: 200,
  },
  {
    method: "get",
    path: "/v1/orders/{id}",
    operationId: "getOrder",
    summary:
      "The guest's view of their order; a missing or wrong guest token gives 404",
    tag: "orders",
    response: "OrderResponse",
    status: 200,
    auth: "guest",
  },
  {
    method: "post",
    path: "/v1/orders/{id}/cancel",
    operationId: "cancelOrder",
    summary:
      "The guest cancels their order before acceptance; the full amount is refunded",
    tag: "orders",
    response: "OrderResponse",
    status: 200,
    auth: "guest",
  },
  {
    method: "post",
    path: "/v1/orders/{id}/confirmation-email",
    operationId: "sendConfirmationEmail",
    summary:
      "Send the guest's payment confirmation (not a receipt) to an address, at most 3 times per order",
    tag: "orders",
    request: "ConfirmationEmailInput",
    response: "ConfirmationEmailResponse",
    status: 200,
    auth: "guest",
  },
  {
    method: "post",
    path: "/v1/orders/{id}/report",
    operationId: "reportProblem",
    summary:
      "The guest reports a problem with a paid order; mailed to the venue and the platform, at most 3 per order",
    tag: "orders",
    request: "ReportProblemInput",
    response: "ReportProblemResponse",
    status: 200,
    auth: "guest",
  },
  {
    method: "post",
    path: "/v1/orders/{id}/review",
    operationId: "reviewOrder",
    summary: "The guest rates a picked-up order with 1 to 5 stars, once",
    tag: "orders",
    request: "ReviewInput",
    response: "ReviewResponse",
    status: 200,
    auth: "guest",
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
    auth: "staff",
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
          ...(op.auth === "guest"
            ? [
                {
                  name: "x-guest-token",
                  in: "header",
                  required: true,
                  schema: { type: "string" },
                },
              ]
            : []),
        ],
      }),
      // shortcut: only the refund route declares its staff session so far; the other staff routes still list none.
      security:
        op.auth === "staff"
          ? [{ adminSession: [] }, { hqSession: [] }, { bearerAuth: [] }]
          : [],
      ...(op.request && {
        requestBody: { required: true, ...json(op.request) },
      }),
      responses: {
        [op.status]: { description: "Success", ...json(op.response) },
        400: { description: "Invalid input", ...json("ErrorResponse") },
        ...(op.auth === "staff" && {
          401: { description: "Not signed in", ...json("ErrorResponse") },
          403: { description: "Not allowed", ...json("ErrorResponse") },
          409: {
            description: "Conflicts with the current state",
            ...json("ErrorResponse"),
          },
        }),
        ...(op.auth === "guest" && {
          404: {
            description: "No such order for this token",
            ...json("ErrorResponse"),
          },
          409: {
            description: "Conflicts with the current state",
            ...json("ErrorResponse"),
          },
        }),
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
    components: {
      schemas,
      // Better Auth sessions (T-030): each web app has its own cookie; the mobile app sends a Bearer token.
      securitySchemes: {
        adminSession: {
          type: "apiKey",
          in: "cookie",
          name: "nmi-admin.session_token",
          description: "Over HTTPS the cookie carries the __Secure- prefix.",
        },
        hqSession: {
          type: "apiKey",
          in: "cookie",
          name: "nmi-hq.session_token",
          description: "Over HTTPS the cookie carries the __Secure- prefix.",
        },
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
  };
}

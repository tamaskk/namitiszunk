import { describe, expect, it } from "vitest";

import { buildOpenApiDocument } from "./openapi";

describe("buildOpenApiDocument", () => {
  it("produces a JSON-serialisable OpenAPI 3.1 document", () => {
    const document = buildOpenApiDocument();

    const roundTrip = JSON.parse(JSON.stringify(document)) as unknown;

    expect(roundTrip).toEqual(document);
    expect(document.openapi).toBe("3.1.0");
  });

  it("lists the order, venue and meta paths with schema references", () => {
    const { paths } = buildOpenApiDocument();

    const createOrder = paths["/v1/orders"]?.post as {
      requestBody: { content: Record<string, { schema: { $ref: string } }> };
    };

    expect(Object.keys(paths)).toEqual([
      "/v1/orders",
      "/v1/orders/quote",
      "/v1/orders/{id}",
      "/v1/orders/{id}/cancel",
      "/v1/orders/{id}/confirmation-email",
      "/v1/orders/{id}/report",
      "/v1/orders/{id}/review",
      "/v1/orders/{id}/refunds",
      "/v1/venues",
      "/v1/stripe/connect/account",
      "/v1/stripe/connect/link",
      "/v1/realtime/token",
      "/v1/ping",
      "/v1/openapi.json",
      "/v1/uploads",
      "/v1/orders/{id}/reorder",
      "/v1/me",
      "/v1/me/orders",
      "/v1/me/orders/claim",
      "/v1/me/orders/{id}/reorder",
      "/v1/me/export",
      "/v1/bars/{id}/orders",
      "/v1/venues/{id}/vip-orders",
      "/v1/bars/{id}/pause",
      "/v1/orders/{id}/status",
      "/v1/orders/{id}/reject",
      "/v1/orders/{id}/receipt",
      "/v1/orders/{id}/reminder",
      "/v1/orders/{id}/move",
    ]);
    expect(createOrder.requestBody.content["application/json"]?.schema).toEqual(
      { $ref: "#/components/schemas/CreateOrderInput" },
    );
  });

  it("asks the guest token header and declares 404 on the guest order routes", () => {
    const { paths } = buildOpenApiDocument();

    const getOrder = paths["/v1/orders/{id}"]?.get as {
      parameters: { name: string; in: string }[];
      responses: Record<string, unknown>;
    };

    expect(getOrder.parameters).toContainEqual(
      expect.objectContaining({ name: "x-guest-token", in: "header" }),
    );
    expect(Object.keys(getOrder.responses)).toContain("404");
  });

  it("declares the staff session and the 401, 403 and 409 answers on the refund route", () => {
    const { paths, components } = buildOpenApiDocument();
    const refund = paths["/v1/orders/{id}/refunds"]?.post as {
      security: unknown[];
      responses: Record<string, unknown>;
    };

    expect(refund.security).toEqual([
      { adminSession: [] },
      { hqSession: [] },
      { bearerAuth: [] },
    ]);
    expect(Object.keys(refund.responses)).toEqual(
      expect.arrayContaining(["401", "403", "409"]),
    );
    expect(Object.keys(components.securitySchemes)).toEqual([
      "adminSession",
      "hqSession",
      "orderSession",
      "bearerAuth",
    ]);
  });

  it("emits a component per area with the cart limits", () => {
    const { components } = buildOpenApiDocument();

    const names = Object.keys(components.schemas);

    expect(names).toEqual(
      expect.arrayContaining([
        "ErrorResponse",
        "CreateOrderInput",
        "MenuResponse",
        "VenueListResponse",
        "StaffMemberInput",
        "PromoInput",
        "PinSignInInput",
      ]),
    );
    expect(components.schemas.CreateOrderInput).toMatchObject({
      properties: {
        items: {
          minItems: 1,
          items: {
            properties: {
              quantity: { type: "integer", minimum: 1, maximum: 10 },
            },
          },
        },
      },
    });
  });

  it("declares the order-app session and 401, 404 and 409 on the account routes", () => {
    const { paths } = buildOpenApiDocument();

    const remove = paths["/v1/me"]?.delete as {
      security: unknown[];
      responses: Record<string, unknown>;
    };

    expect(remove.security).toEqual([{ orderSession: [] }, { bearerAuth: [] }]);
    expect(Object.keys(remove.responses)).toEqual(
      expect.arrayContaining(["200", "401", "404", "409"]),
    );
  });
});

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
      "/v1/venues",
      "/v1/ping",
      "/v1/openapi.json",
      "/v1/uploads",
    ]);
    expect(createOrder.requestBody.content["application/json"]?.schema).toEqual(
      { $ref: "#/components/schemas/CreateOrderInput" },
    );
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
});

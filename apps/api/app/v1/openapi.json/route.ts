import { buildOpenApiDocument } from "@namitiszunk/validators";

import { handler } from "@/lib/handler";

const document = buildOpenApiDocument();

// Served bare, not as `{ data }`, so OpenAPI tools can read it directly.
export const GET = handler(
  { rateLimit: { limit: 60, windowSeconds: 60 } },
  async () => Response.json(document),
);

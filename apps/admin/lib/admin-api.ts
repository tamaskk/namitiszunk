import { createApiClient } from "@namitiszunk/api-client";

// The browser calls apps/api with the parent-domain session and staff cookies (credentials: "include").
// Without NEXT_PUBLIC_API_URL (e2e) the calls stay on this origin, where the tests answer them.
export const adminApi = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "",
});

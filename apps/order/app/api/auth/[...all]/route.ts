import { getAuth } from "@namitiszunk/auth";

// Better Auth's endpoints (sign-in, callbacks, magic link) with the order app's own session cookie.
async function handle(request: Request): Promise<Response> {
  return (await getAuth("order")).handler(request);
}

export { handle as GET, handle as POST };

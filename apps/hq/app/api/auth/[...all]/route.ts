import { getAuth } from "@namitiszunk/auth";

// Better Auth's endpoints (sign-in, callbacks, magic link, 2FA) with the HQ app's own session cookie.
async function handle(request: Request): Promise<Response> {
  return (await getAuth("hq")).handler(request);
}

export { handle as GET, handle as POST };

import { getAuth } from "@namitiszunk/auth";

// Better Auth's endpoints (sign-in, callbacks, magic link, 2FA) with the admin app's own session cookie.
async function handle(request: Request): Promise<Response> {
  return (await getAuth("admin")).handler(request);
}

export { handle as GET, handle as POST };

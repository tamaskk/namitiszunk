import { getAuth, staffDeviceAllowsAuthRequest } from "@namitiszunk/auth";

// Better Auth's endpoints (sign-in, callbacks, magic link, 2FA) with the admin app's own session cookie.
async function handle(request: Request): Promise<Response> {
  // On a bar tablet only signing in and out: the manager session on it is not the PIN holder's (SECURITY.md §03).
  if (!staffDeviceAllowsAuthRequest(request))
    return Response.json({ error: { code: "forbidden" } }, { status: 403 });
  return (await getAuth("admin")).handler(request);
}

export { handle as GET, handle as POST };

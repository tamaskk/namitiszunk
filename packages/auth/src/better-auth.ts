import "server-only";

import { expo } from "@better-auth/expo";
import {
  hitRateLimit,
  lockRateLimit,
  rateLimitLockedFor,
} from "@namitiszunk/core/api";
import { connectDb, Types } from "@namitiszunk/db";
import { sendEmail } from "@namitiszunk/emails";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { bearer, magicLink, twoFactor } from "better-auth/plugins";

/** Each web app has its own Better Auth instance, cookie names and sessions (spec T-030 item 2). */
export type AuthApp = "order" | "admin" | "hq";

type Db = Parameters<typeof mongodbAdapter>[0];

// Sign-in, e-mail link and 2FA attempts per client IP (docs/SECURITY.md §03).
const limitedPaths = ["/sign-in/", "/magic-link/", "/two-factor/"];
const authRateLimit = { limit: 10, windowSeconds: 60 };
// A session that has not passed TOTP yet may only finish the check, read itself or sign out.
const unverifiedSessionPaths = [
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  "/get-session",
  "/sign-out",
];
// TOTP guesses per user on top of the IP limit, then a lockout (6 digits fall to a distributed guesser otherwise).
const totpUserRateLimit = { limit: 5, windowSeconds: 5 * 60 };
const totpLockSeconds = 15 * 60;
// E-mail links per address, so one inbox cannot be flooded from many IPs.
const magicLinkEmailRateLimit = { limit: 5, windowSeconds: 15 * 60 };

function clientIp(headers: Headers | undefined): string {
  return (
    headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers?.get("x-real-ip") ||
    "unknown"
  );
}

function socialProviders(): BetterAuthOptions["socialProviders"] {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  const { APPLE_CLIENT_ID, APPLE_CLIENT_SECRET } = process.env;
  // Unset locally until the OAuth clients exist (T-005, T-007); the env check requires them in production.
  return {
    ...(GOOGLE_CLIENT_ID &&
      GOOGLE_CLIENT_SECRET && {
        google: {
          clientId: GOOGLE_CLIENT_ID,
          clientSecret: GOOGLE_CLIENT_SECRET,
        },
      }),
    ...(APPLE_CLIENT_ID &&
      APPLE_CLIENT_SECRET && {
        apple: { clientId: APPLE_CLIENT_ID, clientSecret: APPLE_CLIENT_SECRET },
      }),
  };
}

/**
 * Production cookies go to the parent domain, so api.namitiszunk.hu receives them; the per-app
 * names and the session's `app` keep the apps apart. Localhost and Vercel previews stay host-only.
 */
export function cookieDomainFor(
  baseUrl: string | undefined,
): string | undefined {
  const host = baseUrl ? URL.parse(baseUrl)?.hostname : undefined;
  return host === "namitiszunk.hu" || host?.endsWith(".namitiszunk.hu")
    ? ".namitiszunk.hu"
    : undefined;
}

// The adapter stores user ids as ObjectIds; a string id that is not one is matched as is.
function userIdForms(id: string): (Types.ObjectId | string)[] {
  return Types.ObjectId.isValid(id) ? [new Types.ObjectId(id), id] : [id];
}

/** Builds the Better Auth instance for one app on an open database. Tests pass an in-memory database. */
export function createAuth(app: AuthApp, db: Db) {
  const cookieDomain = cookieDomainFor(process.env.BETTER_AUTH_URL);
  return betterAuth({
    appName: "Na, mit iszunk?",
    database: mongodbAdapter(db),
    secret: process.env.BETTER_AUTH_SECRET,
    // Each app's own BETTER_AUTH_URL (its subdomain).
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: ["https://appleid.apple.com"],
    telemetry: { enabled: false },
    // It returns every session's token: a stolen session must not be able to read the others.
    disabledPaths: ["/list-sessions"],
    advanced: {
      cookiePrefix: `nmi-${app}`,
      ...(cookieDomain && {
        crossSubDomainCookies: { enabled: true, domain: cookieDomain },
      }),
    },
    socialProviders: socialProviders(),
    session: {
      additionalFields: {
        // Which app created the session: an admin session token is refused by HQ even under the HQ cookie name.
        app: { type: "string", input: false, required: false },
        // Set only by a TOTP or backup code check in this session; OAuth and e-mail link skip the plugin's challenge.
        twoFactorVerified: {
          type: "boolean",
          input: false,
          required: false,
          defaultValue: false,
        },
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => ({
            data: { ...session, app, twoFactorVerified: false },
          }),
          // Sessions are deleted on sign-out, so the user carries the last sign-in for retention (T-028).
          after: async (session) => {
            await db
              .collection<{ _id: Types.ObjectId | string }>("user")
              .updateOne(
                { _id: { $in: userIdForms(session.userId) } },
                { $set: { lastSignInAt: new Date() } },
              );
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (limitedPaths.some((p) => ctx.path.startsWith(p))) {
          const limited = await hitRateLimit(
            `auth:${app}:${ctx.path}:${clientIp(ctx.headers)}`,
            authRateLimit,
          );
          if (limited) throw new APIError("TOO_MANY_REQUESTS");
        }
        const email: unknown = ctx.body?.email;
        if (ctx.path === "/sign-in/magic-link" && typeof email === "string") {
          const limited = await hitRateLimit(
            `auth:${app}:magic-link-email:${email.trim().toLowerCase()}`,
            magicLinkEmailRateLimit,
          );
          if (limited) throw new APIError("TOO_MANY_REQUESTS");
        }

        // bearer() turns the header into the session cookie only after this hook, so check that session now.
        const bearerToken = ctx.headers?.get("authorization");
        const headers = new Headers(ctx.headers);
        if (app === "order" && bearerToken?.startsWith("Bearer "))
          headers.set(
            "cookie",
            `${ctx.context.authCookies.sessionToken.name}=${encodeURIComponent(bearerToken.slice("Bearer ".length))}`,
          );
        const session = await getSessionFromCtx({ ...ctx, headers });
        if (!session) return;
        // A session (cookie or Bearer) is valid only in the app that created it.
        if (session.session.app !== app) throw new APIError("UNAUTHORIZED");
        // Without passwords (allowPasswordless), a session that skipped TOTP must not read, replace
        // or remove the factor, list or revoke sessions or change the user: that would let a stolen
        // OAuth or e-mail link session bypass 2FA.
        if (
          session.user.twoFactorEnabled &&
          session.session.twoFactorVerified !== true &&
          !unverifiedSessionPaths.includes(ctx.path)
        )
          throw new APIError("FORBIDDEN", { code: "two_factor_required" });

        if (ctx.path.startsWith("/two-factor/verify-")) {
          const bucket = `auth:${app}:totp:${session.user.id}`;
          if (await rateLimitLockedFor(bucket))
            throw new APIError("TOO_MANY_REQUESTS");
          if (await hitRateLimit(bucket, totpUserRateLimit)) {
            await lockRateLimit(bucket, totpLockSeconds);
            throw new APIError("TOO_MANY_REQUESTS");
          }
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (
          ctx.path !== "/two-factor/verify-totp" &&
          ctx.path !== "/two-factor/verify-backup-code"
        )
          return;
        const returned: unknown = ctx.context.returned;
        if (returned instanceof Error) return;
        // Enabling TOTP rotates the session: the new one is in newSession, the body names the old one.
        const token =
          ctx.context.newSession?.session.token ??
          (typeof returned === "object" &&
          returned !== null &&
          "token" in returned &&
          typeof returned.token === "string"
            ? returned.token
            : undefined);
        if (token)
          await ctx.context.internalAdapter.updateSession(token, {
            twoFactorVerified: true,
          });
      }),
    },
    plugins: [
      magicLink({
        expiresIn: 15 * 60,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url }, ctx) => {
          const accept = ctx?.headers?.get("accept-language") ?? "";
          await sendEmail("signIn", email, {
            url,
            locale: accept.startsWith("en") ? "en" : "hu",
          });
        },
      }),
      // Sign-in is Apple, Google or e-mail link only: there is no password to confirm 2FA changes with.
      twoFactor({ issuer: "Na, mit iszunk?", allowPasswordless: true }),
      // The guest mobile app (phase 3) calls apps/api with `Authorization: Bearer`, not a cookie; the Expo client side is not built yet.
      ...(app === "order" ? [expo(), bearer({ requireSignature: true })] : []),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const instances = new Map<AuthApp, Promise<Auth>>();

/** The app's Better Auth instance on the shared Mongoose connection, created once per process. */
export function getAuth(app: AuthApp): Promise<Auth> {
  let instance = instances.get(app);
  if (!instance) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is missing");
    instance = connectDb(uri).then((mongoose) => {
      const db = mongoose.connection.db;
      if (!db) throw new Error("MongoDB connection has no database");
      return createAuth(app, db);
    });
    instance.catch(() => instances.delete(app));
    instances.set(app, instance);
  }
  return instance;
}

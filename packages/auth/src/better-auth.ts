import "server-only";

import { expo } from "@better-auth/expo";
import { hitRateLimit } from "@namitiszunk/core/api";
import { connectDb } from "@namitiszunk/db";
import { sendEmail } from "@namitiszunk/emails";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { magicLink, twoFactor } from "better-auth/plugins";

/** Each web app has its own Better Auth instance, cookie names and sessions (spec T-030 item 2). */
export type AuthApp = "order" | "admin" | "hq";

type Db = Parameters<typeof mongodbAdapter>[0];

// Sign-in, e-mail link and 2FA attempts per client IP (docs/SECURITY.md §03).
const limitedPaths = ["/sign-in/", "/magic-link/", "/two-factor/"];
const authRateLimit = { limit: 10, windowSeconds: 60 };
const guardedTwoFactorPaths = [
  "/two-factor/enable",
  "/two-factor/disable",
  "/two-factor/get-totp-uri",
  "/two-factor/generate-backup-codes",
];

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

/** Builds the Better Auth instance for one app on an open database. Tests pass an in-memory database. */
export function createAuth(app: AuthApp, db: Db) {
  return betterAuth({
    appName: "Na, mit iszunk?",
    database: mongodbAdapter(db),
    secret: process.env.BETTER_AUTH_SECRET,
    // Each app's own BETTER_AUTH_URL (its subdomain); the cookie stays host-only, never shared.
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: ["https://appleid.apple.com"],
    telemetry: { enabled: false },
    advanced: { cookiePrefix: `nmi-${app}` },
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
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!limitedPaths.some((p) => ctx.path.startsWith(p))) return;
        const limited = await hitRateLimit(
          `auth:${app}:${ctx.path}:${clientIp(ctx.headers)}`,
          authRateLimit,
        );
        if (limited) throw new APIError("TOO_MANY_REQUESTS");

        // Without passwords (allowPasswordless), a session that has not passed TOTP yet must not
        // read, replace or remove the factor: that would let a stolen OAuth session bypass 2FA.
        if (!guardedTwoFactorPaths.includes(ctx.path)) return;
        const session = await getSessionFromCtx(ctx);
        if (
          session?.user.twoFactorEnabled &&
          session.session.twoFactorVerified !== true
        )
          throw new APIError("FORBIDDEN", { code: "two_factor_required" });
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
      // Bearer sessions for the guest mobile app (phase 3); the Expo client side is not built yet.
      ...(app === "order" ? [expo()] : []),
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

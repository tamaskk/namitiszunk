import { z } from "zod";

export type AppName = "landing" | "order" | "admin" | "hq" | "api";
type DeploymentEnv = "production" | "preview" | "development";
type EnvSource = Record<string, string | undefined>;

const required = z.string().min(1);

// Production gets live keys only; preview and local get test keys only (docs/SECURITY.md §04).
function stripeKey(prefix: "sk" | "pk", deployment: DeploymentEnv) {
  const expected = `${prefix}_${deployment === "production" ? "live" : "test"}_`;
  return required.refine((value) => value.startsWith(expected), {
    message: `must start with ${expected} in ${deployment}`,
  });
}

// Monitoring is mandatory where incidents happen; locally it would only block dev.
function monitoring<T extends z.ZodType>(schema: T, deployment: DeploymentEnv) {
  return deployment === "production" ? schema : schema.optional();
}

const server = {
  MONGODB_URI: required.refine((v) => /^mongodb(\+srv)?:\/\//.test(v), {
    message: "must be a mongodb:// or mongodb+srv:// connection string",
  }),
  BETTER_AUTH_SECRET: required.min(32, {
    message: "must be at least 32 characters",
  }),
};

const sentryDsn = z.url({ message: "must be a URL" });

// Sign-in (T-030) in the order, admin and HQ apps: the app's own URL, the OAuth clients and the
// e-mail link sender. Optional locally and in previews (Apple sign-in cannot work on preview URLs).
function signIn(deployment: DeploymentEnv) {
  return {
    BETTER_AUTH_URL: monitoring(
      z.url({ message: "must be a URL" }),
      deployment,
    ),
    GOOGLE_CLIENT_ID: monitoring(required, deployment),
    GOOGLE_CLIENT_SECRET: monitoring(required, deployment),
    // The Services ID and the client secret JWT signed with the Apple key; the JWT expires within 6 months.
    APPLE_CLIENT_ID: monitoring(required, deployment),
    APPLE_CLIENT_SECRET: monitoring(required, deployment),
    RESEND_API_KEY: monitoring(required, deployment),
  };
}

function notInProduction(deployment: DeploymentEnv) {
  return deployment === "production"
    ? z.undefined({ message: "must not be set in production" }).optional()
    : z.string().optional();
}

// Source maps reach Sentry only from production builds; preview and local builds skip the upload.
function sentryBuild(deployment: DeploymentEnv) {
  return {
    SENTRY_DSN: monitoring(sentryDsn, deployment),
    SENTRY_AUTH_TOKEN: monitoring(required, deployment),
    SENTRY_ORG: monitoring(required, deployment),
    SENTRY_PROJECT: monitoring(required, deployment),
  };
}

function browserMonitoring(deployment: DeploymentEnv) {
  return {
    ...sentryBuild(deployment),
    NEXT_PUBLIC_SENTRY_DSN: monitoring(sentryDsn, deployment),
    // Browser events take their environment from it; Vercel sets it only with "Automatically expose System Environment Variables" on.
    NEXT_PUBLIC_VERCEL_ENV:
      deployment === "production"
        ? z.literal("production", {
            message:
              "must be production: turn on the Vercel system environment variables",
          })
        : z.string().optional(),
    NEXT_PUBLIC_POSTHOG_KEY: monitoring(required, deployment),
  };
}

const appSchemas = {
  landing: (d: DeploymentEnv) => z.object(browserMonitoring(d)),
  order: (d: DeploymentEnv) =>
    z.object({
      ...browserMonitoring(d),
      ...server,
      ...signIn(d),
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: stripeKey("pk", d),
      // The guest's browser calls apps/api for order status, cancel and the Ably token (T-043).
      NEXT_PUBLIC_API_URL:
        d === "production"
          ? z.url({ protocol: /^https$/, message: "must be an https URL" })
          : z.url({ message: "must be a URL" }),
    }),
  admin: (d: DeploymentEnv) =>
    z.object({ ...browserMonitoring(d), ...server, ...signIn(d) }),
  hq: (d: DeploymentEnv) =>
    z.object({ ...browserMonitoring(d), ...server, ...signIn(d) }),
  api: (d: DeploymentEnv) =>
    z.object({
      ...sentryBuild(d),
      ...server,
      // Unset means the Sentry test endpoint answers 404.
      SENTRY_TEST_TOKEN: required
        .min(32, { message: "must be at least 32 characters" })
        .optional(),
      // Lets a preview deployment fake an outage to test the uptime alert (T-017).
      HEALTH_FORCE_FAIL:
        d === "production"
          ? z.undefined({ message: "must not be set in production" }).optional()
          : z.literal("1").optional(),
      STRIPE_SECRET_KEY: stripeKey("sk", d),
      // The platform's copy of every guest problem report (T-046).
      PLATFORM_ALERT_EMAIL: monitoring(
        z.email({ message: "must be an e-mail address" }),
        d,
      ),
      STRIPE_WEBHOOK_SECRET: required.refine((v) => v.startsWith("whsec_"), {
        message: "must start with whsec_",
      }),
      ABLY_API_KEY: required,
      TWILIO_ACCOUNT_SID: required,
      TWILIO_AUTH_TOKEN: required,
      TWILIO_MESSAGING_SERVICE_SID: required,
      RESEND_API_KEY: required,
      BLOB_READ_WRITE_TOKEN: required,
      INNGEST_EVENT_KEY: required,
      INNGEST_SIGNING_KEY: required,
      // Dev mode skips Inngest's request signature check: never in production.
      INNGEST_DEV: notInProduction(d),
      NEXT_PUBLIC_INNGEST_DEV: notInProduction(d),
    }),
} satisfies Record<AppName, (d: DeploymentEnv) => z.ZodType>;

export type AppEnv<A extends AppName> = z.infer<
  ReturnType<(typeof appSchemas)[A]>
>;

function deploymentOf(source: EnvSource): DeploymentEnv {
  const value = source.VERCEL_ENV;
  return value === "production" || value === "preview" ? value : "development";
}

/** Validates one app's variables; the error names each variable and never echoes a value. */
export function parseAppEnv<A extends AppName>(
  app: A,
  source: EnvSource,
): AppEnv<A> {
  const deployment = deploymentOf(source);
  // Empty strings are what an unset Vercel variable or a blank .env line produces.
  const present = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== ""),
  );
  const result = appSchemas[app](deployment).safeParse(present);
  // TypeScript cannot narrow a schema picked by a generic key, so the result type is restated.
  if (result.success) return result.data as AppEnv<A>;

  const problems = result.error.issues.map((issue) => {
    const name = String(issue.path[0]);
    return present[name] === undefined
      ? `${name} is missing`
      : `${name} ${issue.message}`;
  });
  throw new Error(
    `Invalid environment for ${app} (${deployment}):\n${problems.map((p) => `  - ${p}`).join("\n")}`,
  );
}

/** Build-time gate for next.config; SKIP_ENV_VALIDATION=1 is for CI builds without secrets. */
export function validateBuildEnv(app: AppName, source: EnvSource): void {
  if (source.SKIP_ENV_VALIDATION === "1") {
    if (deploymentOf(source) === "production") {
      throw new Error(
        "Environment validation cannot be skipped in production builds (SKIP_ENV_VALIDATION is set).",
      );
    }
    return;
  }
  parseAppEnv(app, source);
}

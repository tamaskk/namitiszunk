import { describe, expect, it } from "vitest";

import { parseAppEnv, validateBuildEnv } from "./env";

const testApiEnv = {
  MONGODB_URI:
    "mongodb+srv://user:pass@cluster0.example.mongodb.net/namitiszunk_dev",
  BETTER_AUTH_SECRET: "a".repeat(32),
  STRIPE_SECRET_KEY: "sk_test_abc123",
  STRIPE_WEBHOOK_SECRET: "whsec_abc123",
  ABLY_API_KEY: "app.key:secret",
  TWILIO_ACCOUNT_SID: "AC123",
  TWILIO_AUTH_TOKEN: "token",
  TWILIO_MESSAGING_SERVICE_SID: "MG123",
  RESEND_API_KEY: "re_abc123",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_abc",
  INNGEST_EVENT_KEY: "event-key",
  INNGEST_SIGNING_KEY: "signkey-test-abc",
};

const liveApiEnv = {
  ...testApiEnv,
  VERCEL_ENV: "production",
  STRIPE_SECRET_KEY: "sk_live_abc123",
  SENTRY_DSN: "https://key@o1.ingest.sentry.io/1",
  SENTRY_AUTH_TOKEN: "sntrys_abc",
  SENTRY_ORG: "namitiszunk",
  SENTRY_PROJECT: "namitiszunk",
};

describe("parseAppEnv", () => {
  it("accepts a complete development env for the api", () => {
    const source = testApiEnv;

    const env = parseAppEnv("api", source);

    expect(env.STRIPE_SECRET_KEY).toBe("sk_test_abc123");
  });

  it("lets landing run locally without monitoring keys", () => {
    const source = {};

    const env = parseAppEnv("landing", source);

    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it("names every missing variable", () => {
    const source = { MONGODB_URI: testApiEnv.MONGODB_URI };

    const act = () => parseAppEnv("api", source);

    expect(act).toThrow(/BETTER_AUTH_SECRET is missing/);
    expect(act).toThrow(/INNGEST_SIGNING_KEY is missing/);
  });

  it("treats an empty string as missing", () => {
    const source = { ...testApiEnv, RESEND_API_KEY: "" };

    const act = () => parseAppEnv("api", source);

    expect(act).toThrow(/RESEND_API_KEY is missing/);
  });

  it("rejects a Stripe test key in production without echoing it", () => {
    const source = { ...liveApiEnv, STRIPE_SECRET_KEY: "sk_test_do_not_print" };

    const act = () => parseAppEnv("api", source);

    expect(act).toThrow(/STRIPE_SECRET_KEY must start with sk_live_/);
    expect(act).not.toThrow(/do_not_print/);
  });

  it("rejects a live Stripe key outside production", () => {
    const source = {
      ...testApiEnv,
      VERCEL_ENV: "preview",
      STRIPE_SECRET_KEY: "sk_live_abc",
    };

    const act = () => parseAppEnv("api", source);

    expect(act).toThrow(/STRIPE_SECRET_KEY must start with sk_test_/);
  });

  it("requires monitoring keys in production", () => {
    const source = { ...liveApiEnv, SENTRY_DSN: undefined };

    const act = () => parseAppEnv("api", source);

    expect(act).toThrow(/SENTRY_DSN is missing/);
  });

  it("accepts a complete production env for the api", () => {
    const source = liveApiEnv;

    const env = parseAppEnv("api", source);

    expect(env.STRIPE_SECRET_KEY).toBe("sk_live_abc123");
  });

  it("checks the publishable key prefix for the order app", () => {
    const source = {
      ...testApiEnv,
      VERCEL_ENV: "production",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_abc",
      SENTRY_DSN: liveApiEnv.SENTRY_DSN,
      SENTRY_AUTH_TOKEN: liveApiEnv.SENTRY_AUTH_TOKEN,
      SENTRY_ORG: liveApiEnv.SENTRY_ORG,
      SENTRY_PROJECT: liveApiEnv.SENTRY_PROJECT,
      NEXT_PUBLIC_SENTRY_DSN: liveApiEnv.SENTRY_DSN,
      NEXT_PUBLIC_VERCEL_ENV: "production",
      NEXT_PUBLIC_POSTHOG_KEY: "phc_abc",
    };

    const act = () => parseAppEnv("order", source);

    expect(act).toThrow(
      /NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must start with pk_live_/,
    );
  });
  it("requires the source map upload token in production", () => {
    const source = { ...liveApiEnv, SENTRY_AUTH_TOKEN: undefined };

    const act = () => parseAppEnv("api", source);

    expect(act).toThrow(/SENTRY_AUTH_TOKEN is missing/);
  });

  it("requires the browser environment variable in production", () => {
    const source = {
      ...liveApiEnv,
      NEXT_PUBLIC_SENTRY_DSN: liveApiEnv.SENTRY_DSN,
      NEXT_PUBLIC_POSTHOG_KEY: "phc_abc",
    };

    const act = () => parseAppEnv("admin", source);

    expect(act).toThrow(/NEXT_PUBLIC_VERCEL_ENV is missing/);
  });

  it("refuses a faked outage in production", () => {
    const source = { ...liveApiEnv, HEALTH_FORCE_FAIL: "1" };

    const act = () => parseAppEnv("api", source);

    expect(act).toThrow(/HEALTH_FORCE_FAIL must not be set in production/);
  });

  it("rejects a short Sentry test token and an unknown health override", () => {
    const source = {
      ...testApiEnv,
      SENTRY_TEST_TOKEN: "short",
      HEALTH_FORCE_FAIL: "yes",
    };

    const act = () => parseAppEnv("api", source);

    expect(act).toThrow(/SENTRY_TEST_TOKEN must be at least 32 characters/);
    expect(act).toThrow(/HEALTH_FORCE_FAIL/);
  });
});

describe("validateBuildEnv", () => {
  it("skips validation outside production when SKIP_ENV_VALIDATION is set", () => {
    const source = { SKIP_ENV_VALIDATION: "1", VERCEL_ENV: "preview" };

    const act = () => validateBuildEnv("api", source);

    expect(act).not.toThrow();
  });

  it("refuses to skip validation in production", () => {
    const source = { SKIP_ENV_VALIDATION: "1", VERCEL_ENV: "production" };

    const act = () => validateBuildEnv("api", source);

    expect(act).toThrow(/cannot be skipped in production/);
  });

  it("validates when the skip flag is absent", () => {
    const source = {};

    const act = () => validateBuildEnv("api", source);

    expect(act).toThrow(/MONGODB_URI is missing/);
  });
});

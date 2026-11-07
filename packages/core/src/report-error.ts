// On globalThis because Next.js bundles instrumentation.ts (where apps register) apart from route handlers.
const registry = globalThis as {
  __coreErrorReporter?: (error: unknown) => void;
};

/**
 * Sets where core reports errors it must not throw (work after a commit: Ably publish, Inngest
 * emit, Stripe domain registration). Core has no Sentry SDK, so each app registers
 * Sentry.captureException at startup (apps/api: instrumentation.ts).
 */
export function setDefaultErrorReporter(report: (error: unknown) => void) {
  registry.__coreErrorReporter = report;
}

export function reportError(error: unknown): void {
  (registry.__coreErrorReporter ?? console.error)(error);
}

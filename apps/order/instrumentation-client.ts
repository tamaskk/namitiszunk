import { loadSentry, reportClientError } from "@/lib/sentry-client";

// Sentry loads after the first paint (T-040: guest JS budget). Errors thrown before that are
// held here and reported once it is up, so nothing early is lost.
const early: unknown[] = [];
const holdError = (event: ErrorEvent) => early.push(event.error ?? event);
const holdRejection = (event: PromiseRejectionEvent) =>
  early.push(event.reason);
window.addEventListener("error", holdError);
window.addEventListener("unhandledrejection", holdRejection);

const start = () => {
  loadSentry()
    .then(() => {
      // Sentry's own global handlers are attached now.
      window.removeEventListener("error", holdError);
      window.removeEventListener("unhandledrejection", holdRejection);
      for (const error of early.splice(0)) reportClientError(error);
    })
    .catch(() => {
      // Offline before the SDK chunk loaded: the app keeps working without reporting.
    });
};
if ("requestIdleCallback" in window) {
  requestIdleCallback(start, { timeout: 5000 });
} else {
  setTimeout(start, 2000);
}

/** Router transitions start traces once Sentry has loaded; earlier ones are skipped. */
export function onRouterTransitionStart(
  ...args: Parameters<
    (typeof import("@sentry/nextjs"))["captureRouterTransitionStart"]
  >
): void {
  void loadSentry()
    .then((Sentry) => Sentry.captureRouterTransitionStart(...args))
    .catch(() => {
      // No SDK, no trace.
    });
}

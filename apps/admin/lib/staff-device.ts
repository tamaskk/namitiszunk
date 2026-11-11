import "server-only";

// The bar the tablet opens on (T-054). A preference, not a permission: the bar view's API checks
// the PIN holder's venue on every call.
export const DEVICE_BAR_COOKIE = "nmi-admin.bar";

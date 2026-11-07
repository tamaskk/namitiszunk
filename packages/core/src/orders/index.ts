export * from "./state-machine";
// transitionWith stays internal: callers outside this package always go through RBAC.
export {
  onStatusChanged,
  type StatusChanged,
  type StatusChangedHook,
  transition,
  type TransitionOptions,
} from "./transition";
export { setDefaultErrorReporter } from "../report-error";

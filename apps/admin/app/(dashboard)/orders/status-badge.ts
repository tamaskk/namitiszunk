// Order-status colours only for the order's state (DESIGN_SYSTEM §06).
export function badgeOf(
  status: string,
): "new" | "inProgress" | "ready" | "pickedUp" | "rejected" | "neutral" {
  switch (status) {
    case "new":
      return "new";
    case "preparing":
      return "inProgress";
    case "ready":
      return "ready";
    case "picked_up":
      return "pickedUp";
    case "rejected":
    case "refunded":
      return "rejected";
    default:
      return "neutral";
  }
}

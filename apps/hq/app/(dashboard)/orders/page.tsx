import { ModulePlaceholder } from "@/components/module-placeholder";

export const instant = false;

// The page itself is T-069; the permission check already runs.
export default function OrdersPage() {
  return <ModulePlaceholder moduleKey="orders" />;
}

import { ModulePlaceholder } from "@/components/module-placeholder";

export const instant = false;

// The page itself is T-067; the permission check already runs.
export default function VenuesPage() {
  return <ModulePlaceholder moduleKey="venues" />;
}

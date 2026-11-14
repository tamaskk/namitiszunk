import { ModulePlaceholder } from "@/components/module-placeholder";

export const instant = false;

// The page itself is T-072; the permission check already runs.
export default function LeadsPage() {
  return <ModulePlaceholder moduleKey="leads" />;
}

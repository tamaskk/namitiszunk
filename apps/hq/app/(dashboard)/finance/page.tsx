import { ModulePlaceholder } from "@/components/module-placeholder";

export const instant = false;

// The page itself is T-073; the permission check already runs.
export default function FinancePage() {
  return <ModulePlaceholder moduleKey="finance" />;
}

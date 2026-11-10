import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const instant = false;

// The Dashboard itself is T-063; until then the shell's landing page.
export default function DashboardPage() {
  return <ModulePlaceholder moduleKey="dashboard" />;
}

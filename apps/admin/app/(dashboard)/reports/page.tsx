import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const instant = false;

// Placeholder until the module's own task replaces this page; the role check already runs.
export default function Page() {
  return <ModulePlaceholder moduleKey="reports" />;
}

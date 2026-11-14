import { ModulePlaceholder } from "@/components/module-placeholder";

export const instant = false;

// The page itself is T-071; the permission check already runs.
export default function AuditPage() {
  return <ModulePlaceholder moduleKey="audit" />;
}

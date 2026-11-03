import { notFound } from "next/navigation";

import { UiShowcase } from "./ui-showcase";

// Developer showcase of every @namitiszunk/ui primitive; never served outside `next dev`.
export default function DevUiPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <UiShowcase />;
}

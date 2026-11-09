import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

/**
 * Frame for a legal document (T-003): title, version, status, then the text.
 * The content files hold plain semantic HTML; the type roles come from here.
 */
export async function LegalPage({
  title,
  version,
  effectiveDate,
  children,
}: {
  title: string;
  version: string;
  /** Unset while the document is a draft under legal review. */
  effectiveDate?: string;
  children: ReactNode;
}) {
  const t = await getTranslations("landing.legal");

  return (
    <main className="mx-auto flex max-w-180 flex-col gap-6 px-4 py-12 text-body [&_a]:text-primary [&_a]:underline [&_a]:outline-none [&_a]:focus-visible:ring-2 [&_a]:focus-visible:ring-primary [&_a]:focus-visible:ring-offset-2 [&_a]:focus-visible:ring-offset-(--focus-offset) [&_h2]:mt-4 [&_h2]:text-h2 [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_section]:flex [&_section]:flex-col [&_section]:gap-3 [&_ul]:list-disc [&_ul]:pl-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1">{title}</h1>
        <p className="text-small text-text-muted">
          {/* A draft has no version a guest could refer to yet. */}
          {effectiveDate
            ? `${t("version", { version })} · ${t("effective", { date: effectiveDate })}`
            : t("draft")}
        </p>
      </header>
      {children}
    </main>
  );
}

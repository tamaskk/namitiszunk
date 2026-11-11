import { NotFoundError } from "@namitiszunk/core/errors";
import { memberLog } from "@namitiszunk/core/staff";
import { Button, EmptyState, Input, Label } from "@namitiszunk/ui";
import { objectIdSchema, staffLogQuerySchema } from "@namitiszunk/validators";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { requireAdminModule } from "@/lib/admin-context";

export const instant = false;

export const metadata: Metadata = { robots: { index: false } };

/** One member's actions on one business day, from the audit log (T-057). */
export default async function StaffMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ memberId }, query] = await Promise.all([params, searchParams]);
  const { actor, venue } = await requireAdminModule("staff");
  if (!objectIdSchema.safeParse(memberId).success) notFound();
  const parsed = staffLogQuerySchema.safeParse({
    date: typeof query.date === "string" && query.date ? query.date : undefined,
  });
  const [log, t, format] = await Promise.all([
    memberLog(
      actor,
      venue.id,
      memberId,
      parsed.success ? parsed.data.date : undefined,
    ).catch((error: unknown) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }),
    getTranslations("admin.staff"),
    getFormatter(),
  ]);
  // Actions come from stored data: an unknown one shows as stored.
  type Key = Parameters<typeof t>[0];
  const actionLabel = (action: string) => {
    const key = `log.actions.${action.replace(".", "_")}` as Key;
    return t.has(key) ? t(key) : action;
  };

  return (
    <div className="flex max-w-content flex-col gap-6">
      <Button asChild variant="ghost" className="self-start">
        <Link href="/staff">{t("log.back")}</Link>
      </Button>
      <header className="flex flex-col gap-2">
        <h1 className="text-h1">{log.member.name}</h1>
        <p className="text-small text-text-muted">
          {[
            t(`roles.${log.member.role}`),
            log.member.active ? t("active") : t("disabled"),
          ].join(" · ")}
        </p>
      </header>

      <form className="flex flex-wrap items-end gap-3" action="">
        <div className="flex flex-col gap-2">
          <Label htmlFor="log-date">{t("log.date")}</Label>
          <Input
            id="log-date"
            name="date"
            type="date"
            defaultValue={log.businessDate}
          />
        </div>
        <Button type="submit" variant="secondary">
          {t("log.show")}
        </Button>
      </form>

      <section
        aria-labelledby="log-title"
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="log-title" className="text-h3">
          {t("log.title")}
        </h2>
        {log.entries.length === 0 ? (
          <EmptyState message={t("log.empty")} />
        ) : (
          <ol className="flex flex-col gap-2">
            {log.entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-x-3 text-body"
              >
                <span className="min-w-36 shrink-0 text-small text-text-muted tabular-nums">
                  {format.dateTime(entry.at, {
                    dateStyle: "short",
                    timeStyle: "short",
                    hour12: false,
                  })}
                </span>
                {entry.target.type === "order" ? (
                  <Link
                    href={`/orders/${entry.target.id}`}
                    className="inline-flex min-h-12 items-center font-semibold underline underline-offset-4"
                  >
                    {actionLabel(entry.action)}
                  </Link>
                ) : (
                  <span className="font-semibold">
                    {actionLabel(entry.action)}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
        {log.truncated && (
          <p className="text-small text-text-muted">{t("log.truncated")}</p>
        )}
      </section>
    </div>
  );
}

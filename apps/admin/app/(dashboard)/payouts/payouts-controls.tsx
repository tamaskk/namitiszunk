"use client";

import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@namitiszunk/ui";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import {
  dashboardLinkAction,
  refreshPayoutsAction,
  setPayoutScheduleAction,
  startOnboardingAction,
} from "./actions";

type Result<T> = { data: T } | { error: { code: string } };

function useStripeAction() {
  const t = useTranslations("admin.payouts");
  const [pending, start] = useTransition();
  // Stays true after a link action succeeds, so the button cannot start a second link before the redirect.
  const [leaving, setLeaving] = useState(false);
  const run = <T,>(
    action: () => Promise<Result<T>>,
    done: (data: T) => void,
    { redirects = false } = {},
  ) =>
    start(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(
          result.error.code === "rate_limited"
            ? t("rateLimited")
            : t("actionFailed"),
        );
        return;
      }
      if (redirects) setLeaving(true);
      done(result.data);
    });
  return [pending || leaving, run] as const;
}

/** Opens Stripe onboarding: the first connect, or the details Stripe still asks for. */
export function OnboardingButton({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  const [pending, run] = useStripeAction();
  return (
    <Button
      className={className}
      loading={pending}
      onClick={() =>
        // A link is single-use and short-lived, so it is made on the click, never ahead.
        run(startOnboardingAction, ({ url }) => window.location.assign(url), {
          redirects: true,
        })
      }
    >
      <ExternalLink aria-hidden />
      {label}
    </Button>
  );
}

export function DashboardButton({ className }: { className?: string }) {
  const t = useTranslations("admin.payouts");
  const [pending, run] = useStripeAction();
  return (
    <Button
      variant="secondary"
      className={className}
      loading={pending}
      onClick={() =>
        run(dashboardLinkAction, ({ url }) => window.location.assign(url), {
          redirects: true,
        })
      }
    >
      <ExternalLink aria-hidden />
      {t("dashboard")}
    </Button>
  );
}

export function RefreshButton() {
  const t = useTranslations("admin.payouts");
  const [pending, run] = useStripeAction();
  return (
    <Button
      variant="ghost"
      loading={pending}
      onClick={() =>
        run(refreshPayoutsAction, () => toast.success(t("refreshed")))
      }
    >
      <RefreshCw aria-hidden />
      {t("refresh")}
    </Button>
  );
}

export function ScheduleSelect({
  interval,
  disabled = false,
}: {
  interval: string | null;
  disabled?: boolean;
}) {
  const t = useTranslations("admin.payouts.schedule");
  const [pending, run] = useStripeAction();
  const known = interval === "daily" || interval === "weekly";
  return (
    <div className="flex max-w-80 flex-col gap-2">
      <Label htmlFor="payout-interval">{t("label")}</Label>
      <Select
        value={known ? interval : undefined}
        disabled={pending || disabled}
        onValueChange={(value) =>
          run(
            () => setPayoutScheduleAction({ interval: value }),
            () => toast.success(t("saved")),
          )
        }
      >
        <SelectTrigger id="payout-interval">
          <SelectValue placeholder={t("other")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="daily">{t("daily")}</SelectItem>
          <SelectItem value="weekly">{t("weekly")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

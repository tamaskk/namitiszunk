"use client";

import { ApiError } from "@namitiszunk/api-client";
import { formatHuf } from "@namitiszunk/i18n";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Textarea,
  toast,
} from "@namitiszunk/ui";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { adminApi } from "@/lib/admin-api";

/**
 * Refund and cancel on the order page (T-056). Both go to apps/api (/v1), where the refund
 * hook and the audit log live; the page shows the result after a refresh.
 */
export function OrderActions({
  orderId,
  number,
  refundableHuf,
  canRefund,
  canCancel,
}: {
  orderId: string;
  number: string;
  refundableHuf: number;
  canRefund: boolean;
  canCancel: boolean;
}) {
  if (!canRefund && !canCancel) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {canRefund && (
        <RefundDialog
          orderId={orderId}
          number={number}
          refundableHuf={refundableHuf}
        />
      )}
      {canCancel && <CancelDialog orderId={orderId} number={number} />}
    </div>
  );
}

function useErrorText() {
  const tErrors = useTranslations("apiErrors");
  type Code = Parameters<typeof tErrors>[0];
  // The code comes from the network: only a known one gets its own message.
  return (error: unknown, fallback: string) =>
    error instanceof ApiError && tErrors.has(error.code as Code)
      ? tErrors(error.code as Code)
      : fallback;
}

function RefundDialog({
  orderId,
  number,
  refundableHuf,
}: {
  orderId: string;
  number: string;
  refundableHuf: number;
}) {
  const t = useTranslations("admin.orders.refund");
  const tDetail = useTranslations("admin.orders.detail");
  const router = useRouter();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(true);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  // Whole forints only: the field takes digits, never a decimal.
  const amountHuf = Number(amount);
  const amountOk =
    full ||
    (/^\d+$/.test(amount) && amountHuf >= 1 && amountHuf <= refundableHuf);
  const ready = amountOk && reason.trim().length > 0;

  async function submit() {
    setBusy(true);
    try {
      await adminApi.orders.refund(orderId, {
        amountHuf: full ? "full" : amountHuf,
        reason: reason.trim(),
      });
      toast.success(t("started"));
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(errorText(error, t("failed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="secondary">{t("open")}</Button>
      </DialogTrigger>
      {/* A money action: it closes only by its buttons, so a typed reason is never lost. */}
      <DialogContent destructive>
        <DialogHeader>
          <DialogTitle>{t("title", { number })}</DialogTitle>
          <DialogDescription>
            {t("hint", { amount: formatHuf(refundableHuf) })}
          </DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t("amount")}</legend>
          {([true, false] as const).map((value) => (
            <label
              key={String(value)}
              className="flex h-12 cursor-pointer items-center gap-3 rounded-md border border-border px-4 text-body has-checked:border-primary has-focus-visible:ring-2 has-focus-visible:ring-primary"
            >
              <input
                type="radio"
                name="refund-amount"
                checked={full === value}
                onChange={() => setFull(value)}
                className="size-5 accent-primary"
              />
              {value
                ? t("full", { amount: formatHuf(refundableHuf) })
                : t("partial")}
            </label>
          ))}
        </fieldset>
        {!full && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="refund-amount">{t("amount")}</Label>
            <Input
              id="refund-amount"
              inputMode="numeric"
              value={amount}
              aria-invalid={amount !== "" && !amountOk}
              aria-describedby="refund-amount-max"
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            />
            <p
              id="refund-amount-max"
              className={
                amount !== "" && !amountOk
                  ? "text-small text-danger"
                  : "text-small text-text-muted"
              }
            >
              {tDetail("amountMax", { amount: formatHuf(refundableHuf) })}
            </p>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="refund-reason">{t("reason")}</Label>
          <Textarea
            id="refund-reason"
            maxLength={500}
            required
            aria-describedby="refund-reason-hint"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p id="refund-reason-hint" className="text-small text-text-muted">
            {t("reasonHint")}
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={busy}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button
            variant="danger"
            loading={busy}
            disabled={!ready || busy}
            onClick={() => void submit()}
          >
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  orderId,
  number,
}: {
  orderId: string;
  number: string;
}) {
  const t = useTranslations("admin.orders.cancelOrder");
  const router = useRouter();
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await adminApi.barView.reject(orderId, { reason: "other" });
      toast.success(t("done"));
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(errorText(error, t("failed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="danger">{t("open")}</Button>
      </DialogTrigger>
      <DialogContent destructive>
        <DialogHeader>
          <DialogTitle>{t("title", { number })}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={busy}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button variant="danger" loading={busy} onClick={() => void submit()}>
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

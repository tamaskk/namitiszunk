"use client";

import { formatHuf } from "@namitiszunk/i18n/format";
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
  EmptyState,
} from "@namitiszunk/ui";
import type { AccountOrder } from "@namitiszunk/validators";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { ReorderButton } from "@/components/reorder/reorder-button";
import { authApi, meApi } from "@/lib/account-api";
import { forgetAllOpenOrders, readOpenOrders } from "@/lib/open-orders";
import { OrderApiError } from "@/lib/order-api";

// Read once per render; this list changes only through this view.
const noSubscription = () => () => undefined;

/** History, data export, sign-out and deletion of the signed-in guest (T-047). */
export function AccountView({ orders }: { orders: AccountOrder[] }) {
  const t = useTranslations("order.account");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // localStorage exists only in the browser: the server and the first render see none.
  const deviceOrderCount = useSyncExternalStore(
    noSubscription,
    () => readOpenOrders().length,
    () => 0,
  );
  const [claimHidden, setClaimHidden] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimFailed, setClaimFailed] = useState(false);

  // The guest confirms: on a shared phone these may be someone else's orders (phone, report e-mail).
  async function claimDeviceOrders() {
    setClaiming(true);
    setClaimFailed(false);
    try {
      await meApi.claimOrders(
        readOpenOrders().map(({ orderId, token }) => ({ orderId, token })),
      );
    } catch {
      setClaiming(false);
      setClaimFailed(true);
      return;
    }
    forgetAllOpenOrders();
    setClaimHidden(true);
    setClaiming(false);
    router.refresh();
  }

  async function downloadExport() {
    setExporting(true);
    setExportFailed(false);
    try {
      const data = await meApi.export();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "namitiszunk-adataim.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportFailed(true);
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await meApi.delete();
    } catch (error) {
      setDeleting(false);
      setDeleteError(
        error instanceof OrderApiError && error.code === "staff_account"
          ? t("staffAccount")
          : t("deleteFailed"),
      );
      return;
    }
    forgetAllOpenOrders();
    // The sessions are gone on the server: the page renders again as signed out, and says so.
    router.replace(`/${locale}/fiok?notice=deleted`);
  }

  async function signOut() {
    await authApi.signOut();
    forgetAllOpenOrders();
    router.replace(`/${locale}/fiok?notice=signedOut`);
  }

  return (
    <div className="flex flex-col gap-8">
      {deviceOrderCount > 0 && !claimHidden && (
        <section
          aria-labelledby="device-orders"
          className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
        >
          <p id="device-orders" className="text-body">
            {t("claimPrompt", { count: deviceOrderCount })}
          </p>
          <Button
            variant="secondary"
            loading={claiming}
            onClick={claimDeviceOrders}
          >
            {t("claimAdd")}
          </Button>
          <Button
            variant="ghost"
            disabled={claiming}
            onClick={() => setClaimHidden(true)}
          >
            {t("claimSkip")}
          </Button>
          {claimFailed && (
            <p role="alert" className="text-small text-danger">
              {t("claimFailed")}
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="history" className="flex flex-col gap-3">
        <h2 id="history" className="text-h2">
          {t("historyTitle")}
        </h2>
        {orders.length === 0 ? (
          <EmptyState message={t("empty")} />
        ) : (
          <ul className="flex flex-col gap-3">
            {orders.map((order) => (
              <li
                key={order.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-body font-medium">{order.venueName}</p>
                  {order.number && (
                    <p className="text-small text-text-muted tabular-nums">
                      {order.number}
                    </p>
                  )}
                </div>
                <p className="text-small text-text-muted">
                  {format.dateTime(new Date(order.createdAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {" · "}
                  {t(`statuses.${order.status}`)}
                </p>
                <ul className="text-body">
                  {order.items.map((item, index) => (
                    <li key={index}>
                      {item.quantity}×{" "}
                      {locale === "en" ? (item.nameEn ?? item.name) : item.name}
                    </li>
                  ))}
                </ul>
                <p className="text-body font-medium tabular-nums">
                  {formatHuf(order.totalHuf)}
                </p>
                <ReorderButton
                  orderId={order.id}
                  // A never-paid order has no number: the button's own label then.
                  label={
                    order.number
                      ? t("reorderLabel", { number: order.number })
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="data" className="flex flex-col gap-3">
        <h2 id="data" className="text-h2">
          {t("dataTitle")}
        </h2>
        <Button
          variant="secondary"
          loading={exporting}
          onClick={downloadExport}
        >
          {t("export")}
        </Button>
        {exportFailed && (
          <p role="alert" className="text-small text-danger">
            {t("exportFailed")}
          </p>
        )}
        <Button variant="ghost" onClick={signOut}>
          {t("signOut")}
        </Button>
        <Dialog onOpenChange={() => setDeleteError(null)}>
          <DialogTrigger asChild>
            <Button variant="danger">{t("delete")}</Button>
          </DialogTrigger>
          <DialogContent destructive>
            <DialogHeader>
              <DialogTitle>{t("deleteTitle")}</DialogTitle>
              <DialogDescription>{t("deleteBody")}</DialogDescription>
            </DialogHeader>
            {deleteError && (
              <p role="alert" className="text-small text-danger">
                {deleteError}
              </p>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary" disabled={deleting}>
                  {t("cancel")}
                </Button>
              </DialogClose>
              <Button
                variant="danger"
                loading={deleting}
                onClick={deleteAccount}
              >
                {t("deleteConfirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </div>
  );
}

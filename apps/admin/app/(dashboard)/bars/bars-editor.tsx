"use client";

import type { AdminBar, AdminZone } from "@namitiszunk/core/bars";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@namitiszunk/ui";
import { Download, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { useForm, type FieldPath, type UseFormReturn } from "react-hook-form";

import { useMenuAction, useValidationText } from "../menu/use-menu-action";
import {
  createBarAction,
  createZoneAction,
  updateBarAction,
  updateZoneAction,
} from "./actions";

/** Bars with their zones; every zone row carries its QR code, scan count and downloads (T-053). */
export function BarsEditor({ bars }: { bars: AdminBar[] }) {
  const t = useTranslations("admin.bars");
  const addBar = (
    <BarDialog
      trigger={
        <Button>
          <Plus aria-hidden />
          {t("addBar")}
        </Button>
      }
    />
  );

  if (bars.length === 0)
    return <EmptyState message={t("empty")} action={addBar} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="self-start">{addBar}</div>
      {bars.map((bar) => (
        <BarCard key={bar.id} bar={bar} bars={bars} />
      ))}
    </div>
  );
}

function BarCard({ bar, bars }: { bar: AdminBar; bars: AdminBar[] }) {
  const t = useTranslations("admin.bars");
  return (
    <section
      aria-labelledby={`bar-${bar.id}`}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={`bar-${bar.id}`} className="text-h2">
          {bar.name}
        </h2>
        {/* A bar state, not an order status: a coloured label, not a status Badge (DESIGN_SYSTEM §06). */}
        <span
          className={`text-small font-medium ${bar.isOpen ? "text-success" : "text-text-muted"}`}
        >
          {bar.isOpen ? t("open") : t("closed")}
        </span>
        {bar.maxActiveOrders !== null && (
          <span className="text-small text-text-muted">
            {t("maxActiveOrdersValue", { count: bar.maxActiveOrders })}
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <BarDialog
            bar={bar}
            trigger={
              <Button variant="secondary">
                <Pencil aria-hidden />
                {t("editBar")}
              </Button>
            }
          />
          <ZoneDialog
            bars={bars}
            barId={bar.id}
            trigger={
              <Button variant="secondary">
                <Plus aria-hidden />
                {t("addZone")}
              </Button>
            }
          />
        </div>
      </div>
      {bar.zones.length === 0 ? (
        <p className="text-small text-text-muted">{t("noZones")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {bar.zones.map((zone) => (
            <ZoneRow key={zone.id} zone={zone} bar={bar} bars={bars} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ZoneRow({
  zone,
  bar,
  bars,
}: {
  zone: AdminZone;
  bar: AdminBar;
  bars: AdminBar[];
}) {
  const t = useTranslations("admin.bars");
  const downloads = [
    ["png", t("downloadPng")],
    ["card", t("downloadCard")],
    ["poster", t("downloadPoster")],
  ] as const;
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 text-body font-semibold break-words">
            {zone.name}
          </span>
          {zone.type === "vip_table" && (
            <Badge status="neutral">{t("vip")}</Badge>
          )}
        </div>
        {zone.qr && (
          <span className="text-small text-text-muted tabular-nums">
            {t("qrLine", { code: zone.qr.code, count: zone.qr.scanCount })}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {zone.qr &&
          downloads.map(([format, label]) => (
            <Button key={format} variant="ghost" asChild>
              <a
                href={`/bars/qr/${zone.qr!.id}?format=${format}`}
                download
                aria-label={t("downloadFor", { label, zone: zone.name })}
              >
                <Download aria-hidden />
                {label}
              </a>
            </Button>
          ))}
        <ZoneDialog
          bars={bars}
          barId={bar.id}
          zone={zone}
          trigger={
            <Button
              variant="ghost"
              aria-label={t("editZoneFor", { zone: zone.name })}
            >
              <Pencil aria-hidden />
            </Button>
          }
        />
      </div>
    </li>
  );
}

/** Field errors from the server land on the form field they name. */
function useFieldErrors<V extends Record<string, unknown>>(
  form: UseFormReturn<V>,
) {
  const validationText = useValidationText();
  return ({ fields }: { fields?: Record<string, string> }) => {
    for (const [path, key] of Object.entries(fields ?? {})) {
      form.setError(path.replace(/^input\./, "") as FieldPath<V>, {
        message: validationText(key),
      });
    }
  };
}

type BarValues = { name: string; isOpen: boolean; maxActiveOrders: string };

function BarDialog({ bar, trigger }: { bar?: AdminBar; trigger: ReactNode }) {
  const t = useTranslations("admin.bars");
  const tMenu = useTranslations("admin.menu");
  const [open, setOpen] = useState(false);
  const [pending, run] = useMenuAction();
  const defaults: BarValues = {
    name: bar?.name ?? "",
    isOpen: bar?.isOpen ?? false,
    maxActiveOrders: bar?.maxActiveOrders?.toString() ?? "",
  };
  const form = useForm<BarValues>({ defaultValues: defaults });
  const onError = useFieldErrors(form);

  function submit(values: BarValues) {
    const limit = values.maxActiveOrders.trim();
    const input = {
      name: values.name.trim(),
      isOpen: values.isOpen,
      // A non-number is sent as is, so the shared schema names the field.
      maxActiveOrders: limit === "" ? null : Number(limit),
    };
    run(
      () =>
        bar ? updateBarAction({ id: bar.id, input }) : createBarAction(input),
      { onDone: () => setOpen(false), onError },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) form.reset(defaults);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent closeLabel={tMenu("close")}>
        <DialogHeader>
          <DialogTitle>{bar ? t("editBar") : t("addBar")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("barHint")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(submit)}
            className="flex flex-col gap-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("barName")}</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isOpen"
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onChange={field.onChange}
                  label={t("isOpen")}
                  hint={t("isOpenHint")}
                />
              )}
            />
            <FormField
              control={form.control}
              name="maxActiveOrders"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("maxActiveOrders")}</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="numeric" autoComplete="off" />
                  </FormControl>
                  <p className="text-small text-text-muted">
                    {t("maxActiveOrdersHint")}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" loading={pending}>
                {tMenu("save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

type ZoneValues = { name: string; barId: string; vip: boolean };

function ZoneDialog({
  bars,
  barId,
  zone,
  trigger,
}: {
  bars: AdminBar[];
  barId: string;
  zone?: AdminZone;
  trigger: ReactNode;
}) {
  const t = useTranslations("admin.bars");
  const tMenu = useTranslations("admin.menu");
  const [open, setOpen] = useState(false);
  const [pending, run] = useMenuAction();
  const defaults: ZoneValues = {
    name: zone?.name ?? "",
    barId,
    vip: zone?.type === "vip_table",
  };
  const form = useForm<ZoneValues>({ defaultValues: defaults });
  const onError = useFieldErrors(form);

  function submit(values: ZoneValues) {
    const input = {
      name: values.name.trim(),
      barId: values.barId,
      type: values.vip ? ("vip_table" as const) : ("bar_area" as const),
    };
    run(
      () =>
        zone
          ? updateZoneAction({ id: zone.id, input })
          : createZoneAction(input),
      { onDone: () => setOpen(false), onError },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) form.reset(defaults);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent closeLabel={tMenu("close")}>
        <DialogHeader>
          <DialogTitle>{zone ? t("editZone") : t("addZone")}</DialogTitle>
          <DialogDescription>{t("zoneHint")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(submit)}
            className="flex flex-col gap-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("zoneName")}</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="barId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("zoneBar")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {bars.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="vip"
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onChange={field.onChange}
                  label={t("vipTable")}
                  hint={t("vipTableHint")}
                />
              )}
            />
            <DialogFooter>
              <Button type="submit" loading={pending}>
                {tMenu("save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

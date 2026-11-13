"use client";

import type { AdminPromo } from "@namitiszunk/core/promos";
import { formatDateTime, formatHuf } from "@namitiszunk/i18n";
import {
  Badge,
  Button,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@namitiszunk/ui";
import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ComponentProps, useState } from "react";
import { useForm, useWatch, type FieldPath } from "react-hook-form";

import { useMenuAction, useValidationText } from "../menu/use-menu-action";
import { createPromoAction, setPromoActiveAction } from "./actions";

/** The Promotions module (T-060): create a code, stop or restart it, and see its usage. */
export function PromosManager({ promos }: { promos: AdminPromo[] }) {
  const t = useTranslations("admin.promos");
  const add = <PromoDialog />;
  if (promos.length === 0)
    return <EmptyState message={t("empty")} action={add} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="self-start">{add}</div>
      <Table label={t("tableLabel")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("colCode")}</TableHead>
            <TableHead>{t("colDiscount")}</TableHead>
            <TableHead>{t("colLimits")}</TableHead>
            <TableHead className="text-right">{t("colUses")}</TableHead>
            <TableHead className="text-right">
              {t("colTotalDiscount")}
            </TableHead>
            <TableHead className="text-right">
              {t("colAverageBasket")}
            </TableHead>
            <TableHead>{t("colStatus")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("stop")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {promos.map((promo) => (
            <PromoRow key={promo.id} promo={promo} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PromoRow({ promo }: { promo: AdminPromo }) {
  const t = useTranslations("admin.promos");
  const locale = useLocale();
  const [pending, run] = useMenuAction();
  const date = (iso: string | null) =>
    iso ? formatDateTime(new Date(iso), locale) : "…";
  const limits = [
    promo.minOrderHuf > 0 &&
      t("minOrderValue", { amount: formatHuf(promo.minOrderHuf) }),
    (promo.validFrom || promo.validTo) &&
      t("period", { from: date(promo.validFrom), to: date(promo.validTo) }),
  ].filter(Boolean);

  return (
    <TableRow>
      <TableCell className="font-mono">{promo.code}</TableCell>
      <TableCell className="tabular-nums">
        {promo.type === "percent"
          ? t("percentValue", { percent: promo.value / 100 })
          : formatHuf(promo.value)}
      </TableCell>
      <TableCell className="text-small">
        {limits.length > 0 ? limits.join(" · ") : t("noLimits")}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {promo.maxUses === null
          ? promo.usedCount
          : t("usesValue", { used: promo.usedCount, max: promo.maxUses })}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatHuf(promo.totalDiscountHuf)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatHuf(promo.averageBasketHuf)}
      </TableCell>
      <TableCell>
        {/* A code state, not an order status: neutral unless the code is live (DESIGN_SYSTEM §06). */}
        {promo.isExpired ? (
          <Badge status="neutral">{t("expired")}</Badge>
        ) : promo.isActive ? (
          <Badge status="new">{t("active")}</Badge>
        ) : (
          <Badge status="neutral">{t("stopped")}</Badge>
        )}
      </TableCell>
      <TableCell>
        <Button
          variant="secondary"
          loading={pending}
          onClick={() =>
            run(() =>
              setPromoActiveAction({ id: promo.id, isActive: !promo.isActive }),
            )
          }
        >
          {promo.isActive ? t("stop") : t("restart")}
          {/* The visible word starts the name (WCAG 2.5.3); the code tells the rows apart. */}
          <span className="sr-only"> {promo.code}</span>
        </Button>
      </TableCell>
    </TableRow>
  );
}

type PromoValues = {
  code: string;
  type: "percent" | "fixed";
  value: string;
  maxUses: string;
  minOrderHuf: string;
  validFrom: string;
  validTo: string;
};

const emptyValues: PromoValues = {
  code: "",
  type: "percent",
  value: "",
  maxUses: "",
  minOrderHuf: "",
  validFrom: "",
  validTo: "",
};

// A non-number is sent as is, so the shared schema names the field.
const optionalNumber = (value: string) =>
  value.trim() === "" ? undefined : Number(value);
// datetime-local has no zone: the browser reads it in the owner's own time zone.
const optionalIso = (value: string) =>
  value === "" ? undefined : new Date(value).toISOString();

function PromoDialog() {
  const t = useTranslations("admin.promos");
  const tMenu = useTranslations("admin.menu");
  const validationText = useValidationText();
  const [open, setOpen] = useState(false);
  const [pending, run] = useMenuAction();
  const form = useForm<PromoValues>({ defaultValues: emptyValues });
  const type = useWatch({ control: form.control, name: "type" });

  function submit(values: PromoValues) {
    const value = optionalNumber(values.value);
    const input = {
      code: values.code.trim(),
      type: values.type,
      // The owner types whole percents; the model stores basis points.
      value:
        values.type === "percent" && value !== undefined ? value * 100 : value,
      maxUses: optionalNumber(values.maxUses),
      minOrderHuf: optionalNumber(values.minOrderHuf),
      validFrom: optionalIso(values.validFrom),
      validTo: optionalIso(values.validTo),
    };
    run(() => createPromoAction(input), {
      onDone: () => setOpen(false),
      onError: ({ fields }) => {
        for (const [path, key] of Object.entries(fields ?? {})) {
          form.setError(path as FieldPath<PromoValues>, {
            message: validationText(key),
          });
        }
      },
    });
  }

  const field = (
    name: Exclude<keyof PromoValues, "type">,
    label: string,
    props: ComponentProps<typeof Input> = {},
    hint?: string,
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field: f }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...f} autoComplete="off" {...props} />
          </FormControl>
          {hint && <p className="text-small text-text-muted">{hint}</p>}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) form.reset(emptyValues);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden />
          {t("add")}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={tMenu("close")}>
        <DialogHeader>
          <DialogTitle>{t("add")}</DialogTitle>
          <DialogDescription>{t("addHint")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(submit)}
            className="flex flex-col gap-4"
            noValidate
          >
            {field("code", t("code"), { className: "uppercase" })}
            <FormField
              control={form.control}
              name="type"
              render={({ field: f }) => (
                <FormItem>
                  <FormLabel>{t("type")}</FormLabel>
                  <Select value={f.value} onValueChange={f.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="percent">
                        {t("typePercent")}
                      </SelectItem>
                      <SelectItem value="fixed">{t("typeFixed")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {field(
              "value",
              type === "percent" ? t("valuePercent") : t("valueFixed"),
              { inputMode: "numeric" },
            )}
            {field(
              "maxUses",
              t("maxUses"),
              { inputMode: "numeric" },
              t("maxUsesHint"),
            )}
            {field("minOrderHuf", t("minOrder"), { inputMode: "numeric" })}
            <div className="grid gap-4 sm:grid-cols-2">
              {field("validFrom", t("validFrom"), { type: "datetime-local" })}
              {field("validTo", t("validTo"), { type: "datetime-local" })}
            </div>
            <DialogFooter>
              <Button type="submit" loading={pending}>
                {t("create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

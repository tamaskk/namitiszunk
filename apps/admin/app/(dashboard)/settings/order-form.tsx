"use client";

import type { VenueSettings } from "@namitiszunk/core/settings";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@namitiszunk/ui";
import {
  bpsToPercent,
  percentToBps,
  serviceFeeTypes,
  toInt,
} from "@namitiszunk/validators";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";

import {
  CheckField,
  SaveButton,
  TextField,
  useSaveSettings,
} from "./settings-fields";

type Order = VenueSettings["order"];
type Values = {
  autoAccept: boolean;
  pickupDeadlineMinutes: string;
  refundOnExpiry: boolean;
  maxItemsPerOrder: string;
  minimumOrderHuf: string;
  lastOrderMinutesBeforeClose: string;
  serviceFee: { type: Order["serviceFee"]["type"]; value: string };
  tips: { enabled: boolean; presetsBps: string[] };
};

function toValues(order: Order): Values {
  return {
    ...order,
    pickupDeadlineMinutes: String(order.pickupDeadlineMinutes),
    maxItemsPerOrder: String(order.maxItemsPerOrder),
    minimumOrderHuf: String(order.minimumOrderHuf),
    lastOrderMinutesBeforeClose: String(order.lastOrderMinutesBeforeClose),
    serviceFee: {
      type: order.serviceFee.type,
      // A percentage is typed as % (12.5), stored as basis points (1250); a fixed fee in forints.
      value:
        order.serviceFee.type === "percent"
          ? bpsToPercent(order.serviceFee.value)
          : String(order.serviceFee.value),
    },
    tips: {
      enabled: order.tips.enabled,
      presetsBps: order.tips.presetsBps.map(bpsToPercent),
    },
  };
}

/** Order rules (T-058): fee and tips change the checkout total, priced on the server (#22). */
export function OrderForm({ order }: { order: Order }) {
  const t = useTranslations("admin.settings.order");
  const form = useForm<Values>({ defaultValues: toValues(order) });
  const [pending, save] = useSaveSettings(form);
  const feeType = useWatch({ control: form.control, name: "serviceFee.type" });
  const tipsOn = useWatch({ control: form.control, name: "tips.enabled" });

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit((values) =>
          save({
            tab: "order",
            autoAccept: values.autoAccept,
            refundOnExpiry: values.refundOnExpiry,
            pickupDeadlineMinutes: toInt(values.pickupDeadlineMinutes),
            maxItemsPerOrder: toInt(values.maxItemsPerOrder),
            minimumOrderHuf: toInt(values.minimumOrderHuf),
            lastOrderMinutesBeforeClose: toInt(
              values.lastOrderMinutesBeforeClose,
            ),
            serviceFee: {
              type: values.serviceFee.type,
              value:
                values.serviceFee.type === "none"
                  ? 0
                  : values.serviceFee.type === "percent"
                    ? percentToBps(values.serviceFee.value)
                    : toInt(values.serviceFee.value),
            },
            tips: {
              enabled: values.tips.enabled,
              presetsBps: values.tips.presetsBps.map(percentToBps),
            },
          }),
        )}
        className="flex max-w-120 flex-col gap-6"
      >
        <section aria-labelledby="fee-title" className="flex flex-col gap-4">
          <h2 id="fee-title" className="text-h3">
            {t("serviceFee")}
          </h2>
          <FormField
            control={form.control}
            name="serviceFee.type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("serviceFeeType")}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {serviceFeeTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(`feeTypes.${type}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          {feeType !== "none" && (
            <TextField
              name="serviceFee.value"
              label={feeType === "percent" ? t("feePercent") : t("feeFixed")}
              numeric
              decimal={feeType === "percent"}
            />
          )}
        </section>

        <section aria-labelledby="tips-title" className="flex flex-col gap-4">
          <h2 id="tips-title" className="text-h3">
            {t("tips")}
          </h2>
          <CheckField
            name="tips.enabled"
            label={t("tipsEnabled")}
            hint={t("tipsHint")}
          />
          {tipsOn && (
            <div className="grid grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <TextField
                  key={i}
                  name={`tips.presetsBps.${i}`}
                  label={t("tipPreset", { n: i + 1 })}
                  numeric
                  decimal
                />
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="rules-title" className="flex flex-col gap-4">
          <h2 id="rules-title" className="text-h3">
            {t("rules")}
          </h2>
          <CheckField
            name="autoAccept"
            label={t("autoAccept")}
            hint={t("autoAcceptHint")}
          />
          <TextField
            name="pickupDeadlineMinutes"
            label={t("pickupDeadline")}
            hint={t("pickupDeadlineHint")}
            numeric
          />
          <CheckField
            name="refundOnExpiry"
            label={t("refundOnExpiry")}
            hint={t("refundOnExpiryHint")}
          />
          <TextField name="maxItemsPerOrder" label={t("maxItems")} numeric />
          <TextField
            name="minimumOrderHuf"
            label={t("minimumOrder")}
            hint={t("minimumOrderHint")}
            numeric
          />
          <TextField
            name="lastOrderMinutesBeforeClose"
            label={t("lastOrder")}
            hint={t("lastOrderHint")}
            numeric
          />
        </section>
        <SaveButton pending={pending} />
      </form>
    </Form>
  );
}

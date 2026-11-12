import type { AdminMenu, AdminMenuItem } from "@namitiszunk/core/menu";
import {
  Button,
  Checkbox,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Textarea,
  toast,
} from "@namitiszunk/ui";
import { allergenCodes, type ItemInput } from "@namitiszunk/validators";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  useFieldArray,
  useForm,
  useFormContext,
  type FieldPath,
} from "react-hook-form";

import { uploadImage } from "@/lib/upload-image";

import { createItemAction, updateItemAction } from "./actions";
import {
  useMenuAction,
  useMenuErrorText,
  useValidationText,
} from "./use-menu-action";

export type ItemSheetTarget = { categoryId: string; item?: AdminMenuItem };

type Allergen = (typeof allergenCodes)[number];
type GroupValues = {
  name: string;
  nameEn: string;
  required: boolean;
  minSelect: string;
  maxSelect: string;
  modifiers: { name: string; nameEn: string; priceDeltaHuf: string }[];
};
type Values = {
  categoryId: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  // Number fields stay strings while typed; toInput turns them into integers for the server.
  priceHuf: string;
  vatRate: "5" | "18" | "27";
  alcoholPercent: string;
  allergens: Allergen[];
  barIds: string[];
  isAvailable: boolean;
  imageUrl: string;
  modifierGroups: GroupValues[];
};

/** The new-item or edit form in a side sheet; on phones it fills the screen. */
export function ItemSheet({
  target,
  onClose,
  menu,
  venueId,
}: {
  target: ItemSheetTarget | null;
  onClose: () => void;
  menu: AdminMenu;
  venueId: string;
}) {
  const t = useTranslations("admin.menu");
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        closeLabel={t("close")}
        className="w-full sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle>{target?.item ? t("editItem") : t("newItem")}</SheetTitle>
          <SheetDescription className="sr-only">
            {target?.item?.name ?? t("newItem")}
          </SheetDescription>
        </SheetHeader>
        {target && (
          <ItemForm
            key={target.item?.id ?? `new-${target.categoryId}`}
            target={target}
            menu={menu}
            venueId={venueId}
            onSaved={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ItemForm({
  target,
  menu,
  venueId,
  onSaved,
}: {
  target: ItemSheetTarget;
  menu: AdminMenu;
  venueId: string;
  onSaved: () => void;
}) {
  const t = useTranslations("admin.menu");
  const tAllergen = useTranslations("admin.menu.allergenNames");
  const validationText = useValidationText();
  const errorText = useMenuErrorText();
  const [pending, run] = useMenuAction();
  const form = useForm<Values>({
    defaultValues: toValues(target, menu.bars),
  });
  const groups = useFieldArray({
    control: form.control,
    name: "modifierGroups",
  });
  const copySources = menu.categories
    .flatMap((category) => category.items)
    .filter(
      (item) => item.id !== target.item?.id && item.modifierGroups.length > 0,
    );

  function submit(values: Values) {
    if (menu.bars.length > 0 && values.barIds.length === 0) {
      form.setError("barIds", { message: t("barsRequired") });
      return;
    }
    const input = toInput(values, menu.bars.length);
    const { item } = target;
    run(
      () =>
        item
          ? updateItemAction({ id: item.id, input })
          : createItemAction(input).then((r) =>
              "error" in r ? r : { data: null },
            ),
      {
        onDone: () => {
          toast.success(t("saved"));
          onSaved();
        },
        onError: ({ code, fields }) => {
          for (const [path, key] of Object.entries(fields ?? {})) {
            form.setError(path.replace(/^input\./, "") as FieldPath<Values>, {
              message: validationText(key),
            });
          }
          toast.error(errorText(code));
        },
      },
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(submit)}
        className="flex flex-col gap-6"
        noValidate
      >
        <TextField name="name" label={t("name")} />
        <TextField name="nameEn" label={t("nameEn")} lang="en" />
        <TextField name="description" label={t("description")} multiline />
        <TextField
          name="descriptionEn"
          label={t("descriptionEn")}
          lang="en"
          multiline
        />

        <FormField
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("category")}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {menu.categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <TextField name="priceHuf" label={t("price")} numeric />
          <FormField
            control={form.control}
            name="vatRate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("vatRate")}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(["5", "18", "27"] as const).map((rate) => (
                      <SelectItem key={rate} value={rate}>
                        {t("vatOption", { rate })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <TextField
          name="alcoholPercent"
          label={t("alcoholPercent")}
          numeric
          decimal
        />

        <ImageField venueId={venueId} />

        <FormField
          control={form.control}
          name="allergens"
          render={({ field }) => (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-small font-medium">
                {t("allergens")}
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2">
                {allergenCodes.map((code) => (
                  <Checkbox
                    key={code}
                    label={tAllergen(code)}
                    checked={field.value.includes(code)}
                    onChange={(on) =>
                      field.onChange(
                        on
                          ? [...field.value, code]
                          : field.value.filter((c) => c !== code),
                      )
                    }
                  />
                ))}
              </div>
            </fieldset>
          )}
        />

        {menu.bars.length > 0 && (
          <FormField
            control={form.control}
            name="barIds"
            render={({ field, fieldState }) => (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-small font-medium">
                  {t("bars")}
                </legend>
                {menu.bars.map((bar) => (
                  <Checkbox
                    key={bar.id}
                    label={bar.name}
                    checked={field.value.includes(bar.id)}
                    onChange={(on) =>
                      field.onChange(
                        on
                          ? [...field.value, bar.id]
                          : field.value.filter((id) => id !== bar.id),
                      )
                    }
                  />
                ))}
                <p className="text-small text-text-muted">{t("barsHint")}</p>
                {fieldState.error?.message && (
                  <p role="alert" className="text-small text-danger">
                    {fieldState.error.message}
                  </p>
                )}
              </fieldset>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="isAvailable"
          render={({ field }) => (
            <Checkbox
              label={t("available")}
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />

        <section className="flex flex-col gap-4" aria-labelledby="groups">
          <h3 id="groups" className="text-h3">
            {t("modifierGroups")}
          </h3>
          {groups.fields.map((group, index) => (
            <GroupFields
              key={group.id}
              index={index}
              onRemove={() => groups.remove(index)}
            />
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                groups.append({
                  name: "",
                  nameEn: "",
                  required: false,
                  minSelect: "0",
                  maxSelect: "1",
                  modifiers: [{ name: "", nameEn: "", priceDeltaHuf: "0" }],
                })
              }
            >
              <Plus aria-hidden />
              {t("addGroup")}
            </Button>
            {copySources.length > 0 && (
              <div className="grid min-w-56 flex-1 gap-2">
                <Label htmlFor="copy-groups" className="sr-only">
                  {t("copyGroups")}
                </Label>
                <Select
                  value=""
                  onValueChange={(id) => {
                    const source = copySources.find((item) => item.id === id);
                    if (source)
                      groups.append(source.modifierGroups.map(toGroupValues));
                  }}
                >
                  <SelectTrigger id="copy-groups">
                    <SelectValue placeholder={t("copyGroups")} />
                  </SelectTrigger>
                  <SelectContent>
                    {copySources.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </section>

        {/* Sticky, so a long form never hides its main action on a phone. */}
        <div className="sticky bottom-0 -mx-6 -mb-6 border-t border-border bg-surface px-6 py-3">
          <Button type="submit" loading={pending}>
            {t("save")}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function GroupFields({
  index,
  onRemove,
}: {
  index: number;
  onRemove: () => void;
}) {
  const t = useTranslations("admin.menu");
  const form = useFormContext<Values>();
  const modifiers = useFieldArray({
    control: form.control,
    name: `modifierGroups.${index}.modifiers`,
  });
  const prefix = `modifierGroups.${index}` as const;
  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <legend className="sr-only">
        {t("modifierGroups")} {index + 1}
      </legend>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <TextField name={`${prefix}.name`} label={t("groupName")} />
        </div>
        <Button
          type="button"
          variant="ghost"
          className="w-12 px-0"
          aria-label={t("removeGroup")}
          onClick={onRemove}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
      <TextField name={`${prefix}.nameEn`} label={t("groupNameEn")} lang="en" />
      <FormField
        control={form.control}
        name={`${prefix}.required`}
        render={({ field }) => (
          <Checkbox
            label={t("required")}
            checked={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <div className="grid grid-cols-2 gap-4">
        <TextField
          name={`${prefix}.minSelect`}
          label={t("minSelect")}
          numeric
        />
        <TextField
          name={`${prefix}.maxSelect`}
          label={t("maxSelect")}
          numeric
        />
      </div>
      <p className="text-small font-medium">{t("modifiers")}</p>
      {modifiers.fields.map((modifier, m) => (
        <div
          key={modifier.id}
          className="flex flex-col gap-2 border-t border-border pt-4"
        >
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <TextField
                name={`${prefix}.modifiers.${m}.name`}
                label={t("modifierName")}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              className="w-12 shrink-0 px-0"
              aria-label={t("removeModifier")}
              disabled={modifiers.fields.length === 1}
              onClick={() => modifiers.remove(m)}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
          <TextField
            name={`${prefix}.modifiers.${m}.nameEn`}
            label={t("modifierNameEn")}
            lang="en"
          />
          <TextField
            name={`${prefix}.modifiers.${m}.priceDeltaHuf`}
            label={t("priceDelta")}
            numeric
          />
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        className="self-start"
        onClick={() =>
          modifiers.append({ name: "", nameEn: "", priceDeltaHuf: "0" })
        }
      >
        <Plus aria-hidden />
        {t("addModifier")}
      </Button>
    </fieldset>
  );
}

function TextField({
  name,
  label,
  lang,
  multiline,
  numeric,
  decimal,
}: {
  name: FieldPath<Values>;
  label: string;
  lang?: string;
  multiline?: boolean;
  numeric?: boolean;
  decimal?: boolean;
}) {
  const form = useFormContext<Values>();
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            {multiline ? (
              <Textarea
                {...field}
                value={String(field.value ?? "")}
                lang={lang}
              />
            ) : (
              <Input
                {...field}
                value={String(field.value ?? "")}
                lang={lang}
                autoComplete="off"
                inputMode={
                  numeric ? (decimal ? "decimal" : "numeric") : undefined
                }
                className={numeric ? "tabular-nums" : undefined}
              />
            )}
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Uploads straight to Blob with a one-time token from apps/api; the file never passes our servers. */
function ImageField({ venueId }: { venueId: string }) {
  const t = useTranslations("admin.menu");
  const form = useFormContext<Values>();
  const [uploading, setUploading] = useState(false);
  const url = form.watch("imageUrl");

  async function upload(file: File) {
    setUploading(true);
    try {
      form.setValue("imageUrl", await uploadImage(venueId, "product", file), {
        shouldDirty: true,
      });
      form.clearErrors("imageUrl");
    } catch {
      // The token route and Blob refuse wrong types and files over 5 MB; one message covers all.
      toast.error(t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <FormField
      control={form.control}
      name="imageUrl"
      render={() => (
        <FormItem>
          <FormLabel>{t("image")}</FormLabel>
          {url && (
            // eslint-disable-next-line @next/next/no-img-element -- a Blob URL the owner just chose
            <img
              src={url}
              alt=""
              className="aspect-square w-32 rounded-md object-cover"
            />
          )}
          <div className="flex flex-wrap gap-2">
            <FormControl>
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                aria-busy={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.target.value = "";
                }}
                className="flex-1 py-3"
              />
            </FormControl>
            {url && (
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  form.setValue("imageUrl", "", { shouldDirty: true })
                }
              >
                {t("removeImage")}
              </Button>
            )}
          </div>
          <FormDescription>
            {uploading ? t("uploading") : t("imageHint")}
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function toGroupValues(
  group: NonNullable<ItemInput["modifierGroups"]>[number],
): GroupValues {
  return {
    name: group.name,
    nameEn: group.nameEn ?? "",
    required: group.required,
    minSelect: String(group.minSelect),
    maxSelect: String(group.maxSelect),
    modifiers: group.modifiers.map((modifier) => ({
      name: modifier.name,
      nameEn: modifier.nameEn ?? "",
      priceDeltaHuf: String(modifier.priceDeltaHuf),
    })),
  };
}

function toValues(
  { categoryId, item }: ItemSheetTarget,
  bars: AdminMenu["bars"],
): Values {
  return {
    categoryId: item?.categoryId ?? categoryId,
    name: item?.name ?? "",
    nameEn: item?.nameEn ?? "",
    description: item?.description ?? "",
    descriptionEn: item?.descriptionEn ?? "",
    priceHuf: item ? String(item.priceHuf) : "",
    vatRate: item ? (String(item.vatRate) as Values["vatRate"]) : "27",
    alcoholPercent:
      item?.alcoholPercent == null ? "" : String(item.alcoholPercent),
    allergens: item?.allergens ?? [],
    // No bar list on the item means every bar, including ones added later.
    barIds: item?.barIds.length ? item.barIds : bars.map((bar) => bar.id),
    isAvailable: item?.isAvailable ?? true,
    imageUrl: item?.imageUrl ?? "",
    modifierGroups: (item?.modifierGroups ?? []).map(toGroupValues),
  };
}

/** Empty optional fields go as undefined, so core clears them; a typo'd number reaches the schema as NaN and fails there. */
function toInput(values: Values, barCount: number): ItemInput {
  const text = (value: string) => value.trim() || undefined;
  const number = (value: string) =>
    value.trim() === "" ? undefined : Number(value.replace(",", "."));
  return {
    categoryId: values.categoryId,
    name: values.name.trim(),
    nameEn: text(values.nameEn),
    description: text(values.description),
    descriptionEn: text(values.descriptionEn),
    priceHuf: number(values.priceHuf) ?? Number.NaN,
    vatRate: Number(values.vatRate) as ItemInput["vatRate"],
    imageUrl: text(values.imageUrl),
    alcoholPercent: number(values.alcoholPercent),
    allergens: values.allergens,
    isAvailable: values.isAvailable,
    // Every bar ticked: save "all bars", so a bar opened later sells the item too.
    barIds: values.barIds.length === barCount ? [] : values.barIds,
    modifierGroups: values.modifierGroups.map((group) => ({
      name: group.name.trim(),
      nameEn: text(group.nameEn),
      required: group.required,
      minSelect: number(group.minSelect) ?? Number.NaN,
      maxSelect: number(group.maxSelect) ?? Number.NaN,
      modifiers: group.modifiers.map((modifier) => ({
        name: modifier.name.trim(),
        nameEn: text(modifier.nameEn),
        priceDeltaHuf: number(modifier.priceDeltaHuf) ?? 0,
      })),
    })),
  };
}

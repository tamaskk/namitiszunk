import type { AdminMenu } from "@namitiszunk/core/menu";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from "@namitiszunk/ui";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { useForm, type FieldPath } from "react-hook-form";

import { createCategoryAction, updateCategoryAction } from "./actions";
import { useMenuAction, useValidationText } from "./use-menu-action";

type Values = { name: string; nameEn: string; vipOnly: boolean };

/** New category, or the edit of one; the VIP flag hides all its items from a plain QR. */
export function CategoryDialog({
  category,
  trigger,
}: {
  category?: AdminMenu["categories"][number];
  trigger: ReactNode;
}) {
  const t = useTranslations("admin.menu");
  const validationText = useValidationText();
  const [open, setOpen] = useState(false);
  const [pending, run] = useMenuAction();
  const defaults: Values = {
    name: category?.name ?? "",
    nameEn: category?.nameEn ?? "",
    vipOnly: category?.vipOnly ?? false,
  };
  const form = useForm<Values>({ defaultValues: defaults });

  function submit(values: Values) {
    const input = {
      name: values.name.trim(),
      nameEn: values.nameEn.trim() || undefined,
      vipOnly: values.vipOnly,
    };
    run(
      () =>
        category
          ? updateCategoryAction({ id: category.id, input })
          : createCategoryAction(input).then((r) =>
              "error" in r ? r : { data: null },
            ),
      {
        onDone: () => setOpen(false),
        onError: ({ fields }) => {
          for (const [path, key] of Object.entries(fields ?? {})) {
            form.setError(path.replace(/^input\./, "") as FieldPath<Values>, {
              message: validationText(key),
            });
          }
        },
      },
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
      <DialogContent closeLabel={t("close")}>
        <DialogHeader>
          <DialogTitle>
            {category ? t("editCategory") : t("addCategory")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("vipOnlyHint")}
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
                  <FormLabel>{t("categoryName")}</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="nameEn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("categoryNameEn")}</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="off" lang="en" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="vipOnly"
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onChange={field.onChange}
                  label={t("vipOnly")}
                  hint={t("vipOnlyHint")}
                />
              )}
            />
            <DialogFooter>
              <Button type="submit" loading={pending}>
                {t("save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

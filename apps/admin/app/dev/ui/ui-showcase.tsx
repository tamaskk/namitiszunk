"use client";

import { formatHuf } from "@namitiszunk/i18n";
import {
  Badge,
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
  Form,
  FormControl,
  FormDescription,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
  Toaster,
} from "@namitiszunk/ui";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-h2">{title}</h2>
      {children}
    </section>
  );
}

export function UiShowcase() {
  const t = useTranslations("admin.devUi");
  const form = useForm({ defaultValues: { email: "", category: "" } });
  const tabs = [
    { value: "new", label: t("statusNew") },
    { value: "inProgress", label: t("statusInProgress") },
    { value: "ready", label: t("statusReady") },
  ];

  return (
    <main className="mx-auto flex max-w-content flex-col gap-12 p-6">
      <h1 className="text-h1">{t("title")}</h1>

      <Section title={t("buttons")}>
        <div className="flex flex-wrap gap-4">
          <Button>{t("pay")}</Button>
          <Button variant="secondary">{t("cancel")}</Button>
          <Button variant="ghost">{t("filter")}</Button>
          <Button variant="danger">{t("reject")}</Button>
          <Button loading>{t("saving")}</Button>
          <Button disabled>{t("pay")}</Button>
          <Button size="bar">{t("ready")}</Button>
        </div>
      </Section>

      <Section title={t("fields")}>
        <Form {...form}>
          <form
            noValidate
            className="flex max-w-guest flex-col gap-6"
            onSubmit={form.handleSubmit(() => toast(t("toastMessage")))}
          >
            <FormField
              control={form.control}
              name="email"
              rules={{ required: t("emailRequired") }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("emailLabel")}</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" {...field} />
                  </FormControl>
                  <FormDescription>{t("emailHint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("categoryLabel")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("categoryPlaceholder")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="beers">{t("beers")}</SelectItem>
                      <SelectItem value="cocktails">
                        {t("cocktails")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <Button type="submit" className="self-start">
              {t("submit")}
            </Button>
          </form>
        </Form>
      </Section>

      <Section title={t("statuses")}>
        <div className="flex flex-wrap gap-2">
          <Badge status="new">{t("statusNew")}</Badge>
          <Badge status="inProgress">{t("statusInProgress")}</Badge>
          <Badge status="ready">{t("statusReady")}</Badge>
          <Badge status="pickedUp">{t("statusPickedUp")}</Badge>
          <Badge status="rejected">{t("statusRejected")}</Badge>
        </div>
      </Section>

      <Section title={t("table")}>
        <Table label={t("table")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("item")}</TableHead>
              <TableHead>{t("quantity")}</TableHead>
              <TableHead className="text-right">{t("price")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>{t("beer")}</TableCell>
              <TableCell>2</TableCell>
              <TableCell className="text-right">{formatHuf(2580)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      <Section title={t("tabs")}>
        <Tabs defaultValue="new">
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent
              key={tab.value}
              value={tab.value}
              className="pt-4 text-text-muted"
            >
              {t("tabBody", { tab: tab.label })}
            </TabsContent>
          ))}
        </Tabs>
      </Section>

      <Section title={t("overlays")}>
        <div className="flex flex-wrap gap-4">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">{t("openDialog")}</Button>
            </DialogTrigger>
            <DialogContent destructive>
              <DialogHeader>
                <DialogTitle>{t("dialogTitle")}</DialogTitle>
                <DialogDescription>{t("dialogBody")}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary">{t("cancel")}</Button>
                </DialogClose>
                <Button variant="danger">{t("reject")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">{t("openSheet")}</Button>
            </SheetTrigger>
            <SheetContent closeLabel={t("close")}>
              <SheetHeader>
                <SheetTitle>{t("sheetTitle")}</SheetTitle>
                <SheetDescription>{t("emptyCart")}</SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>
          <Button variant="ghost" onClick={() => toast(t("toastMessage"))}>
            {t("showToast")}
          </Button>
        </div>
      </Section>

      <Section title={t("emptyState")}>
        <EmptyState
          className="max-w-guest"
          message={t("emptyCart")}
          action={<Button>{t("browseMenu")}</Button>}
        />
      </Section>

      <Toaster />
    </main>
  );
}

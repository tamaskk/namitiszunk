"use client";

import type { AdminMenu, AdminMenuItem } from "@namitiszunk/core/menu";
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
  EmptyState,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@namitiszunk/ui";
import { Archive, Copy, ExternalLink, Pencil, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useOptimistic, useState } from "react";

import { guestMenuUrl } from "@/lib/order-app";

import {
  archiveCategoryAction,
  archiveItemAction,
  duplicateItemAction,
  reorderCategoriesAction,
  reorderItemsAction,
  setItemAvailableAction,
} from "./actions";
import { CategoryDialog } from "./category-dialog";
import { ItemSheet, type ItemSheetTarget } from "./item-sheet";
import { SortableList } from "./sortable-list";
import { useMenuAction } from "./use-menu-action";

type Category = AdminMenu["categories"][number];

const NO_BAR = "none";

export function MenuEditor({
  menu,
  venueId,
  slug,
}: {
  menu: AdminMenu;
  venueId: string;
  slug: string;
}) {
  const t = useTranslations("admin.menu");
  const locale = useLocale();
  const [categories, setCategories] = useOptimistic(menu.categories);
  const [, run] = useMenuAction();
  const [sheet, setSheet] = useState<ItemSheetTarget | null>(null);
  const [previewBar, setPreviewBar] = useState(NO_BAR);

  function reorderCategories(ids: string[]) {
    run(() => reorderCategoriesAction({ ids }), {
      before: () => setCategories(sortBy(categories, ids)),
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <CategoryDialog
          trigger={
            <Button>
              <Plus aria-hidden />
              {t("addCategory")}
            </Button>
          }
        />
        <div className="ml-auto flex flex-wrap items-end gap-2">
          {menu.bars.length > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="preview-bar">{t("previewBar")}</Label>
              <Select value={previewBar} onValueChange={setPreviewBar}>
                <SelectTrigger id="preview-bar" className="min-w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_BAR}>{t("previewAllBars")}</SelectItem>
                  {menu.bars.map((bar) => (
                    <SelectItem key={bar.id} value={bar.id}>
                      {bar.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button variant="secondary" asChild>
            <a
              href={guestMenuUrl(
                slug,
                locale,
                previewBar === NO_BAR ? null : previewBar,
              )}
              target="_blank"
              rel="noreferrer"
            >
              {t("preview")}
              <span className="sr-only"> ({t("newTab")})</span>
              <ExternalLink aria-hidden />
            </a>
          </Button>
        </div>
      </div>

      {categories.length === 0 ? (
        <EmptyState message={t("emptyMenu")} />
      ) : (
        <SortableList
          items={categories}
          onReorder={reorderCategories}
          handleLabel={(category) => t("dragHandle", { name: category.name })}
          className="gap-6"
        >
          {(category, handle) => (
            <CategorySection
              category={category}
              handle={handle}
              onAddItem={() => setSheet({ categoryId: category.id })}
              onEditItem={(item) => setSheet({ categoryId: category.id, item })}
            />
          )}
        </SortableList>
      )}

      <ItemSheet
        target={sheet}
        onClose={() => setSheet(null)}
        menu={menu}
        venueId={venueId}
      />
    </>
  );
}

function CategorySection({
  category,
  handle,
  onAddItem,
  onEditItem,
}: {
  category: Category;
  handle: React.ReactNode;
  onAddItem: () => void;
  onEditItem: (item: AdminMenuItem) => void;
}) {
  const t = useTranslations("admin.menu");
  const [items, setItems] = useOptimistic(category.items);
  const [, run] = useMenuAction();

  function reorderItems(ids: string[]) {
    run(() => reorderItemsAction({ categoryId: category.id, ids }), {
      before: () => setItems(sortBy(items, ids)),
    });
  }

  return (
    <section
      aria-labelledby={`category-${category.id}`}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-6"
    >
      <header className="flex items-center gap-2">
        {handle}
        <h2
          id={`category-${category.id}`}
          className="flex min-w-0 flex-1 items-center gap-2 text-h3"
        >
          <span className="truncate">{category.name}</span>
          {category.vipOnly && <Badge status="neutral">{t("vipBadge")}</Badge>}
        </h2>
        <CategoryDialog
          category={category}
          trigger={
            <Button
              variant="ghost"
              className="w-12 px-0"
              aria-label={`${t("editCategory")}: ${category.name}`}
            >
              <Pencil aria-hidden />
            </Button>
          }
        />
        <ConfirmArchive
          label={`${t("archiveCategory")}: ${category.name}`}
          title={t("archiveCategory")}
          body={t("archiveCategoryBody", { name: category.name })}
          onConfirm={() => archiveCategoryAction({ id: category.id })}
        />
      </header>

      {items.length === 0 ? (
        <p className="text-small text-text-muted">{t("emptyCategory")}</p>
      ) : (
        <SortableList
          items={items}
          onReorder={reorderItems}
          handleLabel={(item) => t("dragHandle", { name: item.name })}
        >
          {(item, itemHandle) => (
            <ItemRow
              item={item}
              handle={itemHandle}
              onEdit={() => onEditItem(item)}
            />
          )}
        </SortableList>
      )}

      <Button variant="secondary" className="self-start" onClick={onAddItem}>
        <Plus aria-hidden />
        {t("addItem")}
      </Button>
    </section>
  );
}

function ItemRow({
  item,
  handle,
  onEdit,
}: {
  item: AdminMenuItem;
  handle: React.ReactNode;
  onEdit: () => void;
}) {
  const t = useTranslations("admin.menu");
  const [available, setAvailable] = useOptimistic(item.isAvailable);
  const [, run] = useMenuAction();
  const [duplicating, runDuplicate] = useMenuAction();

  return (
    // Phones: name on the first line, the actions below, so the name never shrinks to nothing.
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg py-1 pr-1 sm:flex-nowrap">
      <div className="flex min-w-0 basis-full items-center gap-2 sm:basis-auto sm:flex-1">
        {handle}
        {item.imageUrl && (
          // Blob URLs are external and already sized by the owner; next/image would need a remote pattern.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            className="hidden size-12 shrink-0 rounded-sm object-cover sm:block"
          />
        )}
        <button
          type="button"
          onClick={onEdit}
          className="flex min-h-12 min-w-0 flex-1 flex-col items-start justify-center rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className="w-full truncate text-body">
            <span className="sr-only">{t("edit")}: </span>
            {item.name}
          </span>
          <span className="text-small text-text-muted tabular-nums">
            {formatHuf(item.priceHuf)}
          </span>
        </button>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* A toggle button: the label stays "Sold out", aria-pressed carries the state. */}
        <Button
          variant="secondary"
          aria-pressed={!available}
          className={cn(
            "px-3",
            available ? "text-text-muted" : "border-warning text-warning",
          )}
          onClick={() =>
            run(
              () =>
                setItemAvailableAction({ id: item.id, available: !available }),
              { before: () => setAvailable(!available) },
            )
          }
        >
          <span className="sr-only">{item.name}: </span>
          {t("soldOut")}
        </Button>
        <Button
          variant="ghost"
          className="w-12 shrink-0 px-0"
          aria-label={`${t("duplicate")}: ${item.name}`}
          loading={duplicating}
          onClick={() =>
            runDuplicate(() => duplicateItemAction({ id: item.id }))
          }
        >
          <Copy aria-hidden />
        </Button>
        <ConfirmArchive
          label={`${t("archive")}: ${item.name}`}
          title={t("archiveItem")}
          body={t("archiveItemBody", { name: item.name })}
          onConfirm={() => archiveItemAction({ id: item.id })}
        />
      </div>
    </div>
  );
}

function ConfirmArchive({
  label,
  title,
  body,
  onConfirm,
}: {
  label: string;
  title: string;
  body: string;
  onConfirm: () => ReturnType<typeof archiveItemAction>;
}) {
  const t = useTranslations("admin.menu");
  const [open, setOpen] = useState(false);
  const [pending, run] = useMenuAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        className="w-12 shrink-0 px-0"
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        <Archive aria-hidden />
      </Button>
      <DialogContent destructive>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{t("cancel")}</Button>
          </DialogClose>
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              run(onConfirm, {
                onDone: () => setOpen(false),
              })
            }
          >
            {t("archive")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function sortBy<T extends { id: string }>(list: T[], ids: string[]): T[] {
  const byId = new Map(list.map((entry) => [entry.id, entry]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

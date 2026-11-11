"use client";

import type { AdminModuleKey } from "@namitiszunk/core/admin";
import {
  cn,
  focusRing,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@namitiszunk/ui";
import {
  BookOpen,
  ChartColumn,
  Ellipsis,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  MonitorSmartphone,
  QrCode,
  ReceiptText,
  Settings,
  Star,
  Tag,
  Users,
  Wallet,
  Wine,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavItem = { key: AdminModuleKey; path: string; label: string };

const icons: Record<AdminModuleKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  barView: MonitorSmartphone,
  vipView: Wine,
  orders: ReceiptText,
  menu: BookOpen,
  bars: QrCode,
  staff: Users,
  reports: ChartColumn,
  promos: Tag,
  payouts: Wallet,
  reviews: Star,
  settings: Settings,
  billing: FileText,
};

// The phone's bottom bar keeps four modules; the rest open from "More".
const BOTTOM_COUNT = 4;

function isActive(pathname: string, path: string): boolean {
  return path === "/"
    ? pathname === "/"
    : pathname === path || pathname.startsWith(`${path}/`);
}

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = icons[item.key];
  const active = isActive(pathname, item.path);
  return (
    <Link
      href={item.path}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-12 items-center gap-3 rounded-md px-4 text-small font-medium",
        active ? "bg-surface text-primary" : "text-text-muted hover:text-text",
        focusRing,
      )}
    >
      <Icon className="size-5" aria-hidden />
      {item.label}
    </Link>
  );
}

/** Desktop and landscape tablet (lg and up): the full module list on the left. */
export function SideNav({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={label}
      className="hidden w-64 shrink-0 flex-col gap-1 border-r border-border p-4 lg:flex"
    >
      {items.map((item) => (
        <NavLink key={item.key} item={item} pathname={pathname} />
      ))}
    </nav>
  );
}

/** Phones and portrait tablets: four modules at the bottom, the rest in a sheet. */
export function BottomNav({
  items,
  label,
  moreLabel,
  closeLabel,
}: {
  items: NavItem[];
  label: string;
  moreLabel: string;
  closeLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const shown = items.slice(0, BOTTOM_COUNT);
  const rest = items.slice(BOTTOM_COUNT);
  const tab = (active: boolean) =>
    cn(
      "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-label",
      active ? "text-primary" : "text-text-muted",
      focusRing,
    );

  return (
    <nav
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-bg lg:hidden"
    >
      {shown.map((item) => {
        const Icon = icons[item.key];
        const active = isActive(pathname, item.path);
        return (
          <Link
            key={item.key}
            href={item.path}
            aria-current={active ? "page" : undefined}
            className={tab(active)}
          >
            <Icon className="size-5" aria-hidden />
            <span className="w-full truncate text-center">{item.label}</span>
          </Link>
        );
      })}
      {rest.length > 0 && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            className={tab(rest.some((i) => isActive(pathname, i.path)))}
          >
            <Ellipsis className="size-5" aria-hidden />
            <span className="w-full truncate text-center">{moreLabel}</span>
          </SheetTrigger>
          <SheetContent closeLabel={closeLabel}>
            <SheetHeader>
              <SheetTitle>{moreLabel}</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-1">
              {rest.map((item) => (
                <NavLink
                  key={item.key}
                  item={item}
                  pathname={pathname}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </nav>
  );
}

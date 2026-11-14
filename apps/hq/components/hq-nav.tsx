"use client";

import { cn, focusRing } from "@namitiszunk/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** The HQ menu (T-066): one wrapping row of links, the current one marked for screen readers too. */
export function HqNav({
  items,
  label,
}: {
  items: { key: string; path: string; label: string }[];
  label: string;
}) {
  const path = usePathname();
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-1">
        {items.map((item) => {
          const current =
            item.path === "/"
              ? path === "/"
              : path === item.path || path.startsWith(`${item.path}/`);
          return (
            <li key={item.key}>
              <Link
                href={item.path}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center rounded-md px-3 text-body",
                  focusRing,
                  current
                    ? "bg-surface font-semibold text-primary"
                    : "text-text-muted hover:text-text",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

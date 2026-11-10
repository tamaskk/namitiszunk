import { toast } from "@namitiszunk/ui";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import type { MenuActionResult } from "./run-menu-action";

const knownErrors = [
  "validation_failed",
  "forbidden",
  "not_found",
  "category_not_empty",
  "menu_changed",
] as const;

export function useMenuErrorText() {
  const t = useTranslations("admin.menu.errors");
  return (code: string) =>
    knownErrors.includes(code as (typeof knownErrors)[number])
      ? t(code as (typeof knownErrors)[number])
      : t("generic");
}

/** Field errors come back as message keys ("validation.name.required"); unknown ones read "invalid". */
export function useValidationText() {
  const t = useTranslations("validation");
  return (key: string) => {
    const short = key.replace(/^validation\./, "") as Parameters<typeof t>[0];
    return key.startsWith("validation.") && t.has(short)
      ? t(short)
      : t("invalid");
  };
}

/**
 * Runs one menu action in a transition. A refusal shows as a toast (unless onError takes it);
 * success calls onDone. The page refreshes itself: every action revalidates /menu.
 */
export function useMenuAction() {
  const errorText = useMenuErrorText();
  const [pending, startTransition] = useTransition();

  function run<T>(
    action: () => Promise<MenuActionResult<T>>,
    options: {
      before?: () => void;
      onDone?: (data: T) => void;
      onError?: (error: {
        code: string;
        fields?: Record<string, string>;
      }) => void;
    } = {},
  ) {
    startTransition(async () => {
      options.before?.();
      const result = await action();
      if ("error" in result) {
        if (options.onError) options.onError(result.error);
        else toast.error(errorText(result.error.code));
        return;
      }
      options.onDone?.(result.data);
    });
  }

  return [pending, run] as const;
}

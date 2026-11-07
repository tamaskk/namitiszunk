"use client";

import { Button } from "@namitiszunk/ui";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "namitiszunk.ageGate";
type Answer = "adult" | "minor";

const listeners = new Set<() => void>();

function readAnswer(): Answer | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "adult" || value === "minor" ? value : null;
  } catch {
    // Storage blocked (private mode): ask on every visit.
    return null;
  }
}

function saveAnswer(answer: Answer | null) {
  try {
    if (answer) localStorage.setItem(STORAGE_KEY, answer);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the answer holds for this page only.
  }
  memory = answer;
  for (const listener of listeners) listener();
}

let memory: Answer | null | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Full-screen 18+ question on the first visit; the device remembers the answer (T-040). */
export function AgeGate() {
  const t = useTranslations("order.menu.ageGate");
  const answer = useSyncExternalStore(
    subscribe,
    () => (memory === undefined ? readAnswer() : memory),
    // The server cannot see the device's answer; the gate appears once hydrated.
    () => "adult" as const,
  );
  if (answer === "adult") return null;

  const minor = answer === "minor";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-title"
      className="fixed inset-0 z-50 flex flex-col justify-center gap-8 bg-bg px-4"
    >
      <div className="mx-auto flex w-full max-w-120 flex-col gap-4">
        <h2 id="age-gate-title" className="text-h1">
          {minor ? t("underageTitle") : t("title")}
        </h2>
        <p className="text-body text-text-muted">
          {minor ? t("underageBody") : t("body")}
        </p>
        {minor ? (
          <Button variant="secondary" onClick={() => saveAnswer(null)}>
            {t("back")}
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <Button autoFocus onClick={() => saveAnswer("adult")}>
              {t("yes")}
            </Button>
            <Button variant="secondary" onClick={() => saveAnswer("minor")}>
              {t("no")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

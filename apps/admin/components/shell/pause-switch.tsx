"use client";

import {
  Button,
  cn,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@namitiszunk/ui";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { setOrdersPausedAction } from "@/app/(dashboard)/actions";

/** "Ordering: Open / Paused" for the whole venue (T-050); both directions ask first. */
export function PauseSwitch({
  venueId,
  paused,
  canChange,
}: {
  /** The venue on screen: the action pauses this one, whatever another tab switched to. */
  venueId: string;
  paused: boolean;
  /** false: the role may not pause, so only the state shows, at full contrast. */
  canChange: boolean;
}) {
  const t = useTranslations("admin.shell");
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setFailed(false);
    startTransition(async () => {
      const result = await setOrdersPausedAction({ venueId, paused: !paused });
      if ("error" in result) {
        setFailed(true);
        return;
      }
      setOpen(false);
    });
  }

  const state = (
    <>
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          paused ? "bg-warning" : "bg-success",
        )}
      />
      <span className="sr-only sm:not-sr-only">{t("ordering")}:</span>
      {paused ? t("orderingPaused") : t("orderingOpen")}
    </>
  );

  if (!canChange) {
    return (
      <p
        className={cn(
          "flex min-h-12 items-center gap-2 px-2 text-small font-medium",
          paused && "text-warning",
        )}
      >
        {state}
      </p>
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          className={cn(paused && "border-warning text-warning")}
        >
          {state}
        </Button>
      </DialogTrigger>
      <DialogContent destructive>
        <DialogHeader>
          <DialogTitle>
            {paused ? t("resumeTitle") : t("pauseTitle")}
          </DialogTitle>
          <DialogDescription>
            {paused ? t("resumeBody") : t("pauseBody")}
          </DialogDescription>
        </DialogHeader>
        {failed && (
          <p role="alert" className="text-small text-danger">
            {t("pauseFailed")}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button
            variant={paused ? "primary" : "danger"}
            loading={pending}
            onClick={confirm}
          >
            {paused ? t("resumeConfirm") : t("pauseConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

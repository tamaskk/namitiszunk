"use client";

import type { DeviceRow, StaffRow } from "@namitiszunk/core/staff";
import {
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
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@namitiszunk/ui";
import { Plus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { type FormEvent, type ReactNode, useState } from "react";

import { useMenuAction, useValidationText } from "../menu/use-menu-action";
import {
  addPinMemberAction,
  changeMemberPinAction,
  inviteMemberAction,
  revokeDeviceAction,
  setMemberActiveAction,
} from "./actions";

type Fields = Record<string, string>;

/** Shows a refusal from core by its code; unknown codes read as a generic failure. */
function useStaffError() {
  const t = useTranslations("admin.staff.errors");
  return (code: string) => {
    const key = code as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : t("generic");
  };
}

export function StaffManager({
  members,
  devices,
  canInvite,
}: {
  members: StaffRow[];
  devices: DeviceRow[];
  canInvite: boolean;
}) {
  const t = useTranslations("admin.staff");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <AddPinMemberDialog />
        {canInvite && <InviteDialog />}
      </div>

      <section
        aria-labelledby="staff-members"
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="staff-members" className="text-h3">
          {t("members")}
        </h2>
        <ul className="flex flex-col divide-y divide-border">
          {members.map((member) => (
            <MemberRow key={member.id} member={member} />
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="staff-devices"
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="staff-devices" className="text-h3">
          {t("devices.title")}
        </h2>
        {devices.length === 0 ? (
          <EmptyState message={t("devices.empty")} />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {devices.map((device) => (
              <DeviceItem key={device.id} device={device} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MemberRow({ member }: { member: StaffRow }) {
  const t = useTranslations("admin.staff");
  const format = useFormatter();
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          href={`/staff/${member.id}`}
          className="inline-flex min-h-12 items-center text-body font-semibold underline underline-offset-4"
        >
          {member.name}
          {member.self && ` (${t("you")})`}
        </Link>
        <span className="text-small text-text-muted">
          {[
            t(`roles.${member.role}`),
            member.lastActionAt
              ? t("lastAction", {
                  time: format.dateTime(member.lastActionAt, {
                    dateStyle: "short",
                    timeStyle: "short",
                  }),
                })
              : t("noAction"),
          ].join(" · ")}
        </span>
      </div>
      {/* A member state, not an order status: a coloured label (DESIGN_SYSTEM §06). */}
      <span
        className={`text-small font-medium ${member.active ? "text-success" : "text-text-muted"}`}
      >
        {member.active ? t("active") : t("disabled")}
      </span>
      {member.canManage && (
        <div className="flex flex-wrap gap-2">
          {member.usesPin && member.active && (
            <ChangePinDialog member={member} />
          )}
          <ActiveDialog member={member} />
        </div>
      )}
    </li>
  );
}

function PinField({
  id,
  value,
  onChange,
  error,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const t = useTranslations("admin.staff");
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{t("pin")}</Label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint`}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      />
      <p
        id={`${id}-hint`}
        role={error ? "alert" : undefined}
        className={
          error ? "text-small text-danger" : "text-small text-text-muted"
        }
      >
        {error ?? t("pinHint")}
      </p>
    </div>
  );
}

/** Field errors from the schema ("validation.…") and the PIN or name clash from core. */
function useFormErrors() {
  const validationText = useValidationText();
  const errorText = useStaffError();
  const [fields, setFields] = useState<Fields>({});
  const onError = ({ code, fields: f }: { code: string; fields?: Fields }) => {
    if (code === "pin_taken") setFields({ pin: errorText(code) });
    else if (code === "staff_name_taken") setFields({ name: errorText(code) });
    else if (f)
      setFields(
        Object.fromEntries(
          Object.entries(f).map(([path, key]) => [path, validationText(key)]),
        ),
      );
    else toast.error(errorText(code));
  };
  return [fields, setFields, onError] as const;
}

function AddPinMemberDialog() {
  const t = useTranslations("admin.staff");
  const tMenu = useTranslations("admin.menu");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<"bartender" | "vip_host">("bartender");
  const [pin, setPin] = useState("");
  const [fields, setFields, onError] = useFormErrors();
  const [pending, run] = useMenuAction();

  function submit(event: FormEvent) {
    event.preventDefault();
    setFields({});
    run(() => addPinMemberAction({ name: name.trim(), role, pin }), {
      onDone: () => {
        toast.success(t("added", { name: name.trim() }));
        setOpen(false);
      },
      onError,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName("");
          setRole("bartender");
          setPin("");
          setFields({});
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden />
          {t("add")}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={tMenu("close")}>
        <DialogHeader>
          <DialogTitle>{t("add")}</DialogTitle>
          <DialogDescription>{t("addHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="staff-name">{t("name")}</Label>
            <Input
              id="staff-name"
              autoComplete="off"
              value={name}
              aria-invalid={fields.name ? true : undefined}
              aria-describedby={fields.name ? "staff-name-error" : undefined}
              onChange={(e) => setName(e.target.value)}
            />
            {fields.name && (
              <p
                id="staff-name-error"
                role="alert"
                className="text-small text-danger"
              >
                {fields.name}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="staff-role">{t("role")}</Label>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as typeof role)}
            >
              <SelectTrigger id="staff-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bartender">
                  {t("roles.bartender")}
                </SelectItem>
                <SelectItem value="vip_host">{t("roles.vip_host")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <PinField
            id="staff-pin"
            value={pin}
            onChange={setPin}
            error={fields.pin}
          />
          <DialogFooter>
            <Button type="submit" loading={pending}>
              {t("addSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChangePinDialog({ member }: { member: StaffRow }) {
  const t = useTranslations("admin.staff");
  const tMenu = useTranslations("admin.menu");
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [fields, setFields, onError] = useFormErrors();
  const [pending, run] = useMenuAction();

  function submit(event: FormEvent) {
    event.preventDefault();
    setFields({});
    run(() => changeMemberPinAction({ memberId: member.id, pin }), {
      onDone: () => {
        toast.success(t("pinChanged", { name: member.name }));
        setOpen(false);
      },
      onError,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setPin("");
          setFields({});
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">{t("changePin")}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={tMenu("close")}>
        <DialogHeader>
          <DialogTitle>
            {t("changePinTitle", { name: member.name })}
          </DialogTitle>
          <DialogDescription>{t("changePinHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <PinField
            id={`pin-${member.id}`}
            value={pin}
            onChange={setPin}
            error={fields.pin}
          />
          <DialogFooter>
            <Button type="submit" loading={pending}>
              {tMenu("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A yes/no step before a change that takes effect at once. */
function ConfirmDialog({
  trigger,
  title,
  body,
  confirm,
  danger,
  onConfirm,
  pending,
  open,
  onOpenChange,
}: {
  trigger: ReactNode;
  title: string;
  body: string;
  confirm: string;
  danger: boolean;
  onConfirm: () => void;
  pending: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tMenu = useTranslations("admin.menu");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        {...(danger
          ? { destructive: true as const }
          : { closeLabel: tMenu("close") })}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{tMenu("cancel")}</Button>
          </DialogClose>
          <Button
            variant={danger ? "danger" : "primary"}
            loading={pending}
            onClick={onConfirm}
          >
            {confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActiveDialog({ member }: { member: StaffRow }) {
  const t = useTranslations("admin.staff");
  const errorText = useStaffError();
  const [open, setOpen] = useState(false);
  const [pending, run] = useMenuAction();
  const disabling = member.active;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      pending={pending}
      danger={disabling}
      trigger={
        <Button variant={disabling ? "ghost" : "secondary"}>
          {disabling ? t("disable") : t("enable")}
        </Button>
      }
      title={
        disabling
          ? t("disableTitle", { name: member.name })
          : t("enableTitle", { name: member.name })
      }
      body={disabling ? t("disableBody") : t("enableBody")}
      confirm={disabling ? t("disable") : t("enable")}
      onConfirm={() =>
        run(
          () =>
            setMemberActiveAction({ memberId: member.id, active: !disabling }),
          {
            onDone: () => setOpen(false),
            onError: ({ code }) => toast.error(errorText(code)),
          },
        )
      }
    />
  );
}

function DeviceItem({ device }: { device: DeviceRow }) {
  const t = useTranslations("admin.staff.devices");
  const format = useFormatter();
  const errorText = useStaffError();
  const [open, setOpen] = useState(false);
  const [pending, run] = useMenuAction();
  const name = device.barName ?? t("vipPhone");
  const when = (at: Date) =>
    format.dateTime(at, { dateStyle: "short", timeStyle: "short" });

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-body font-semibold">{name}</span>
        <span className="text-small text-text-muted">
          {[
            t("registered", { time: when(device.registeredAt) }),
            device.lastSignInAt
              ? t("lastSignIn", { time: when(device.lastSignInAt) })
              : t("noSignIn"),
          ].join(" · ")}
        </span>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        pending={pending}
        danger
        trigger={<Button variant="ghost">{t("revoke")}</Button>}
        title={t("revokeTitle", { name })}
        body={t("revokeBody")}
        confirm={t("revoke")}
        onConfirm={() =>
          run(() => revokeDeviceAction({ deviceId: device.id }), {
            onDone: () => setOpen(false),
            onError: ({ code }) => toast.error(errorText(code)),
          })
        }
      />
    </li>
  );
}

function InviteDialog() {
  const t = useTranslations("admin.staff.invite");
  const tMenu = useTranslations("admin.menu");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "owner">("manager");
  const [fields, setFields, onError] = useFormErrors();
  const [pending, run] = useMenuAction();
  const tStaff = useTranslations("admin.staff");

  function submit(event: FormEvent) {
    event.preventDefault();
    setFields({});
    run(() => inviteMemberAction({ email: email.trim(), role }), {
      onDone: () => {
        toast.success(t("sent", { email: email.trim() }));
        setOpen(false);
      },
      onError,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setEmail("");
          setRole("manager");
          setFields({});
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">{t("open")}</Button>
      </DialogTrigger>
      <DialogContent closeLabel={tMenu("close")}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email">{t("email")}</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              value={email}
              aria-invalid={fields.email ? true : undefined}
              aria-describedby={fields.email ? "invite-email-error" : undefined}
              onChange={(e) => setEmail(e.target.value)}
            />
            {fields.email && (
              <p
                id="invite-email-error"
                role="alert"
                className="text-small text-danger"
              >
                {fields.email}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-role">{tStaff("role")}</Label>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as typeof role)}
            >
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">
                  {tStaff("roles.manager")}
                </SelectItem>
                <SelectItem value="owner">{tStaff("roles.owner")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" loading={pending}>
              {t("send")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

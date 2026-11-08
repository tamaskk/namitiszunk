import { Link, Section, Text } from "@react-email/components";
import { formatHuf, messages, type Locale } from "@namitiszunk/i18n";
import type { ReactNode } from "react";
import { createTranslator } from "use-intl/core";
import { EmailButton, styles } from "./layout";

export function emailTranslator(locale: Locale) {
  return createTranslator({
    locale,
    messages: messages[locale],
    namespace: "emails",
  });
}
type T = ReturnType<typeof emailTranslator>;

type WithLocale<D> = D & { locale: Locale };

// Same literals as packages/db; emails stays free of the db package.
type OrderStatus =
  | "awaiting_payment"
  | "new"
  | "preparing"
  | "ready"
  | "picked_up"
  | "cancelled"
  | "rejected"
  | "expired"
  | "refunded";

/** Template name → the data its caller must pass. Amounts are integer forints. */
export interface EmailData {
  signIn: WithLocale<{ url: string }>;
  staffInvite: WithLocale<{
    venueName: string;
    role: "manager" | "owner";
    url: string;
  }>;
  orderConfirmation: WithLocale<{
    venueName: string;
    venueEmail: string;
    shortNumber: string;
    items: { name: string; quantity: number; amountHuf: number }[];
    totalHuf: number;
    /** Link to the guest's confirmation page (T-044). */
    confirmationUrl?: string;
  }>;
  orderRejected: WithLocale<{
    venueName: string;
    venueEmail: string;
    shortNumber: string;
    refundHuf: number;
  }>;
  orderRefunded: WithLocale<{
    venueName: string;
    venueEmail: string;
    shortNumber: string;
    refundHuf: number;
  }>;
  /** Same template to the venue and to the platform. */
  problemReport: WithLocale<{
    venueName: string;
    barName: string;
    shortNumber: string;
    status: OrderStatus;
    totalHuf: number;
    category: "not_received" | "wrong_order" | "payment" | "other";
    message: string;
    guestEmail?: string;
    adminUrl: string;
    platformEmail: string;
  }>;
  newLead: WithLocale<{
    name: string;
    venueName: string;
    email: string;
    phone?: string;
    message?: string;
    platformEmail: string;
  }>;
  onboardingReminder: WithLocale<{ venueName: string; url: string }>;
  weeklyReport: WithLocale<{
    venueName: string;
    orderCount: number;
    revenueHuf: number;
    url: string;
  }>;
}

interface Template<D> {
  subject: (t: T, data: D) => string;
  heading: (t: T, data: D) => string;
  Body: (props: { t: T; data: D }) => ReactNode;
  /** Spec T-037: order mails reply to the venue, lead and problem mails to the platform. */
  replyTo?: (data: D) => string;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Section style={{ margin: "0 0 16px" }}>
      <Text style={styles.label}>{label}</Text>
      <Text style={{ ...styles.text, margin: 0, whiteSpace: "pre-line" }}>
        {children}
      </Text>
    </Section>
  );
}

/** Breaks "https://" so mail clients do not turn a link the sender typed into something to click. */
const defang = (value: string) => value.replaceAll("://", "[:]//");

/**
 * Free text from a guest or a visitor, sent from our domain: boxed and labelled as theirs, with links
 * broken, so it cannot pass for a message from us (phishing).
 */
function UntrustedField({
  label,
  note,
  children,
}: {
  label: string;
  note: string;
  children: string;
}) {
  return (
    <Section style={styles.untrusted}>
      <Text style={styles.label}>{label}</Text>
      <Text style={{ ...styles.muted, margin: "0 0 8px" }}>{note}</Text>
      <Text style={{ ...styles.text, margin: 0, whiteSpace: "pre-line" }}>
        {defang(children)}
      </Text>
    </Section>
  );
}

const venueReplyTo = (data: { venueEmail: string }) => data.venueEmail;
const platformReplyTo = (data: { platformEmail: string }) => data.platformEmail;

export const templates: { [N in keyof EmailData]: Template<EmailData[N]> } = {
  signIn: {
    subject: (t) => t("signIn.subject"),
    heading: (t) => t("signIn.heading"),
    Body: ({ t, data }) => (
      <>
        <Text style={styles.text}>{t("signIn.body")}</Text>
        <EmailButton href={data.url}>{t("signIn.button")}</EmailButton>
        <Text style={styles.muted}>{t("ignoreIfNotYou")}</Text>
      </>
    ),
  },
  staffInvite: {
    subject: (t, d) => t("staffInvite.subject", { venueName: d.venueName }),
    heading: (t) => t("staffInvite.heading"),
    Body: ({ t, data }) => (
      <>
        <Text style={styles.text}>
          {t("staffInvite.body", {
            venueName: data.venueName,
            role: data.role,
          })}
        </Text>
        <EmailButton href={data.url}>{t("staffInvite.button")}</EmailButton>
        <Text style={styles.muted}>{t("ignoreIfNotYou")}</Text>
      </>
    ),
  },
  orderConfirmation: {
    subject: (t, d) =>
      t("orderConfirmation.subject", { shortNumber: d.shortNumber }),
    heading: (t) => t("orderConfirmation.heading"),
    replyTo: venueReplyTo,
    Body: ({ t, data }) => (
      <>
        <Text style={styles.notice}>{t("orderConfirmation.notReceipt")}</Text>
        <Text style={styles.label}>{t("orderConfirmation.orderNumber")}</Text>
        <Text style={styles.orderNumber}>{data.shortNumber}</Text>
        <Text style={styles.text}>
          {t("orderConfirmation.body", { venueName: data.venueName })}
        </Text>
        {data.items.map((item, index) => (
          <Text key={index} style={{ ...styles.text, margin: "0 0 8px" }}>
            {item.quantity} × {item.name}{" "}
            <span style={styles.amount}>{formatHuf(item.amountHuf)}</span>
          </Text>
        ))}
        <Text style={{ ...styles.text, fontWeight: 600, margin: "16px 0 0" }}>
          {t("total")}:{" "}
          <span style={styles.amount}>{formatHuf(data.totalHuf)}</span>
        </Text>
        {data.confirmationUrl && (
          <EmailButton href={data.confirmationUrl}>
            {t("orderConfirmation.open")}
          </EmailButton>
        )}
      </>
    ),
  },
  orderRejected: {
    subject: (t, d) =>
      t("orderRejected.subject", { shortNumber: d.shortNumber }),
    heading: (t) => t("orderRejected.heading"),
    replyTo: venueReplyTo,
    Body: ({ t, data }) => (
      <>
        <Text style={styles.text}>
          {t("orderRejected.body", {
            venueName: data.venueName,
            amount: formatHuf(data.refundHuf),
          })}
        </Text>
        <Text style={styles.muted}>{t("refundTiming")}</Text>
      </>
    ),
  },
  orderRefunded: {
    subject: (t, d) =>
      t("orderRefunded.subject", { shortNumber: d.shortNumber }),
    heading: (t) => t("orderRefunded.heading"),
    replyTo: venueReplyTo,
    Body: ({ t, data }) => (
      <>
        <Text style={styles.text}>
          {t("orderRefunded.body", { amount: formatHuf(data.refundHuf) })}
        </Text>
        <Text style={styles.muted}>{t("refundTiming")}</Text>
      </>
    ),
  },
  problemReport: {
    subject: (t, d) =>
      t("problemReport.subject", { shortNumber: d.shortNumber }),
    heading: (t) => t("problemReport.heading"),
    replyTo: platformReplyTo,
    Body: ({ t, data }) => (
      <>
        <Text style={styles.text}>
          {t("problemReport.body", {
            venueName: data.venueName,
            shortNumber: data.shortNumber,
          })}
        </Text>
        <Field label={t("problemReport.category")}>
          {t(`problemReport.categories.${data.category}`)}
        </Field>
        <Field label={t("problemReport.bar")}>{data.barName}</Field>
        <Field label={t("problemReport.status")}>
          {t(`problemReport.statuses.${data.status}`)}
        </Field>
        <Field label={t("total")}>{formatHuf(data.totalHuf)}</Field>
        {data.message && (
          <UntrustedField
            label={t("problemReport.message")}
            note={t("untrustedText")}
          >
            {data.message}
          </UntrustedField>
        )}
        {data.guestEmail && (
          <Field label={t("problemReport.guestEmail")}>{data.guestEmail}</Field>
        )}
        <EmailButton href={data.adminUrl}>
          {t("problemReport.open")}
        </EmailButton>
      </>
    ),
  },
  newLead: {
    subject: (t, d) => t("newLead.subject", { venueName: d.venueName }),
    heading: (t) => t("newLead.heading"),
    replyTo: platformReplyTo,
    Body: ({ t, data }) => (
      <>
        <Field label={t("newLead.name")}>{data.name}</Field>
        <Field label={t("newLead.venue")}>{data.venueName}</Field>
        <Field label={t("newLead.email")}>
          <Link href={`mailto:${data.email}`} style={{ color: "inherit" }}>
            {data.email}
          </Link>
        </Field>
        {data.phone && <Field label={t("newLead.phone")}>{data.phone}</Field>}
        {data.message && (
          <UntrustedField
            label={t("newLead.message")}
            note={t("untrustedText")}
          >
            {data.message}
          </UntrustedField>
        )}
      </>
    ),
  },
  // Placeholder copy until T-068 defines the reminder steps.
  onboardingReminder: {
    subject: (t, d) =>
      t("onboardingReminder.subject", { venueName: d.venueName }),
    heading: (t) => t("onboardingReminder.heading"),
    Body: ({ t, data }) => (
      <>
        <Text style={styles.text}>
          {t("onboardingReminder.body", { venueName: data.venueName })}
        </Text>
        <EmailButton href={data.url}>
          {t("onboardingReminder.button")}
        </EmailButton>
      </>
    ),
  },
  // Placeholder until T-062 defines the report contents.
  weeklyReport: {
    subject: (t, d) => t("weeklyReport.subject", { venueName: d.venueName }),
    heading: (t, d) => t("weeklyReport.heading", { venueName: d.venueName }),
    Body: ({ t, data }) => (
      <>
        <Field label={t("weeklyReport.orders")}>{data.orderCount}</Field>
        <Field label={t("weeklyReport.revenue")}>
          {formatHuf(data.revenueHuf)}
        </Field>
        <EmailButton href={data.url}>{t("weeklyReport.button")}</EmailButton>
      </>
    ),
  },
};

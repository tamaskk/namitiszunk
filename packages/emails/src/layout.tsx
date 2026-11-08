import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { messages, type Locale } from "@namitiszunk/i18n";
import tokens from "@namitiszunk/ui/tokens.json";
import type { ReactNode } from "react";

// Mail clients ignore CSS variables, so the DESIGN_SYSTEM tokens are inlined from their single source.
const { color, text, radius, container } = tokens;
const fontFamily =
  "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const styles = {
  heading: {
    color: color.text,
    fontSize: text.h2.size,
    fontWeight: text.h2.weight,
    lineHeight: text.h2.lineHeight,
    margin: "0 0 16px",
  },
  text: {
    color: color.text,
    fontSize: text.body.size,
    lineHeight: text.body.lineHeight,
    margin: "0 0 16px",
  },
  muted: {
    color: color["text-muted"],
    fontSize: text.small.size,
    lineHeight: text.small.lineHeight,
    margin: "0 0 8px",
  },
  label: {
    color: color["text-muted"],
    fontSize: text.label.size,
    fontWeight: text.label.weight,
    letterSpacing: text.label.letterSpacing,
    textTransform: "uppercase",
    margin: "0 0 4px",
  },
  orderNumber: {
    color: color.primary,
    fontSize: text.order.size,
    fontWeight: text.order.weight,
    lineHeight: text.order.lineHeight,
    fontVariantNumeric: "tabular-nums",
    margin: "0 0 24px",
  },
  untrusted: {
    border: `1px solid ${color.border}`,
    borderRadius: radius.md,
    padding: "12px 16px",
    margin: "0 0 16px",
  },
  notice: {
    color: color.text,
    fontSize: text.h3.size,
    fontWeight: text.h3.weight,
    lineHeight: text.h3.lineHeight,
    border: `2px solid ${color.warning}`,
    borderRadius: radius.md,
    padding: "12px 16px",
    margin: "0 0 24px",
    textAlign: "center",
  },
  amount: { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
} as const;

export function EmailButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: color.primary,
        color: color["on-primary"],
        borderRadius: radius.md,
        fontSize: text.body.size,
        fontWeight: 600,
        padding: "14px 24px",
        margin: "8px 0 24px",
      }}
    >
      {children}
    </Button>
  );
}

export function EmailLayout({
  locale,
  preview,
  heading,
  footer,
  children,
}: {
  locale: Locale;
  preview: string;
  heading: string;
  footer: string;
  children: ReactNode;
}) {
  return (
    <Html lang={locale}>
      <Head>
        {/* Dark is the only theme; declaring it stops Gmail and Apple Mail from inverting the colors. */}
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{ backgroundColor: color.bg, fontFamily, margin: 0, padding: 0 }}
      >
        <Container
          style={{
            maxWidth: container.guest,
            backgroundColor: color.bg,
            padding: "32px 16px",
          }}
        >
          <Text
            style={{
              color: color.primary,
              fontSize: text.h3.size,
              fontWeight: 700,
              margin: "0 0 32px",
            }}
          >
            {messages[locale].common.appName}
          </Text>
          <Section
            style={{
              backgroundColor: color.surface,
              border: `1px solid ${color.border}`,
              borderRadius: radius.lg,
              padding: "24px",
            }}
          >
            <Heading as="h1" style={styles.heading}>
              {heading}
            </Heading>
            {children}
          </Section>
          <Hr style={{ borderColor: color.border, margin: "32px 0 16px" }} />
          <Text style={styles.muted}>{footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}

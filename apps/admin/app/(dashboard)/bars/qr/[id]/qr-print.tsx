import "server-only";

import path from "node:path";

import type { QrPrintData } from "@namitiszunk/core/bars";
import tokens from "@namitiszunk/ui/tokens.json";
import {
  Document,
  Font,
  Image as PdfImage,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import QRCode from "qrcode";

// The built-in PDF fonts have no ő or ű; Inter is the app's own typeface (OFL, assets/fonts).
const fontDir = path.join(process.cwd(), "assets/fonts");
Font.register({
  family: "Inter",
  fonts: [
    { src: path.join(fontDir, "Inter-Regular.ttf") },
    { src: path.join(fontDir, "Inter-Bold.ttf"), fontWeight: 700 },
  ],
});

export type QrFormat = "png" | "card" | "poster";

/**
 * A printed QR is read from up to ~1 m in a dark club: error correction Q survives scratches and a
 * logo sticker, and the 4-module quiet zone plus the white page is the white border the scanner needs.
 */
const qrOptions = {
  errorCorrectionLevel: "Q",
  margin: 4,
  width: 1200,
} as const;

export type PrintLabels = { cta: string; ctaEn: string };

export function qrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, qrOptions);
}

// A6 table card and A4 poster. The A4 code is 150 mm wide: scanners read about 10x the code's
// width, so it works from well beyond 1 m (acceptance criterion); the card's 75 mm from ~70 cm.
const layouts = {
  card: { size: "A6", qr: 212, title: 16, zone: 20, padding: 24 },
  poster: { size: "A4", qr: 425, title: 28, zone: 40, padding: 48 },
} as const;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Inter",
    // Paper, not screen: the print values of DESIGN_SYSTEM §02, as on the payment confirmation.
    backgroundColor: "#FFFFFF",
    color: tokens.color.bg,
    alignItems: "center",
    justifyContent: "space-between",
  },
  head: { alignItems: "center", gap: 6 },
  muted: { color: "#3F3F46" },
});

function QrSheet({
  data,
  format,
  qrDataUrl,
  url,
  withLogo,
  labels,
}: {
  data: QrPrintData;
  format: "card" | "poster";
  qrDataUrl: string;
  url: string;
  withLogo: boolean;
  /** The card is bilingual: Hungarian first, English below, whatever the admin's locale. */
  labels: PrintLabels;
}) {
  const l = layouts[format];
  return (
    <Document title={`${data.venueName} – ${data.zoneName}`}>
      <Page size={l.size} style={[styles.page, { padding: l.padding }]}>
        <View style={styles.head}>
          {withLogo && data.logoUrl ? (
            <PdfImage
              src={data.logoUrl}
              style={{ height: l.title * 2.5, objectFit: "contain" }}
            />
          ) : (
            <Text style={{ fontSize: l.title, fontWeight: 700 }}>
              {data.venueName}
            </Text>
          )}
          <Text style={{ fontSize: l.zone, fontWeight: 700 }}>
            {data.zoneName}
          </Text>
        </View>
        <PdfImage src={qrDataUrl} style={{ width: l.qr, height: l.qr }} />
        <View style={styles.head}>
          <Text style={{ fontSize: l.title, fontWeight: 700 }}>
            {labels.cta}
          </Text>
          <Text style={[styles.muted, { fontSize: l.title * 0.8 }]}>
            {labels.ctaEn}
          </Text>
          <Text style={[styles.muted, { fontSize: l.title * 0.55 }]}>
            {url.replace(/^https?:\/\//, "")}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function qrPdf(
  data: QrPrintData,
  format: "card" | "poster",
  url: string,
  labels: PrintLabels,
): Promise<Buffer> {
  const qrDataUrl = await QRCode.toDataURL(url, qrOptions);
  const render = (withLogo: boolean) =>
    renderToBuffer(
      <QrSheet
        data={data}
        format={format}
        qrDataUrl={qrDataUrl}
        url={url}
        withLogo={withLogo}
        labels={labels}
      />,
    );
  if (!data.logoUrl) return render(false);
  try {
    return await render(true);
  } catch {
    // A logo that cannot be fetched or decoded must not block printing: the name stands in.
    return render(false);
  }
}

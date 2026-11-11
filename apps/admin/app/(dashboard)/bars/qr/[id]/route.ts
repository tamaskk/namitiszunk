import { getQrPrintData } from "@namitiszunk/core/bars";
import { AppError } from "@namitiszunk/core/errors";
import { objectIdSchema, qrDownloadQuerySchema } from "@namitiszunk/validators";
import { getTranslations } from "next-intl/server";

import { contextCanOpen, getAdminContext } from "@/lib/admin-context";
import { ORDER_APP_URL } from "@/lib/order-app";

import { qrPdf, qrPng } from "./qr-print";

const fail = (status: number) =>
  new Response(null, { status, headers: { "Cache-Control": "no-store" } });

/** One zone's QR code as a PNG, an A6 table card or an A4 poster (T-053). */
export async function GET(
  request: Request,
  { params }: RouteContext<"/bars/qr/[id]">,
) {
  const { id } = await params;
  const query = qrDownloadQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!objectIdSchema.safeParse(id).success || !query.success) return fail(400);

  const context = await getAdminContext();
  if (!contextCanOpen(context, "bars")) return fail(403);

  let data;
  try {
    data = await getQrPrintData(context.actor, context.venue.id, id);
  } catch (error) {
    if (error instanceof AppError) return fail(error.status);
    throw error;
  }

  const url = new URL(`/q/${data.code}`, ORDER_APP_URL).toString();
  const { format } = query.data;
  const name = `qr-${data.code}-${format}`;
  const headers = { "Cache-Control": "private, no-store" };

  if (format === "png") {
    const png = await qrPng(url);
    return new Response(new Uint8Array(png), {
      headers: {
        ...headers,
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${name}.png"`,
      },
    });
  }

  const [hu, en] = await Promise.all([
    getTranslations({ locale: "hu", namespace: "admin.bars.print" }),
    getTranslations({ locale: "en", namespace: "admin.bars.print" }),
  ]);
  const pdf = await qrPdf(data, format, url, {
    cta: hu("cta"),
    ctaEn: en("ctaEn"),
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      ...headers,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}.pdf"`,
    },
  });
}

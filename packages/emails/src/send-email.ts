import "server-only";
import { Resend } from "resend";
import { renderEmail, type EmailTemplate } from "./render";
import type { EmailData } from "./templates";

const from = "Na, mit iszunk? <noreply@namitiszunk.hu>";

let client: Resend | undefined;

function resend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is missing");
  client ??= new Resend(apiKey);
  return client;
}

/**
 * Renders and sends one e-mail; throws on a Resend error so the caller's retry (Inngest, T-035) can run.
 * Guest mail: call it only when the guest has an address (wallet, card or typed in); this function does not check.
 */
export async function sendEmail<N extends EmailTemplate>(
  template: N,
  to: string | string[],
  data: EmailData[N],
): Promise<{ id: string }> {
  const { subject, html, text, replyTo } = await renderEmail(template, data);
  const { data: sent, error } = await resend().emails.send({
    from,
    to,
    subject,
    html,
    text,
    ...(replyTo && { replyTo }),
  });
  if (error || !sent) {
    // The Resend error carries no secrets; the recipient address stays out of the message.
    throw new Error(
      `Resend rejected the ${template} e-mail: ${error?.name ?? "no response"}: ${error?.message ?? ""}`,
    );
  }
  return { id: sent.id };
}

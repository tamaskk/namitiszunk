import "server-only";

import { parsePhoneNumberFromString } from "libphonenumber-js";
import twilio from "twilio";

/** One GSM-7 segment; anything longer or outside the set doubles the cost. */
export const SMS_MAX_LENGTH = 160;
export const SMS_MAX_PER_ORDER = 2;

// GSM 03.38 basic set only: extension characters ({, }, €, ...) take two septets each.
const GSM7_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);

/** E.164 for a valid Hungarian (+36) number, otherwise null: other countries are an SMS fraud risk. */
export function normalizeHuPhone(input: string): string | null {
  const phone = parsePhoneNumberFromString(input, "HU");
  return phone?.isValid() && phone.country === "HU" ? phone.number : null;
}

/** Strips accents so one Hungarian letter cannot switch the message to UCS-2; throws if it still is not one GSM-7 segment. */
export function toGsm7(text: string): string {
  const plain = text.normalize("NFD").replace(/\p{M}/gu, "");
  const bad = [...plain].find((char) => !GSM7_BASIC.has(char));
  if (bad !== undefined) {
    throw new Error(
      `SMS text has a non GSM-7 character: ${JSON.stringify(bad)}`,
    );
  }
  if (plain.length > SMS_MAX_LENGTH) {
    throw new Error(
      `SMS text is ${plain.length} characters, the limit is ${SMS_MAX_LENGTH}`,
    );
  }
  return plain;
}

// Hungarian article: "az" before a vowel ("az Aurora pultnal"), "a" otherwise.
function article(barName: string): string {
  return /^[aeiou]/i.test(toGsm7(barName)) ? "az" : "a";
}

export function readySmsText(input: {
  shortNumber: number;
  barName: string;
  link: string;
}): string {
  const { shortNumber, barName, link } = input;
  return toGsm7(
    `Na mit iszunk: #${shortNumber} kesz! Vedd fel ${article(barName)} ${barName} pultnal. ${link}`,
  );
}

export function reminderSmsText(input: { barName: string }): string {
  const { barName } = input;
  return toGsm7(
    `Meg var rad az italod ${article(barName)} ${barName} pultnal.`,
  );
}

/** Push wins over SMS; the venue can switch SMS off; at most two per order (ready and one reminder). */
export function shouldSendSms(input: {
  hasPushToken: boolean;
  smsRequested: boolean;
  venueSmsEnabled: boolean;
  smsCountForOrder: number;
}): boolean {
  return (
    !input.hasPushToken &&
    input.smsRequested &&
    input.venueSmsEnabled &&
    input.smsCountForOrder < SMS_MAX_PER_ORDER
  );
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

/**
 * Sends one SMS through the Twilio Messaging Service and returns the message SID.
 * `statusCallbackUrl` is the apps/api route that receives the delivery status.
 */
export async function sendSms(
  to: string,
  text: string,
  statusCallbackUrl: string,
): Promise<string> {
  const phone = normalizeHuPhone(to);
  if (!phone) throw new Error("SMS recipient is not a valid Hungarian number");
  const body = toGsm7(text);
  const messagingServiceSid = requiredEnv("TWILIO_MESSAGING_SERVICE_SID");
  const client = twilio(
    requiredEnv("TWILIO_ACCOUNT_SID"),
    requiredEnv("TWILIO_AUTH_TOKEN"),
  );

  try {
    const message = await client.messages.create({
      messagingServiceSid,
      to: phone,
      body,
      statusCallback: statusCallbackUrl,
    });
    return message.sid;
  } catch (error) {
    // Twilio messages can quote the recipient's number (personal data), so only the error code travels on.
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "unknown";
    throw new Error(`Twilio SMS send failed (code ${code})`);
  }
}

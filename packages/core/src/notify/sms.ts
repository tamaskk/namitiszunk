import "server-only";

// The max metadata: the default (min) cannot tell a mobile number from a landline.
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { type Locale, messages } from "@namitiszunk/i18n";
import twilio from "twilio";
import { createTranslator } from "use-intl/core";

/** One GSM-7 segment; anything longer or outside the set doubles the cost. */
export const SMS_MAX_LENGTH = 160;
export const SMS_MAX_PER_ORDER = 2;

// GSM 03.38 basic set only: extension characters ({, }, €, ...) take two septets each.
const GSM7_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);

/**
 * E.164 for a valid Hungarian (+36) mobile number, otherwise null: other countries are an SMS
 * fraud risk, and a landline cannot receive the SMS.
 */
export function normalizeHuPhone(input: string): string | null {
  const phone = parsePhoneNumberFromString(input, "HU");
  const type = phone?.getType();
  return phone?.isValid() &&
    phone.country === "HU" &&
    (type === "MOBILE" || type === "FIXED_LINE_OR_MOBILE")
    ? phone.number
    : null;
}

/** A venue-typed bar name made GSM-7 safe: accents stripped, dashes and quotes plain, anything else dropped. */
export function sanitizeBarName(name: string): string {
  return [
    ...name
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[‐-―−]/g, "-")
      .replace(/[‘’‚‛′]/g, "'")
      .replace(/[“”„‟″]/g, '"')
      .replace(/\s+/g, " "),
  ]
    .filter((char) => GSM7_BASIC.has(char) && char !== "\n" && char !== "\r")
    .join("")
    .trim();
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

// Hungarian article: "az" before a vowel sound ("az Aurora pultnal", "az 5-os pultnal"), "a" otherwise; en ignores it.
function article(barName: string): string {
  const digits = /^\d+/.exec(barName)?.[0];
  if (digits) {
    // Spoken: 1 egy, 5 öt, 1xxx ezer start with a vowel; 10 tíz, 100 száz do not.
    const vowelSound =
      digits[0] === "5" ||
      (digits[0] === "1" && (digits.length === 1 || digits.length === 4));
    return vowelSound ? "az" : "a";
  }
  return /^[aeiou]/i.test(barName) ? "az" : "a";
}

function smsTranslator(locale: Locale) {
  return createTranslator({
    locale,
    messages: messages[locale],
    namespace: "sms",
  });
}

export function readySmsText(
  locale: Locale,
  input: { shortNumber: number; barName: string; link: string },
): string {
  const { shortNumber, link } = input;
  const barName = sanitizeBarName(input.barName);
  return toGsm7(
    smsTranslator(locale)("ready", {
      // A string, so ICU does not group 9999 as "9 999" with a non GSM-7 space.
      shortNumber: String(shortNumber),
      article: article(barName),
      barName,
      link,
    }),
  );
}

export function reminderSmsText(
  locale: Locale,
  input: { barName: string },
): string {
  const barName = sanitizeBarName(input.barName);
  return toGsm7(
    smsTranslator(locale)("reminder", { article: article(barName), barName }),
  );
}

/** Push wins over SMS; the venue can switch SMS off; at most two per order (ready and one reminder). */
// shortcut: the count is read, then the SMS sent, so two parallel jobs may both send; an atomic per-order claim needs an Order field, add it with T-043/T-035.
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

// shortcut: bounds one run (one Inngest step, sequential HTTP calls); the daily job deletes a larger
// backlog over the next days. Messages of other senders on the account count toward the page.
const SMS_LOG_PAGE = 200;
// Twilio's "not found": already deleted, which is the goal.
const TWILIO_NOT_FOUND = 20404;

const twilioCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "unknown";

/**
 * Deletes Twilio's copies of our ready and reminder SMS sent before `cutoff` (T-028): its message log
 * keeps the guest's number and the text. Only outbound messages of our messaging service: an account
 * shared with another sender or environment keeps its own log. Returns how many were deleted.
 */
export async function deleteSmsSentBefore(cutoff: Date): Promise<number> {
  const messagingServiceSid = requiredEnv("TWILIO_MESSAGING_SERVICE_SID");
  const client = twilio(
    requiredEnv("TWILIO_ACCOUNT_SID"),
    requiredEnv("TWILIO_AUTH_TOKEN"),
  );
  let old;
  try {
    old = await client.messages.list({
      dateSentBefore: cutoff,
      limit: SMS_LOG_PAGE,
    });
  } catch (error) {
    // As in sendSms: a Twilio error can quote a number, so only its code travels on.
    throw new Error(`Twilio message list failed (code ${twilioCode(error)})`);
  }
  let deleted = 0;
  const failedCodes: string[] = [];
  for (const message of old) {
    if (
      message.messagingServiceSid !== messagingServiceSid ||
      message.direction !== "outbound-api"
    )
      continue;
    try {
      await client.messages(message.sid).remove();
      deleted++;
    } catch (error) {
      const code = twilioCode(error);
      if (code !== String(TWILIO_NOT_FOUND)) failedCodes.push(code);
    }
  }
  // One stuck message must not block the rest; the run still fails so the job reports it.
  if (failedCodes.length > 0) {
    throw new Error(
      `Twilio message deletion failed for ${failedCodes.length} (codes ${[...new Set(failedCodes)].join(", ")}), ${deleted} deleted`,
    );
  }
  return deleted;
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SMS_MAX_LENGTH,
  normalizeHuPhone,
  reminderSmsText,
  readySmsText,
  sendSms,
  shouldSendSms,
  toGsm7,
} from "./sms";

const { create, twilioFactory } = vi.hoisted(() => {
  const create = vi.fn();
  return { create, twilioFactory: vi.fn(() => ({ messages: { create } })) };
});

vi.mock("server-only", () => ({}));
vi.mock("twilio", () => ({ default: twilioFactory }));

// The Bar model has no name length limit; 40 characters is the assumed admin form limit.
const LONGEST_BAR_NAME = "Árvíztűrő Tükörfúrógép Ősi Üvegház Bárja".padEnd(
  40,
  "x",
);
const LONG_LINK = "https://namitiszunk.hu/o/AbCdEfGhIjKlMnOpQrStUv";
const isGsm7Basic = (text: string) =>
  /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà]*$/.test(
    text,
  );

describe("toGsm7", () => {
  it("strips Hungarian accents including ő, ű and é", () => {
    const text = "ő Ő ű Ű é É á Á í Í ó Ó ö Ö ú Ú ü Ü";

    const result = toGsm7(text);

    expect(result).toBe("o O u U e E a A i I o O o O u U u U");
  });

  it("keeps the longest realistic bar name within one segment", () => {
    expect(LONGEST_BAR_NAME).toHaveLength(40);

    const result = toGsm7(LONGEST_BAR_NAME);

    expect(isGsm7Basic(result)).toBe(true);
    expect(result).toHaveLength(40);
  });

  it("rejects characters outside the GSM-7 basic set", () => {
    expect(() => toGsm7("Ár: 1000 €")).toThrow(/non GSM-7/);
    expect(() => toGsm7("Cheers 🍻")).toThrow(/non GSM-7/);
  });

  it("rejects text longer than one segment", () => {
    expect(toGsm7("a".repeat(SMS_MAX_LENGTH))).toHaveLength(SMS_MAX_LENGTH);
    expect(() => toGsm7("a".repeat(SMS_MAX_LENGTH + 1))).toThrow(/limit/);
  });
});

describe("SMS texts", () => {
  const order = {
    shortNumber: 214,
    barName: "Main Bar",
    link: "https://namitiszunk.hu/o/x",
  };

  it("builds the ready text in hu and en", () => {
    const hu = readySmsText("hu", order);
    const en = readySmsText("en", order);

    expect(hu).toBe(
      "Na mit iszunk: #214 kesz! Vedd fel a Main Bar pultnal. https://namitiszunk.hu/o/x",
    );
    expect(en).toBe(
      "Na mit iszunk: #214 is ready. Pick it up at Main Bar. https://namitiszunk.hu/o/x",
    );
  });

  it("builds the reminder text and picks az before a vowel in hu", () => {
    expect(reminderSmsText("hu", { barName: "Main Bar" })).toBe(
      "Meg var rad az italod a Main Bar pultnal.",
    );
    expect(reminderSmsText("hu", { barName: "Örvény" })).toBe(
      "Meg var rad az italod az Orveny pultnal.",
    );
    expect(reminderSmsText("en", { barName: "Örvény" })).toBe(
      "Your drink is still waiting at Orveny.",
    );
  });

  it.each([
    ["Űrbár", "az Urbar"],
    ["Ötös", "az Otos"],
    ["1-es pult", "az 1-es pult"],
    ["5-ös pult", "az 5-os pult"],
    ["1000 Bar", "az 1000 Bar"],
    ["10-es pult", "a 10-es pult"],
    ["2-es pult", "a 2-es pult"],
  ])("picks the hu article by sound for %s", (barName, expected) => {
    const text = reminderSmsText("hu", { barName });

    expect(text).toBe(`Meg var rad az italod ${expected} pultnal.`);
  });

  it("makes a typed bar name GSM-7 safe instead of failing", () => {
    const barName = "Rock–n’Roll “Bar” €🍻";

    const text = reminderSmsText("en", { barName });

    expect(text).toBe(`Your drink is still waiting at Rock-n'Roll "Bar".`);
  });

  it.each(["hu", "en"] as const)(
    "keeps every %s text GSM-7 and within 160 with the longest name and a long link",
    (locale) => {
      const texts = [
        readySmsText(locale, {
          shortNumber: 9999,
          barName: LONGEST_BAR_NAME,
          link: LONG_LINK,
        }),
        reminderSmsText(locale, { barName: LONGEST_BAR_NAME }),
      ];

      for (const text of texts) {
        expect(text).toContain(toGsm7(LONGEST_BAR_NAME));
        expect(isGsm7Basic(text)).toBe(true);
        expect(text.length).toBeLessThanOrEqual(SMS_MAX_LENGTH);
      }
      expect(texts[0]).toContain("#9999 ");
      expect(LONG_LINK).toHaveLength(47);
    },
  );
});

describe("normalizeHuPhone", () => {
  it.each([
    ["06 30 123 4567", "+36301234567"],
    ["+36 20 123 4567", "+36201234567"],
    ["+36-70-123-4567", "+36701234567"],
  ])("normalizes %s to E.164", (input, expected) => {
    expect(normalizeHuPhone(input)).toBe(expected);
  });

  it.each([
    "+43 664 1234567",
    "+44 7911 123456",
    "+1 202 555 0143",
    "12",
    "",
    // Budapest landline: valid, but it cannot receive an SMS.
    "+36 1 234 5678",
  ])("rejects %s", (input) => {
    expect(normalizeHuPhone(input)).toBeNull();
  });
});

describe("shouldSendSms", () => {
  const base = {
    hasPushToken: false,
    smsRequested: true,
    venueSmsEnabled: true,
    smsCountForOrder: 0,
  };

  it.each([
    [{}, true],
    [{ smsCountForOrder: 1 }, true],
    [{ smsCountForOrder: 2 }, false],
    [{ hasPushToken: true }, false],
    [{ smsRequested: false }, false],
    [{ venueSmsEnabled: false }, false],
  ])("with %o returns %s", (override, expected) => {
    expect(shouldSendSms({ ...base, ...override })).toBe(expected);
  });
});

describe("sendSms", () => {
  const callback = "https://api.namitiszunk.hu/webhooks/twilio";

  beforeEach(() => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token_test");
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MG_test");
    create.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends through the Messaging Service with a status callback", async () => {
    create.mockResolvedValue({ sid: "SM123" });

    const sid = await sendSms("06 30 123 4567", "Kész a Bárban", callback);

    expect(sid).toBe("SM123");
    expect(twilioFactory).toHaveBeenCalledWith("AC_test", "token_test");
    expect(create).toHaveBeenCalledWith({
      messagingServiceSid: "MG_test",
      to: "+36301234567",
      body: "Kesz a Barban",
      statusCallback: callback,
    });
  });

  it("refuses a foreign number without calling Twilio", async () => {
    await expect(sendSms("+43 664 1234567", "x", callback)).rejects.toThrow(
      /Hungarian/,
    );

    expect(create).not.toHaveBeenCalled();
  });

  it("drops the Twilio message so the phone number is not passed on", async () => {
    create.mockRejectedValue(
      Object.assign(new Error("The 'To' number +36301234567 is blocked"), {
        code: 21610,
      }),
    );

    const error: unknown = await sendSms("+36301234567", "x", callback).catch(
      (e: unknown) => e,
    );

    expect(String(error)).toContain("21610");
    expect(String(error)).not.toContain("301234567");
  });

  it("fails clearly when a Twilio variable is missing", async () => {
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "");

    await expect(sendSms("+36301234567", "x", callback)).rejects.toThrow(
      "TWILIO_MESSAGING_SERVICE_SID is missing",
    );
  });
});

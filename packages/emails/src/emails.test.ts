import { afterEach, describe, expect, it, vi } from "vitest";
import { locales, type Locale } from "@namitiszunk/i18n";
import { renderEmail, type EmailTemplate } from "./render";
import type { EmailData } from "./templates";

// "server-only" throws outside a React Server Components bundle.
vi.mock("server-only", () => ({}));

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const { sendEmail } = await import("./send-email");

const fixtures: { [N in EmailTemplate]: Omit<EmailData[N], "locale"> } = {
  signIn: { url: "https://admin.namitiszunk.hu/auth/verify?token=abc" },
  staffInvite: {
    venueName: "Pilot Club",
    role: "manager",
    url: "https://admin.namitiszunk.hu/invite/xyz",
  },
  orderConfirmation: {
    venueName: "Pilot Club",
    venueEmail: "bar@pilot.example",
    shortNumber: "A42",
    items: [
      { name: "Csapolt sör 0,5 l", quantity: 2, amountHuf: 3980 },
      { name: "Gin tonic", quantity: 1, amountHuf: 2490 },
    ],
    totalHuf: 6470,
  },
  orderRejected: {
    venueName: "Pilot Club",
    venueEmail: "bar@pilot.example",
    shortNumber: "A42",
    refundHuf: 6470,
  },
  orderRefunded: {
    venueName: "Pilot Club",
    venueEmail: "bar@pilot.example",
    shortNumber: "A42",
    refundHuf: 1990,
  },
  problemReport: {
    venueName: "Pilot Club",
    barName: "Főpult",
    shortNumber: "A42",
    status: "ready",
    totalHuf: 4980,
    category: "not_received",
    message: "Nem kaptam meg az italt.\n<script>x</script>",
    guestEmail: "guest@example.com",
    adminUrl: "https://admin.namitiszunk.hu/orders/abc",
    platformEmail: "hello@platform.example",
  },
  newLead: {
    name: "Kiss Anna",
    venueName: "Új Klub",
    email: "anna@example.com",
    phone: "+36301234567",
    message: "Érdekel a rendszer.",
    platformEmail: "hello@platform.example",
  },
  onboardingReminder: {
    venueName: "Pilot Club",
    url: "https://admin.namitiszunk.hu/onboarding",
  },
  weeklyReport: {
    venueName: "Pilot Club",
    from: "2026-11-09",
    to: "2026-11-15",
    current: {
      orders: 312,
      revenueHuf: 1245600,
      tipHuf: 48200,
      avgBasketHuf: 3992,
      avgPrepSeconds: 262,
      refundedOrders: 1,
      refundedHuf: 2400,
    },
    previous: {
      orders: 280,
      revenueHuf: 1100000,
      tipHuf: 40100,
      avgBasketHuf: 3929,
      avgPrepSeconds: null,
      refundedOrders: 0,
      refundedHuf: 0,
    },
    change: {
      orders: 11,
      revenueHuf: 13,
      avgBasketHuf: 2,
      avgPrepSeconds: null,
      tipHuf: -5,
    },
    products: [
      { name: "Sör", nameEn: "Beer", quantity: 140, revenueHuf: 168000 },
      { name: "Mojito", quantity: 60, revenueHuf: 150000 },
    ],
    url: "https://admin.namitiszunk.hu/reports/period?from=2026-11-09&to=2026-11-15",
  },
};

function dataFor<N extends EmailTemplate>(
  template: N,
  locale: Locale,
): EmailData[N] {
  return { ...fixtures[template], locale } as EmailData[N];
}

const templateNames = Object.keys(fixtures) as EmailTemplate[];

describe("renderEmail", () => {
  for (const template of templateNames) {
    for (const locale of locales) {
      it(`renders ${template} in ${locale}`, async () => {
        const email = await renderEmail(template, dataFor(template, locale));

        expect(email.html).toContain(`lang="${locale}"`);
        expect(email.html).toContain('content="dark"');
        expect(email.html).toMatchSnapshot("html");
        expect(email.subject).toMatchSnapshot("subject");
      });
    }
  }

  it("says the confirmation is not a receipt, in both languages", async () => {
    const hu = await renderEmail(
      "orderConfirmation",
      dataFor("orderConfirmation", "hu"),
    );
    const en = await renderEmail(
      "orderConfirmation",
      dataFor("orderConfirmation", "en"),
    );

    expect(hu.html).toContain("Ez nem nyugta");
    expect(hu.text).toContain("Ez nem nyugta");
    expect(en.html).toContain("This is not a receipt");
  });

  it("escapes guest-written text", async () => {
    const email = await renderEmail(
      "problemReport",
      dataFor("problemReport", "hu"),
    );

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("labels guest-written text as theirs and breaks its links", async () => {
    const data = {
      ...dataFor("problemReport", "hu"),
      message: "Visszatérítés itt: https://evil.example/refund",
    };

    const email = await renderEmail("problemReport", data);

    expect(email.html).toContain("A feladó írta, nem mi.");
    expect(email.html).toContain("https[:]//evil.example/refund");
    expect(email.html).not.toContain("https://evil.example");
  });

  it("replies to the venue on order mail and to the platform on problem and lead mail", async () => {
    const order = await renderEmail(
      "orderRejected",
      dataFor("orderRejected", "hu"),
    );
    const problem = await renderEmail(
      "problemReport",
      dataFor("problemReport", "hu"),
    );
    const signIn = await renderEmail("signIn", dataFor("signIn", "hu"));

    expect(order.replyTo).toBe("bar@pilot.example");
    expect(problem.replyTo).toBe("hello@platform.example");
    expect(signIn.replyTo).toBeUndefined();
  });
});

describe("sendEmail", () => {
  afterEach(() => {
    send.mockReset();
    vi.unstubAllEnvs();
  });

  it("sends from noreply with the venue as reply-to", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    send.mockResolvedValue({ data: { id: "email_1" }, error: null });

    const result = await sendEmail(
      "orderConfirmation",
      "guest@example.com",
      dataFor("orderConfirmation", "en"),
    );

    expect(result).toEqual({ id: "email_1" });
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      from: "Na, mit iszunk? <noreply@namitiszunk.hu>",
      to: "guest@example.com",
      subject: "Order confirmation (A42)",
      replyTo: "bar@pilot.example",
    });
    expect(payload.html).toContain("This is not a receipt");
    expect(payload.text).toContain("This is not a receipt");
  });

  it("omits reply-to when the template has none", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    send.mockResolvedValue({ data: { id: "email_2" }, error: null });

    await sendEmail("signIn", "staff@example.com", dataFor("signIn", "hu"));

    expect(send.mock.calls[0]?.[0]).not.toHaveProperty("replyTo");
  });

  it("throws when Resend returns an error, so the caller can retry", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    send.mockResolvedValue({
      data: null,
      error: { name: "rate_limit_exceeded", message: "Too many requests" },
    });

    const attempt = sendEmail(
      "signIn",
      "staff@example.com",
      dataFor("signIn", "hu"),
    );

    await expect(attempt).rejects.toThrow("rate_limit_exceeded");
  });

  it("throws without RESEND_API_KEY", async () => {
    vi.stubEnv("RESEND_API_KEY", "");

    const attempt = sendEmail(
      "signIn",
      "staff@example.com",
      dataFor("signIn", "hu"),
    );

    await expect(attempt).rejects.toThrow("RESEND_API_KEY is missing");
  });
});

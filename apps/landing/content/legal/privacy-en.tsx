// T-003 draft, English translation of privacy-hu.tsx; the lawyer decides its legal status.
export function PrivacyEn() {
  return (
    <>
      <p>
        This English text is a translation for convenience. The Hungarian
        version governs.
      </p>

      <section>
        <h2>1. Who handles your data</h2>
        <ul>
          <li>
            <strong>Your order data</strong> (what you ordered, the price, the
            time, your phone number, your problem report): the controller is the
            club where you ordered. The platform handles this data on the
            club&apos;s behalf, as a processor.
          </li>
          <li>
            <strong>Your account, website and analytics data</strong>: the
            controller is the platform operator, [company name, registered
            office, email address].
          </li>
        </ul>
      </section>

      <section>
        <h2>2. What data, why and for how long</h2>
        <ul>
          <li>
            <strong>Order and payment</strong> (items, amounts, times, the
            Stripe payment id): to fulfil the order (contract), then kept for 8
            years for accounting law.
          </li>
          <li>
            <strong>Phone number</strong>, if you ask for an SMS when the order
            is ready: based on your consent; deleted 30 days after the order.
          </li>
          <li>
            <strong>Email address on a problem report</strong>, if you give it
            so the club can reply: based on your consent; deleted after 90 days.
          </li>
          <li>
            <strong>Card fingerprint</strong> (Stripe&apos;s pseudonymous id,
            not the card number): to prevent abuse (legitimate interest);
            deleted after 2 days.
          </li>
          <li>
            <strong>Account</strong> (name, email address, order history), if
            you sign up: to provide the account (contract); kept until you
            delete it, or deleted after 2 years of inactivity.
          </li>
        </ul>
        <p>
          We do not handle card details: Stripe receives your card directly.
          After you delete your account, your orders stay for accounting but are
          no longer linked to you.
        </p>
      </section>

      <section>
        <h2>3. Processors</h2>
        <p>
          We use these providers, each in an EU region where one is offered:
        </p>
        <ul>
          <li>Stripe: payments and refunds</li>
          <li>MongoDB Atlas: database (Frankfurt)</li>
          <li>Vercel: hosting and images</li>
          <li>Ably: live order status updates</li>
          <li>Twilio: SMS notifications</li>
          <li>Resend: email</li>
          <li>Inngest: scheduled jobs (such as deletions)</li>
          <li>Sentry: error logging</li>
          <li>PostHog: analytics, in the EU, without cookies</li>
        </ul>
        <p>
          If you sign in with Apple or Google, we receive the data needed to
          sign in (name, email address) from them.
        </p>
      </section>

      <section>
        <h2>4. Cookies</h2>
        <p>
          We only use cookies needed to run the service: to keep you signed in
          and to let you reopen your order page. Analytics works without
          cookies.
        </p>
      </section>

      <section>
        <h2>5. Your rights</h2>
        <ul>
          <li>
            Access and portability: download all data tied to you in your
            account (/fiok).
          </li>
          <li>Erasure: delete your account in your account, at once.</li>
          <li>
            Rectification, restriction, objection, withdrawing consent: write to
            [email address]; we reply within 30 days.
          </li>
          <li>
            Complaints: the Hungarian data protection authority (NAIH, naih.hu),
            or a court.
          </li>
        </ul>
        <p>
          You can also send requests about your order data to the club; we help
          it fulfil them.
        </p>
      </section>
    </>
  );
}

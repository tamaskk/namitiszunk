// T-003 draft, English translation of terms-hu.tsx; the lawyer decides its legal status.
export function TermsEn() {
  return (
    <>
      <p>
        This English text is a translation for convenience. The Hungarian
        version governs.
      </p>

      <section>
        <h2>1. Who we are and what we do</h2>
        <p>
          Na, mit iszunk? (the platform) is operated by [company name,
          registered office, company registration number, tax number, email
          address]. On the platform, guests in a club order and pay for drinks
          with a QR code.
        </p>
        <p>
          The platform is an intermediary. The club sells the drinks: your
          contract of sale is with the club, which issues the receipt and is
          responsible for the drinks. The menu and the payment confirmation show
          the club&apos;s name and details.
        </p>
      </section>

      <section>
        <h2>2. Prices and fees</h2>
        <ul>
          <li>All prices are gross, in forints, including VAT.</li>
          <li>
            If the club charges a service fee, checkout shows it on a separate
            line before you pay.
          </li>
          <li>
            Tips are optional. You choose the amount and see it before you pay.
          </li>
          <li>You see the total before you tap Pay.</li>
        </ul>
      </section>

      <section>
        <h2>3. Age</h2>
        <p>
          Only guests over 18 may order alcohol. By ordering you declare that
          you are over 18. At pickup the club may check your age in person and
          may refuse to hand over an alcoholic drink if you cannot prove it.
        </p>
      </section>

      <section>
        <h2>4. How an order works</h2>
        <ol>
          <li>You fill your cart and accept these terms at checkout.</li>
          <li>
            You pay by card, Apple Pay or Google Pay. Stripe handles the
            payment; neither the platform nor the club sees your card details.
          </li>
          <li>
            After a successful payment you get an order number and can follow
            the order on its page.
          </li>
          <li>When it is ready, you pick it up at the bar with the number.</li>
        </ol>
        <p>
          The contract is made when the payment succeeds. If the payment fails,
          no order is made and you are not charged.
        </p>
      </section>

      <section>
        <h2>5. Cancellation, rejection, refunds</h2>
        <ul>
          <li>
            If the club accepts orders automatically, your order is accepted
            when you pay and can no longer be cancelled.
          </li>
          <li>
            If the club accepts orders by hand, you can cancel while the order
            is New and get the full amount back.
          </li>
          <li>If the club rejects your order, we refund the full amount.</li>
          <li>
            After pickup, only the club (its manager or owner) can give a
            refund, based on your problem report.
          </li>
          <li>
            If you do not pick up a ready drink, the receipt stays valid and
            there is no refund, unless the club&apos;s rules say otherwise.
          </li>
          <li>
            Refunds go to the card you paid with. When they arrive depends on
            your bank, usually 5–10 business days.
          </li>
        </ul>
        <p>
          Right of withdrawal: drinks are perishable goods for immediate
          consumption, so under Section 29 (1) d) of Government Decree 45/2014
          (II. 26.) the 14-day right of withdrawal does not apply.
        </p>
      </section>

      <section>
        <h2>6. Complaints</h2>
        <p>
          If something is wrong with your order, tap “Report a problem” on the
          order page. The club receives the report and decides on it. Send
          complaints about the platform to [email address]; we reply in writing
          within 30 days.
        </p>
        <p>
          If your complaint is not resolved, you can turn to the conciliation
          board of your place of residence (in Budapest: Budapesti Békéltető
          Testület) or to a court.
        </p>
      </section>

      <section>
        <h2>7. Personal data</h2>
        <p>
          What data we handle, why and for how long is in the{" "}
          <a href="adatvedelem">privacy notice</a>.
        </p>
      </section>

      <section>
        <h2>8. Liability</h2>
        <p>
          The club is responsible for the drinks, the service and the receipt.
          The platform is responsible for passing on the order and processing
          the payment. We are not liable for outages caused by things outside
          our control, such as the mobile network or the payment provider.
        </p>
      </section>

      <section>
        <h2>9. Changes and governing law</h2>
        <p>
          We may change these terms. Your order is governed by the version you
          accepted at checkout, which we store with the order. The language of
          the contract is Hungarian, and Hungarian law applies.
        </p>
      </section>
    </>
  );
}

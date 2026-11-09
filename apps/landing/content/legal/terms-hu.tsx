// T-003 draft for legal review. Bracketed items are filled in by the owner before publication.
// The not-collected rule is a working assumption the accountant and the lawyer must confirm (T-002).
export function TermsHu() {
  return (
    <>
      <section>
        <h2>1. Kik vagyunk, és mit csinálunk</h2>
        <p>
          A Na, mit iszunk? (a továbbiakban: platform) üzemeltetője [cégnév,
          székhely, cégjegyzékszám, adószám, e-mail cím]. A platformon a
          vendégek a klubban QR-kóddal rendelhetnek és fizethetnek italt.
        </p>
        <p>
          A platform közvetítő. Az italt a klub adja el: vele jön létre az
          adásvételi szerződés, ő állítja ki a nyugtát, és ő felel az italért. A
          klub nevét és adatait a menü és a fizetési visszaigazolás mutatja.
        </p>
      </section>

      <section>
        <h2>2. Árak és díjak</h2>
        <ul>
          <li>Minden ár bruttó, forintban, az ÁFA-t tartalmazza.</li>
          <li>
            Ha a klub szervizdíjat számol fel, annak összegét a pénztár a
            fizetés előtt külön sorban mutatja.
          </li>
          <li>
            A borravaló önkéntes. Az összegét te választod, és a fizetés előtt
            látod.
          </li>
          <li>
            A fizetendő végösszeg a fizetés gomb megnyomása előtt látható.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Életkor</h2>
        <p>
          Alkoholt csak 18 éven felüli vendég rendelhet. A rendeléssel
          kijelented, hogy elmúltál 18 éves. A pultnál átvételkor a klub
          személyesen ellenőrizheti az életkorodat, és ha nem tudod igazolni,
          megtagadhatja az alkoholos ital átadását.
        </p>
      </section>

      <section>
        <h2>4. A rendelés menete</h2>
        <ol>
          <li>
            Összeállítod a kosarat, és a pénztárban elfogadod ezt az ÁSZF-et.
          </li>
          <li>
            Kártyával, Apple Pay-jel vagy Google Pay-jel fizetsz. A fizetést a
            Stripe kezeli; a kártyaadataidat sem a platform, sem a klub nem
            látja.
          </li>
          <li>
            Sikeres fizetés után kapsz egy rendelésszámot, és a rendelés oldalán
            követheted az állapotát.
          </li>
          <li>Amikor kész, a pultnál a rendelésszámmal veheted át.</li>
        </ol>
        <p>
          A szerződés a sikeres fizetéssel jön létre. Ha a fizetés nem sikerül,
          rendelés sem jön létre, és nem terhelünk.
        </p>
      </section>

      <section>
        <h2>5. Lemondás, elutasítás, visszatérítés</h2>
        <ul>
          <li>
            Ha a klub automatikusan elfogadja a rendeléseket, a rendelés a
            fizetéssel elfogadottá válik, és már nem mondható le.
          </li>
          <li>
            Ha a klub kézzel fogadja el a rendeléseket, amíg a rendelés Új
            állapotban van, lemondhatod, és a teljes összeget visszakapod.
          </li>
          <li>
            Ha a klub elutasítja a rendelésedet, a teljes összeget
            visszatérítjük.
          </li>
          <li>
            Átadás után visszatérítést csak a klub (menedzsere vagy tulajdonosa)
            adhat, a problémajelzésed alapján.
          </li>
          <li>
            Ha a kész italt nem veszed át, a nyugta érvényes marad, és nincs
            visszatérítés, kivéve, ha a klub szabályai mást mondanak.
          </li>
          <li>
            A visszatérítés arra a kártyára érkezik, amellyel fizettél. A
            jóváírás ideje a bankodtól függ, általában 5–10 munkanap.
          </li>
        </ul>
        <p>
          Elállási jog: az ital romlandó, gyorsan fogyasztandó termék, ezért a
          45/2014. (II. 26.) Korm. rendelet 29. § (1) bekezdés d) pontja alapján
          a 14 napos elállási jog nem illeti meg.
        </p>
      </section>

      <section>
        <h2>6. Panasz</h2>
        <p>
          Ha baj van a rendeléseddel, a rendelés oldalán a „Problémát jelzek”
          gombbal jelezd. A jelzést a klub kapja meg, és ő dönt róla. A
          platformmal kapcsolatos panaszt a(z) [e-mail cím] címre küldheted; 30
          napon belül írásban válaszolunk.
        </p>
        <p>
          Ha a panaszod rendezése nem sikerül, a lakóhelyed szerinti békéltető
          testülethez fordulhatsz (Budapesten: Budapesti Békéltető Testület),
          vagy bírósághoz.
        </p>
      </section>

      <section>
        <h2>7. Adatkezelés</h2>
        <p>
          Hogy milyen adatot, mire és meddig kezelünk, az{" "}
          <a href="adatvedelem">adatkezelési tájékoztatóban</a> olvashatod.
        </p>
      </section>

      <section>
        <h2>8. Felelősség</h2>
        <p>
          Az italért, a kiszolgálásért és a nyugtáért a klub felel. A platform a
          rendelés továbbításáért és a fizetés lebonyolításáért felel. Nem
          felelünk olyan kiesésért, amely rajtunk kívül álló okból (például a
          mobilhálózat vagy a fizetési szolgáltató hibája miatt) történik.
        </p>
      </section>

      <section>
        <h2>9. Módosítás és irányadó jog</h2>
        <p>
          Az ÁSZF-et módosíthatjuk. A rendelésedre az a verzió vonatkozik,
          amelyet a pénztárban elfogadtál; ezt a rendelésed mellett tároljuk. A
          szerződés nyelve a magyar, és a magyar jog irányadó.
        </p>
      </section>
    </>
  );
}

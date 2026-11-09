// T-003 draft for legal review. Bracketed items are filled in by the owner before publication.
// The processor list must match the services the apps use (T-014 env list); retention matches docs/SECURITY.md.
export function PrivacyHu() {
  return (
    <>
      <section>
        <h2>1. Ki kezeli az adataidat</h2>
        <ul>
          <li>
            <strong>A rendelésed adatai</strong> (mit rendeltél, mennyiért,
            mikor, a telefonszámod, a problémajelzésed): az adatkezelő az a
            klub, ahol rendeltél. A platform ezeket a klub megbízásából,
            adatfeldolgozóként kezeli.
          </li>
          <li>
            <strong>A fiókod, a weboldal és az analitika adatai</strong>: az
            adatkezelő a platform üzemeltetője, Kálmán Tamás Krisztián egyéni
            vállalkozó (1108 Budapest, Agyagfejtő utca 20.; e-mail:
            kalman.tamaskrisztian@gmail.com).
          </li>
        </ul>
      </section>

      <section>
        <h2>2. Milyen adatot, mire és meddig</h2>
        <ul>
          <li>
            <strong>Rendelés és fizetés</strong> (tételek, összegek, időpontok,
            a Stripe fizetési azonosítója): a rendelés teljesítéséhez
            (szerződés), majd a számviteli kötelezettség miatt 8 évig őrizzük.
          </li>
          <li>
            <strong>Telefonszám</strong>, ha kéred, hogy SMS-ben szóljunk,
            amikor kész a rendelés: a hozzájárulásod alapján; a rendelés után 30
            nappal töröljük.
          </li>
          <li>
            <strong>E-mail cím a problémajelzésen</strong>, ha megadod, hogy a
            klub válaszolhasson: a hozzájárulásod alapján; 90 nap után töröljük.
          </li>
          <li>
            <strong>Kártya-ujjlenyomat</strong> (a Stripe álnevesített
            azonosítója, nem a kártyaszám): a visszaélések megelőzésére (jogos
            érdek), 2 nap után töröljük.
          </li>
          <li>
            <strong>Fiók</strong> (név, e-mail cím, rendelési előzmények), ha
            regisztrálsz: a fiók szolgáltatásához (szerződés); amíg nem törlöd,
            vagy 2 év inaktivitás után töröljük.
          </li>
        </ul>
        <p>
          Kártyaadatot nem kezelünk: a kártyádat közvetlenül a Stripe kapja meg.
          A fiók törlése után a rendeléseid a könyvelés miatt megmaradnak, de
          már nem kapcsolódnak hozzád.
        </p>
      </section>

      <section>
        <h2>3. Adatfeldolgozók</h2>
        <p>
          Ezeket a szolgáltatókat használjuk, mindegyiknél EU-s régióval, ahol
          választható:
        </p>
        <ul>
          <li>Stripe: fizetés és visszatérítés</li>
          <li>MongoDB Atlas: adatbázis (Frankfurt)</li>
          <li>Vercel: tárhely és képek</li>
          <li>Ably: a rendelés állapotának élő frissítése</li>
          <li>Twilio: SMS-értesítés</li>
          <li>Resend: e-mail</li>
          <li>Inngest: időzített feladatok (például a törlések)</li>
          <li>Sentry: hibanaplózás</li>
          <li>PostHog: analitika, EU-ban, sütik nélkül</li>
        </ul>
        <p>
          Ha Apple- vagy Google-fiókkal lépsz be, a belépéshez szükséges adatot
          (név, e-mail cím) tőlük kapjuk meg.
        </p>
      </section>

      <section>
        <h2>4. Sütik</h2>
        <p>
          Csak működéshez szükséges sütiket használunk: a bejelentkezéshez és
          ahhoz, hogy a rendelésed oldalát újra megnyithasd. Az analitika sütik
          nélkül működik.
        </p>
      </section>

      <section>
        <h2>5. A jogaid</h2>
        <ul>
          <li>
            Hozzáférés és adathordozhatóság: a fiókodban (/fiok) letöltheted az
            összes hozzád kötött adatot.
          </li>
          <li>Törlés: a fiókodat a fiókodban azonnal törölheted.</li>
          <li>
            Helyesbítés, korlátozás, tiltakozás, a hozzájárulás visszavonása:
            írj a kalman.tamaskrisztian@gmail.com címre; 30 napon belül
            válaszolunk.
          </li>
          <li>
            Panasz: a Nemzeti Adatvédelmi és Információszabadság Hatóságnál
            (NAIH, naih.hu), vagy bírósághoz fordulhatsz.
          </li>
        </ul>
        <p>
          A rendelésed adataival kapcsolatos kérést a klubnak is küldheted; mi
          segítünk neki teljesíteni.
        </p>
      </section>
    </>
  );
}

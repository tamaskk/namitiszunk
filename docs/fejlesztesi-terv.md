# Na, mit iszunk? – Fejlesztési terv

Nov 1, 2026 · @Tamás Krisztián Kálmán

A release-ig 117 feladat van 11 témakörben; a Fázis 4 is része a release-nek. Forrás: [Na, mit iszunk? – Teljes termékdokumentáció](https://claude.ai/artifact/LFFS9WPtKww24aYceKDszq), a 2026-11-01-i döntésekkel együtt.

A projekt greenfield: a repóban még nincs kód. Ezért minden feladat „Jelenlegi állapot” pontja a termékdoksi vonatkozó szakaszára hivatkozik. A „Hol” oszlop azt a fájlt vagy modult adja meg, ahol a megoldás készül. Ez a doksi „Monorepó felépítése” szakaszát követi, két új közös csomaggal: `packages/ui` és `packages/i18n`.

Feltételek:

- 1 fejlesztő teljes munkaidőben (kb. 40 óra/hét), AI-asszisztenssel, designer nélkül.
- Méret: S ≤ 1 nap · M 2–5 nap · L 1+ hét (fejlesztői munkanapban).
- Súly: 🔴 blokkoló (nélküle a következő kapu nem érhető el) · 🟠 komoly · 🟡 csiszolás.
- Fázisok a doksi ütemterve szerint: 0 Tervezés · 1 Web MVP · 2 Pilot · 3 App + landing · 4 Skálázás.

## 1. Összesítő táblázat

### A. Üzleti, jogi és fiókok (nem fejlesztés)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Stripe platformfiók és Connect beállítás | Stripe Dashboard (platformfiók), Vercel env változók | Nincs platformfiók, így nincs teszt- és élő kulcs | Fizetés, Connect onboarding és application fee nélküle nem fejleszthető | 🔴 | S |
| 2 | Könyvelő megtalálása, nyugta- és NTAK-kérdések lezárása | Termékdoksi „Kérdések a könyvelőnek”, Gmail piszkozat | Nincs könyvelő; a nyugtakezelés munkafeltételezés | Ha a könyvelő elveti a Készül gombos nyugtát, a Pult nézet és a fizetési folyamat változik | 🔴 | M |
| 3 | Jogi dokumentumok: ÁSZF, adatvédelmi tájékoztató, pilotmegállapodás, adatfeldolgozói szerződés | `apps/landing/content/legal/`, szerződések DOCX-ben | Egyik sincs meg | ÁSZF és tájékoztató nélkül nem fogadhatunk fizetést; adatfeldolgozói szerződés nélkül a klub nem adhat adatot | 🔴 | M |
| 4 | Pilot klub megszerzése | Egyoldalas ajánlat (PDF), budapesti klublista | Nincs pilot klub | Kapu 1 és Kapu 2 csak éles klubban mérhető | 🔴 | M |
| 5 | DNS a Vercelre és e-mail küldő domain | Regisztrátor, Vercel Domains, Resend | A namitiszunk.hu névszerverei a regisztrátornál vannak | Aldomainek és tranzakciós e-mailek (SPF, DKIM) nélküle nem működnek | 🔴 | S |
| 6 | Betanító videó és útmutató a pultosoknak | `docs/pilot/betanitas.md`, videó | Nincs | Csúcsidőben nincs idő tanulni; a rossz kezelés rontja a Kapu 2 számokat | 🟠 | S |
| 7 | Apple Developer és Google Play fiók | Apple Developer Program (D-U-N-S), Google Play Console | Nincs céges fiók | Nélküle nincs áruházi kiadás; a D-U-N-S szám kiadása napokig-hetekig tart | 🔴 | S |
| 8 | Zárt teszt ismerősökkel, valódi fizetéssel | Éles környezet, a pilot klub egy csendes estéje | Nincs lebonyolítva | A doksi döntése szerint ez kötelező az éles est előtt | 🔴 | S |
| 9 | Védjegykeresés | SZTNH, EUIPO, TMview | Nincs ellenőrizve | Névütközés esetén a nyilvános indulás előtt kell nevet váltani | 🟡 | S |
| 10 | Landing videó felvétele a pilot klubban | `apps/landing/public/video/` | Nincs videó | A teljes landing hero és „Hogyan működik” szekciója erre épül | 🟡 | S |

### B. Tervezés és alapok

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 11 | UX drótvázak a fő folyamatokra | `docs/ux/` | Nincs designer és nincs drótváz | A 60 mp-es rendelési cél és a csúcsidős Pult nézet tervezés nélkül nem teljesül | 🟠 | M |
| 12 | Monorepó váz | Gyökér (`turbo.json`, `pnpm-workspace.yaml`, `.nvmrc`), `apps/*`, `packages/*` | A repó üres | Minden további feladat erre épül | 🔴 | M |
| 13 | CI (GitHub Actions) | `.github/workflows/ci.yml` | Nincs automatikus ellenőrzés | Pénzkezelő kódnál a hibás változtatás nem juthat élesbe | 🔴 | S |
| 14 | Környezetek, titkok és deploy | `packages/config/src/env.ts`, 5 Vercel projekt, Atlas Flex (éles), Atlas M0 (fejlesztői) | Nincs környezet és titokkezelés | Teszt- és élő Stripe-kulcsok, adatbázisok és domainek szétválasztása nélkül nem lehet biztonságosan élesíteni | 🔴 | M |
| 15 | Közös fordítási csomag (next-intl) | `packages/i18n` | Nincs | A magyar és angol nyelv induló követelmény; utólag minden szöveget át kellene írni | 🔴 | S |
| 16 | UI alap és sötét téma | `packages/ui`, `packages/config/tailwind` | Nincs közös komponenskészlet | 4 webes app ugyanazokat a gombokat, űrlapokat és táblákat használja; a sötét téma a klubvilágításhoz kell | 🟠 | M |
| 17 | Monitorozás és riasztás | `apps/*/sentry.*.config.ts`, uptime figyelő, telefonos push | Nincs hibakövetés és riasztás | Péntek éjjeli leállásról különben csak a klub panaszából értesülünk | 🟠 | S |
| 18 | Termékanalitika (PostHog, cookieless) | `packages/analytics` | Nincs mérés | A fő tölcsér és a pilot tanulságai nélküle nem mérhetők | 🟠 | S |
| 19 | Mentés és visszaállítási próba | Atlas Flex napi snapshot, `docs/runbooks/restore.md` | Nincs ellenőrzött visszaállítás | Adatvesztésnél a rendelések és a riportok elvesznek | 🟠 | S |

### C. Adatmodell és üzleti logika

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | Mongoose modellek és indexek | `packages/db/src/models/` | Nincs adatmodell | Minden felület ugyanazokat a modelleket használja | 🔴 | M |
| 21 | Rendelés-állapotgép | `packages/core/src/orders/state-machine.ts`, `transition.ts` | Nincs | A doksi szerint állapotot csak a szerver vált egyetlen függvényen át; hiba esetén pénz és ital vész el | 🔴 | M |
| 22 | Díjszámítás | `packages/core/src/pricing/` | Nincs | Részösszeg, szervizdíj, borravaló, kedvezmény, jutalék és SMS-díj pontos számítása nélkül nem lehet terhelni | 🔴 | M |
| 23 | Jogosultságok (RBAC) | `packages/core/src/auth/permissions.ts` | Nincs | 5 helyszíni és 3 platformszerepkör; a szervernek kell ellenőriznie, nem a felületnek | 🔴 | M |
| 24 | Rövid rendelésszám és üzleti nap | `packages/core/src/orders/short-number.ts` | Nincs | A pultos és a vendég a rövid számmal azonosítja a rendelést; ütközés téves átadást okoz | 🔴 | S |
| 25 | Zod sémák és OpenAPI | `packages/validators/` | Nincs | Ugyanaz a validáció kell kliensen, szerveren és a mobil API-ban | 🔴 | S |
| 26 | Audit napló | `packages/core/src/audit/` | Nincs | Visszatérítés, díjváltozás és a klub nevében végzett belépés csak naplózva engedhető | 🔴 | S |
| 27 | Seed adatok | `packages/db/src/seed.ts` | Nincs | Fejlesztés, E2E teszt és demó mintaadat nélkül lassú | 🟠 | S |
| 28 | Automatikus adattörlés (megőrzési idők) | `apps/api/src/inngest/retention.ts` | Nincs | A döntött megőrzési idők (telefonszám 30 nap, problémajelzés e-mail-címe 90 nap, inaktív fiók 2 év) GDPR-kötelezettség | 🟠 | S |

### D. Backend és integrációk

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 29 | API váz: route handlerek, hibakezelés, rate limit, CORS, OpenAPI | `apps/api/app/v1/` | Nincs API | A mobilapp, a webhookok és a háttérfeladatok mind ezt hívják | 🔴 | M |
| 30 | Hitelesítés (Better Auth): Apple, Google, e-mail link, HQ 2FA, személyzeti PIN, vendégtoken | `packages/auth/`, `apps/*/app/api/auth/[...all]/route.ts` | Nincs | Admin, HQ, vendégfiók és a pultosok azonosítása nélkül semmi nem védhető | 🔴 | L |
| 31 | Realtime (Ably) | `packages/core/src/realtime/`, `apps/api/app/v1/realtime/token/route.ts` | Nincs | A rendelésnek 2 mp-en belül meg kell jelennie a pulton, és a vendég élő állapota is erre épül | 🔴 | M |
| 32 | Stripe Connect onboarding | `apps/api/app/v1/stripe/connect/`, `apps/api/app/webhooks/stripe/route.ts` | Nincs | Kapcsolt fiók nélkül a pénz nem jut el a klubhoz | 🔴 | M |
| 33 | Fizetés: PaymentIntent direct charge, application fee, webhook | `packages/core/src/payments/`, `apps/api/app/webhooks/stripe/route.ts` | Nincs | Ez a termék magja; a rendelés csak a webhook után kerül a pultra | 🔴 | L |
| 34 | Visszatérítés | `packages/core/src/payments/refund.ts` | Nincs | Elutasítás és menedzseri visszatérítés nélkül a pult nem tud hibát kezelni | 🔴 | M |
| 35 | Háttérfeladatok (Inngest) | `apps/api/src/inngest/` | Nincs | Lejárat, emlékeztető, megszakított fizetések, heti riport és adattörlés időzítést igényel | 🔴 | M |
| 36 | SMS (Twilio) | `packages/core/src/notify/sms.ts` | Nincs | App nélkül az SMS az egyetlen megbízható „Kész” jelzés | 🔴 | S |
| 37 | E-mail (Resend + React Email) | `packages/emails/` | Nincs | Belépési link, meghívó, visszaigazolás, problémajelzés és leadek | 🔴 | M |
| 38 | Képfeltöltés (Vercel Blob) | `apps/api/app/v1/uploads/route.ts` | Nincs | Termékképek, logók és borítóképek tárolása | 🟠 | S |
| 39 | Típusos API kliens | `packages/api-client/` | Nincs | A mobilapp és a webes kliensoldali hívások ezt használják | 🟠 | S |

### E. Rendelős oldal

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 40 | Menü oldal | `apps/order/app/[locale]/v/[slug]/page.tsx` | Nincs | A vendégek többsége itt találkozik a termékkel; 4G-n 2 mp alatt kell betöltenie | 🔴 | L |
| 41 | Termék lap és kosár | `apps/order/components/product-sheet/`, `apps/order/components/cart/` | Nincs | Opciók, mennyiség, tételkorlát és készlet-újraellenőrzés nélkül nincs rendelés | 🔴 | M |
| 42 | Pénztár és fizetés | `apps/order/app/[locale]/v/[slug]/checkout/` | Nincs | Apple Pay, Google Pay, kártya, Stripe Link, borravaló, szervizdíj és promóciós kód egy képernyőn | 🔴 | L |
| 43 | Élő állapot oldal | `apps/order/app/[locale]/o/[orderId]/page.tsx` | Nincs | A vendég itt látja, mikor veheti át; Kész állapotban erre néz rá a pultos | 🔴 | M |
| 44 | Visszaigazolás oldal (nem nyugta) | `apps/order/app/[locale]/r/[orderId]/page.tsx` | Nincs | A vendégnek igazolás kell a fizetésről, a nyugtával összetéveszthetetlen formában | 🟠 | S |
| 45 | Értékelés és Köszönjük oldal | `apps/order/app/[locale]/o/[orderId]/thanks/` | Nincs | Pilot visszajelzés és újrarendelés | 🟡 | S |
| 46 | Problémajelzés | `apps/order/components/report-problem/`, `apps/api/app/v1/orders/[id]/report/route.ts` | Nincs | A pilotban e-mailben kell eljutnia a klubhoz és a platformhoz | 🟠 | S |
| 47 | Webes vendégfiók | `apps/order/app/[locale]/fiok/` | Nincs | A döntés szerint már a pilotban kell (előzmények, újrarendelés, GDPR) | 🟠 | M |
| 48 | Hibaállapotok és szélső esetek | `apps/order/components/states/` | Nincs | Szünet, zárva, elfogyott, sikertelen fizetés, kapcsolatvesztés: csúcsidőben ezek a gyakoriak | 🔴 | M |
| 49 | Teljesítmény és akadálymentesség | `apps/order/` egésze | Nincs mérve | JS 150 KB alatt, LCP 2,5 mp alatt, WCAG 2.1 AA a doksi szerint | 🟠 | M |

### F. Admin oldal

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 50 | Admin váz és navigáció | `apps/admin/app/(dashboard)/layout.tsx` | Nincs | Szerepkör szerinti menü és a globális Nyitva / Szünetel kapcsoló | 🔴 | M |
| 51 | Menü modul | `apps/admin/app/(dashboard)/menu/` | Nincs | A klub tölti fel a menüt; enélkül nincs mit rendelni | 🔴 | L |
| 52 | Menü import CSV-ből | `apps/admin/app/(dashboard)/menu/import/` | Nincs | Gyorsítja a klub beállítását a pilot előtt | 🟠 | S |
| 53 | Pultok, zónák, VIP asztalok és QR-kódok | `apps/admin/app/(dashboard)/bars/` | Nincs | A QR-kód a belépési pont; a VIP asztal QR-ja nyitja a VIP termékeket | 🔴 | M |
| 54 | Pult nézet (PWA) | `apps/admin/app/pult/[barId]/` | Nincs | A pultosok egyetlen felülete; hangjelzés, PIN, Nyugta beütve, offline sáv | 🔴 | L |
| 55 | VIP-host nézet | `apps/admin/app/vip/` | Nincs | A VIP palackrendelés MVP-funkció, a VIP-host ebből viszi ki | 🔴 | M |
| 56 | Rendelések modul, visszatérítés, export | `apps/admin/app/(dashboard)/orders/` | Nincs | Átadás után csak a menedzser térít vissza; a könyvelés CSV/Excel exportot kér | 🔴 | M |
| 57 | Személyzet modul | `apps/admin/app/(dashboard)/staff/` | Nincs | Pultos, VIP-host név + PIN; Manager és Tulaj e-mailes meghívása | 🔴 | M |
| 58 | Beállítások | `apps/admin/app/(dashboard)/settings/` | Nincs | Nyitvatartás, üzleti nap, arculat, rendelési szabályok, SMS, szervizdíj | 🔴 | M |
| 59 | Kifizetések (Stripe Connect) | `apps/admin/app/(dashboard)/payouts/` | Nincs | A Tulaj itt köti be a Stripe-ot; enélkül nem fogadhat fizetést | 🔴 | S |
| 60 | Akciók: promóciós kódok | `apps/admin/app/(dashboard)/promos/`, `packages/core/src/promos/` | Nincs | A döntés szerint a pilot előtt kell | 🟠 | M |
| 61 | Riportok: napi riport, pultos riport, export | `apps/admin/app/(dashboard)/reports/` | Nincs | A Kapu 2 mérése és a klub elszámolása erre épül | 🟠 | M |
| 62 | Heti riport e-mailben | `apps/api/src/inngest/weekly-report.ts`, `packages/emails/weekly-report.tsx` | Nincs | A döntés szerint a pilot előtt kell | 🟡 | S |
| 63 | Irányítópult | `apps/admin/app/(dashboard)/page.tsx` | Nincs | A Manager élőben látja a terhelést és az elfogyott termékeket | 🟠 | M |
| 64 | Értékelések lista | `apps/admin/app/(dashboard)/reviews/` | Nincs | Az értékelés csak akkor ér valamit, ha a klub látja | 🟡 | S |
| 65 | Díjak és számlák | `apps/admin/app/(dashboard)/billing/` | Nincs | A Tulaj látja a havi jutalékot, az SMS-díjat és a számla számát | 🟡 | S |

### G. Saját admin (HQ)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 66 | HQ váz, kötelező 2FA | `apps/hq/app/(dashboard)/layout.tsx` | Nincs | A platform irányítása csak 2FA-val engedhető | 🔴 | M |
| 67 | Helyszínek és jutalék | `apps/hq/app/(dashboard)/venues/` | Nincs | Az MVP-ben csak te veszel fel klubot; az 1%-os pilotjutalék itt állítható | 🔴 | M |
| 68 | Onboarding varázsló | `apps/hq/app/(dashboard)/venues/[id]/onboarding/` | Nincs | A klub beállítási lépéseinek követése a pilot előtt | 🟠 | M |
| 69 | Globális rendeléskereső és support visszatérítés | `apps/hq/app/(dashboard)/orders/` | Nincs | Pilot alatt minden vendégpanaszt rendelésszám alapján kell megtalálni | 🔴 | M |
| 70 | Belépés a klub nevében | `apps/hq/app/(dashboard)/venues/[id]/impersonate/`, `packages/auth/` | Nincs | Pilot alatti távsegítség; csak naplózva és alapból csak olvasással | 🟠 | M |
| 71 | Audit napló felület | `apps/hq/app/(dashboard)/audit/` | Nincs | Visszatérítés és díjváltozás utólagos ellenőrzése | 🔴 | S |
| 72 | Leadek modul | `apps/hq/app/(dashboard)/leads/` | Nincs | A demó űrlap beküldései itt kezelhetők | 🟠 | S |
| 73 | Pénzügy és havi jutalékösszesítő | `apps/hq/app/(dashboard)/finance/` | Nincs | A pilotban kézzel számlázol, ehhez havi összesítő kell | 🟠 | M |

### H. Landing

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 74 | Egyoldalas demó oldal | `apps/landing/app/[locale]/page.tsx` | Nincs | A pilot előtti MVP része; a jogi oldalaknak is itt a helyük | 🔴 | M |
| 75 | Teljes landing | `apps/landing/app/[locale]/`, `apps/landing/content/` | Nincs | Fázis 3: demókérés, app letöltés, SEO | 🟠 | L |
| 76 | Megtérülés-kalkulátor | `apps/landing/app/[locale]/kalkulator/` | Nincs | A döntés szerint a pilot valós adataival készül | 🟡 | S |
| 77 | Blog | `apps/landing/app/[locale]/blog/`, `apps/landing/content/blog/` | Nincs | Keresőforgalom a pilot eredményeivel | 🟡 | S |

### I. Minőség, biztonság és pilot

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 78 | E2E tesztek (Playwright) | `e2e/` | Nincs | A teljes rendelés fizetéssel minden telepítés előtt tesztelendő | 🔴 | M |
| 79 | Biztonsági átnézés | `docs/security/checklist.md` | Nincs | Pénz és személyes adat; OWASP Top 10, rate limit, jogosultság-tesztek | 🔴 | M |
| 80 | Terheléses teszt (k6) | `load/` | Nincs | A doksi előírja az élesítés előtt | 🔴 | M |
| 81 | Pilot telepítés a klubban | `docs/pilot/telepites.md` | Nincs | Menü, QR-kódok, tablet, tesztrendelések a klubban | 🔴 | S |
| 82 | Pilot mérés és Kapu 2 riport | `docs/pilot/kapu2.md`, Admin Riportok | Nincs | A ≥ 15% QR-arány és ≤ 5 perc elkészítési idő mérése | 🔴 | S |
| 83 | Pilot ügyelet és javítási ciklus | `docs/pilot/ugyelet.md` | Nincs | 3–4 hét éles üzem; az első 2–3 estén a helyszínen | 🔴 | L |

### J. Mobilapp (Fázis 3)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 84 | Expo app alapok | `apps/mobile/app/_layout.tsx`, `apps/mobile/src/` | Csak üres váz van (12. feladat) | Navigáció, bejelentkezés, API kliens és fordítás nélkül egy képernyő sem működik | 🔴 | M |
| 85 | Felfedezés, helyszín oldal, QR szkenner | `apps/mobile/app/(tabs)/discover/`, `apps/mobile/app/scan.tsx` | Nincs | Az app belépési pontjai | 🔴 | L |
| 86 | Menü, termék és kosár mobilon | `apps/mobile/app/v/[slug]/` | Nincs | Ugyanaz a rendelési folyamat natívan | 🔴 | M |
| 87 | Fizetés mobilon (PaymentSheet) | `apps/mobile/src/payments/` | Nincs | Apple Pay, Google Pay, mentett kártyák | 🔴 | M |
| 88 | Rendelés állapota, átvétel, rendeléseim | `apps/mobile/app/o/[orderId].tsx`, `apps/mobile/app/(tabs)/orders/` | Nincs | Élő állapot, átvételi képernyő, egy érintéses újrarendelés | 🔴 | M |
| 89 | Profil, súgó, GDPR | `apps/mobile/app/(tabs)/profile/` | Nincs | Áruházi követelmény a fióktörlés; adatexport GDPR miatt | 🟠 | M |
| 90 | Push értesítések | `apps/mobile/src/notifications/`, `packages/core/src/notify/push.ts` | Nincs | Az app fő értéke a megbízható „Kész” jelzés | 🔴 | M |
| 91 | Deep link és universal link | `apps/mobile/app.config.ts`, `apps/order/public/.well-known/` | Nincs | A QR-kód telepített appnál az appban nyíljon | 🟠 | S |
| 92 | Offline menü | `apps/mobile/src/cache/` | Nincs | Gyenge térerőnél is betöltsön a menü | 🟡 | S |
| 93 | Személyzet mód | `apps/mobile/app/staff/` | Nincs | Natív kamerás átvétel és pultos funkciók telefonon | 🟠 | L |
| 94 | QR-beolvasás átvételkor | `apps/admin/app/pult/[barId]/scan/`, `apps/mobile/app/staff/scan.tsx` | Nincs | A döntés szerint a Fázis 3-ban, a személyzet móddal jön; a szám + élő képernyő tartalék marad | 🟠 | M |
| 95 | Áruházi kiadás (EAS) | `apps/mobile/eas.json`, áruházi anyagok | Nincs | Nyilvános indulás az App Store-ban és a Google Playen | 🔴 | M |
| 96 | Mobil E2E tesztek (Maestro) | `apps/mobile/.maestro/` | Nincs | A doksi szerinti tesztszint a mobilon | 🟠 | M |

### K. Skálázás és bővítés (Fázis 4)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 97 | Több pult és zóna felülete | `apps/admin/app/(dashboard)/bars/`, `apps/order/components/bar-picker/` | Az adatmodell kezeli, a felület nincs meg | Egy átlagos klubnak 3–5 pultja van | 🟠 | M |
| 98 | Láncfelület: helyszínváltó, összesített riport | `apps/admin/components/venue-switcher/`, `apps/admin/app/(dashboard)/reports/` | Az adatmodell kezeli, a felület nincs meg | Több klubot üzemeltető tulajok | 🟠 | M |
| 99 | Tételenkénti elutasítás és részleges visszatérítés | `packages/core/src/orders/`, `apps/admin/app/pult/[barId]/` | A pilotban csak teljes elutasítás van | Egy elfogyott tétel miatt ne vesszen el az egész rendelés | 🟠 | M |
| 100 | Időzített happy hour | `packages/core/src/pricing/price-rules.ts`, `apps/admin/app/(dashboard)/menu/` | Nincs | A döntés szerint a pilot után | 🟡 | M |
| 101 | Események és eseménymenük | `apps/admin/app/(dashboard)/events/` | Nincs | Eseménynaptár és saját menü vagy ár eseményenként | 🟡 | M |
| 102 | Beépített jegykezelés | `apps/hq/app/(dashboard)/support/` | A pilotban e-mail és WhatsApp | Több klubnál az e-mailes support nem követhető | 🟠 | L |
| 103 | Automatikus jutalékszámla (Számlázz.hu API) | `packages/core/src/billing/szamlazz.ts`, `apps/api/src/inngest/monthly-invoices.ts` | A pilotban kézzel számlázol | Több klubnál a kézi számlázás nem tartható | 🟠 | M |
| 104 | Céges számla vendégeknek | `packages/core/src/billing/venue-invoice.ts`, `apps/order/app/[locale]/v/[slug]/checkout/` | Nincs | A céges vendégek számlát kérnek | 🟡 | M |
| 105 | Hűségprogram | `packages/core/src/loyalty/`, `apps/mobile/app/(tabs)/loyalty/`, `apps/admin/app/(dashboard)/loyalty/` | Nincs | A visszatérő vendég fő oka az app letöltésére | 🟠 | L |
| 106 | Ajándék ital | `packages/core/src/gifts/`, `apps/order/app/[locale]/g/[token]/` | Nincs | Új rendelési alkalom, vírusszerű terjedés | 🟡 | M |
| 107 | Asztalfoglalás | `apps/order/app/[locale]/v/[slug]/foglalas/`, `apps/admin/app/(dashboard)/reservations/` | Nincs | VIP asztalok előre foglalása | 🟡 | M |
| 108 | Asztalhoz szállítás | `packages/core/src/orders/delivery.ts`, `apps/admin/app/waiter/` | Nincs | Sima rendelés asztalhoz, felszolgálói szerepkörrel | 🟡 | L |
| 109 | Kasszaintegráció: Fruitsys | `packages/integrations/pos/fruitsys/` | Nincs; a Fruitsysnek nincs nyilvános API-ja | Kézi beütés nélkül a rendelés a klub NTAK-minősített kasszájába kerül, és az a klub pénztárgépén nyugtáz (2028-tól e-pénztárgépen is) | 🟠 | L |
| 110 | Nyilvános API és webhook | `apps/api/app/public/v1/`, `packages/core/src/webhooks/` | Nincs | A klubok saját rendszerei lekérhetik a rendeléseket | 🟡 | M |
| 111 | Push kampányok | `apps/admin/app/(dashboard)/campaigns/`, `apps/api/src/inngest/campaigns.ts` | Nincs | A klub elérheti a hozzájárult vendégeit | 🟡 | M |
| 112 | Funkciókapcsolók és app verziók | `packages/core/src/flags/`, `apps/hq/app/(dashboard)/flags/` | Nincs | Béta funkciók klubonként, kényszerített appfrissítés | 🟡 | M |
| 113 | Support és Pénzügy szerepkör felülete | `apps/hq/app/(dashboard)/team/` | A modellben megvan, a felület nincs | Ha bővül a csapat | 🟡 | S |
| 114 | Bonnyomtató (Star CloudPRNT) | `apps/api/app/v1/cloudprnt/route.ts` | Nincs | Ha egy klub kéri | 🟡 | M |
| 115 | iOS Live Activity | `apps/mobile/targets/live-activity/` | Nincs | Rendelésállapot a zárolt képernyőn | 🟡 | M |
| 116 | Átállás M10-re időpontra visszaállítással (PITR) | Atlas, `docs/runbooks/restore.md` | Flex-en nincs PITR | Kb. 10 helyszín felett a napi mentés kevés | 🟠 | S |
| 117 | Skálázási teszt (50 helyszín) és fizetős szintek | `load/`, Atlas, Ably | Nincs mérve | A cél 50 egyidejű helyszín, helyszínenként 50 rendelés/perc | 🟠 | M |

## 2. Feladatok részletesen

Minden feladat a táblázat sorával kezdődik, utána hat pont következik: jelenlegi állapot, probléma, megoldás, elfogadási feltételek, tesztelés, függőségek és kockázatok. Az elfogadási feltételek kipipálhatók.

### A. Üzleti, jogi és fiókok

#### 1. Stripe platformfiók és Connect beállítás

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Stripe platformfiók és Connect beállítás | Stripe Dashboard (platformfiók), Vercel env változók | Nincs platformfiók, így nincs teszt- és élő kulcs | Fizetés, Connect onboarding és application fee nélküle nem fejleszthető | 🔴 | S |

**Jelenlegi állapot.** A cég megvan, a Stripe platformfiók nincs megnyitva. A doksi döntése: Stripe Connect Express, direct charge, a jutalék application fee-ként vonódik le, visszatérítéskor a platformdíj is visszajár („Fizetés, pénzügy, jog” → „Pénzfolyam”).

**Probléma.** Teszt kulcs nélkül a 32–34. feladat nem kezdhető el. Élő kulcs nélkül nincs zárt teszt (8.) és pilot.

**Megoldás.**

1. Platformfiók nyitása a cég nevére: cégadatok, bankszámla, a képviselő azonosítása.
2. Connect bekapcsolása: platformprofil kitöltése, kapcsolt fióktípus Express, ország Magyarország, pénznem HUF.
3. Connect branding: név „Na, mit iszunk?”, logó, sötét szín. Ez jelenik meg a klubok Express onboardingján.
4. Kulcsok: teszt kulcsok (`sk_test_`, `pk_test_`) a Vercel Development és Preview környezetbe, élő kulcsok (`sk_live_`, `pk_live_`) csak a Production környezetbe.
5. A webhook végpontok és titkaik a 32–33. feladatban készülnek, amikor az API már fut.

**Elfogadási feltételek.**

- [ ] A platformfiók aktív, a Stripe nem kér további adatot.
- [ ] A Connect be van kapcsolva Express fióktípussal, a branding beállítva.
- [ ] Teszt módban létrehozható egy magyar Express kapcsolt fiók, és az onboarding linkje végigmegy.
- [ ] A teszt- és élő kulcsok csak a megfelelő Vercel környezetben vannak, a repóban egyik sincs.

**Tesztelés.** Stripe CLI-vel teszt módban: kapcsolt fiók létrehozása (`stripe accounts create -d type=express -d country=HU`), az onboarding végigvitele teszt adatokkal, majd egy PaymentIntent `application_fee_amount`-tal ezen a fiókon (`Stripe-Account` fejléccel). A Dashboardon a kapcsolt fióknál megjelenik a terhelés, a platformnál az application fee.

**Függőségek és kockázatok.** Függ: semmitől. Erre épül: 14, 32, 33, 34, 59. Kockázat: az alkoholértékesítés miatt a Stripe további ellenőrzést kérhet. Ezért a platformprofilban pontosan le kell írni, hogy a klubok a saját fiókjukon árulnak italt, a platform közvetít.

#### 2. Könyvelő megtalálása, nyugta- és NTAK-kérdések lezárása

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | Könyvelő megtalálása, nyugta- és NTAK-kérdések lezárása | Termékdoksi „Kérdések a könyvelőnek”, Gmail piszkozat | Nincs könyvelő; a nyugtakezelés munkafeltételezés | Ha a könyvelő elveti a Készül gombos nyugtát, a Pult nézet és a fizetési folyamat változik | 🔴 | M |

**Jelenlegi állapot.** Nincs könyvelő. A kérdések a termékdoksi „Kérdések a könyvelőnek” szakaszában vannak, munkafeltételezésekkel. A levél Gmail-piszkozatként kész, címzett nélkül: 11 kérdés (Nyugta és NTAK 1–5, Jutalék és díjak 6–9, Saját cégem 10–11).

**Probléma.** Ezek csak feltételezések:

- a Pult nézet nyugtafolyamata (a pultos a Készül gombnál bankkártyás fizetési móddal üti be a rendelést, és „Nyugta beütve” pipával jelöli);
- a visszatérítés sztórnója;
- a szervizdíj ÁFA-kulcsa;
- a jutalékszámla ÁFA-kezelése (alanyi adómentesség, fordított ÁFA a Stripe, a Vercel és a Twilio díja után);
- az NTAK-kötelezettség teljesülése a tételes beütéssel.

Az e-nyugta kiesett, mert italszolgáltatásnál nem engedélyezett. Ha a könyvelő elveti a kézi beütést, a tartalék a kasszaintegráció (109.).

**Megoldás.**

1. 3–5 jelölt keresése, akik vendéglátóhelyeket könyvelnek (online pénztárgép, NTAK).
2. A piszkozat kiegészítése a könyvelő és a saját neveddel, majd elküldés.
3. A válaszok rögzítése a termékdoksiban: „Munkafeltételezés” helyett „Eldöntve”, dátummal.
4. Ha egy válasz eltér, az érintett feladatok frissítése ebben a tervben: 21, 22, 33, 34, 54, 56, 73.
5. Ha a jelölt a saját céged könyvelését is vállalja, megbízás (a 10–11. kérdés alapján).

**Elfogadási feltételek.**

- [ ] Mind a 11 kérdésre írásos válasz van.
- [ ] A termékdoksiban nincs nyugtára, NTAK-ra vagy ÁFA-ra vonatkozó munkafeltételezés.
- [ ] A szervizdíj ÁFA-kulcsa ismert; a 22. feladat ezt használja.
- [ ] Döntés van arról, hogy a kézi beütés a pilotban maradhat, vagy a kasszaintegráció előrébb kerül.

**Tesztelés.** A válaszokat kérdésenként összevetni a doksi munkafeltételezésével. Minden eltérésnél legyen bejegyzés a terv érintett feladatánál.

**Függőségek és kockázatok.** Függ: semmitől. Erre épül: 3 (a pilotmegállapodás NTAK-vállalása), 22, 54, 73. Kockázat: ha a könyvelő szerint a kézi beütés nem elég, a doksi szerint a pilot ennyivel csúszik („A becslés feltételei”). A Fruitsys-integráció partneri megállapodást igényel, mert nyilvános API-ja nincs.

#### 3. Jogi dokumentumok

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | Jogi dokumentumok: ÁSZF, adatvédelmi tájékoztató, pilotmegállapodás, adatfeldolgozói szerződés | `apps/landing/content/legal/`, szerződések DOCX-ben | Egyik sincs meg | ÁSZF és tájékoztató nélkül nem fogadhatunk fizetést; adatfeldolgozói szerződés nélkül a klub nem adhat adatot | 🔴 | M |

**Jelenlegi állapot.** Egyik dokumentum sincs meg. Döntés (2026-11-01): mind a négy tervezetet én írom a doksi döntései alapján, a saját ügyvéded nézi át. Adatkezelő: a rendelésadatoknál a klub, a platform adatfeldolgozó. A landing, az analitika és a HQ adatainál a platform az adatkezelő.

**Probléma.** ÁSZF nélkül a pénztárban nincs mit elfogadni. Tájékoztató nélkül nem gyűjthető telefonszám és e-mail. Adatfeldolgozói szerződés nélkül a klub nem adhat át vendégadatot. Pilotmegállapodás nélkül nincs rögzítve a díj, a felelősség és az NTAK-beütés vállalása.

**Megoldás.**

1. ÁSZF a vendégeknek:
   - a platform szerepe: közvetít, az eladó a klub;
   - bruttó árak; szervizdíj és borravaló a fizetés előtt látható;
   - 18+ nyilatkozat, átvételkor személyes ellenőrzés;
   - automatikus elfogadásnál nincs lemondás; elutasítás csak Új állapotban, teljes visszatérítéssel; átadás után visszatérítés csak a klub menedzserén át;
   - nem átvett ital: a nyugta érvényes, nincs visszatérítés (munkafeltételezés, a könyvelő és az ügyvéd hagyja jóvá);
   - panaszkezelés a problémajelzésen át.
2. Adatvédelmi tájékoztató:
   - az adatkezelői szerepek a fenti megosztásban;
   - kezelt adatok: név, e-mail, telefonszám, rendelés, fizetési azonosító; kártyaadatot nem kezelünk;
   - megőrzés: rendelés- és pénzügyi adat 8 év, telefonszám a rendelés után 30 nap, inaktív fiók 2 év után törlődik;
   - adatfeldolgozók: Stripe, MongoDB Atlas, Vercel, Ably, Twilio, Resend, Inngest, Sentry, PostHog (EU, cookieless);
   - jogok: export és törlés a fiókban.
3. Pilotmegállapodás: 3–4 hét, 1% jutalék, utána a klubra beállított díj (alapértelmezés 3%). A klub vállalja a nyugtaadást és a tételes beütést az NTAK-minősített rendszerébe. Kapu 2 célok (≥ 15% QR-arány, ≤ 5 perc), 2 hetes hosszabbítás lehetősége, ha nem teljesülnek (2026-11-02), felelősség, kilépés; a tablet és a Wi-Fi a klubé.
4. Adatfeldolgozói szerződés (GDPR 28. cikk): tárgy, időtartam, adatkategóriák, alfeldolgozók listája (mint fent), biztonsági intézkedések (EU régió, titkosítás, hozzáférés-szabályozás, audit napló), incidens bejelentése a klubnak indokolatlan késedelem nélkül.
5. Ügyvédi átnézés, javítás, verziószám és hatályba lépés.
6. Közzététel: `apps/landing/app/[locale]/aszf/` és `apps/landing/app/[locale]/adatvedelem/`, MDX-ből (`apps/landing/content/legal/`). A szerződések DOCX-ben, aláírásra.

**Elfogadási feltételek.**

- [ ] Mind a négy dokumentumot az ügyvéd írásban jóváhagyta.
- [ ] Az ÁSZF és a tájékoztató elérhető a namitiszunk.hu-n, verzióval és hatályba lépési dátummal.
- [ ] Az adatfeldolgozók listája egyezik a ténylegesen használt szolgáltatásokkal (14. feladat env listája).
- [x] A pénztár 18+ és ÁSZF jelölője az aktuális ÁSZF-verzióra linkel, és a rendelés tárolja az elfogadott verziót.

**Tesztelés.** Linkellenőrzés a landing, a pénztár és a fiók oldalon (Playwright, 78.). A tájékoztató szolgáltatáslistáját összevetni a Vercel env változókkal.

**Függőségek és kockázatok.** Függ: 2 (nyugta-, NTAK- és ÁFA-válaszok a pilotmegállapodásba). Erre épül: 4, 42, 74, 81. Kockázat: a doksi szerint a Connect-modell pénzforgalmi megfelelését jogásszal kell megerősíteni. Ezt a kérdést külön fel kell tenni az ügyvédnek. Az angol felületen is el kell érni az ÁSZF-et; az angol fordítás jogi státuszáról az ügyvéd dönt.

#### 4. Pilot klub megszerzése

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 4 | Pilot klub megszerzése | Egyoldalas ajánlat (PDF), budapesti klublista | Nincs pilot klub | Kapu 1 és Kapu 2 csak éles klubban mérhető | 🔴 | M |

**Jelenlegi állapot.** Nincs pilot klub (2026-11-01). Döntés: egyoldalas ajánlat és 15–20 budapesti klub listája; a jelölteket én keresem. Pilotfeltételek a doksiból: klub, 1 pult, egy este 300 vendég alatt, 3–4 hét, 1% jutalék, a klub saját tabletje.

**Probléma.** Kapu 1 (első valódi fizetett rendelés átvételig) és Kapu 2 csak éles klubban érhető el. A klub kasszarendszere dönti el, hogyan megy a tételes NTAK-beütés.

**Megoldás.**

1. Klublista (`docs/pilot/klublista.md`, a privát repóban): név, cím, kapcsolattartó, nyitvatartás, pultok száma, becsült vendégszám, kasszarendszer (Fruitsys, más NTAK-rendszer, online pénztárgép), forrás.
2. Egyoldalas ajánlat (PDF): a sorban állás problémája; a 3 lépés (QR, fizetés, átvétel számmal); pilotfeltételek (3–4 hét, 1%, nincs hardvervásárlás, kilépési feltételek); amit a klub ad (tablet, Wi-Fi, menü feltöltése, kapcsolattartó, tételes beütés a kasszába); képernyőképek.
3. Megkeresési sorrend: az 1 pultos, 300 fő alatti klubok előre.
4. Bemutató a klubban: a demó oldal (74.) és a Pult nézet teszt módban.
5. Aláírás: pilotmegállapodás és adatfeldolgozói szerződés (3.).

**Elfogadási feltételek.**

- [ ] Aláírt pilotmegállapodás és adatfeldolgozói szerződés.
- [ ] Rögzített kezdő dátum, kapcsolattartó és a klub kasszarendszere.
- [ ] A klub Tulaja elérhető a Stripe Connect onboardinghoz (cégadatok, bankszámla).
- [ ] A klub vállalta a tételes beütést az NTAK-minősített rendszerébe.

**Tesztelés.** Helyszíni bejárás a 81. feladat előtt: Wi-Fi lefedettség és sebesség a pultnál, a tablet és a tápellátás helye, a pénztárgép helye a tablethez képest.

**Függőségek és kockázatok.** Függ: 3 (szerződések), 74 (bemutató). Erre épül: 8, 10, 81, 82, 83. Kockázat: ha a klub online pénztárgép helyett NTAK-kasszarendszert használ, a beütés menete eltér, és ezt a betanításba (6.) fel kell venni. Ha a Web MVP végére nincs klub, a Fázis 2 csúszik; ezért van 15–20 név a listán.

#### 5. DNS a Vercelre és e-mail küldő domain

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | DNS a Vercelre és e-mail küldő domain | Regisztrátor, Vercel Domains, Resend | A namitiszunk.hu névszerverei a regisztrátornál vannak | Aldomainek és tranzakciós e-mailek (SPF, DKIM) nélküle nem működnek | 🔴 | S |

**Jelenlegi állapot.** A namitiszunk.hu megvan (2026-11-01), a névszerverek a regisztrátornál vannak. Döntés: DNS a Vercelen, céges postafiók egyelőre nincs. Tervezett hostok: namitiszunk.hu (landing), rendel., admin., hq. és api.namitiszunk.hu.

**Probléma.** Aldomainek nélkül az 5 Vercel projekt nem kap saját címet. Küldő domain és SPF/DKIM nélkül a belépési linkek és visszaigazolások spambe kerülnek.

**Megoldás.**

1. A regisztrátornál lévő meglévő rekordok listázása.
2. A domain felvétele a Vercelen (Vercel Domains), hogy a Vercel névszerverek már válaszoljanak a zónára.
3. A regisztrátornál a névszerverek átírása: `ns1.vercel-dns.com`, `ns2.vercel-dns.com`.
4. Hostok a Vercel projektekhez (14.): apex → landing, `rendel` → order, `admin` → admin, `hq` → hq, `api` → api; `www` → átirányítás az apexre.
5. Resend: küldő domain felvétele, a Resend által adott DKIM-, SPF- és MX-rekordok a Vercel DNS-be; DMARC rekord (`_dmarc`, `v=DMARC1; p=none`).
6. Küldő cím: `noreply@namitiszunk.hu`. A válaszcím a levél típusa szerint a klubé vagy a tiéd (37.).

**Elfogadási feltételek.**

- [ ] A `dig NS namitiszunk.hu` a két Vercel névszervert adja.
- [ ] Mind az 5 host HTTPS-en válaszol, érvényes tanúsítvánnyal.
- [ ] A Resend a domaint Verified állapotban mutatja.
- [ ] Egy Gmailbe küldött tesztlevél fejlécében SPF, DKIM és DMARC: PASS.

**Tesztelés.** `dig` az NS-, A-, CNAME- és TXT-rekordokra. Tesztlevél Gmailbe, az „Eredeti megjelenítése” nézetben ellenőrizve.

**Függőségek és kockázatok.** Függ: 14 (Vercel projektek a hostokhoz); a névszerver-átírás ettől függetlenül most elvégezhető. Erre épül: 37, 42 (Apple Pay domain-ellenőrzés a rendel aldomainen), 91. Kockázat: a regisztrátornál lévő rekordok (parkoló oldal, továbbítás) az átírással elvesznek, ezért kell az 1. lépés. A névszerver-változás terjedése akár 48 óráig tarthat.

#### 6. Betanító videó és útmutató a pultosoknak

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 6 | Betanító videó és útmutató a pultosoknak | `docs/pilot/betanitas.md`, videó | Nincs | Csúcsidőben nincs idő tanulni; a rossz kezelés rontja a Kapu 2 számokat | 🟠 | S |

**Jelenlegi állapot.** Nincs. A doksi („Pilot előkészítés”): rövid videó és 1–2 oldalas útmutató; ha kell, személyes bemutató. Az első 2–3 estén ügyelet a helyszínen.

**Probléma.** Csúcsidőben a pultosnak nincs ideje kérdezni. Ha kimarad a „Nyugta beütve”, vagy rossz rendelést ad át, sérül a pénz, a nyugta és a Kapu 2 mérés.

**Megoldás.**

1. Útmutató (`docs/pilot/betanitas.md`, nyomtatható PDF-ben is):
   - belépés névvel és PIN-nel;
   - Új → Készül (tételes beütés a kasszába bankkártyás fizetési móddal, „Nyugta beütve” pipa) → Kész → Átadva;
   - átadás: a rövid szám és a mozgó színes képernyő ellenőrzése a vendég telefonján;
   - elutasítás csak Új állapotban, okkal; Elfogyott kapcsoló; Szünetel;
   - offline sáv: mit jelent, mi a teendő;
   - VIP rendelés: a pult elkészíti, a VIP-host viszi ki;
   - az ügyeleti telefonszám.
2. Videó: képernyőfelvétel a Pult nézetről teszt rendelésekkel, lépésenként fejezetekre bontva, felirattal.
3. Az útmutató egyoldalas összefoglalója a pult mellé.

**Elfogadási feltételek.**

- [ ] A pilot klub egy pultosa a videó és az útmutató alapján, segítség nélkül végigvisz egy teszt rendelést Új-tól Átadva-ig, „Nyugta beütve” jelöléssel.
- [ ] Ugyanő végrehajt egy elutasítást és egy Elfogyott kapcsolást.
- [ ] Az útmutató minden lépése egyezik az élő Pult nézet felirataival.

**Tesztelés.** Próba a klubban a 81. feladat során, egy pultossal, aki még nem látta a rendszert. A hibákat az útmutatóba vezetni.

**Függőségek és kockázatok.** Függ: 54, 55 (végleges felület), 2 (a fizetési mód a pénztárgépen). Erre épül: 81, 83. Kockázat: ha a Pult nézet a felvétel után változik, újra kell venni. Ezért a felvétel a 81. előtti utolsó héten készül, amikor a felület már nem változik.

#### 7. Apple Developer és Google Play fiók

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | Apple Developer és Google Play fiók | Apple Developer Program (D-U-N-S), Google Play Console | Nincs céges fiók | Nélküle nincs áruházi kiadás; a D-U-N-S szám kiadása napokig-hetekig tart | 🔴 | S |

**Jelenlegi állapot.** Nincs céges fiók. Döntés: az app előtt regisztrálunk; Apple 99 USD/év, D-U-N-S szám kell; Google 25 USD egyszeri.

**Probléma.** A web is érintett: az Apple-bejelentkezés (30.) a weben is Apple Developer fiókot igényel (Services ID és kulcs). A D-U-N-S szám és az Apple szervezeti ellenőrzése napokig-hetekig tarthat.

**Megoldás.**

1. Most, a Fázis 0-ban: D-U-N-S szám ellenőrzése vagy igénylése a cégre (Apple D-U-N-S kereső).
2. Apple Developer Program, szervezeti regisztráció a cég nevére.
3. Google Play Console, szervezeti fiók a cég nevére.
4. Mindkét fiókban a cég jogi neve és címe egyezik az ÁSZF-fel. A Google Play kötelező kapcsolati e-mailje a fiókhoz használt cím, amíg nincs céges postafiók.

**Elfogadási feltételek.**

- [ ] Az Apple Developer Program tagság aktív, a cég nevével.
- [ ] A Google Play Console szervezeti fiók ellenőrzött.
- [ ] Az Apple fiókban létrehozható a Sign in with Apple Services ID a 30. feladathoz.

**Tesztelés.** Belépés mindkét konzolba. Az első belső build feltöltése (TestFlight, Play belső teszt) a 95. feladatban.

**Függőségek és kockázatok.** Függ: semmitől (a cég megvan). Erre épül: 30, 90 (APNs kulcs), 95. Kockázat: magánszemélyes Google fióknál a Google kötelező zárt tesztidőszakot ír elő a nyilvános kiadás előtt; ezért kell szervezeti fiók.

#### 8. Zárt teszt ismerősökkel, valódi fizetéssel

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 8 | Zárt teszt ismerősökkel, valódi fizetéssel | Éles környezet, a pilot klub egy csendes estéje | Nincs lebonyolítva | A doksi döntése szerint ez kötelező az éles est előtt | 🔴 | S |

**Jelenlegi állapot.** Döntés (2026-11-01): először zárt teszt ismerősökkel egy csendes estén, valódi fizetéssel; utána a klub éles estje.

**Probléma.** Teszt módban nem derül ki az élő Apple Pay és Google Pay, a valódi kártyák 3D Secure-ja, a kifizetés a klub bankszámlájára, az SMS-kézbesítés magyar számokra és a pultos tényleges munkamenete.

**Megoldás.** Forgatókönyv-lista (`docs/pilot/zart-teszt.md`); mindegyik legalább egyszer fut le:

- fizetés Apple Pay-jel, Google Pay-jel, kártyával (3D Secure) és Stripe Linkkel;
- rendelés SMS-kéréssel (35 Ft az application fee-ben) és anélkül; borravaló; promóciós kód;
- elutasítás Új állapotban: teljes visszatérítés, a platformdíj is visszajár; menedzseri visszatérítés átadás után az Adminban;
- VIP rendelés: a pult elkészíti, a VIP-host kiviszi, Átadva;
- problémajelzés: e-mail a klubnak és a platformnak; webes vendégfiók e-mail linkkel; „Nyugta beütve” minden rendelésnél.

Utána egyeztetés: Admin napi riport, Stripe Dashboard és a pénztárgép Z-jelentése.

**Elfogadási feltételek.**

- [ ] Minden forgatókönyv lefutott, az eredmény rögzítve.
- [ ] A napi riport összegei (bruttó, borravaló, visszatérítés, jutalék) egyeznek a Stripe Dashboarddal.
- [ ] Az application fee minden rendelésnél a 22. feladat képlete szerinti, visszatérítésnél visszajárt.
- [ ] A Stripe Dashboardon megjelenik a klub első kifizetése.
- [ ] Nincs megoldatlan Sentry-hiba.

**Tesztelés.** Maga a feladat a teszt. A hibák a 83. javítási ciklusba kerülnek; az éles est előtt a 🔴 hibák javítva. Az első valódi fizetett rendelés átvétele teljesíti a Kapu 1-et.

**Függőségek és kockázatok.** Függ: 1 (élő kulcsok), 32–34, 40–48, 54–56, 59, 81. Erre épül: 82, 83. Kockázat: a visszatérített teszt rendeléseknél a Stripe tranzakciós díja nem jár vissza, és direct charge miatt a klubot terheli. A teszt költségét előre egyeztetni kell a klubbal, vagy kis összegű tételekkel tesztelni.

#### 9. Védjegykeresés

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 9 | Védjegykeresés | SZTNH, EUIPO, TMview | Nincs ellenőrizve | Névütközés esetén a nyilvános indulás előtt kell nevet váltani | 🟡 | S |

**Jelenlegi állapot.** Nincs ellenőrizve. Döntés: a pilot után. Az iszunk.hu és a mitiszunk.hu más birtokában van.

**Probléma.** Ha egy korábbi védjegy ütközik, a nyilvános indulás (landing, áruházi kiadás) után drága a névváltás: domain, app név, anyagok.

**Megoldás.**

1. Keresés az SZTNH E-kutatásban, az EUIPO eSearch plusban és a TMview-ban: „Na, mit iszunk?”, „mit iszunk”, „iszunk”.
2. Nizzai osztályok: 9 (letölthető szoftver, app), 35 (online piactér), 42 (SaaS), 43 (vendéglátás).
3. Az eredmény átadása az ügyvédnek.
4. Ha nincs ütközés: bejelentés (SZTNH nemzeti vagy EUIPO uniós), az ügyvéddel döntve.

**Elfogadási feltételek.**

- [ ] Írásos keresési eredmény a 4 osztályra és a 3 kifejezésre.
- [ ] Az ügyvéd véleménye arról, hogy használható-e a név.
- [ ] Döntés: bejelentés vagy névváltás.

**Tesztelés.** A keresés megismétlése ékezet nélküli alakokra („na mit iszunk”) és szóköz nélküli alakra („namitiszunk”).

**Függőségek és kockázatok.** Függ: 83 (pilot vége). Erre épül: 75, 95. Kockázat: névváltásnál a domain, a Stripe branding, az áruházi név és a fordítási fájlok is változnak.

#### 10. Landing videó felvétele a pilot klubban

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | Landing videó felvétele a pilot klubban | `apps/landing/public/video/` | Nincs videó | A teljes landing hero és „Hogyan működik” szekciója erre épül | 🟡 | S |

**Jelenlegi állapot.** Nincs videó. Döntés: a pilot klubban veszed fel, addig képernyőképek; interaktív admin demó nincs. A teljes landing hero CTA-ja „Demót kér, videót néz”; a „Hogyan működik” oldal a 3 lépést videóval mutatja.

**Probléma.** A Fázis 3 teljes landingje (75.) videó nélkül csak képernyőképekkel tudja bemutatni a folyamatot. A reklámvideók (Instagram, TikTok) is ebből készülnek.

**Megoldás.**

1. Felvételi lista: QR-beolvasás a pultnál, menü a telefonon, fizetés Apple Pay-jel, új rendelés a Pult nézetben hangjelzéssel, élő állapot, átadás a rövid számmal és a mozgó színes képernyővel; ugyanez a pult felől.
2. Engedélyek: a klub írásos engedélye; minden felismerhető vendég és pultos hozzájárulása, vagy felismerhetetlen felvétel.
3. Két változat: fekvő a landingre, álló a reklámokhoz (bio-link a landingre).
4. MP4 (H.264) és poszterkép. Ha a fájl túl nagy a repóhoz, a Vercel Blobba kerül (38.).

**Elfogadási feltételek.**

- [ ] A 3 lépés (beolvasás, fizetés, átvétel) mindkét változatban látszik.
- [ ] Minden felismerhető szereplőtől van hozzájárulás.
- [ ] A videó nem rontja a landing LCP-jét: késleltetett betöltéssel, poszterképpel indul.

**Tesztelés.** Lighthouse-mérés a landingen videóval és anélkül. Némított automatikus lejátszás iOS Safarin és Android Chrome-on.

**Függőségek és kockázatok.** Függ: 4, 81 (éles est). Erre épül: 75. Kockázat: sötét, zsúfolt klubban a telefon képernyője nehezen vehető fel; ezért a képernyőt külön, képernyőfelvétellel is rögzíteni kell.

### B. Tervezés és alapok

#### 11. UX drótvázak a fő folyamatokra

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 11 | UX drótvázak a fő folyamatokra | `docs/ux/` | Nincs designer és nincs drótváz | A 60 mp-es rendelési cél és a csúcsidős Pult nézet tervezés nélkül nem teljesül | 🟠 | M |

**Jelenlegi állapot.** Nincs designer (döntés: shadcn/ui + AI). Arculat: sötét téma, fekete alap, saját neon kiemelőszín (nem a Cosca neonzöldje), a logó egyszerű „Na, mit iszunk?” felirat. A doksi UX-szabályai: QR-kódtól 60 mp alatt leadott rendelés, legalább 48 px-es gombok, egykezes használat, a fő műveletek a képernyő alján.

**Probléma.** A négy webes felület és a Pult nézet terv nélkül következetlen lesz. A 60 mp-es cél és a csúcsidős Pult nézet a képernyők sorrendjén és tartalmán múlik, ezt kódban újratervezni drágább.

**Megoldás.** Alacsony hűségű drótvázak Excalidraw-ban (`docs/ux/*.excalidraw`, PNG exporttal), hogy verziókövetve a repóban legyenek. Sorrend:

1. Vendég: QR → menü → termék lap → kosár → pénztár → élő állapot → átvétel (nagy rövid szám, mozgó színes háttér) → Köszönjük; a hibaállapotokkal (szünet, zárva, elfogyott, sikertelen fizetés).
2. Pult nézet: Új / Készül / Kész oszlop, a kártya tartalma, PIN, „Nyugta beütve”, elutasítás okkal, Elfogyott, Szünetel, offline sáv, csúcsidős összesítő.
3. VIP-host nézet: „Kivinni” lista, asztal, Átadva.
4. Admin: menüszerkesztő, pultok és QR-kódok, rendelések visszatérítéssel.
5. HQ: helyszín létrehozása és Tulaj meghívása, rendeléskereső.

Színt és tipográfiát a drótváz nem tartalmaz; az a 16. feladat.

**Elfogadási feltételek.**

- [x] Mind az 5 folyamat képernyői megvannak, a doksi minden rendelésállapotával.
- [x] A vendégút minden fő művelete a képernyő alján van.
- [x] A Pult nézet kártyáján egy pillantásra látszik a rövid szám, a tételek, az eltelt idő és a VIP jelölés.

**Tesztelés.** Végigjátszás 2–3 ismerőssel a PNG-ken, hangos gondolkodással; a Pult nézetet egy pultossal. Az észrevételek a drótvázba kerülnek, mielőtt a 40. és az 54. feladat indul.

**Függőségek és kockázatok.** Függ: semmitől. Erre épül: 16, 40–49, 50–58, 66–73. Kockázat: túltervezés. A drótváz csak a képernyők tartalmát és sorrendjét rögzíti, a részleteket a kód dönti el.

#### 12. Monorepó váz

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 12 | Monorepó váz | Gyökér (`turbo.json`, `pnpm-workspace.yaml`, `.nvmrc`), `apps/*`, `packages/*` | A repó üres | Minden további feladat erre épül | 🔴 | M |

**Jelenlegi állapot.** A repó üres. Döntések („Fejlesztői környezet”): Turborepo + pnpm, Node 24 LTS (`.nvmrc`), csomagnév `@namitiszunk/*`, privát GitHub repó `tamaskk/namitiszunk`. Az első mérföldkő: váz, helyi futtatás és CI, üres Expo vázzal (Expo Router, NativeWind). Gépen: Node 24 telepítve (nvm), pnpm 10 megvan.

**Probléma.** Minden kód ebbe kerül. Ha a csomaghatárok és a build-sorrend az elején rossz, később minden appot érint a javítás.

**Megoldás.**

1. Node 24 telepítése (`nvm install 24`), privát repó létrehozása, a `main` ág védett: csak PR-rel és zöld CI-jal.
2. Gyökér: `package.json` (`packageManager: pnpm@10`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `turbo.json` (`dev`, `build`, `lint`, `typecheck`, `test`), `.nvmrc` (`24`), `.gitignore` (`.env*.local`).
3. Öt Next.js app (App Router, TypeScript strict, Tailwind) fix portokon: landing 3000, order 3001, admin 3002, hq 3003, api 3004.
4. `apps/mobile`: Expo Router + NativeWind, a Metro monorepó-beállításával.
5. Csomagok: `db`, `core`, `validators`, `api-client`, `config`, `ui`, `i18n`. Mindegyik TypeScript-forrást exportál (`src/index.ts`), a Next appok `transpilePackages`-szel fordítják.
6. Appokként `.env.example` a szükséges változók nevével, érték nélkül.

**Elfogadási feltételek.**

- [ ] Friss klónból a `pnpm i && pnpm dev` elindítja mind az 5 webes appot a portján és az Expo szervert.
- [x] A `pnpm lint`, `pnpm typecheck`, `pnpm test` és `pnpm build` hiba nélkül lefut.
- [x] Egy `@namitiszunk/core` függvény az order appból és a mobilappból is importálható.

**Tesztelés.** A CI (13.) tiszta gépen futtatja a fenti parancsokat. Kézzel: mind az 5 port megnyitása, a mobilapp az iOS Simulatorban.

**Függőségek és kockázatok.** Függ: semmitől (a döntésed szerint „még ne”, a terv szerinti időpontban indul). Erre épül: minden fejlesztési feladat. Kockázat: a React Native és a Next.js eltérő React-verziót kérhet; ezért a React verziót appokként kell rögzíteni, nem a gyökérben. Ha a Metro nem oldja fel a pnpm szimlinkjeit, `node-linker=hoisted` kell az `.npmrc`-be.

#### 13. CI (GitHub Actions)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 13 | CI (GitHub Actions) | `.github/workflows/ci.yml` | Nincs automatikus ellenőrzés | Pénzkezelő kódnál a hibás változtatás nem juthat élesbe | 🔴 | S |

**Jelenlegi állapot.** Nincs. Döntések: lint ESLint + Prettier, egységtesztek Vitesttel (web és csomagok) és Jesttel (mobil), CI-ban memóriabeli MongoDB.

**Probléma.** Egy fejlesztőnél nincs code review. Az állapotgép, a díjszámítás vagy a jogosultságok hibája közvetlenül pénzt érint.

**Megoldás.**

1. `.github/workflows/ci.yml`, minden PR-ra és a `main` ágra: Node a `.nvmrc`-ből, `pnpm install --frozen-lockfile` gyorsítótárral, majd `turbo run lint typecheck test build`.
2. A tesztek `mongodb-memory-server`-rel futnak; a letöltött MongoDB bináris gyorsítótárazva.
3. Titokkereső lépés (gitleaks) a véletlenül feltöltött kulcsok ellen.
4. Branch protection: a `main` csak zöld CI-jal fogad PR-t.
5. Az E2E job (Playwright) a 78. feladatban kerül ide.

**Elfogadási feltételek.**

- [x] Bukott teszttel a PR nem olvasztható be.
- [x] Egy próbaként feltöltött `sk_test_` kulcs miatt a CI piros.
- [x] A CI a 12. feladat összes parancsát futtatja.

**Tesztelés.** Próba-PR szándékosan bukott teszttel, majd javítva; próba-PR egy kamu kulccsal.

**Függőségek és kockázatok.** Függ: 12. Erre épül: 14, 78. Kockázat: a CI ideje a csomagok számával nő; a Turborepo csak a változott csomagokat és függőikat futtatja, ha a `turbo.json` függőségei pontosak.

#### 14. Környezetek, titkok és deploy

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 14 | Környezetek, titkok és deploy | `packages/config/src/env.ts`, 5 Vercel projekt, Atlas Flex (éles), Atlas M0 (fejlesztői) | Nincs környezet és titokkezelés | Teszt- és élő Stripe-kulcsok, adatbázisok és domainek szétválasztása nélkül nem lehet biztonságosan élesíteni | 🔴 | M |

**Jelenlegi állapot.** Döntések: Vercel Pro, EU régió, 5 külön Vercel projekt; fejlesztéshez Atlas M0 (Frankfurt), élesben Atlas Flex; a kapcsolati string csak `.env.local`-ban; titkok környezeti változóban.

**Probléma.** Ha egy élő Stripe-kulcs a fejlesztői környezetbe kerül, vagy egy preview az éles adatbázist írja, valódi pénz és adat sérül.

**Megoldás.**

1. Három környezet:
   - Development (helyi): Atlas M0, Stripe teszt kulcsok, webhook a Stripe CLI-vel (`stripe listen --forward-to localhost:3004/webhooks/stripe`);
   - Preview (Vercel, PR-onként): Atlas M0 külön adatbázisnévvel (`namitiszunk_preview`), Stripe teszt kulcsok, Stripe webhook nélkül; a fizetés E2E tesztje helyben fut a CLI-vel (78.);
   - Production: Atlas Flex, élő kulcsok, élő webhook.
2. `packages/config/src/env.ts`: appokként Zod-séma a környezeti változókra (`MONGODB_URI`, `BETTER_AUTH_SECRET`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `ABLY_API_KEY`, `TWILIO_*`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `INNGEST_*`, `SENTRY_DSN`, PostHog kulcs). Hiányzó változónál a build olvasható hibával leáll. Production buildben a `sk_test_` kulcs hiba.
3. Vercel: 5 projekt, Root Directory `apps/<app>`, függvényrégió `fra1` (az Atlas is Frankfurtban van), `turbo-ignore`, hogy csak a változott app épüljön.
4. Domainek hozzárendelése az 5. feladat szerint.

**Elfogadási feltételek.**

- [ ] Mind az 5 app élesen fut a saját domainjén, PR-ra preview készül.
- [x] Hiányzó környezeti változónál a build megnevezi a változót és leáll.
- [ ] Az éles környezet a Flex klaszterre, a preview és a helyi az M0-ra csatlakozik.
- [ ] A repóban nincs titok (gitleaks zöld).

**Tesztelés.** Próba preview egy eltávolított változóval: a build leáll. Csak a landinget érintő PR-nál csak a landing épül. A `packages/config` env-sémájára Vitest-teszt.

**Függőségek és kockázatok.** Függ: 1, 5, 12, 13. Erre épül: 17, 19, 29 és minden deploy. Kockázat: a Vercel Pro függvényeinek nincs fix kimenő IP-címe, így az Atlas hálózati engedélylistája `0.0.0.0/0` lesz. Ezért az adatbázis-felhasználó erős, véletlenszerű jelszót és csak a szükséges jogosultságot kapja, környezetenként külön felhasználóval.

#### 15. Közös fordítási csomag (next-intl)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 15 | Közös fordítási csomag (next-intl) | `packages/i18n` | Nincs | A magyar és angol nyelv induló követelmény; utólag minden szöveget át kellene írni | 🔴 | S |

**Jelenlegi állapot.** Döntés: magyar és angol az induláskor, német nem kell. Minden szöveg fordítási kulcsból (next-intl, közös csomag, a mobil is ezt olvassa), pénznem- és dátumformázás nyelvenként. A menü angol neve és leírása opcionális adatbázismező; ha üres, a magyar látszik.

**Probléma.** Ha a szövegek egyszer bekemlényednek a komponensekbe, később mindet át kell írni. A formázás („1 990 Ft”) három helyen eltérhet.

**Megoldás.**

1. `packages/i18n/messages/hu.json` és `en.json`, névterekkel: `common`, `order`, `admin`, `hq`, `landing`, `mobile`, `emails`.
2. Formázók: `formatHuf()` (`Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0, useGrouping: 'always' })`), dátum és idő `Europe/Budapest` időzónával.
3. Landing és order: next-intl `[locale]` útvonalakkal, a böngésző nyelve szerint, alapértelmezés `hu`. Admin és HQ: URL-előtag nélkül, a nyelv a felhasználó beállításából.
4. Mobil: `use-intl` (a next-intl keretrendszer-független magja) ugyanazokkal a JSON-fájlokkal.
5. Típusbiztos kulcsok: a `hu.json` alapján generált TypeScript-típus.

**Elfogadási feltételek.**

- [x] Ha az `en.json`-ból hiányzik egy kulcs, ami a `hu.json`-ban megvan, a CI piros.
- [x] Nem létező kulcsra a typecheck hibát ad.
- [ ] A `formatHuf(1990)` eredménye magyarul „1 990 Ft”, a webes és a mobil appban ugyanígy.

**Tesztelés.** Vitest a formázókra; kulcsellenőrző szkript a CI-ban (`packages/i18n/scripts/check-keys.ts`).

**Függőségek és kockázatok.** Függ: 12. Erre épül: minden felületi feladat és a 37. (e-mail sablonok). Kockázat: egyetlen nagy fájl kezelhetetlen lesz; ezért kellenek a névterek.

#### 16. UI alap és sötét téma

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 16 | UI alap és sötét téma | `packages/ui`, `packages/config/tailwind` | Nincs közös komponenskészlet | 4 webes app ugyanazokat a gombokat, űrlapokat és táblákat használja; a sötét téma a klubvilágításhoz kell | 🟠 | M |

**Jelenlegi állapot.** Döntés: egyelőre shadcn alaptéma, a színek CSS-változókban, az arculat elkészülte után cserélhetők. Arculat: sötét téma, fekete alap, saját neon kiemelőszín. A doksi: WCAG 2.1 AA, magas kontraszt, legalább 48 px-es gombok.

**Probléma.** Közös csomag nélkül mind a 4 app saját gombot, űrlapot és táblát kap, és az arculatcsere 4 helyen történik.

**Megoldás.**

1. `packages/ui`: shadcn komponensek egy helyen: Button, Input, Select, Sheet, Dialog, Table, Tabs, Badge, Toast (Sonner), Form (react-hook-form + Zod).
2. Színek, lekerekítés és távolságok egyetlen forrásban (`packages/ui/tokens.json`). Ebből készülnek a webes CSS-változók (`packages/config/tailwind`) és a mobil NativeWind-konfigurációja.
3. Sötét téma alapértelmezettként minden appban; a gombok minimum 48 px magasak.
4. A kiemelőszín kiválasztása 3 jelöltből a drótvázakon (11.), azzal a feltétellel, hogy a fekete alapon a kontraszt legalább 4,5:1.
5. Fejlesztői bemutatóoldal: `apps/admin/app/dev/ui/` (csak Development környezetben), minden komponenssel.

**Elfogadási feltételek.**

- [x] A 4 webes app csak a `@namitiszunk/ui` komponenseit használja; appokban nincs shadcn-másolat.
- [x] Az axe-core a bemutatóoldalon nem talál kontraszthibát.
- [x] A kiemelőszín egy helyen (`tokens.json`) cserélhető, és a csere a webes és a mobil appban is megjelenik.

**Tesztelés.** Playwright + axe-core a bemutatóoldalon; kézi ellenőrzés telefonon, sötét helyiségben, minimális fényerőn.

**Függőségek és kockázatok.** Függ: 11, 12. Erre épül: 40–77 és a mobil felületek. Kockázat: a NativeWind 4 a Tailwind 3-at használja, a weben a Tailwind 4 az aktuális. Ezért van közös `tokens.json`, és nem közös Tailwind-konfiguráció.

#### 17. Monitorozás és riasztás

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 17 | Monitorozás és riasztás | `apps/*/sentry.*.config.ts`, uptime figyelő, telefonos push | Nincs hibakövetés és riasztás | Péntek éjjeli leállásról különben csak a klub panaszából értesülünk | 🟠 | S |

**Jelenlegi állapot.** A doksi: Sentry (web és mobil), uptime-figyelés, központi naplózás, éjszakai riasztás. Döntés: push a telefonodra. Kritikus idősáv: péntek–szombat 20:00–05:00.

**Probléma.** A pilot alatt egy leállás percekben mérhető bevételkiesést és bizalomvesztést okoz a klubnál. Riasztás nélkül a klub telefonhívása az első jel.

**Megoldás.**

1. `@sentry/nextjs` mind az 5 appban (a mobil a 84. feladatban): környezetcímke (production, preview), release = git SHA, source map feltöltés a Vercel buildben, `sendDefaultPii: false`.
2. Egészség-végpont: `apps/api/app/health/route.ts` (adatbázis-ping, 200 vagy 503).
3. Uptime-figyelő: Better Stack, a telefonos appján keresztül pushsal. Figyelt címek: `api.namitiszunk.hu/health`, a rendelős oldal egy demó helyszíne, `admin.namitiszunk.hu`, `namitiszunk.hu`.
4. Riasztási szabályok: bármely cím két egymás utáni ellenőrzésen kiesik; új hiba az éles környezetben; az api hibáinak száma 5 perc alatt 10 fölé megy. A Sentry-riasztás a Better Stackbe megy, onnan pushként érkezik.
5. A Stripe webhook hibáiról a Stripe e-mailt küld; ezt a fiókban bekapcsolni.

**Elfogadási feltételek.**

- [ ] Egy próbahiba az éles környezetben megjelenik a Sentryben release-szel és visszafejtett stack trace-szel.
- [ ] Ha az egészség-végpont 503-at ad, 3 percen belül push érkezik a telefonodra.
- [ ] A Sentry eseményeiben nincs e-mail-cím és telefonszám.

**Tesztelés.** Védett próbahiba-végpont (csak HQ Admin szerepkörrel hívható). A preview-ban környezeti változóval 503-ra állított egészség-végpont.

**Függőségek és kockázatok.** Függ: 14. Erre épül: 83. Kockázat: túl sok riasztás esetén a pushokat figyelmen kívül hagyod. Ezért az első 2 pilot-hétvége után a küszöböket a valós zajhoz kell igazítani.

#### 18. Termékanalitika (PostHog, cookieless)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 18 | Termékanalitika (PostHog, cookieless) | `packages/analytics` | Nincs mérés | A fő tölcsér és a pilot tanulságai nélküle nem mérhetők | 🟠 | S |

**Jelenlegi állapot.** Döntés: PostHog, EU-s szerver, süti nélküli mód; cookie banner csak nem létfontosságú süti esetén. Fő tölcsér: QR beolvasás → menü → kosár → fizetés → átvétel. A Kapu 2 QR-aránya kézzel számolódik a Z-jelentésből, nem PostHogból.

**Probléma.** Mérés nélkül nem derül ki, hol esnek ki a vendégek a QR és a fizetés között, és mennyi idő a 60 mp-es célhoz képest.

**Megoldás.**

1. `packages/analytics`: vékony burok a posthog-js köré (`persistence: 'memory'`, EU-s host), és posthog-node a szerveroldali eseményekhez.
2. Fordított proxy Next rewrite-tal (`/ingest` → EU-s PostHog host), hogy a hirdetésblokkolók ne vágják le.
3. Események, fix listával:
   - kliens: `menu_viewed` (forrás: qr / link / app), `product_added`, `checkout_started`;
   - szerver (webhook és állapotváltás): `payment_succeeded`, `order_ready`, `order_picked_up`.
4. Kliens és szerver összekötése: a kliens anonim azonosítója a PaymentIntent metadatájába kerül, a szerveroldali események ezt használják.
5. Tulajdonságok: `venueId`, `barId`, `orderId`, összeg; személyes adat nincs.
6. PostHog-irányítópult: a fő tölcsér helyszínenként, a QR-tól a fizetésig eltelt idő mediánja.

**Elfogadási feltételek.**

- [ ] Egy teszt rendelés mind a 6 lépése egy tölcsérben, egy azonosítóval jelenik meg.
- [ ] A PostHog nem ír sütit és localStorage-t (DevTools-ban ellenőrizve).
- [ ] Az események az EU-s példányba mennek, e-mail és telefonszám nélkül.

**Tesztelés.** Vitest a burok beállításaira (perzisztencia, host). Kézi teszt rendelés a preview-ban, ellenőrzés a PostHog Live Events nézetében.

**Függőségek és kockázatok.** Függ: 12, 14; az eseményekhez 33, 40–43. Erre épül: 61, 82. Kockázat: memóriás perzisztenciánál egy teljes oldalújratöltés új azonosítót ad. Ezért a rendelős oldal a menütől a fizetésig oldalújratöltés nélkül navigál.

#### 19. Mentés és visszaállítási próba

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 19 | Mentés és visszaállítási próba | Atlas Flex napi snapshot, `docs/runbooks/restore.md` | Nincs ellenőrzött visszaállítás | Adatvesztésnél a rendelések és a riportok elvesznek | 🟠 | S |

**Jelenlegi állapot.** Döntés: Atlas Flex napi automatikus snapshottal; időpontra visszaállítás (PITR) csak az M10-re váltáskor, kb. 10 helyszín felett. A doksi havonta próbavisszaállítást ír elő. A gépen nincs mongosh és MongoDB Database Tools.

**Probléma.** Ki nem próbált mentésről nem tudni, hogy visszaállítható-e, és mennyi ideig tart. Napi snapshotnál a legrosszabb esetben egy napnyi rendelés hiányzik.

**Megoldás.**

1. mongosh és MongoDB Database Tools telepítése.
2. Runbook (`docs/runbooks/restore.md`):
   - a snapshot visszaállítása mindig külön, ideiglenes klaszterre, soha nem közvetlenül az élesre;
   - ellenőrzés, utána az érintett gyűjtemények átmásolása (`mongodump` / `mongorestore`), vagy a `MONGODB_URI` átállítása;
   - a snapshot óta fizetett rendelések listája a Stripe-ból (PaymentIntent metadata: `orderId`, `venueId`).
3. Ellenőrző szkript (`scripts/verify-restore.ts`): gyűjteményenkénti dokumentumszám és a legutóbbi rendelés ideje.
4. Próbavisszaállítás a pilot előtt, utána havonta, naptárbejegyzéssel.

**Elfogadási feltételek.**

- [ ] A pilot előtt egy próbavisszaállítás lefutott; a dokumentumszámok egyeznek a snapshotéval.
- [ ] A visszaállítás ideje mérve és beírva a runbookba.
- [ ] Egy preview-app a visszaállított klaszteren elindul, és listázza a rendeléseket.

**Tesztelés.** Maga a próba a teszt, az ellenőrző szkripttel.

**Függőségek és kockázatok.** Függ: 14, 20. Erre épül: 116. Kockázat: az éles klaszterre visszaállított snapshot felülírja a snapshot óta keletkezett adatokat; ezért tiltja a runbook.

### C. Adatmodell és üzleti logika

#### 20. Mongoose modellek és indexek

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | Mongoose modellek és indexek | `packages/db/src/models/` | Nincs adatmodell | Minden felület ugyanazokat a modelleket használja | 🔴 | M |

**Jelenlegi állapot.** A doksi „Entitások” táblája 22 entitást sorol fel (User, Venue, VenueMember, PlatformMember, Bar, Zone, QrCode, Event, Category, Item, ModifierGroup/Modifier, PriceRule, Order, OrderItem, Payment, Refund, Promo, Review, DeviceToken, FeeRule, Lead, AuditLog). Adatszabályok: pénz egész számként, tétel ár-pillanatképpel, menüelem csak archiválható, pénzhez kötött lépés többdokumentumos tranzakcióban.

**Probléma.** A 2026-11-01-i döntések új mezőket kérnek, amelyek nincsenek a táblában. A rossz index csúcsidőben lassítja a Pult nézetet, a hiányzó egyedi index dupla rendelésszámot enged.

**Megoldás.**

1. Modellek a doksi táblája szerint, ezekkel a kiegészítésekkel:
   - VenueMember: `vipHost` szerepkör (később `waiter`), név + PIN-hash e-mail-fiók nélkül;
   - Venue: `businessDayStart` (alap `06:00`), `timezone` (`Europe/Budapest`), `openingHours` (heti nyitvatartás helyi időben, ISO nap 1–7, a nyitásnál nem későbbi zárás másnap reggel van; üresen csak a pult kapcsolója számít, 48.), rendelési szabályok (automatikus elfogadás, átvételi határidő 15–60 perc, lejáratkori visszatérítés, max. tétel, minimum rendelés, utolsó rendelés zárás előtt, szervizdíj típusa és értéke, SMS be/ki);
   - Zone: típus (`bar_area`, `vip_table`); Item: `vipOnly`, `nameEn`, `descriptionEn`;
   - Order: `businessDate`, `shortNumber`, `guestPhone` (30 napos törléssel), `smsRequested`, `receiptEnteredAt` és `receiptEnteredBy` („Nyugta beütve”), `acceptedTermsVersion`, `isVip`;
   - Counter: helyszín és üzleti nap szerinti sorszámláló (24.).
2. Indexek: Order `{venueId, businessDate, shortNumber}` egyedi; Order `{venueId, barId, status}`; Payment `stripePaymentIntentId` egyedi; Venue `slug` egyedi; QrCode `code` egyedi; AuditLog `{target.type, target.id, createdAt}`.
3. Pénz: egész forint (`Number`, egész validációval); a Stripe felé a 22. feladat vált át.
4. Kapcsolatkezelés serverless környezetben: globálisan gyorsítótárazott Mongoose-kapcsolat, `maxPoolSize: 10`.

**Elfogadási feltételek.**

- [x] Minden doksi-entitás és a fenti mezők modellként léteznek, TypeScript-típussal.
- [x] Két azonos `{venueId, businessDate, shortNumber}` rendelés mentése hibát ad.
- [x] A menüelemnek nincs törlő művelete, csak archiváló.
- [x] Egy többdokumentumos tranzakció a tesztben és az M0-n is lefut.

**Tesztelés.** Vitest `MongoMemoryReplSet`-tel (a tranzakciókhoz replika készlet kell): egyedi indexek, validációk, tranzakció visszaállítása hibánál. A Pult nézet lekérdezésére `explain()`: indexet használ.

**Függőségek és kockázatok.** Függ: 12. Erre épül: 21–28 és minden backend-feladat. Kockázat: a Flex klaszter max. 500 kapcsolatot enged; sok párhuzamos Vercel-függvénynél a pool mérete ezt elérheti. Ezt a k6-teszt (80.) méri.

#### 21. Rendelés-állapotgép

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 21 | Rendelés-állapotgép | `packages/core/src/orders/state-machine.ts`, `transition.ts` | Nincs | A doksi szerint állapotot csak a szerver vált egyetlen függvényen át; hiba esetén pénz és ital vész el | 🔴 | M |

**Jelenlegi állapot.** A doksi 9 állapotot ad: Fizetésre vár, Új, Készül, Kész, Átvéve, Megszakítva, Elutasítva, Lejárt, Visszatérítve. Döntések: fizetett rendelés automatikusan elfogadott (`acceptedAt = paidAt`), a klub kézi elfogadásra válthat; elutasítás csak Új állapotban, teljes visszatérítéssel; vendéglemondás csak kézi elfogadású klubnál, elfogadás előtt; lejárat Kész után 30 perccel (15–60, visszatérítés be/ki); VIP-nél a pult elkészíti, a VIP-host adja át.

**Probléma.** Ha két pultos egyszerre nyomja meg az Átvéve gombot, vagy a webhook kétszer érkezik, állapotgép nélkül dupla művelet vagy elveszett rendelés lesz.

**Megoldás.**

1. Tiszta függvény (`state-machine.ts`): `next(state, event, ctx)` táblázatból. Átmenetek:
   - Fizetésre vár → Új: sikeres fizetés webhookja;
   - Fizetésre vár → Megszakítva: 15 perc sikeres fizetés nélkül (Inngest, 35.); egy sikertelen próbálkozás után a vendég ugyanazzal a rendeléssel újrapróbálhat;
   - Új → Készül: pultos; Új → Elutasítva: pultos okkal, vagy a vendég kézi elfogadású klubnál elfogadás előtt;
   - Készül → Kész: pultos; Kész → Átvéve: pultos, VIP-rendelésnél a VIP-host vagy a Manager;
   - Kész → Lejárt: határidő (Inngest); Lejárt → Visszatérítve: automatikusan, ha a klub bekapcsolta;
   - Átvéve vagy Lejárt → Visszatérítve: Manager vagy Tulaj teljes visszatérítése. Részleges visszatérítésnél az állapot marad, a Refund rekord rögzíti.
2. `transition.ts`: `transition(orderId, event, actor)` Mongo-tranzakcióban. Feltételes frissítés (`findOneAndUpdate` a várt kiinduló állapottal), időbélyeg (`paidAt`, `acceptedAt`, `readyAt`, `pickedUpAt`), jogosultság-ellenőrzés (23.), audit bejegyzés (26.).
3. A commit után azonnal Ably-publikálás (31.) a 2 mp-es cél miatt, majd Inngest-esemény (`order/status.changed`) az értesítésekhez (36., 37., 90.) és az elemzési eseményhez (18.).
4. A pult áttétele (rossz pultnál álló vendég) nem állapotváltás, hanem `barId`-módosítás, szintén auditálva.

**Elfogadási feltételek.**

- [x] Állapot csak a `transition()` függvényen át változik; a kódbázisban máshol nincs `status`-írás (lint-szabály vagy grep a CI-ban).
- [x] Tiltott átmenet `InvalidTransition` hibát dob, az adat nem változik.
- [x] Két párhuzamos Kész → Átvéve kérésből pontosan egy sikeres.
- [x] Ugyanaz a webhook kétszer feldolgozva egy Új rendelést ad.

**Tesztelés.** Vitest: mind a 9 állapot × minden esemény kombinációja egy táblából (megengedett: siker, a többi: hiba). Párhuzamossági teszt `MongoMemoryReplSet`-en `Promise.all`-lal.

**Függőségek és kockázatok.** Függ: 20, 23, 26. Erre épül: 31, 33, 34, 35, 43, 54, 55. Kockázat: a könyvelői válasz (2.) módosíthatja, mikor kell a nyugtát beütni; ez a táblázatot nem, csak a Pult nézetet érinti.

#### 22. Díjszámítás

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 22 | Díjszámítás | `packages/core/src/pricing/` | Nincs | Részösszeg, szervizdíj, borravaló, kedvezmény, jutalék és SMS-díj pontos számítása nélkül nem lehet terhelni | 🔴 | M |

**Jelenlegi állapot.** Döntések: a vendég fizet tételeket, opcionális szervizdíjat és borravalót, mínusz kedvezmény; platformdíjat nem. Borravaló 0 / 5 / 10 / 15% vagy egyéni, alapból 0%. Szervizdíj alapból ki; a klub választja, százalék vagy fix (2026-11-02). Jutalék: pilot 1%, utána alap 3%, klubonként állítható (FeeRule); alapja a végösszeg borravaló nélkül (2026-11-02). SMS-kérésnél fix 35 Ft az application fee-ben. Visszatérítésnél a platformdíj is visszajár.

**Probléma.** Egy kerekítési vagy sorrendi hiba minden rendelésnél rossz összeget terhel, és a riport nem egyezik a Stripe-pal.

**Megoldás.** Egyetlen tiszta függvény: `calculateOrder(items, venueRules, promo, tip, smsRequested, feeRule)`. Minden összeg egész forint, minden lépés után kerekítve (`Math.round`), ebben a sorrendben:

1. részösszeg = Σ (tételár + opciók felára) × mennyiség;
2. kedvezmény = a promóciós kód szerint (% vagy fix), legfeljebb a részösszeg;
3. szervizdíj = % × (részösszeg − kedvezmény), vagy a fix összeg, vagy 0;
4. borravaló = % × (részösszeg − kedvezmény), vagy az egyéni összeg;
5. végösszeg = részösszeg − kedvezmény + szervizdíj + borravaló;
6. jutalék = jutalék% × (végösszeg − borravaló); a jutalék% a fizetés pillanatában érvényes FeeRule-ból (helyszínre szabott, különben az alapértelmezett);
7. application fee = jutalék + (SMS kérve ? 35 : 0);
8. Stripe `amount` = végösszeg × 100, `application_fee_amount` = application fee × 100 (a Stripe a HUF-ot fillérben várja).

A szerver mindig újraszámol a friss árakból; a kliens összege csak megjelenítés.

**Elfogadási feltételek.**

- [x] Az összes összetevő egész szám, és a végösszeg pontosan a részek összege.
- [x] A jutalék alapjában nincs borravaló; a szervizdíj benne van.
- [x] Az application fee soha nem nagyobb a végösszegnél.
- [x] A Stripe minimális HUF-terhelése (175 Ft) alatti végösszegnél a pénztár nem engedi a fizetést.
- [x] A 100%-os kedvezményű rendelésre nem készül PaymentIntent.

**Tesztelés.** Vitest táblázatos esetekkel (szervizdíj % és fix, borravaló 0/5/10/15/egyéni, % és fix kedvezmény, SMS be/ki, pilot 1% és 3%). Tulajdonságalapú teszt (fast-check) véletlen kosarakra az invariánsokra. Egy teszt PaymentIntent teszt módban: a Dashboard összege és az application fee egyezik a függvénnyel.

**Függőségek és kockázatok.** Függ: 20; a szervizdíj ÁFA-kulcsa a 2. feladattól. Erre épül: 33, 34, 41, 42, 60, 61, 73. Kockázat: a Stripe HUF-kezelése (fillér, 100-zal osztható kifizetések) teszt módban ellenőrizendő, mielőtt a riportok épülnek rá.

#### 23. Jogosultságok (RBAC)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 23 | Jogosultságok (RBAC) | `packages/core/src/auth/permissions.ts` | Nincs | 5 helyszíni és 3 platformszerepkör; a szervernek kell ellenőriznie, nem a felületnek | 🔴 | M |

**Jelenlegi állapot.** A doksi jogosultsági mátrixa 19 műveletet és 6 oszlopot ad (Vendég, Pultos, Manager, Tulaj, Platform Support, Platform Admin). Szabályok: egy felhasználó több helyszínen, helyszínenként más szerepkörrel; pultosváltás 4 jegyű PIN-nel; a Manager visszatérítési limitje állítható (a pilotban nincs); a Pénzügy csak olvas és exportál. A VIP-host és (Fázis 4-ben) a felszolgáló név + PIN szerepkör; Managert és Tulajt csak a Tulaj hív meg.

**Probléma.** Ha a jogosultságot csak a felület rejti el, egy kézzel összeállított kéréssel a pultos is visszatéríthet, vagy egy klub láthatja egy másik klub rendeléseit.

**Megoldás.**

1. `permissions.ts`: a mátrix egy táblázatban, a VIP-host sorával kiegészítve (VIP-rendelés átvétele, „Kivinni” lista).
2. `can(actor, action, resource)`: a szerepkört mindig a `resource.venueId`-hoz tartozó tagságból veszi, sosem globálisan.
3. `requirePermission()` minden route handlerben és server actionben; hiányzó jognál 403.
4. Személyzeti munkamenet: a tablet a klub fiókjával van belépve, a művelet szerepkörét és naplózott szereplőjét az aktív PIN-tulajdonos adja.
5. Klub nevében belépés (70.): a platformszereplő alapból csak olvasási jogot kap, írás csak külön megerősítéssel, mindkettő naplózva.
6. A Manager visszatérítési limitje Venue-beállítás (alap: nincs limit).

**Elfogadási feltételek.**

- [x] A mátrix minden cellája automatikus tesztként létezik.
- [x] Másik helyszín erőforrására minden szerepkör 403-at kap.
- [x] Pultos PIN-nel a visszatérítés végpontja 403-at ad.
- [x] Nincs route handler `requirePermission()` nélkül (CI-ellenőrzés a nyilvános végpontok listáján kívül).

**Tesztelés.** Vitest: a mátrix egy fixture-ből, szerepkör × művelet × elvárt eredmény. API-szintű tesztek a legkritikusabb végpontokra (visszatérítés, menüár, személyzet, kifizetés) másik klub tokenjével.

**Függőségek és kockázatok.** Függ: 20, 30. Erre épül: 21, 29, 50–73. Kockázat: a mátrix és a kód szétcsúszása; ezért a teszt-fixture a mátrix egyetlen forrása, és módosításkor a termékdoksit is frissíteni kell.

#### 24. Rövid rendelésszám és üzleti nap

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 24 | Rövid rendelésszám és üzleti nap | `packages/core/src/orders/short-number.ts` | Nincs | A pultos és a vendég a rövid számmal azonosítja a rendelést; ütközés téves átadást okoz | 🔴 | S |

**Jelenlegi állapot.** Döntés: a rövid szám (#214) helyszínenként és üzleti naponként indul újra; az üzleti nap kezdete helyszínenként állítható, alap 6:00. Átvételkor a pultos a rövid számot és a mozgó képernyőt nézi.

**Probléma.** Éjfél után is ugyanaz az este tart, ezért a naptári nap rossz határ. Párhuzamos fizetéseknél egy nem atomi számláló két rendelésnek ugyanazt a számot adja.

**Megoldás.**

1. `businessDate(now, venue)`: a helyszín időzónájában (`Europe/Budapest`) számolt dátum, a `businessDayStart`-tal eltolva; időzóna-számítás `@date-fns/tz`-vel.
2. Atomi számláló: `findOneAndUpdate({venueId, businessDate}, {$inc: {seq: 1}}, {upsert: true})` a Counter gyűjteményben.
3. A szám a sikeres fizetéskor (Új állapot) jön létre, így a megszakított fizetések nem hagynak lyukat.
4. Formátum: `#` + sorszám 1-től, felső korlát nélkül.

**Elfogadási feltételek.**

- [x] 100 párhuzamos fizetés 1-től 100-ig egyedi számokat kap.
- [x] 5:59-kor fizetett rendelés az előző üzleti naphoz tartozik, 6:00-kor fizetett az újhoz.
- [x] A nyári és téli időszámítás váltásának éjszakáján is helyes az üzleti nap.

**Tesztelés.** Vitest rögzített órával a határesetekre (5:59, 6:00, március és október utolsó vasárnapja), párhuzamossági teszt `MongoMemoryReplSet`-en.

**Függőségek és kockázatok.** Függ: 20. Erre épül: 33, 43, 54, 61. Kockázat: ha a klub a nyitvatartás közben állítja át az üzleti nap kezdetét, a sorszám újraindulhat; ezért az új érték a következő üzleti naptól él.

#### 25. Zod sémák és OpenAPI

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 25 | Zod sémák és OpenAPI | `packages/validators/` | Nincs | Ugyanaz a validáció kell kliensen, szerveren és a mobil API-ban | 🔴 | S |

**Jelenlegi állapot.** Döntés: REST + OpenAPI a Zod sémákból, ugyanaz a séma kliensen és szerveren.

**Probléma.** Külön kliens- és szervervalidáció szétcsúszik: a kliens elfogad egy kosarat, amit a szerver elutasít, vagy fordítva.

**Megoldás.**

1. `packages/validators/src/`: sémák területenként (`orders`, `menu`, `venues`, `staff`, `promos`, `auth`), bemenetre és válaszra is.
2. A helyszín-függő szabályok (max. tétel, minimum rendelés) a szerveren, a helyszín beállításával futó kiegészítő ellenőrzésben, nem a statikus sémában.
3. Hibaüzenetek fordítási kulccsal (15.), nem beszégezett szöveggel.
4. OpenAPI 3.1: a Zod 4 `z.toJSONSchema()` kimenetéből épül buildkor, elérhető a `/v1/openapi.json` címen.

**Elfogadási feltételek.**

- [x] Minden API-végpont bemenete sémán megy át; hibás bemenetre 400 és mezőnkénti hibakulcsok.
- [x] Az `openapi.json` érvényes (Redocly lint a CI-ban).
- [x] A rendelős oldal űrlapjai ugyanazt a sémát használják, mint a szerver.

**Tesztelés.** Vitest a sémák határeseteire (mennyiség 0 és 11, üres kosár, érvénytelen telefonszám); CI-lépés: OpenAPI generálás és lint.

**Függőségek és kockázatok.** Függ: 12, 15. Erre épül: 29, 39, 41, 42, 110. Kockázat: a Zod JSON Schema kimenete nem minden Zod-konstrukciót fordít OpenAPI-ra (pl. transzformációk); az API-sémák ezért transzformáció nélküliek.

#### 26. Audit napló

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 26 | Audit napló | `packages/core/src/audit/` | Nincs | Visszatérítés, díjváltozás és a klub nevében végzett belépés csak naplózva engedhető | 🔴 | S |

**Jelenlegi állapot.** A doksi: AuditLog (ki, művelet, célpont, előtte / utána, időpont), minden írási műveletre; a platformon minden írás naplózott, a klub nevében végzett belépés külön jelölve; a „Nyugta beütve”, az átadás és a visszatérítés a PIN gazdájához kerül.

**Probléma.** Napló nélkül egy vitatott visszatérítésnél vagy hiányzó nyugtánál nem derül ki, ki mit csinált.

**Megoldás.**

1. AuditLog séma: `actor` (típus: user, staff PIN, platform, system; azonosító, név), `impersonatedBy`, `venueId`, `action`, `target` (típus, azonosító), `before`, `after`, `createdAt`.
2. `audit(session, entry)`: ugyanabban a Mongo-tranzakcióban fut, mint a módosítás; ha az egyik elbukik, mindkettő visszagördül.
3. Naplózott: minden platformírás; a klubnál minden állapotváltás, visszatérítés, „Nyugta beütve”, menü- és árváltozás, személyzet- és beállításváltozás, díjváltozás.
4. A `before` / `after` nem tartalmaz telefonszámot, e-mail-címet és PIN-hasht.
5. Nincs módosító és törlő API; megőrzés 8 év, mint a pénzügyi adatnál (28.).

**Elfogadási feltételek.**

- [x] Minden állapotváltás és visszatérítés után van audit bejegyzés a szereplővel.
- [ ] A klub nevében végzett műveletnél az `impersonatedBy` ki van töltve.
- [x] Ha az audit írása elbukik, a módosítás sem marad meg.

**Tesztelés.** Vitest: tranzakciós visszagörgetés szimulált audit-hibával; snapshot-teszt, hogy a `before` / `after` nem tartalmaz tiltott mezőt.

**Függőségek és kockázatok.** Függ: 20. Erre épül: 21, 34, 56, 70, 71. Kockázat: a napló gyorsan nő; az index a célpontra és az időre van, és a lekérdezések mindig időszakra szűrnek.

#### 27. Seed adatok

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 27 | Seed adatok | `packages/db/src/seed.ts` | Nincs | Fejlesztés, E2E teszt és demó mintaadat nélkül lassú | 🟠 | S |

**Jelenlegi állapot.** A doksi szerint a `packages/db` tartalmazza a seed adatokat; tartalmuk nincs meghatározva.

**Probléma.** Mintaadat nélkül minden fejlesztési munkamenet kézi kattintgatással indul, és az E2E teszt nem determinisztikus.

**Megoldás.**

1. „Demo Klub” (slug: `demo`): 2 pult, 3 zóna, 2 VIP asztal saját QR-ral, 6 kategóriában kb. 40 tétel opciókkal, részben angol névvel, VIP-palackok `vipOnly` jelöléssel.
2. Személyzet: Tulaj, Manager, 2 pultos és 1 VIP-host PIN-nel; promóciós kódok; FeeRule: alap 3%, a Demo Klubra 1%.
3. Rendelések a mai üzleti napra minden állapotban.
4. Parancsok: `pnpm db:seed` (fejlesztői; leáll, ha a `MONGODB_URI` az éles klaszterre mutat) és `pnpm db:seed:e2e` (rögzített azonosítókkal, a memóriabeli adatbázisba).
5. Élesben csak a `demo` helyszín kerül fel, Stripe-fiók nélkül (a menü látható, fizetni nem lehet); ezt figyeli az uptime-figyelő (17.).

**Elfogadási feltételek.**

- [x] Az újrafuttatás nem dupláz adatot.
- [x] Az éles URI-ra a fejlesztői seed hibával leáll.
- [x] Az E2E seed után minden azonosító futtatásról futtatásra azonos.

**Tesztelés.** Vitest: kétszeri futtatás után azonos dokumentumszámok; az éles URI-védelem egységtesztje.

**Függőségek és kockázatok.** Függ: 20, 22, 24. Erre épül: 17, 78, 80. Kockázat: a seed elavul, ahogy a modellek változnak; ezért a CI minden futtatáskor lefuttatja az E2E seedet.

#### 28. Automatikus adattörlés (megőrzési idők)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 28 | Automatikus adattörlés (megőrzési idők) | `apps/api/src/inngest/retention.ts` | Nincs | A döntött megőrzési idők (telefonszám 30 nap, problémajelzés e-mail-címe 90 nap, inaktív fiók 2 év) GDPR-kötelezettség | 🟠 | S |

**Jelenlegi állapot.** Döntés: rendelés- és pénzügyi adat 8 év; a vendég telefonszáma a rendelés után 30 nap; a problémajelzés e-mail-címe 90 nap; inaktív fiók 2 év után törlődik.

**Probléma.** A tájékoztatóban vállalt megőrzési idő automatikus törlés nélkül ígéret marad. A telefonszám a Twilio üzenetnaplójában is megmarad.

**Megoldás.** Inngest-cron naponta 07:00-kor (`Europe/Budapest`), a kritikus éjszakai idősávon kívül:

1. 30 napnál régebbi rendelésekből a `guestPhone` törlése; a 30 napnál régebbi Twilio-üzenetek törlése a Twilio API-val. 90 napnál régebbi problémajelzésekből (`problemReports[].email`, 46.) a vendég e-mail-címének törlése.
2. Fiókok, ahol az utolsó belépés és az utolsó rendelés is 2 évnél régebbi: a User, a munkamenetek és a push tokenek törlése; a rendelésekben `userId: null`.
3. 8 évnél régebbi rendelések, fizetések, visszatérítések és audit bejegyzések törlése.
4. Próbafázis (`dryRun`): csak darabszámot naplóz; az éles futás eredménye audit bejegyzésként (system szereplő).

**Elfogadási feltételek.**

- [x] A 31 napos teszt rendelésből eltűnik a telefonszám, a 29 naposból nem.
- [x] A törölt fiók rendelései megmaradnak a riportokban, személyes adat nélkül.
- [x] A feladat ismételt futtatása nem töröl többet és nem hibázik.

**Tesztelés.** Vitest rögzített órával és memóriabeli adatbázissal, határeseti fixture-ökkel (29, 30, 31 nap; 2 év ± 1 nap). Inngest dev szerverrel kézi indítás.

**Függőségek és kockázatok.** Függ: 20, 35, 36. Erre épül: 3 (a tájékoztató ígérete), 89. Kockázat: a napi Atlas-snapshotok a törölt adatot a snapshot lejártáig még tartalmazzák; ezt az adatvédelmi tájékoztatóban le kell írni.

### D. Backend és integrációk

#### 29. API váz: route handlerek, hibakezelés, rate limit, CORS, OpenAPI

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 29 | API váz: route handlerek, hibakezelés, rate limit, CORS, OpenAPI | `apps/api/app/v1/` | Nincs API | A mobilapp, a webhookok és a háttérfeladatok mind ezt hívják | 🔴 | M |

**Jelenlegi állapot.** Döntés: `apps/api` külön Next.js app (api.namitiszunk.hu): mobil API, Stripe webhook, Inngest; REST + OpenAPI a Zod sémákból; token alapú védelem. A webes appok a `packages/core`-t szerveroldalon közvetlenül hívják. A doksi rate limitet kér a belépésre, az OTP-re és a fizetésre.

**Probléma.** Közös keret nélkül minden végpont másképp validál, más hibaformátumot ad, és könnyű egy jogosultság-ellenőrzést kihagyni.

**Megoldás.**

1. Közös burok: `handler({ auth, permission, input, rateLimit, idempotent }, fn)`. Sorrend: rate limit → hitelesítés → Zod-validáció → `requirePermission` (23.) → üzleti logika.
2. Egységes hibaválasz: `{ error: { code, messageKey, fields } }`; 400 / 401 / 403 / 404 / 409 / 429 / 500; minden válaszban `x-request-id`, a hibák Sentrybe mennek.
3. Rate limit: MongoDB-számláló TTL-indexszel (`rateLimits` gyűjtemény), kulcs IP-cím és végpont szerint; a hitelesítési végpontokat a Better Auth saját, adatbázisban tárolt limitere védi.
4. Idempotencia: az `Idempotency-Key` fejléccel érkező POST-kérések (rendelés létrehozása, visszatérítés) válasza 24 óráig tárolva; ismétlésre ugyanaz a válasz.
5. CORS: csak a saját domainek (namitiszunk.hu, rendel., admin., hq.); a mobilapp kéréseihez nem kell CORS.
6. `/v1/openapi.json` (25.) és `/health` (17.).

**Elfogadási feltételek.**

- [x] Minden `/v1` végpont a közös burkon megy át (CI-ellenőrzés).
- [x] A rate limit túllépésekor 429 és `Retry-After` fejléc.
- [x] Ugyanazzal az `Idempotency-Key`-jel kétszer küldött rendelés egy rendelést hoz létre.
- [x] Idegen origin böngészős kérése CORS-hibát kap.

**Tesztelés.** Vitest a burokra (sorrend, hibakódok, idempotencia); integrációs teszt egy minta-végponton memóriabeli adatbázissal.

**Függőségek és kockázatok.** Függ: 12, 14, 20, 23, 25. Erre épül: 30–39, 84–96, 110. Kockázat: a MongoDB-alapú rate limit minden kérésnél plusz adatbázis-írás. A pilot terhelésénél ez elfogadható, skálázásnál (117.) a k6-mérés dönt a cseréről.

#### 30. Hitelesítés (Better Auth)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 30 | Hitelesítés (Better Auth): Apple, Google, e-mail link, HQ 2FA, személyzeti PIN, vendégtoken | `packages/auth/`, `apps/*/app/api/auth/[...all]/route.ts` | Nincs | Admin, HQ, vendégfiók és a pultosok azonosítása nélkül semmi nem védhető | 🔴 | L |

**Jelenlegi állapot.** Döntések: Better Auth MongoDB-adapterrel; Apple, Google és e-mailes link, SMS-belépés nincs; rendeléshez nem kell fiók; 2FA a HQ-ban kötelező, a klubnál választható; az admin és a HQ külön munkamenetet használ; pultos, VIP-host: név + 4 jegyű PIN közös tableten, a klub fiókjával egyszer belépve; rendelésenkénti vendégtoken a rendelős oldalon.

**Probléma.** Öt különböző azonosítási mód van (vendégfiók, klubtag, platformtag, PIN, vendégtoken). Ha egyik rosszul választ el, egy pultos admin-jogot kaphat, vagy egy vendég más rendelését láthatja.

**Megoldás.**

1. `packages/auth`: Better Auth konfiguráció MongoDB-adapterrel; Apple (Services ID és kulcs, 7.), Google OAuth-kliens, magic link a Resenden (37.) 15 perces lejárattal.
2. Munkamenetek: a webes appokban HttpOnly süti a saját aldomainre (az admin és a HQ nem osztozik sütiben); a mobilon bearer token a `@better-auth/expo` bővítménnyel, `expo-secure-store`-ban.
3. 2FA: Better Auth twoFactor (TOTP), a HQ-ban kötelező, belépés után beállítás nélkül nem enged tovább; a klubnál választható.
4. Személyzeti PIN: a tablet a Manager vagy a Tulaj belépésével kap „eszköz-munkamenetet”; a PIN-ellenőrzés a szerveren történik (argon2 hash), az aktív pultos rövid életű, aláírt sütiben van. PIN-próbálkozás: eszközönként 5 / perc, utána 5 perc tiltás.
5. Vendégtoken: 128 bites véletlen token rendelésenként, az adatbázisban csak a hash-e. URL: `/o/[id]?t=[token]`, az eszköz localStorage-ában is; ezzel látható az élő állapot, ezzel lehet problémát jelezni és (kézi elfogadásnál) lemondani.
6. Meghívás: Manager és Tulaj e-mailes meghívóval, egyszer használható, 7 napig érvényes linkkel.

**Elfogadási feltételek.**

- [ ] Vendég Apple-lel, Google-lel és e-mail linkkel is be tud lépni a weben.
- [x] HQ-ba 2FA nélkül nem lehet belépni.
- [x] Az admin munkamenete nem érvényes a HQ-ban, és fordítva.
- [x] Hibás PIN ötször egy percen belül: az eszköz 5 percre tiltva.
- [x] Rendelés állapota token nélkül vagy rossz tokennel 404.

**Tesztelés.** Vitest a PIN- és tokenlogikára; Playwright: magic link belépés (Resend teszt címre), HQ 2FA, admin–HQ munkamenet-elválasztás; kézi teszt Apple és Google belépésre a preview-ban.

**Függőségek és kockázatok.** Függ: 5 (e-mail domain), 7 (Apple fiók), 20, 37. Erre épül: 23, 47, 50, 54, 55, 57, 66, 70, 84. Kockázat: az Apple belépés a weben ellenőrzött domaint és visszatérési URL-t kér minden környezetre; a preview-k változó URL-je miatt az Apple belépés csak helyben és élesben tesztelhető.

#### 31. Realtime (Ably)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 31 | Realtime (Ably) | `packages/core/src/realtime/`, `apps/api/app/v1/realtime/token/route.ts` | Nincs | A rendelésnek 2 mp-en belül meg kell jelennie a pulton, és a vendég élő állapota is erre épül | 🔴 | M |

**Jelenlegi állapot.** Döntés: Ably; a szerver állapotváltáskor publikál, mert a Vercel nem tart nyitva websocketet. Ingyenes szint: 6 millió üzenet/hó, 200 egyidejű kapcsolat, 200 csatorna, 500 üzenet/mp. Cél: rendelés → pult 2 mp alatt. A Pult nézet kapcsolatvesztésnél piros sávot mutat, és újracsatlakozáskor szinkronizál.

**Probléma.** Ha a pult nem kapja meg az új rendelést, a vendég fizetett, de az ital nem készül. A realtime üzenet elveszhet, ezért nem lehet az egyetlen igazságforrás.

**Megoldás.**

1. Csatornák: `venue:{venueId}:bar:{barId}` (Pult nézet), `venue:{venueId}:vip` (VIP-host), `order:{orderId}` (vendég).
2. Token: `/v1/realtime/token` Ably TokenRequestet ad, csak feliratkozási joggal és csak a jogosult csatornára (személyzetnek a helyszín pultjai, vendégnek a rendeléstokennel igazolt rendelése).
3. Publikálás csak a szerverről, az Ably REST API-val, közvetlenül a tranzakció commitja után (21.). Az üzenet: rendelés-azonosító, új állapot, verziószám.
4. Kliens: üzenetre és minden újracsatlakozáskor teljes lista lekérése az API-ból; a verziószám kiszűri az elavult üzenetet. Ha az Ably kapcsolat 10 mp-nél tovább nincs meg, 10 mp-enkénti lekérdezés, amíg vissza nem jön.

**Elfogadási feltételek.**

- [ ] A webhooktól a Pult nézet kártyájáig 2 mp alatt (p95), éles környezetben mérve.
- [x] Vendégtoken csak a saját rendelésének csatornájára iratkozhat fel; publikálni senki nem tud a kliensről.
- [ ] Wi-Fi kikapcsolása majd visszakapcsolása után a Pult nézet a kiesés alatti rendeléseket is mutatja.

**Tesztelés.** Vitest a token-jogosultságokra; Playwright: két böngésző (vendég és pult), állapotváltás, késleltetésmérés; hálózatkiesés szimulálása (Playwright offline mód).

**Függőségek és kockázatok.** Függ: 21, 29, 30. Erre épül: 43, 54, 55, 63, 88. Kockázat: az ingyenes szint 200 egyidejű kapcsolata a pilotban elég (1 klub, 300 vendég alatt, ebből a QR-os rendelők élő oldala), több klubnál nem; a váltást a 117. feladat méri.

#### 32. Stripe Connect onboarding

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 32 | Stripe Connect onboarding | `apps/api/app/v1/stripe/connect/`, `apps/api/app/webhooks/stripe/route.ts` | Nincs | Kapcsolt fiók nélkül a pénz nem jut el a klubhoz | 🔴 | M |

**Jelenlegi állapot.** Döntés: Connect Express fiókok; a Tulaj az Admin Kifizetések moduljában köti be a Stripe-ot (bankszámla, cégadatok) és választ utalási gyakoriságot (napi vagy heti). A HQ a helyszínlistában mutatja a Stripe-ellenőrzés (KYC) állapotát.

**Probléma.** Amíg a kapcsolt fiók nem fogadhat terhelést, a klub nem kaphat rendelést. Direct charge mellett az Apple Pay webes használatához a domaint minden kapcsolt fiókon regisztrálni kell.

**Megoldás.**

1. `POST /v1/stripe/connect/account`: Express fiók létrehozása (`country: HU`, `card_payments` és `transfers` képesség), a `stripeAccountId` a Venue-ba.
2. `POST /v1/stripe/connect/link`: Account Link (return és refresh URL az Admin Kifizetések oldalára).
3. Webhook (Connect-végpont): `account.updated` → a Venue `chargesEnabled`, `payoutsEnabled` és a hiányzó adatok listája frissül.
4. `chargesEnabled` után: a `rendel.namitiszunk.hu` payment method domain regisztrálása a kapcsolt fiókon (Apple Pay, Google Pay).
5. Utalási gyakoriság: a Tulaj választása a fiók `settings.payouts.schedule` mezőjébe; Express Dashboard belépőlink a Tulajnak.
6. A rendelésfelvétel csak `chargesEnabled` helyszínen engedélyezett.

**Elfogadási feltételek.**

- [ ] Teszt módban egy új klub az onboardingot végigviszi, és az Admin „Aktív” állapotot mutat.
- [ ] Hiányzó adatnál az Admin megmutatja, mi hiányzik, és új Account Linket ad.
- [x] Onboarding előtt a rendelős oldal nem enged fizetni.
- [ ] Az Apple Pay gomb megjelenik a kapcsolt fiók rendelős oldalán (Safari, iPhone).

**Tesztelés.** Stripe CLI-vel `account.updated` események indítása; Vitest a webhook-feldolgozóra rögzített eseményekkel; kézi onboarding teszt módban a Stripe teszt adataival.

**Függőségek és kockázatok.** Függ: 1, 5, 20, 29. Erre épül: 33, 59, 67, 68. Kockázat: Express fiókoknál a kapcsolt fiók negatív egyenlegéért (visszatérítés, vitatott terhelés) végső soron a platform felel, ha a klub nem fedezi. Ezt a pilotmegállapodásban (3.) rendezni kell.

#### 33. Fizetés: PaymentIntent direct charge, application fee, webhook

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 33 | Fizetés: PaymentIntent direct charge, application fee, webhook | `packages/core/src/payments/`, `apps/api/app/webhooks/stripe/route.ts` | Nincs | Ez a termék magja; a rendelés csak a webhook után kerül a pultra | 🔴 | L |

**Jelenlegi állapot.** Döntések: PaymentIntent a helyszín kapcsolt fiókján (direct charge); a jutalék application fee; a fizetést a Stripe webhookja zárja le, nem a böngésző; dupla koppintás ellen idempotencia; a nyugtához az e-mail a tárca vagy a kártya adataiból jön; fizetés előtt készlet-újraellenőrzés.

**Probléma.** A pénz és a rendelés két rendszerben él. Ha a webhook elveszik, kétszer érkezik vagy rossz sorrendben, a vendég fizet, de a pult nem kap rendelést, vagy fordítva.

**Megoldás.**

1. `POST /v1/orders` (`Idempotency-Key` a kliens pénztár-munkamenetéből): ellenőrzés (helyszín nyitva, pult nem szünetel, utolsó rendelési idő, tételek elérhetők, max. tétel); árszámítás (22.); Order „Fizetésre vár”; PaymentIntent a kapcsolt fiókon (`stripeAccount`) `amount`, `currency: huf`, `application_fee_amount`, automatikus fizetési módok, metadata (`orderId`, `venueId`, PostHog-azonosító); válasz: `client_secret` és vendégtoken.
2. Webhook (Connect-végpont): aláírás-ellenőrzés; az eseményazonosító egyedi indexszel tárolva, így az ismétlés hatástalan. `payment_intent.succeeded` → Payment rekord, e-mail a fizetési módból, rövid szám (24.), átmenet Új-ba (21.). `payment_intent.payment_failed` → állapotváltás nincs, a vendég újrapróbálhat.
3. 15 perc után fizetés nélkül: a PaymentIntent visszavonása és Megszakítva (35.).
4. Napi egyeztetés (35.): a Stripe sikeres terhelései és az adatbázis rendelései összevetve; eltérésnél riasztás (17.).

**Elfogadási feltételek.**

- [x] Rendelés csak a webhook után kerül Új állapotba, a böngésző visszajelzése nem vált állapotot.
- [x] Ugyanaz a webhook-esemény háromszor küldve egy Payment rekordot és egy állapotváltást ad.
- [x] Dupla koppintás a fizetés gombon egy PaymentIntentet és egy terhelést ad.
- [ ] Az application fee a Stripe Dashboardon egyezik a 22. feladat számításával.
- [x] Elfogyott tétel esetén a PaymentIntent nem jön létre, a kosár frissül.

**Tesztelés.** Vitest a webhook-feldolgozóra rögzített eseményekkel (ismétlés, rossz sorrend, hibás aláírás). Playwright E2E teszt módban Stripe CLI-továbbítással: kártya, 3D Secure teszt kártya, elutasított kártya (78.).

**Függőségek és kockázatok.** Függ: 1, 21, 22, 24, 29, 32. Erre épül: 34, 42, 43, 56, 87. Kockázat: a Stripe a webhookot órákig újrapróbálja, ha az API nem elérhető; ilyenkor a rendelés késik. Ezért van egyeztetés, és ezért riaszt a 17. a webhook hibáira.

#### 34. Visszatérítés

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 34 | Visszatérítés | `packages/core/src/payments/refund.ts` | Nincs | Elutasítás és menedzseri visszatérítés nélkül a pult nem tud hibát kezelni | 🔴 | M |

**Jelenlegi állapot.** Döntések: elutasítás csak Új állapotban, automatikus teljes visszatérítéssel; átadás után csak Manager vagy Tulaj térít vissza, teljesen vagy részben, okkal, naplózva; a pilotban nincs limit; lejáratkor a klub beállítása szerint automatikus visszatérítés; a HQ support célból a klub nevében is visszatéríthet; a platformdíj mindig visszajár (`refund_application_fee`).

**Probléma.** A Stripe-hívás külső művelet, nem görgethető vissza adatbázis-tranzakcióval. Dupla kattintás vagy időtúllépés dupla visszatérítést okozhat.

**Megoldás.**

1. `refundOrder(orderId, amount | 'full', reason, actor)`: jogosultság és Manager-limit ellenőrzése (23.); összeg ≤ a még vissza nem térített rész.
2. Tranzakcióban: Refund rekord `pending` állapotban + audit (26.).
3. Stripe: `refunds.create` a kapcsolt fiókon, `refund_application_fee: true`, `metadata.refundId`, idempotencia-kulcs = a Refund azonosítója.
4. Webhook (`charge.refunded`, `refund.updated`) → Refund `succeeded` vagy `failed`; teljes visszatérítésnél átmenet Visszatérítve-be (21.); a vendég push és e-mail értesítést kap.
5. Sikertelen visszatérítés: Admin-figyelmeztetés és riasztás.

**Elfogadási feltételek.**

- [ ] Elutasításkor a teljes összeg és az application fee is visszajár (Dashboardon ellenőrizve).
- [ ] Részleges visszatérítésnél az application fee arányos része jár vissza.
- [x] A vissza nem térített résznél nagyobb összeg 409-et ad.
- [x] Ugyanaz a visszatérítés kétszer indítva egy Stripe-refundot hoz létre.
- [x] Pultos PIN-nel átadás után a visszatérítés 403.

**Tesztelés.** Vitest (összeghatárok, jogosultság, idempotencia); teszt módban teljes és részleges visszatérítés Stripe CLI-vel, az application fee visszajárásának ellenőrzése.

**Függőségek és kockázatok.** Függ: 21, 22, 23, 26, 33. Erre épül: 54, 56, 69, 99. Kockázat: a kártyára visszatérített összeg napok múlva érkezik meg; a vendégnek szóló üzenet ezt megmondja. A kapcsolt fiók egyenlegét terheli; ha nincs fedezet, a 32. feladat kockázata él.

#### 35. Háttérfeladatok (Inngest)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 35 | Háttérfeladatok (Inngest) | `apps/api/src/inngest/` | Nincs | Lejárat, emlékeztető, megszakított fizetések, heti riport és adattörlés időzítést igényel | 🔴 | M |

**Jelenlegi állapot.** Döntés: Inngest (lejárt rendelések, riportok, egyeztetés). Időzített szabályok: lejárat Kész után 30 perc (15–60), emlékeztető 10 perc után (push, emlékeztető SMS a platform költségén), heti e-mail riport, napi adattörlés.

**Probléma.** A Vercel-függvény nem várhat 30 percet. Időzítő nélkül a lejárat, az emlékeztető és a megszakított fizetések lezárása elmarad.

**Megoldás.** `apps/api/app/api/inngest/route.ts` (serve), függvények:

1. `order/payment-timeout`: rendelés létrehozása + 15 perc → ha még Fizetésre vár, PaymentIntent visszavonása, Megszakítva.
2. `order/pickup-reminder`: Kész + 10 perc → push, vagy ha az nincs és a vendég SMS-t kért, emlékeztető SMS; átvételkor visszavonva (`cancelOn`).
3. `order/expire`: Kész + a helyszín határideje → Lejárt, és ha be van kapcsolva, visszatérítés (34.).
4. `order/notify`: állapotváltásra push, SMS és e-mail a doksi értesítési sorrendje szerint.
5. `stripe/reconcile`: naponta 07:30 (`Europe/Budapest`), Stripe-terhelések és visszatérítések az adatbázissal összevetve.
6. `retention/daily` (28.) és `reports/weekly` (62.).

Preview környezetben az Inngest branch environment fut; események egyedi azonosítóval, így az ismétlés nem dupláz.

**Elfogadási feltételek.**

- [x] A 10 percen belül átvett rendelésnél nem megy emlékeztető.
- [x] A határidő után a rendelés 1 percen belül Lejárt.
- [x] A 15 percig fizetetlen rendelés Megszakítva, a PaymentIntent visszavonva.
- [x] Az egyeztetés egy szándékosan törölt teszt rendelésnél riaszt.

**Tesztelés.** `@inngest/test` egységtesztek minden függvényre (alvás és visszavonás szimulálása); Inngest dev szerverrel helyi végigjátszás.

**Függőségek és kockázatok.** Függ: 14, 21, 29. Erre épül: 28, 34, 36, 37, 62, 90. Kockázat: ha az Inngest nem éri el az API-t, az időzítések késnek; az Inngest-hibák a Sentrybe és a riasztásba (17.) mennek.

#### 36. SMS (Twilio)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 36 | SMS (Twilio) | `packages/core/src/notify/sms.ts` | Nincs | App nélkül az SMS az egyetlen megbízható „Kész” jelzés | 🔴 | S |

**Jelenlegi állapot.** Döntések: Twilio; az SMS csak akkor megy, ha nincs push és a vendég megadta a számát; ékezet nélkül, 160 karakter alatt (1 szegmens); a klub kikapcsolhatja; kéréskor fix 35 Ft az application fee-ben, az emlékeztetőt a platform állja; csak magyar (+36) számra (2026-11-02).

**Probléma.** Egy ékezetes karakter UCS-2 kódolásra vált, és az üzenet több szegmensre esik (dupla költség). Nyitott számbevitelt SMS-csalásra lehet használni.

**Megoldás.**

1. Telefonszám: `libphonenumber-js`, E.164, csak `+36`; más országnál a pénztár jelzi, hogy az élő oldal jelez.
2. Szövegek (ékezet nélkül, a link rövid vendégtokennel): Kész („Na mit iszunk: #214 kesz! Vedd fel a Main Bar pultnal. \[link\]”) és emlékeztető („Meg var rad az italod a Main Bar pultnal”).
3. `toGsm7()`: ékezetmentesítés és ellenőrzés, hogy minden karakter GSM-7 és ≤ 160.
4. Twilio Messaging Service, kézbesítési státusz callbackkel; helyszínenkénti SMS-darabszám a HQ Pénzügynek.
5. Védelem: Twilio Geo Permissions csak Magyarország; rendelésenként legfeljebb 2 SMS (Kész + emlékeztető).

**Elfogadási feltételek.**

- [x] Minden kiküldött szöveg GSM-7 és legfeljebb 160 karakter, a leghosszabb pultnévvel is.
- [x] Külföldi számot a pénztár nem fogad el SMS-hez.
- [x] Ha a vendégnek van push tokenje, SMS nem megy.
- [x] Az SMS-kérés rendelésnél 35 Ft-tal növeli az application fee-t.

**Tesztelés.** Vitest a `toGsm7()`-re (ő, ű, é és a leghosszabb pultnév); Twilio teszt hitelesítő adatokkal a magic számokra; egy valódi SMS a saját számodra a preview-ból.

**Függőségek és kockázatok.** Függ: 22, 35. Erre épül: 43, 54. Kockázat: a Twilio küldőazonosító-szabályai országonként eltérnek; ha Magyarországon az alfanumerikus küldő („NaMitIszunk”) nem érhető el, Twilio-számról megy az SMS.

#### 37. E-mail (Resend + React Email)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 37 | E-mail (Resend + React Email) | `packages/emails/` | Nincs | Belépési link, meghívó, visszaigazolás, problémajelzés és leadek | 🔴 | M |

**Jelenlegi állapot.** Döntések: Resend + React Email; „Ez nem nyugta” visszaigazolás e-mailben; problémajelzés e-mailben a klubnak és a platformnak; elutasítás és visszatérítés pushsal és e-mailben; céges postafiók nincs.

**Probléma.** A magic link e-mail nélkül nincs belépés, meghívó nélkül nincs Manager és Tulaj. A spambe kerülő levél a belépést blokkolja.

**Megoldás.**

1. `packages/emails`: React Email sablonok közös fejléccel és lábléccel, magyarul és angolul (15.):
   - belépési link; személyzeti meghívó (Manager, Tulaj);
   - rendelés-visszaigazolás („Ez nem nyugta”), elutasítás és visszatérítés;
   - problémajelzés (klubnak és neked, rendelésszámmal);
   - új lead (neked); onboarding-emlékeztető (68.); heti riport (62.).
2. Küldés `sendEmail(template, to, data)` függvénnyel, az Inngesten át (újrapróbálás). Küldő: `noreply@namitiszunk.hu`; válaszcím: rendeléses leveleknél a klub e-mailje, a lead- és problémaléveleken a tiéd.
3. Vendégnek csak akkor megy levél, ha van e-mail-címe (tárca, kártya vagy kézi megadás).

**Elfogadási feltételek.**

- [ ] Minden sablon mindkét nyelven renderel, és Gmailben, Apple Mailben sötét módban is olvasható.
- [x] A visszaigazolás láthatóan tartalmazza az „Ez nem nyugta” feliratot.
- [ ] A magic link levél Gmailben a beérkezőbe érkezik (nem spam).

**Tesztelés.** Vitest snapshot a renderelt HTML-re; React Email előnézeti szerver; küldés a Resend teszt címeire (kézbesített, visszapattant).

**Függőségek és kockázatok.** Függ: 5, 15, 35. Erre épül: 30, 44, 46, 57, 62, 68, 72. Kockázat: új küldő domain eleinte alacsony hírnevű; az első hetekben a küldött mennyiség kicsi, és a DMARC-jelentéseket figyelni kell.

#### 38. Képfeltöltés (Vercel Blob)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 38 | Képfeltöltés (Vercel Blob) | `apps/api/app/v1/uploads/route.ts` | Nincs | Termékképek, logók és borítóképek tárolása | 🟠 | S |

**Jelenlegi állapot.** Döntés (2026-11-02): Vercel Blob a Cloudflare R2 helyett, mert az R2 saját domainje Cloudflare DNS-t igényelne. Termékkép opcionális; a menü oldal képei optimalizáltak (next/image, AVIF).

**Probléma.** Ha a kép az API-n keresztül töltődik fel, a Vercel-függvény méretkorlátja és ideje gondot okoz; ellenőrizetlen feltöltéssel bárki bármit feltölthet.

**Megoldás.**

1. Kliensoldali feltöltés a `@vercel/blob` `upload()` függvényével; a token a `/v1/uploads` végpontból jön, csak Manager vagy Tulaj jogosultsággal.
2. Korlátok a tokenben: JPEG, PNG vagy WebP, legfeljebb 5 MB; útvonal `venues/{venueId}/{uuid}`.
3. Megjelenítés next/image-dzsel (`remotePatterns` a Blob hostjára), AVIF/WebP változattal.
4. Csere vagy törlés után a régi fájl törlése (`del()`).

**Elfogadási feltételek.**

- [x] Pultos vagy másik klub tagja nem kap feltöltési tokent.
- [x] 6 MB-os vagy PDF fájl feltöltése elutasítva.
- [x] A menü oldalon a kép AVIF-ben, a képernyőméretnek megfelelően érkezik.

**Tesztelés.** Vitest a token-végpont jogosultságára és korlátaira; Playwright: feltöltés az Adminban, megjelenés a rendelős oldalon.

**Függőségek és kockázatok.** Függ: 14, 23, 29. Erre épül: 10, 51, 58. Kockázat: a Vercel Blob forgalma és tárhelye a Pro csomagon felül díjköteles; a next/image gyorsítótár csökkenti a közvetlen letöltéseket.

#### 39. Típusos API kliens

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 39 | Típusos API kliens | `packages/api-client/` | Nincs | A mobilapp és a webes kliensoldali hívások ezt használják | 🟠 | S |

**Jelenlegi állapot.** A doksi: `packages/api-client` típusos kliens a mobilappnak; a típusok és a Zod sémák a közös csomagokból jönnek.

**Probléma.** Kézzel írt `fetch`-hívásokkal a mobilapp és az API szétcsúszik, és a hibák csak futás közben derülnek ki.

**Megoldás.**

1. Vékony kliens `fetch`-re: `createApiClient({ baseUrl, getToken })`, végpontonkénti függvényekkel (`orders.create`, `orders.get`, `menu.get`, `realtime.token` stb.), a `packages/validators` sémáival a be- és kimenetre.
2. Hibák a 29. feladat formátumában, típusos `ApiError`-ként.
3. A `orders.create` automatikusan küld `Idempotency-Key`-t, és hálózati hibánál ugyanazzal a kulccsal újrapróbál (legfeljebb 3-szor).

**Elfogadási feltételek.**

- [x] Ha egy API-séma változik, a kliens hívóinál a typecheck hibát ad.
- [x] A szerver érvénytelen válasza `ApiError`-t dob, nem csendes hibát.
- [x] Az újrapróbált rendeléslétrehozás egy rendelést ad.

**Tesztelés.** Vitest MSW-vel (mock szerver): siker, hibakódok, újrapróbálás ugyanazzal a kulccsal.

**Függőségek és kockázatok.** Függ: 25, 29. Erre épül: 43, 84–96. Kockázat: kicsi; a kliens csak a közös sémákat használja, saját típust nem definiál.

### E. Rendelős oldal (vendég, web)

#### 40. Menü oldal

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 40 | Menü oldal | `apps/order/app/[locale]/v/[slug]/page.tsx` | Nincs | A vendégek többsége itt találkozik a termékkel; 4G-n 2 mp alatt kell betöltenie | 🔴 | L |

**Jelenlegi állapot.** A doksi: `/v/[helyszín]?bar=[pult]&zone=[zóna]` URL a QR-kódból; fejléc (logó, borító, név, állapot: Nyitva / Szünetel X percig / Zárva, becsült várakozás, pult); rögzített kategóriasáv, keresés, termékkártyák; korhatár-kapu egyszer, az eszköz megjegyzi; nyelv a böngészőből, egy gombbal váltható; az angol név és leírás opcionális, ha üres, a magyar látszik; a VIP termékek csak a VIP asztali QR-ról látszanak; szerveroldalon renderelt, gyorsítótárazott menü; kezdeti JS 150 KB alatt, LCP 2,5 mp alatt 4G-n. Az eseménymenü (101.) és az időzített happy hour (100.) a pilot után jön.

**Probléma.** Ez az első képernyő, zsúfolt helyen, gyenge hálózaton. Ha lassú, vagy elfogyott tételt mutat, a vendég visszamegy a pulthoz sorba állni.

**Megoldás.**

1. Server Component; az adat a `packages/core` `getPublicMenu(slug, zoneId)` függvényéből jön (archivált tétel nincs benne, VIP tétel csak VIP zónánál, a zónát a szerver dönti el). Next.js gyorsítótár `menu:{venueId}` címkével; az Admin menümódosítása (51.) és az elfogyott kapcsoló (54.) frissíti. Megvalósítva (51.): a gyorsítótár kulcsában a `Venue.menuVersion` van, minden menüt érintő írás a `bumpMenuVersion`-nel emeli (`@namitiszunk/core/menu`), mert az Admin másik Vercel projekt, onnan `revalidateTag` nem éri el a rendelős appot.
2. Élő adatok Ably nélkül (a 200 kapcsolatos kerethez, 31.): az oldal 30 mp-enként, csak látható fülön lekéri a `/api/venues/[slug]/status` végpontot: állapot, `pausedUntil`, becsült várakozás, elfogyott tételek azonosítói.
3. Becsült várakozás: a pult utolsó 30 percében elkészült rendelések medián elkészítési ideje (`paidAt` → `readyAt`, a döntés szerinti definíció); 3 rendelés alatt nem jelenik meg.
4. Kategóriasáv görgetéskor követett aktív kategóriával; keresés a betöltött menüben (név, leírás), szerverhívás nélkül.
5. Termékkártya: név, ár (`Intl` forintformázás a nyelv szerint, 15.), kép (next/image, AVIF, az első 4 azonnal, a többi lustán), „Elfogyott” címke letiltott gombbal.
6. Pult: a QR-paraméterből; egy pultos helyszínen nincs választó (a több pult felülete a 97.). A QR-kód `q` paramétere (az 53. feladat /q/\[kód\] átirányítása adja, a beolvasásszámot az növeli) a `menu_viewed` esemény forrása lesz (18.).
7. Korhatár-kapu: teljes képernyős „Elmúltam 18 éves” kérdés az első látogatáskor, a válasz localStorage-ban; „Nem” válaszra tájékoztató oldal, rendelés nincs.
8. Nyelv: next-intl middleware az `Accept-Language` fejlécből, HU/EN gomb a fejlécben.

**Elfogadási feltételek.**

- [ ] A seed demo helyszín (60 tétel, képekkel) menüje mobil Lighthouse-mérésen (4G-fojtás) 2,5 mp alatti LCP-t ad.
- [x] Az oldal saját kezdeti JavaScriptje a keretrendszer-alap (React, Next.js, next-intl; kb. 146 KB gzip) felett legfeljebb 50 KB (gzip, a build kimenete szerint). Döntés 2026-11-08: az eredeti 150 KB-os teljes korlát a jelenlegi stackkel nem érhető el.
- [x] Elfogyottra állított tétel új betöltéskor azonnal, nyitott oldalon 30 mp-en belül „Elfogyott”.
- [x] VIP tétel csak VIP zónás QR-URL-lel látszik; a `zone` paraméter elhagyásával vagy átírásával nem.
- [x] A korhatár-kapu eszközönként egyszer jelenik meg.

**Tesztelés.** Vitest a `getPublicMenu`-re (VIP-szűrés, archivált tétel, angol tartalék) és a várakozási mediánra; Playwright: QR-URL → menü, keresés, kategóriaugrás, nyelvváltás, korhatár-kapu; a mérések a 49. feladat Lighthouse CI-jában.

**Függőségek és kockázatok.** Függ: 11, 15, 16, 18, 20, 27. Erre épül: 41, 48, 49, 86. Kockázat: a gyorsítótárazott menü rövid ideig elavult lehet. Ezért fut a 30 mp-es állapotlekérés, és ezért ellenőriz újra a kosár (41.) és a fizetés (33.).

#### 41. Termék lap és kosár

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 41 | Termék lap és kosár | `apps/order/components/product-sheet/`, `apps/order/components/cart/` | Nincs | Opciók, mennyiség, tételkorlát és készlet-újraellenőrzés nélkül nincs rendelés | 🔴 | M |

**Jelenlegi állapot.** A doksi: alulról felcsúszó termék lap (kép, leírás, ár, kötelező és választható opciók, allergének, alkohol %; mennyiség, megjegyzés); lebegő kosárgomb és kosárlap; max. 10 tétel rendelésenként (a klub állíthatja); minimum rendelés nincs (a klub bekapcsolhatja); fizetés előtt készlet-újraellenőrzés. Adatmodell: ModifierGroup (kötelező, min/max választás), Modifier (felár).

**Probléma.** Ha a kosár mást számol, mint a szerver, vagy elfogyott tétel jut el a fizetésig, a vendég a fizetésnél akad el, a legrosszabb ponton.

**Megoldás.**

1. Termék lap: shadcn Drawer (16.), fókuszcsapdával. Opciócsoportonként rádiógomb (max. 1) vagy jelölőnégyzet (max. N); a „Kosárba” gomb csak érvényes választásnál aktív, és az árat a felárakkal együtt mutatja. Megjegyzés tételenként legfeljebb 100 karakter, a Pult nézet kártyáján látszik.
2. Validáció a `packages/validators` közös Zod sémájával (25.), a kliensen és a szerveren ugyanazzal.
3. Kosár: helyszínenként localStorage-ban, újratöltés után is megmarad. A részösszeget a 22. feladat közös függvénye számolja; a szerver a fizetésnél újraszámol, és az a mérvadó.
4. Tételkorlát: a mennyiségek összege legfeljebb a helyszín `maxItems` értéke; fölötte a gomb letiltva, üzenet a korláttal.
5. Kosárlap: tételek opciókkal, mennyiség és törlés, részösszeg. A borravaló, a promóciós kód, a szervizdíj és a végösszeg a pénztárban (42.) van, hogy a végösszeg egy helyen, a fizetés gomb fölött látszódjon.
6. „Tovább”: `validateCart` Server Action. Elfogyott, archivált vagy árváltozásos tételnél a kosár frissül, az üzenet tételenként szól („A Gin tonic közben elfogyott”).

**Elfogadási feltételek.**

- [x] Kötelező opció nélkül a tétel nem tehető kosárba, és a lap megmondja, mi hiányzik.
- [x] A 11. tétel hozzáadása alap beállításnál letiltva, üzenettel.
- [x] A kosár részösszege feláras opciókkal is megegyezik a szerver számításával.
- [x] A kosárba tett, majd az Adminban elfogyottra állított tétel a „Tovább” gombnál kikerül, üzenettel.
- [x] A kosár az oldal újratöltése után is megvan.

**Tesztelés.** Vitest az opcióvalidációra (min/max, kötelező) és a kosár-újraellenőrzésre; Playwright: opciós tétel kosárba, korlát, elfogyás a kosárban; billentyűzetes és képernyőolvasós bejárás a lapon (49.).

**Függőségek és kockázatok.** Függ: 16, 20, 22, 25, 40. Erre épül: 42, 47, 86. Kockázat: sok opciós tételeknél a lap kis képernyőn hosszú lesz; a „Kosárba” gomb ezért a lap alján rögzített.

#### 42. Pénztár és fizetés

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 42 | Pénztár és fizetés | `apps/order/app/[locale]/v/[slug]/checkout/` | Nincs | Apple Pay, Google Pay, kártya, Stripe Link, borravaló, szervizdíj és promóciós kód egy képernyőn | 🔴 | L |

**Jelenlegi állapot.** A doksi: átvételi pult, telefonszám (opcionális, SMS-hez), e-mail (opcionális), Apple Pay / Google Pay / kártya, 18+ jelölő, ÁSZF; borravaló 5 / 10 / 15% vagy egyéni, alapból 0%; szervizdíj % vagy fix, alapból ki; promóciós kód; kártyamentés Stripe Linkkel; céges számla a pilot után (104.). Döntés (2026-11-02): SMS csak itt, fizetés előtt kérhető, mert a klubot terhelő 35 Ft az application fee-ben megy, ami fizetés után nem módosítható. A rendelés tárolja az elfogadott ÁSZF-verziót (3.).

**Probléma.** Itt válik a kosár pénzzé. Minden plusz mező és minden félreérthető hibaüzenet elvesztett rendelés; a dupla koppintás dupla terhelés lehet.

**Megoldás.**

1. Összesítő a fizetés gomb fölött: tételek, részösszeg, kedvezmény, szervizdíj, borravaló, végösszeg (22.). Borravaló: 5 / 10 / 15% / Egyéni (Ft) chipek, alapból egyik sincs kiválasztva.
2. Promóciós kód: `applyPromo` Server Action; érvénytelen vagy lejárt kódnál fordított üzenet (a kódok korlátai a 60.).
3. Mezők: telefonszám (opcionális), mellette: „SMS-t küldünk, ha kész. Később már nem kérhető.” Csak `+36` (36.). E-mail (opcionális; a tárcából vagy kártyából is jöhet). Egy jelölő: „Elmúltam 18 éves, és elfogadom az ÁSZF-et”, az aktuális verzióra linkelve.
4. Fizetés Stripe Elements-szel, késleltetett PaymentIntent-létrehozással: `loadStripe(pk, { stripeAccount })`, Elements `mode: 'payment'`, összeggel és `huf` pénznemmel. Express Checkout Element (Apple Pay, Google Pay, Link) és Payment Element (kártya), `locale: 'hu'` vagy `'en'`. Borravaló- vagy kódváltozáskor `elements.update({ amount })`.
5. Fizetés gomb: `elements.submit()` → `createOrder` Server Action (a 33. feladat közös `packages/core` függvénye, a pénztár megnyitásakor generált, sessionStorage-ban tartott idempotencia-kulccsal) → `client_secret`, rendelés-azonosító, vendégtoken → `stripe.confirmPayment`, `return_url` = `/o/[id]?t=[token]`. A token már a megerősítés előtt az eszközre kerül (43.).
6. A `createOrder` újraellenőriz (nyitva, pult nem szünetel, utolsó rendelési idő, elérhetőség, tételkorlát, kód, összeg). Eltérésnél 409 és hibakód, a felület a 48. feladat szerint reagál.
7. Fizetés közben a gomb letiltva, „Ne zárd be” réteg. A Stripe-hibákat az Elements a választott nyelven írja ki; a saját hibakódokhoz next-intl kulcsok tartoznak.

**Elfogadási feltételek.**

- [x] A borravaló alapból 0, a végösszeg minden kombinációban egyezik a 22. feladat képletével.
- [ ] Kártyafizetés, 3D Secure teszt kártya és elutasított kártya teszt módban helyes üzenettel lefut.
- [x] Dupla koppintás a fizetés gombon egy rendelést és egy terhelést ad.
- [x] Megadott magyar telefonszámnál az application fee 35 Ft-tal nagyobb; külföldi számot a mező nem fogad el.
- [x] Szünetelő pultnál a fizetés gomb letiltva.
- [x] A rendelésen ott van az elfogadott ÁSZF-verzió.
- [ ] Apple Pay iPhone-on Safariban, Google Pay Androidon Chrome-ban megjelenik és fizet (a zárt teszten, 8.).

**Tesztelés.** Vitest a `createOrder` újraellenőrzéseire; Playwright helyben, Stripe teszt módban, Stripe CLI-webhooktovábbítással (a preview-ban nincs Stripe webhook, 14.): sikeres, 3D Secure és elutasított kártya, promóciós kód, dupla koppintás. Apple Pay és Google Pay valódi eszközön, a zárt teszten (8.) éles módban, utána visszatérítéssel.

**Függőségek és kockázatok.** Függ: 3, 22, 30, 32, 33, 36, 41. Erre épül: 43, 48, 78. Kockázat: a Stripe Link elérhetősége direct charge-nál a kapcsolt fiók fizetésimód-beállításától függ. Ha a kapcsolt fiókon nem kapcsolható be, a kártyamentés kimarad, a fizetés nélküle is működik.

#### 43. Élő állapot oldal

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 43 | Élő állapot oldal | `apps/order/app/[locale]/o/[orderId]/page.tsx` | Nincs | A vendég itt látja, mikor veheti át; Kész állapotban erre néz rá a pultos | 🔴 | M |

**Jelenlegi állapot.** A doksi: `/o/[rendelés]?t=[token]`, „Ne zárd be ezt az oldalt”; rendelésszám, állapotsáv, becsült idő, tételek, pult neve. Kész állapotban teljes képernyős zöld jelzés, nagy rendelésszám, folyamatosan mozgó színes háttér (képernyőfotó ellen), hang, rezgés, villogó fülcím. Műveletek: problémajelzés (46.), app letöltése, lemondás csak kézi elfogadású klubnál, elfogadás előtt. A token az eszközön tárolódik, az SMS-link is ide visz. SMS utólag nem kérhető (2026-11-02).

**Probléma.** A böngésző hangot csak felhasználói érintés után játszik le, és a fizetés utáni átirányítás nem számít érintésnek. Az iOS Safari a háttérbe tett vagy lezárt képernyőjű lapon leállítja a JavaScriptet és a kapcsolatot, és rezgést nem támogat.

**Megoldás.**

1. A szerver a rendelést azonosító és token-hash alapján tölti be (30.); a kliens feliratkozik az `order:{id}` csatornára (31.). Újracsatlakozáskor és a lap újra láthatóvá válásakor (`visibilitychange`) teljes lekérés; ha az Ably 10 mp-nél tovább nem él, 10 mp-es lekérdezés.
2. Nézetek állapotonként (21.): Fizetésre vár („Fizetés feldolgozása”), Új („Megkaptuk”), Készül, Kész, Átvéve (átirányítás a Köszönjük oldalra, 45.), Elutasítva és Visszatérítve (ok és visszatérített összeg), Lejárt, Megszakítva. VIP rendelésnél Kész állapotban: „Az asztalodhoz visszük”.
3. Hang: a lap tetején „Hang bekapcsolása” gomb; az érintés feloldja a Web Audio `AudioContext`-et. Kész állapotban hang, `navigator.vibrate`, ahol támogatott (Android), és villogó fülcím.
4. Screen Wake Lock Új, Készül és Kész állapotban, ahol a böngésző támogatja, hogy a képernyő ne aludjon el. Ahol nem, a szöveg mondja meg: „Hagyd nyitva az oldalt, különben nem tudunk szólni.”
5. Kész képernyő: teljes képernyős zöld, nagy `#214`, CSS-animált színes háttér és másodpercre ketyegő óra, hogy a pultos lássa: nem képernyőfotó. `prefers-reduced-motion` mellett az animáció lassabb, az óra marad. Az állapotváltásokat `aria-live` régió olvassa fel.
6. Lemondás gomb csak kézi elfogadású helyszínen, Új állapotban: átmenet Elutasítva-ba és teljes visszatérítés (34.).
7. Az eszköz localStorage-a a nyitott rendeléseket (azonosító, token, helyszín) tárolja; a menü oldalon sáv jelzi: „Folyamatban lévő rendelésed van”. Az app-letöltés gomb csak akkor látszik, ha az app már az áruházakban van (95.).

**Elfogadási feltételek.**

- [ ] A pultos Kész jelölése után az előtérben lévő oldal 2 mp-en belül vált, hangot játszik (bekapcsolt hangnál), Androidon rezeg.
- [ ] A telefon lezárása és feloldása után az oldal az aktuális állapotot mutatja.
- [x] Token nélkül vagy rossz tokennel 404.
- [x] Lemondás gomb automatikus elfogadású klubnál nem jelenik meg.
- [ ] A Kész képernyő háttere és órája folyamatosan mozog, csökkentett mozgás beállítás mellett is.

**Tesztelés.** Vitest az állapot → nézet leképezésre; Playwright két böngészővel (vendég és pult), offline szimulációval; kézi teszt valódi iPhone-on (Safari) és Androidon (Chrome): hang, Wake Lock, rezgés, lezárás.

**Függőségek és kockázatok.** Függ: 21, 30, 31, 33, 42. Erre épül: 45, 46, 48, 88. Kockázat: régebbi iOS-verziókon nincs Wake Lock, és lezárt telefonon a weboldal nem tud szólni. Ott az SMS az egyetlen megbízható jelzés, ezért a pénztár felajánlja.

#### 44. Visszaigazolás oldal (nem nyugta)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 44 | Visszaigazolás oldal (nem nyugta) | `apps/order/app/[locale]/r/[orderId]/page.tsx` | Nincs | A vendégnek igazolás kell a fizetésről, a nyugtával összetéveszthetetlen formában | 🟠 | S |

**Jelenlegi állapot.** Döntések: „Ez nem nyugta” feliratú visszaigazolás a `/r/[rendelés]` oldalon és e-mailben, a hivatalos nyugtát a klub pénztárgépe adja. Tartalom (2026-11-02): tételek, összegek, fizetés ideje és módja, a klub cégadatai, rendelésszám; ÁFA bontás nincs; PDF a böngésző nyomtatásával.

**Probléma.** A vendégnek igazolás kell (például vitához vagy elszámoláshoz), de ha a lap nyugtának látszik, az adóügyi félreértés.

**Megoldás.**

1. URL: `/r/[id]?t=[token]` (a vendégtoken itt is kötelező, 30.), link az élő oldalról, a Köszönjük oldalról és a visszaigazoló e-mailből (37.).
2. Tartalom: felül és a nyomtatási nézetben is jól látható „Ez nem nyugta” felirat; rendelésszám és dátum; tételek opciókkal és árakkal; részösszeg, kedvezmény, szervizdíj, borravaló, végösszeg; fizetés ideje és módja (kártyamárka és utolsó 4 számjegy, vagy Apple Pay / Google Pay); a klub neve, címe és adószáma (58.); visszatérítések, ha voltak.
3. Nyomtatási stíluslap: világos háttér, „Nyomtatás / PDF” gomb (`window.print()`).
4. „Küldd el e-mailben”: ha nincs e-mail-cím, megadható; rendelésenként legfeljebb 3 küldés.

**Elfogadási feltételek.**

- [x] A „Ez nem nyugta” felirat a képernyőn és a nyomtatott PDF-en is az első sorban van.
- [x] Az oldalon nincs ÁFA bontás.
- [x] Visszatérített rendelésnél a visszatérítés összege és ideje is szerepel.
- [x] Token nélkül 404; a negyedik e-mailes küldés elutasítva.

**Tesztelés.** Vitest a tartalom összeállítására (visszatérítéssel és anélkül); Playwright: oldal megnyitása, PDF-nyomtatás (`page.pdf()`), e-mail küldése a Resend teszt címére.

**Függőségek és kockázatok.** Függ: 30, 33, 37, 58. Erre épül: 45, 47, 89. Kockázat: a könyvelő (2.) más tartalmat kérhet; a tartalom egy függvényben áll össze, így egy helyen változtatható.

#### 45. Értékelés és Köszönjük oldal

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 45 | Értékelés és Köszönjük oldal | `apps/order/app/[locale]/o/[orderId]/thanks/` | Nincs | Pilot visszajelzés és újrarendelés | 🟡 | S |

**Jelenlegi állapot.** A doksi: Köszönjük oldal értékeléssel, visszaigazolás-linkkel és „Rendelj még” gombbal; Review entitás (csillag, szöveg) a rendeléshez; az Admin Értékelések modulja (64.) rendelésenként és trendben mutatja.

**Probléma.** Értékelés nélkül a pilotban nincs vendégoldali mérőszám; újrarendelési gomb nélkül a vendég a második italnál a pulthoz megy.

**Megoldás.**

1. Az élő oldal Átvéve állapotban ide irányít (`?t=[token]`); más állapotban az oldal az élő oldalra vezet vissza.
2. Értékelés: 1–5 csillag rádiócsoportként (billentyűzettel is), opcionális szöveg legfeljebb 500 karakter; rendelésenként egy (egyedi index a rendelés-azonosítón).
3. „Rendelj még”: vissza a menüre ugyanazzal a pulttal és zónával; „Rendeld újra”: a mostani rendelés még elérhető tételei a kosárba kerülnek.
4. Visszaigazolás-link (44.); app-letöltés gomb csak az app megjelenése után (95.).

**Elfogadási feltételek.**

- [x] Értékelni csak Átvéve állapotú rendelést lehet, egyszer.
- [ ] Az értékelés 1 percen belül megjelenik az Admin Értékelések listájában (64.).
- [ ] A „Rendeld újra” az elfogyott tételt kihagyja, és ezt jelzi.

**Tesztelés.** Vitest (egyszeri értékelés, állapotfeltétel); Playwright: átvétel → értékelés → „Rendeld újra”.

**Függőségek és kockázatok.** Függ: 20, 41, 43, 44. Erre épül: 64, 82. Kockázat: kicsi; az értékelések száma a pilotban alacsony lehet, ezért a Kapu 2 nem épül rá.

#### 46. Problémajelzés

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 46 | Problémajelzés | `apps/order/components/report-problem/`, `apps/api/app/v1/orders/[id]/report/route.ts` | Nincs | A pilotban e-mailben kell eljutnia a klubhoz és a platformhoz | 🟠 | S |

**Jelenlegi állapot.** Döntések: problémajelzés e-mailben a klubnak és a platformnak, rendelésszámmal (pilot); formája (2026-11-02): kötelező kategória (Nem kaptam meg / Rossz vagy hiányos rendelés / Fizetési probléma / Egyéb) és opcionális szöveg. A 37. feladat szerint a problémalével válaszcíme a tiéd.

**Probléma.** Ha a vendég nem kapta meg az italát, és nincs hova szólnia, vitatott terhelést indít a bankjánál. Az a klubnak drága, és a platform felelősségi kockázata (32.).

**Megoldás.**

1. „Problémát jelzek” gomb az élő oldalon (fizetés után minden állapotban), a Köszönjük és a visszaigazolás oldalon; lapon kategória, szöveg (max. 1000 karakter), e-mail-cím (előtöltve, ha ismert).
2. `packages/core` `reportProblem(orderId, token, data)`: a jelzés a rendelésbe ágyazva tárolódik (kategória, szöveg, időpont), nem kell új entitás (20.); rendelésenként legfeljebb 3 jelzés.
3. E-mail az Inngesten át (35., 37.) a klub e-mail-címére és neked: rendelésszám, helyszín, pult, állapot, végösszeg, kategória, szöveg, a vendég e-mailje (ha megadta), link az Admin rendelésoldalára (56.).
4. Webről Server Action, a mobilappból a `/v1/orders/[id]/report` végpont hívja ugyanazt a függvényt.

**Elfogadási feltételek.**

- [ ] A jelzés e-mailje 1 percen belül megérkezik a klubnak és neked, minden fenti adattal.
- [x] Kategória nélkül nem küldhető; a negyedik jelzés ugyanarra a rendelésre 429.
- [x] Token nélkül 404.
- [ ] A jelzés az Admin rendelésoldalán látszik (56.).

**Tesztelés.** Vitest a `reportProblem`-re (korlát, token); Playwright: jelzés az élő oldalról, e-mail a Resend teszt címére.

**Függőségek és kockázatok.** Függ: 20, 29, 30, 35, 37. Erre épül: 56, 69, 88. Kockázat: a klub e-mail-címe hiányozhat vagy elavult lehet; az onboarding (68.) kötelezővé teszi, és a másolat mindig hozzád is megérkezik.

#### 47. Webes vendégfiók

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 47 | Webes vendégfiók | `apps/order/app/[locale]/fiok/` | Nincs | A döntés szerint már a pilotban kell (előzmények, újrarendelés, GDPR) | 🟠 | M |

**Jelenlegi állapot.** Döntések: rendeléshez nem kell fiók; opcionális webes vendégfiók az MVP-ben; belépés Apple-lel, Google-lel vagy e-mailes linkkel (30.); inaktív fiók 2 év után törlődik (28.). A pilotban (2026-11-02): rendelési előzmények, „Rendeld újra”, adatexport és fióktörlés; a kedvencek az appal jönnek.

**Probléma.** A visszatérő vendégnek nincs hol megnéznie a korábbi rendeléseit, és a GDPR szerinti hozzáférést és törlést fiókos felhasználónál biztosítani kell.

**Megoldás.**

1. Belépés a fejléc fiók ikonjáról; a pénztár nem kér belépést, de belépett vendégnél előtölti az e-mailt, és a rendelés `userId`-t kap.
2. Belépéskor az eszközön tárolt rendelések (azonosító és token, 43.) a szerver token-ellenőrzése után a fiókhoz kerülnek. E-mail-egyezés alapján nem kapcsolunk rendelést, mert az más eszközön leadott rendelést is felfedne.
3. `/fiok`: előzmények (helyszín, dátum, összeg, állapot, link a visszaigazolásra), „Rendeld újra” (41., 45.).
4. Adatexport: JSON letöltés (profil, rendelések, értékelések, problémajelzések).
5. Fióktörlés megerősítéssel: a User és a munkamenetek törlődnek, a rendelésekről leválik a `userId`, a pénzügyi adat 8 évig marad (28.); audit (26.).

**Elfogadási feltételek.**

- [ ] Belépés mindhárom módon működik; a munkamenet-süti a T-030 szerint alkalmazásonkénti nevű (`nmi-order.*`) a `.namitiszunk.hu` szülődomainen, és az API csak a rendelős app `Origin`-jével fogadja el (más app munkamenete 401).
- [x] Belépés után az eszköz korábbi rendelései az előzményekben vannak, más eszközéi nem.
- [x] Az export minden, a vendéghez kötött személyes adatot tartalmaz.
- [ ] Törlés után a belépés új fiókot hoz létre, a régi rendelések a klub riportjában név nélkül megmaradnak.

**Tesztelés.** Vitest a rendelés-hozzárendelésre és a törlésre; Playwright: magic link belépés, előzmények, export, törlés.

**Függőségek és kockázatok.** Függ: 26, 28, 30, 41, 44. Erre épül: 89. Kockázat: a pilotban kevés vendég regisztrál; a funkció fő haszna a GDPR-kötelezettség teljesítése.

#### 48. Hibaállapotok és szélső esetek

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 48 | Hibaállapotok és szélső esetek | `apps/order/components/states/` | Nincs | Szünet, zárva, elfogyott, sikertelen fizetés, kapcsolatvesztés: csúcsidőben ezek a gyakoriak | 🔴 | M |

**Jelenlegi állapot.** A doksi 10 esetet rögzít: pult szünetel; helyszín zárva; elfogyott a kosárba tétel után; sikertelen fizetés; fizetett, de megszakadt a kapcsolat; a pult nem tudja elkészíteni; nem veszi fel X percig; rossz pultnál áll; dupla koppintás; kiskorú átvételkor. Utolsó rendelés zárás előtt 15 perccel (állítható).

**Probléma.** Csúcsidőben ezek nem kivételek, hanem a megszokott esetek. Ha bármelyik zsákutca, a vendég a pultosnál reklamál, és a pult lelassul.

**Megoldás.** Minden esetnek külön komponense és fordítási kulcsa van, és mindegyikben van következő lépés gomb:

1. Pult szünetel: sárga sáv visszaszámlálással (`pausedUntil`), a kosár megmarad, a fizetés tiltott; a szünet végén a sáv magától eltűnik (40. állapotlekérés).
2. Zárva és utolsó rendelés után: nyitvatartás és következő nyitás; a menü böngészhető, kosárba tenni nem lehet.
3. Elfogyott: a 41. és a 42. újraellenőrzése, tételenkénti üzenettel.
4. Sikertelen fizetés: Stripe-üzenet a választott nyelven, „Újrapróbálás” és „Más fizetési mód”; a rendelés Fizetésre vár marad (33.).
5. Megszakadt kapcsolat fizetés után: a menü oldal sávja a tárolt rendelésre mutat (43.), az SMS-link is oda visz.
6. Elutasítva: az ok („A Mojito elfogyott”) és „A teljes összeget visszatérítettük”, összeggel; gomb vissza a menüre.
7. Lejárt: a helyszín szabálya szerinti szöveg (visszatérítéssel vagy anélkül), problémajelzés gombbal (46.).
8. Rossz pult: a pultos átteszi a rendelést (54.); az élő oldal az új pult nevét mutatja.
9. Dupla koppintás: idempotencia (42., 33.), egy rendelés.
10. Kiskorú: a pultos nem adja át, a Manager térít vissza az Adminban (56.); a vendég a Visszatérítve nézetet látja.

A doksi listáján túl: nincs internet (sáv és automatikus újrapróbálás); nem létező vagy még nem aktív helyszín („Ez a hely még nem fogad rendelést”, 32.); váratlan hiba (`error.tsx` „Újrapróbálás” gombbal, Sentry-eseménnyel).

**Elfogadási feltételek.**

- [x] Mind a 13 eset Playwright-tesztben reprodukálható, a várt szöveggel, mindkét nyelven (`apps/order/e2e/states.spec.ts`; a 4. és a 9. a `checkout.spec.ts`-ben; a 8. a pult átrakása nélkül, az a 54.-kel jön).
- [x] Egyik eset sem zsákutca: mindegyikben van továbbvezető gomb, vagy magától folytatódik (szünet vége, kapcsolat visszajön).
- [x] Szünet alatt a kosár megmarad, és a szünet lejárta után újratöltés nélkül lehet fizetni.

**Tesztelés.** Playwright esetenként, a seed adatokból (27.) és a `packages/core` függvényeivel előkészített állapottal; offline eset Playwright offline móddal.

**Függőségek és kockázatok.** Függ: 15, 21, 27, 33, 34, 35, 40–43. Erre épül: 78, 81. Kockázat: a fordítások száma itt a legnagyobb; a hiányzó kulcsot a 15. feladat CI-ellenőrzése fogja meg.

#### 49. Teljesítmény és akadálymentesség

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 49 | Teljesítmény és akadálymentesség | `apps/order/` egésze | Nincs mérve | JS 150 KB alatt, LCP 2,5 mp alatt, WCAG 2.1 AA a doksi szerint | 🟠 | M |

**Jelenlegi állapot.** A doksi: menü oldal kezdeti JS 150 KB alatt, LCP 2,5 mp alatt 4G-n; sötét téma alapból, nagy gombok (legalább 48 px), magas kontraszt; egy kézzel használható, a fő műveletek a képernyő alján; WCAG 2.1 AA, képernyőolvasóval használható rendelési folyamat.

**Probléma.** A célértékek mérés nélkül csendben romlanak: egy új könyvtár vagy egy nagy kép elég, és a pilot estén derül ki.

**Megoldás.**

1. Lighthouse CI a GitHub Actionsben (13.) a preview deployon: menü, kosár, pénztár és élő oldal a seed demo helyszínnel, mobil profillal. Költségvetés: LCP ≤ 2,5 mp, a menü oldal saját JS-e ≤ 50 KB gzip a keretrendszer-alap felett (döntés 2026-11-08, lásd 40.); túllépésnél a PR piros.
2. Csomagméret: alapból Server Component; a Stripe.js csak a pénztárban, az Ably kliens csak az élő oldalon töltődik; a PostHog a betöltés után, tétlen időben; betűtípus next/fonttal, `latin-ext` készlettel (ő, ű).
3. Valós mérés: `useReportWebVitals` → PostHog-esemény (LCP, INP, CLS), helyszínenként szűrhető (18.).
4. Akadálymentesség: `@axe-core/playwright` minden rendelős oldalon a Playwright-tesztekben, 0 súlyos vagy kritikus hibával; fókuszkezelés a lapokon (41.); a színpárok kontrasztja legalább 4,5:1 a 16. feladat tokenjeiben; érintési felületek legalább 48 px.
5. Kézi bejárás: teljes rendelés VoiceOverrel (iPhone) és TalkBackkel (Android), teszt módban.

**Elfogadási feltételek.**

- [x] A JS-költségvetés a fő ágon zöld, és túllépésnél pirosít: `e2e/js-budget.perf.ts` a production buildön, a szerver HTML-jében hivatkozott chunkokból számol (menü 195,7, pénztár 192,4, élő oldal 193,9 KB gzip a 196-ból). Bizonyítás: az élő oldal a statikusan betöltött Ablyval 229,8 KB-tal bukott; az Ably azóta az első rajzolás után töltődik.
- [ ] LCP ≤ 2,5 mp: a Lighthouse CI méri, de egyelőre csak figyelmeztet. Döntés 2026-11-08: a szimulált mobil LCP 3,2–4,5 mp, futásonként 1–2 mp-et szór, a megfigyelt LCP 1,5 mp alatt van. Akkor lesz kötelező, ha a CI-futások tartják a 2,5 mp-et.
- [x] Az axe-ellenőrzés minden rendelős oldalon 0 hibát ad (`e2e/a11y.spec.ts`, hu és en; a kosár, a pénztár és a fizetés lépései a saját specjeikben).
- [ ] Egy teljes rendelés VoiceOverrel és TalkBackkel is végigvihető (kézi, lásd lent).
- [x] Minden gomb és vezérlő legalább 48 × 48 px (`e2e/a11y.spec.ts`; a szövegbe ágyazott link kivétel, WCAG 2.5.8).

**Tesztelés.** JS-költségvetés, Lighthouse CI és axe a CI-ban; kézi képernyőolvasós bejárás a zárt teszt előtt (8.). A Web Vitals valós mérése (3. pont) a 18. feladattal jön.

**Kézi képernyőolvasós ellenőrzőlista** (VoiceOver iPhone-on, TalkBack Androidon, Stripe teszt mód, hu és en):

1. Korhatár-kapu: a cím és a két gomb felolvasva, a menü mögötte nem érhető el.
2. Menü: a helyszín állapota (nyitva, szünetel, zárva) felolvasva; a kategóriasáv és a termékkártyák nevükkel és árukkal; a nyelvváltó és a fiók link névvel.
3. Terméklap: megnyitáskor a fókusz a lapon, a módosítók csoportnévvel, a hiba felolvasva; bezárás után a fókusz vissza a kártyára.
4. Kosár és pénztár: a mennyiség, a végösszeg és a borravaló változása felolvasva; a fizetés hibája és a szünet sávja egyszer, élő régióból.
5. Élő oldal: az állapotváltás (elfogadva, kész) magától felolvasva; a „Kész” képernyő átvételi kódja számjegyenként érthető.
6. Köszönjük oldal és fiók: az értékelés, az „Újra rendelem” és a bejelentkezés űrlap mezői címkével.

**Függőségek és kockázatok.** Függ: 13, 14, 16, 18, 40–48. Erre épül: 81. Kockázat: a React és a Next.js futásidejű kódja magában is a 150 KB nagy része; ha a költségvetés nem tartható, a build csomagelemzése mutatja meg, mi fér még bele. A Stripe Elements akadálymentességét a Stripe adja, azt nem tudjuk módosítani.

### F. Klub Admin

#### 50. Admin váz és navigáció

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 50 | Admin váz és navigáció | `apps/admin/app/(dashboard)/layout.tsx` | Nincs | Szerepkör szerinti menü és a globális Nyitva / Szünetel kapcsoló | 🔴 | M |

**Jelenlegi állapot.** A doksi: bal oldali menü (Irányítópult, Pult nézet, Rendelések, Menü, Pultok és QR-kódok, Események, Akciók, Személyzet, Riportok, Kifizetések, Értékelések, Beállítások, Díjak és számlák); felső sáv: helyszínváltó, globális „Rendelés: Nyitva / Szünetel” kapcsoló, értesítések, profil; a menüpontok szerepkör szerint. A Manager telefonon is használja. Az Események modul a pilot után jön (101.).

**Probléma.** Ha a menü csak elrejti a modult, de a szerver nem ellenőriz, a Manager URL-lel eléri a Tulaj felületeit.

**Megoldás.**

1. `(dashboard)` layout: oldalsáv asztali gépen, alsó menü és fiók telefonon; a menüpontok a 23. feladat jogosultságaiból (Tulaj: mind; Manager: Irányítópult, Pult nézet, Rendelések, Menü, Pultok, Személyzet (csak pultos és VIP-host), Riportok napi nézete, Értékelések).
2. Minden oldal és Server Action elején `requirePermission` (23.); írásnál audit (26.).
3. Globális kapcsoló: a helyszín minden pultját szünetelteti, időkorlát nélkül, amíg vissza nem kapcsolják (a pultonkénti 5 / 10 / 15 perces szünet a Pult nézetben van, 54.); megerősítő ablakkal, audittal.
4. Helyszínváltó csak akkor látszik, ha a felhasználó több helyszín tagja (a láncfelület a 98.).
5. Értesítések: harang ikon a problémajelzésekkel (46.), a sikertelen visszatérítésekkel (34.) és a „Nyugta beütve” jelölés nélküli rendelésekkel (56.).
6. Munkamenet az admin aldomainre (30.); a klubtagoknál a 2FA választható a profilban.

**Elfogadási feltételek.**

- [x] Manager-fiókkal a Tulaj-modulok URL-je 403, a menüben nem látszanak.
- [x] A globális Szünetel után a rendelős oldal minden pultnál sárga sávot mutat, a fizetés tiltott (48.).
- [x] Az Admin 375 px széles telefonon vízszintes görgetés nélkül használható.

**Tesztelés.** Playwright szerepkörönként (Tulaj, Manager): látható menüpontok, tiltott URL-ek, globális szünet; mobil nézet.

**Függőségek és kockázatok.** Függ: 16, 23, 26, 30. Erre épül: 51–65. Kockázat: a globális szünet időkorlát nélküli, ezért bekapcsolva maradhat; az Irányítópult (63.) és a felső sáv vörösen jelzi.

#### 51. Menü modul

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 51 | Menü modul | `apps/admin/app/(dashboard)/menu/` | Nincs | A klub tölti fel a menüt; enélkül nincs mit rendelni | 🔴 | L |

**Jelenlegi állapot.** A doksi: kategóriák, termékek, opciócsoportok, árak, képek, állapotok; létrehozás, szerkesztés, húzásos sorrend, duplikálás, elrejtés, elfogyottra állítás; melyik pulton kapható; allergén, alkohol %, ÁFA-kulcs; menüelemet nem törlünk, csak archiválunk; a rendelési tétel pillanatképet tárol; opcionális angol név és leírás. Az árszabály (happy hour) a pilot után jön (100.), a CSV-import külön feladat (52.).

**Probléma.** A pilot klub maga tölti fel a menüt. Ha nehézkes, a bevezetés csúszik; ha egy mentés nem jut el a rendelős oldalra, rossz ár vagy elfogyott tétel látszik.

**Megoldás.**

1. Kategória-lista húzásos sorrenddel (dnd-kit), alatta a termékek szintén húzhatóan; kategóriánként „Csak VIP” jelölő (ezek a tételek csak VIP zónából látszanak, 40.).
2. Termék űrlap: név, leírás (magyar, opcionálisan angol), ár egész forintban, ÁFA-kulcs (5 / 18 / 27%), alkohol %, allergének (az EU 14 allergénje jelölőkkel), kép (38.), pultok (alapból mind), elérhető.
3. Opciócsoportok: név, kötelező, min/max választás, opciók felárral; több termékhez is hozzárendelhető.
4. Duplikálás, archiválás (végleges törlés nincs), elfogyott kapcsoló a listában egy érintéssel.
5. Mentés Server Actionnel, Zod-validációval (25.), audittal (26.), utána a menü verziója nő (`Venue.menuVersion`, 40.); a `revalidateTag` helyett ez, lásd ARCHITECTURE.
6. „Előnézet” gomb: a rendelős oldal az adott pulttal, új lapon.

**Elfogadási feltételek.**

- [ ] Egy 40 tételes menü opciókkal, képekkel 1 órán belül felvihető (a pilot klub előtt saját magad mérve).
- [x] Mentés után a rendelős oldal új betöltéskor az új árat mutatja.
- [x] Archivált termék a régi rendelésekben változatlan névvel és árral látszik.
- [x] „Csak VIP” kategória tételei sima QR-ról nem látszanak.
- [x] Pultos PIN-nel a menü módosítása 403.

**Tesztelés.** Vitest a menü-Server Actionekön (validáció, jogosultság, revalidálás); Playwright: termék opciókkal, sorrendezés, elfogyott, előnézet.

**Függőségek és kockázatok.** Függ: 20, 23, 25, 26, 38, 50. Erre épül: 40, 52, 54, 63. Kockázat: az ÁFA-kulcs a visszaigazoláson nem jelenik meg (44.), csak a riportokban; a helyes kulcs a klub felelőssége.

#### 52. Menü import CSV-ből

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 52 | Menü import CSV-ből | `apps/admin/app/(dashboard)/menu/import/` | Nincs | Gyorsítja a klub beállítását a pilot előtt | 🟠 | S |

**Jelenlegi állapot.** Döntés: CSV menüimport az MVP-ben; az onboarding varázsló egyik lépése a menü import (68.).

**Probléma.** A klubok menüje Excelben vagy a kassza rendszerében van. A magyar Excel pontosvesszővel és néha nem UTF-8 kódolással ment, ezért egy naív import ékezethibákat vagy egyetlen oszlopot ad.

**Megoldás.**

1. Letölthető sablon: `kategoria, nev, nev_en, leiras, leiras_en, ar, afa, alkohol, allergenek, csak_vip`.
2. Beolvasás papaparse-szal, elválasztó-felismeréssel (`,` vagy `;`), UTF-8 BOM kezelésével; nem UTF-8 fájlnál üzenet: „Mentsd CSV UTF-8 formátumban”.
3. Előnézet soronkénti hibákkal (Zod, 25.); importálni csak hibamentes fájlt lehet.
4. Import egy adatbázis-tranzakcióban: hiányzó kategóriák létrehozása, tételek hozzáadása; meglévő tételt nem ír felül. Opciócsoportok és képek az Adminban (51.).

**Elfogadási feltételek.**

- [x] Magyar Excelből mentett pontosvesszős CSV ékezethelyesen importálódik.
- [x] Hibás ár (szöveg vagy negatív) a sor számával jelenik meg, import nincs.
- [x] Megszakadt import után nem marad félig felvitt menü.

**Tesztelés.** Vitest minta-fájlokkal (vesszős, pontosvesszős, BOM-os, hibás sorok); Playwright: feltöltés, előnézet, import.

**Függőségek és kockázatok.** Függ: 25, 51. Erre épül: 68, 81. Kockázat: a kassza rendszerek exportja eltérő oszlopokat ad; a pilot klubnál a sablonba másolás kézi lépés marad.

#### 53. Pultok, zónák, VIP asztalok és QR-kódok

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 53 | Pultok, zónák, VIP asztalok és QR-kódok | `apps/admin/app/(dashboard)/bars/` | Nincs | A QR-kód a belépési pont; a VIP asztal QR-ja nyitja a VIP termékeket | 🔴 | M |

**Jelenlegi állapot.** A doksi: pultok (név, nyitva, max. aktív rendelés), zónák és asztalok, QR-kódok beolvasási statisztikával; letöltés PNG-ben és nyomtatható PDF asztali kártya és plakát sablonban a helyszín arculatával; minden VIP asztalon saját QR. Döntés (2026-11-02): a kapacitás elérése csak figyelmeztetés.

**Probléma.** A kinyomtatott QR-kód hetekig az asztalon marad. Ha a kód a pult vagy a helyszín nevét tartalmazza, minden átnevezés vagy átrendezés újranyomtatást jelent.

**Megoldás.**

1. Pultok: név, nyitva / zárva, max. aktív rendelés (opcionális; elérésekor figyelmeztetés, 54., 63.).
2. Zónák: név, típus (sima / VIP), pult. Minden VIP asztal külön VIP zóna, saját QR-kóddal.
3. A QR-kód rövid, változatlan URL-t kódol: `rendel.namitiszunk.hu/q/[kód]`. Az átirányítás a pillanatnyi hozzárendelés szerint a `/v/[slug]?bar=&zone=&q=` címre visz, és növeli a beolvasásszámot.
4. Letöltés: PNG (`qrcode` csomag) és PDF (`@react-pdf/renderer`): asztali kártya és A4-es plakát a helyszín logójával, színével (58.) és a zóna nevével.
5. Statisztika: beolvasások száma QR-kódonként, a rendelések QR-forrás szerint (61.).

**Elfogadási feltételek.**

- [ ] A pult átnevezése vagy a zóna másik pulthoz rendelése után a régi nyomtatott QR-kód az új beállításra visz.
- [ ] A VIP asztal QR-ja a VIP tételeket is mutatja, a sima QR nem.
- [ ] A PDF A4-en nyomtatva telefonnal 1 m-ről beolvasható.
- [ ] Minden beolvasás eggyel növeli a számlálót.

**Tesztelés.** Vitest az átirányításra és a számlálóra; Playwright: pult, VIP zóna, QR letöltése; kézi nyomtatási és beolvasási próba iPhone- és Android-kamerával.

**Függőségek és kockázatok.** Függ: 20, 50, 58. Erre épül: 40, 54, 55, 68, 81. Kockázat: sötét, fényes asztalfelületen a QR rosszul olvasható; a PDF fehér keretet és matt nyomtatási javaslatot ad.

#### 54. Pult nézet (PWA)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 54 | Pult nézet (PWA) | `apps/admin/app/pult/[barId]/` | Nincs | A pultosok egyetlen felülete; hangjelzés, PIN, Nyugta beütve, offline sáv | 🔴 | L |

**Jelenlegi állapot.** A doksi: böngészőben futó PWA, bármilyen tableten, fekvő tájolás, teljes képernyő, hangjelzés, Wake Lock; három oszlop: Új · Készül · Kész. Felső sáv: pult, óra, aktív rendelések, átlagos elkészítési idő, szünet (5 / 10 / 15 perc), online/offline, belépett pultos (PIN-nel váltható). Kártya: nagy rendelésszám, eltelt idő színkóddal (zöld 5 perc alatt, sárga 5–10, piros 10 felett), tételek opciókkal, kiemelt megjegyzés, 18+ ikon. Műveletek: Új → Készül, elutasítás okkal csak Új állapotban, „Nyugta beütve” pipa a PIN gazdájához naplózva, Kész, Átvéve, emlékeztető, Lejárt lista, csúcsidős összesítő, elfogyott kapcsoló, kódellenőrzés, áttétel másik pultra. Döntések (2026-11-02): az eszközre a Manager vagy a Tulaj lép be; offline csak olvasható lista; a kapacitás elérése csak figyelmeztetés. A tételenkénti elutasítás (99.), a bonnyomtató (114.) és a QR-beolvasás átvételkor (94.) a pilot után jön.

**Probléma.** Csúcsidőben egy pultos percenként több rendelést kezel, zajban, nedves kézzel. Ha egy rendelés nem szól, vagy a gomb két érintést kér, a pult visszatér a papírhoz.

**Megoldás.**

> Megjegyzés (51.): az elfogyott kapcsoló a `setItemAvailable`-t hívja (`@namitiszunk/core/menu`), vagy ha saját írást kap, ugyanabban a tranzakcióban `bumpMenuVersion`-t; különben a vendég a régi menüt látja.

1. Eszköz: a Manager vagy a Tulaj belép (30.), kiválasztja a pultot; PWA manifest (`display: fullscreen`, fekvő), kezdőképernyőre tehető. Pultosváltás: név kiválasztása, 4 jegyű PIN (30.); az első PIN-érintés feloldja a hangot (Web Audio) és kéri a Wake Lockot.
2. Adat: kezdőlista az API-ból, frissítés a `venue:{venueId}:bar:{barId}` csatornáról (31.), újracsatlakozáskor teljes szinkron. Új rendelésnél hang és villanó kártya.
3. Gombok legalább 64 px magasak, egy érintéssel működnek. Új kártya érintése → Készül (kézi módban ez az elfogadás is). A Készül kártyán „Nyugta beütve” kapcsoló (`receiptEnteredBy` a PIN gazdája, 26.) és „Kész” gomb. A Kész kártyán „Átvéve” gomb; VIP rendelésnél helyette „VIP-host viszi” felirat (55.).
4. Elutasítás az Új kártyán (hosszú érintés vagy menü): ok (Elfogyott / Egyéb). Elfogyottnál a pultos kijelöli a tételt, az elfogyottra áll; a rendelés teljes visszatérítéssel Elutasítva (34.).
5. Emlékeztető gomb a Kész kártyán: azonnal elküldi az emlékeztetőt, ha még nem ment ki (35., 36.), utána letiltva. A határidő után a kártya a Lejárt fiókba kerül.
6. Felső sáv: szünet 5 / 10 / 15 perc (`pausedUntil`), aktív rendelések (piros, ha eléri a kapacitást), átlagos elkészítési idő, online/offline jelző, számkereső (kódellenőrzés: a beírt szám kártyája kiemelve), „Termékek” fiók az elfogyott kapcsolókkal (revalidál, 40.), csúcsidős összesítő kapcsoló (azonos tétel és opció összeadva az Új és Készül oszlopból: „12× Cerveza”).
7. Áttétel: ha a helyszínen több pult van, a kártya menüjéből másik pultra tehető; az élő oldal az új pultot mutatja (43.).
8. Offline (döntés): piros sáv, a lista olvasható marad, minden gomb tiltva, amíg a kapcsolat vissza nem jön; utána teljes szinkron.

**Elfogadási feltételek.**

- [ ] Új rendelés a fizetéstől számítva 2 mp-en belül megjelenik, hanggal (31.).
- [ ] Minden állapotváltás egy érintés; a „Nyugta beütve” és minden művelet a belépett pultos nevével naplózódik.
- [ ] Wi-Fi kikapcsolásakor piros sáv és tiltott gombok; visszakapcsoláskor a kiesés alatti rendelések is megjelennek.
- [ ] A tablet 6 órán át nem alszik el (a pilot tabletén mérve).
- [ ] Elutasítás Elfogyott okkal: a tétel elfogyott, a vendég teljes visszatérítést kap.
- [ ] Az összesítő nézet a teszt adatokon helyesen adja össze az azonos tételeket.

**Tesztelés.** Vitest az összesítőre és a kártya-színkódra; Playwright tablet nézetben, két böngészővel (vendég és pult), offline móddal; kézi teszt a pilot tabletén (hang, Wake Lock, 6 órás futás) és egy régebbi iPaden.

**Függőségek és kockázatok.** Függ: 21, 23, 26, 30, 31, 34, 35, 36, 50, 53. Erre épül: 6, 48, 55, 61, 63, 81. Kockázat: régebbi iPadeken a Wake Lock nem működik; ott a tablet automatikus zárolását a beállításokban kell kikapcsolni (a betanító útmutatóban, 6.). Offline alatt a pult nem tud állapotot váltani; a pilot helyszínén a Wi-Fi-t a telepítéskor ellenőrizni kell (81.).

#### 55. VIP-host nézet

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 55 | VIP-host nézet | `apps/admin/app/vip/` | Nincs | A VIP palackrendelés MVP-funkció, a VIP-host ebből viszi ki | 🔴 | M |

**Jelenlegi állapot.** Döntések: a VIP rendelés a Pult nézetben is megjelenik, a pult elkészíti (Kész), a VIP-host nézetében „Kivinni” lesz, és az asztalnál Átvéve-re állítja; VIP-host név + PIN; lemondás nincs, az elutasítás és visszatérítés szabályai érvényesek. Eszköz (2026-11-02): a Manager vagy a Tulaj lép be rá, utána PIN.

**Probléma.** A VIP-host járkál, telefont tart a kezében, sötétben. Ha nem látja azonnal, melyik asztalhoz mi megy, a drága palack rossz asztalhoz kerül vagy késik.

**Megoldás.**

1. Álló tájolású telefonos nézet; eszköz és PIN mint az 54. feladatban.
2. Feliratkozás a `venue:{venueId}:vip` csatornára (31.).
3. Két lista: „Kivinni” (Kész VIP rendelések; nagy asztalnév, rendelésszám, tételek, eltelt idő) és „Készül” (Új és Készül, szürkén, hogy előre lássa).
4. „Átadva” gomb → Kész → Átvéve (21.), a VIP-host nevével naplózva.
5. Hang és rezgés (Android), ha egy rendelés Kész lesz; Wake Lock, ahol támogatott.
6. Offline: piros sáv, csak olvasható lista, mint az 54. feladatban.

**Elfogadási feltételek.**

- [ ] A pult Kész jelölése után a VIP rendelés 2 mp-en belül a „Kivinni” listában van, hanggal.
- [ ] Az „Átadva” után a rendelés Átvéve, és eltűnik a Pult nézetből is.
- [ ] Pultos PIN-nel a VIP-host nézet nem nyitható meg.

**Tesztelés.** Playwright mobil nézetben három böngészővel (vendég VIP QR-ról, pult, VIP-host); kézi teszt telefonon sötét helyiségben (olvashatóság).

**Függőségek és kockázatok.** Függ: 21, 23, 30, 31, 53, 54. Erre épül: 6, 81. Kockázat: ha a VIP-host a saját telefonját használja, arra a Manager fiókjával kell belépni; ezt a betanítás (6.) írja le, és műszak végén az Adminból kijelentkeztethető (57.).

#### 56. Rendelések modul, visszatérítés, export

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 56 | Rendelések modul, visszatérítés, export | `apps/admin/app/(dashboard)/orders/` | Nincs | Átadás után csak a menedzser térít vissza; a könyvelés CSV/Excel exportot kér | 🔴 | M |

**Jelenlegi állapot.** A doksi: lista szűrőkkel (dátum, pult, állapot, összeg, fizetési mód); részletek: tételek, idővonal (ki csinálta), vendég részben elrejtve, Stripe-azonosító; keresés rendelésszámra; teljes vagy részleges visszatérítés kötelező okkal; az Admin listázza a nyugta nélküli rendeléseket. Döntés: export CSV-ben és Excelben (rendelések, visszatérítések, borravaló, jutalék, időszakra szűrve); a pilotban a Managernek nincs visszatérítési limitje.

**Probléma.** A rövid rendelésszám naponta újraindul, ezért a „#214” önmagában több rendelést jelöl. A vendégadatok túlzott mutatása adatvédelmi kockázat.

**Megoldás.**

1. Lista szerveroldali lapozással; szűrők: üzleti nap (24.), pult, állapot, összegtartomány, fizetési mód, „Nyugta beütve hiányzik”, „Problémajelzés van”. Keresés rendelésszámra az adott üzleti napon.
2. Részletek: tételek pillanatképpel, összegek, idővonal (fizetve, elfogadva, kész, átvéve, ki), „Nyugta beütve” ki és mikor, problémajelzések (46.), visszatérítések; vendég: e-mail és telefon részben takarva (`k***@gmail.com`, `+36 30 *** **12`); Stripe PaymentIntent-azonosító.
3. Visszatérítés gomb Managernek és Tulajnak: teljes vagy részleges összeg, kötelező ok → `refundOrder` (34.). Új állapotban „Lemondás”: Elutasítva teljes visszatérítéssel.
4. Export: CSV és Excel (`exceljs`), időszakra; oszlopok: dátum, üzleti nap, rendelésszám, pult, állapot, részösszeg, kedvezmény, szervizdíj, borravaló, végösszeg, platformdíj, visszatérített összeg, fizetési mód, Nyugta beütve. Vendégadat nincs benne.

**Elfogadási feltételek.**

- [ ] A „#214” keresés a kiválasztott üzleti nap rendelését adja.
- [ ] Részleges visszatérítés ok nélkül nem indítható; a sikeres visszatérítés az idővonalon és az auditnaplóban látszik.
- [ ] A „Nyugta beütve hiányzik” szűrő pontosan a jelölés nélküli, már Készül állapotba lépett rendeléseket adja.
- [ ] Az Excel-export Excelben és Google Táblázatokban ékezethelyesen nyílik, összegei egyeznek a listáéval.

**Tesztelés.** Vitest a szűrőkre és az exportálóra; Playwright: keresés, részletek, részleges visszatérítés teszt módban, export letöltése.

**Függőségek és kockázatok.** Függ: 23, 24, 26, 34, 46, 50. Erre épül: 48, 61, 69. Kockázat: a telefonszám 30 nap után törlődik (28.), utána a részletekben sem látszik; ez szándékos.

#### 57. Személyzet modul

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 57 | Személyzet modul | `apps/admin/app/(dashboard)/staff/` | Nincs | Pultos, VIP-host név + PIN; Manager és Tulaj e-mailes meghívása | 🔴 | M |

**Jelenlegi állapot.** Döntések: pultos és VIP-host név + PIN, e-mail fiók nélkül; a Tulaj vagy a Manager veszi fel őket; Managert és Tulajt csak a Tulaj hív meg. A doksi: tagok, szerepkör, utolsó belépés, műveleti napló; letiltás. A felszolgálói szerepkör az asztalhoz szállítással jön (108.).

**Probléma.** A pultosok gyakran cserélődnek. Ha egy távozott pultos PIN-je él, vagy két pultos ugyanazt a PIN-t használja, a napló és a pultos riport (61.) értéktelen.

**Megoldás.**

1. Tagok listája: név, szerepkör, utolsó művelet, állapot (aktív / letiltva).
2. Pultos és VIP-host felvétele: név + PIN; a PIN 4 jegyű, helyszínen belül egyedi, argon2 hash (30.). PIN-csere a Tulajnak és a Managernek.
3. Manager és Tulaj meghívása csak a Tulajnak: e-mailes meghívó, 7 napig érvényes, egyszer használható link (30., 37.).
4. Letiltás: a PIN azonnal érvénytelen, a tag nyitott munkamenetei megszűnnek; a műveletei a naplóban maradnak.
5. Tagonkénti műveleti napló az auditból (26.), dátumra szűrve.
6. Eszközök: a belépett pult- és VIP-eszközök listája, „Kijelentkeztetés” gombbal (54., 55.).

**Elfogadási feltételek.**

- [ ] Manager nem tud Managert vagy Tulajt meghívni (403).
- [ ] Letiltás után a pultos PIN-je a tableten 1 percen belül nem működik.
- [ ] Már használt PIN nem adható ki másik tagnak ugyanabban a helyszínben.
- [ ] A lejárt meghívó linkje hibaüzenetet ad.
- [ ] A kijelentkeztetett eszköz újra Manager-belépést kér.

**Tesztelés.** Vitest (PIN-egyediség, letiltás, meghívó-lejárat); Playwright: meghívás Resend teszt címre, pultos felvétele és letiltása, eszköz kijelentkeztetése.

**Függőségek és kockázatok.** Függ: 23, 26, 30, 37, 50. Erre épül: 54, 55, 61, 68. Kockázat: a helyszínen belüli PIN-egyediség miatt a „PIN foglalt” üzenet elváruló, hogy egy PIN létezik; az eszközönkénti próbálkozási korlát (30.) véd a találgatás ellen.

#### 58. Beállítások

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 58 | Beállítások | `apps/admin/app/(dashboard)/settings/` | Nincs | Nyitvatartás, üzleti nap, arculat, rendelési szabályok, SMS, szervizdíj | 🔴 | M |

**Jelenlegi állapot.** A doksi: helyszín adatai (név, cím, cégadatok, adószám), nyitvatartás, arculat (logó, borító, szín), rendelési szabályok (szervizdíj alapból ki, % vagy fix; borravaló opciók; átvételi határidő 15–60 perc, alap 30, lejáratkor visszatérítés be/ki; automatikus elfogadás; max. tétel, alap 10; minimum rendelés, alapból nincs; utolsó rendelés zárás előtt, alap 15 perc), nyelvek, nyugta beállítások, SMS be/ki; előnézet. Üzleti nap kezdete helyszínenként, alap 6:00. Csak a Tulaj szerkeszti.

**Probléma.** Egy rossz beállítás (például nyitvatartás vagy szervizdíj) az egész estét érinti; egy túl világos arculati szín olvashatatlanná teszi a sötét rendelős oldalt.

**Megoldás.**

1. Fülök: Alapadatok (név, cím, cégnév, adószám formátumellenőrzéssel, kapcsolattartó e-mail a problémajelzésekhez, 46.); Nyitvatartás (naponként nyitás–zárás, éjfélen átnyúló is, például 22:00–05:00; üzleti nap kezdete); Arculat (logó, borító, kiemelő szín); Rendelés (a fenti szabályok); Értesítések (SMS be/ki, 35 Ft / SMS a klubnak).
2. Szervizdíj: Ki / % / Fix összeg (22.). Borravaló: be/ki és a három %-érték (alap 5 / 10 / 15), az „Egyéni” mindig ott van.
3. Kiemelő szín: kontrasztellenőrzés a sötét háttéren (legalább 4,5:1, 49.); ha kevés, a felület figyelmeztet, és a rendelős oldal az alap színt használja.
4. A „nyugta beállítások” a könyvelő válaszáig (2.) nyitott; a pilotban a „Nyugta beütve” kapcsoló mindig látszik a Pult nézetben.
5. Mentés audittal (26.), a menü-gyorsítótár és az állapotvégpont frissítésével (40.); „Előnézet” gomb.

**Elfogadási feltételek.**

- [ ] 22:00–05:00 nyitvatartásnál a rendelős oldal 04:45-től nem enged rendelni (utolsó rendelés 15 perccel zárás előtt), 05:00 után zárva mutatja a helyszínt.
- [ ] Fix szervizdíj beállítása után a pénztár végösszege a 22. feladat szerint változik.
- [ ] Rossz kontrasztú szín mentésekor figyelmeztetés, a rendelős oldal az alap színt mutatja.
- [ ] Manager-fiókkal a Beállítások 403.

**Tesztelés.** Vitest a nyitvatartás-számításra (éjfél, üzleti nap, óraátállítás `Europe/Budapest`-ben) és a kontrasztra; Playwright a fülekre.

**Függőségek és kockázatok.** Függ: 22, 23, 24, 26, 38, 50. Erre épül: 40, 44, 46, 53, 68. Kockázat: az óraátállítás éjszakáján (március és október utolsó vasárnapja) a nyitvatartás és az üzleti nap határa elcsúzhat; erre külön teszt van.

#### 59. Kifizetések (Stripe Connect)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 59 | Kifizetések (Stripe Connect) | `apps/admin/app/(dashboard)/payouts/` | Nincs | A Tulaj itt köti be a Stripe-ot; enélkül nem fogadhat fizetést | 🔴 | S |

**Jelenlegi állapot.** A doksi: Stripe-egyenleg, következő utalás, utalások listája, levont díjak (Stripe és platform), visszatérítések, vitatott terhelések; bekötés, utalási gyakoriság, export a könyvelőnek; csak a Tulaj. A bekötés logikája a 32. feladat.

**Probléma.** A Tulaj nem fogja a Stripe Dashboardot böngészni; ha nem látja egy helyen, mennyi pénz jön és mikor, az első kérdése hozzád fut be.

**Megoldás.**

1. Bekötés előtt: „Stripe bekötése” gomb (Account Link, 32.); hiányzó adatnál a hiányzó mezők listája és új link.
2. Bekötés után a kapcsolt fiók adatai a Stripe API-ból (`stripeAccount` fejléccel): egyenleg, következő utalás, utalások (`payouts.list`), egyenlegmozgások díjakkal (`balance_transactions.list`), vitatott terhelések.
3. Utalási gyakoriság: napi vagy heti (32.); „Stripe Express Dashboard” belépőlink.
4. Export: időszakos CSV és Excel az egyenlegmozgásokról (összeg, Stripe-díj, platformdíj, nettó, utalás azonosítója).

**Döntések (2026-11-13).** A levont díjak és a visszatérítések a lapon nem jelennek meg külön összesítőként: az exportban (egyenlegmozgásonként) és a Stripe Express Dashboardon látszanak. Az Express Dashboard link és a gyakoriság váltása kétlépcsős belépéssel megerősített munkamenetet kér (a Dashboardon a bankszámla is módosítható); a 2FA a `/profile` oldalon kapcsolható be (az 50. feladat hiányzó része).

**Elfogadási feltételek.**

- [ ] Teszt módban a lap összegei egyeznek a kapcsolt fiók Stripe Dashboardjával.
- [x] Vitatott terhelés esetén a lap tetején figyelmeztetés jelenik meg.
- [x] Manager-fiókkal a lap 403.

**Tesztelés.** Vitest a Stripe-válaszok feldolgozására rögzített mintákkal; kézi teszt teszt módban, Stripe CLI-vel létrehozott utalással és vitatott terheléssel.

**Függőségek és kockázatok.** Függ: 23, 32, 50. Erre épül: 68. Kockázat: a Stripe API-hívások lassabbak az adatbázisnál; a lap az adatokat 5 percig gyorsítótárazza, és „Frissítés” gombot ad.

#### 60. Akciók: promóciós kódok

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 60 | Akciók: promóciós kódok | `apps/admin/app/(dashboard)/promos/`, `packages/core/src/promos/` | Nincs | A döntés szerint a pilot előtt kell | 🟠 | M |

**Jelenlegi állapot.** Döntés: promóciós kód az MVP-ben. A doksi: létrehozás, korlátok (időszak, felhasználások száma, minimális összeg), leállítás, felhasználási statisztika; csak a Tulaj. Promo entitás: kód, típus, érték, korlátok. A kedvezmény a részösszegből jön le (22.). A happy hour (100.) és az első rendelés kedvezmény (fiók kell hozzá) a pilot után jön.

**Probléma.** A „felhasználások száma” korlát párhuzamos rendeléseknél túlléphető, ha a számlálás nem atomi; a megszakadt fizetés pedig feleslegesen elhasználhat egy felhasználást.

**Megoldás.**

1. Admin: kód (helyszínen belül egyedi, a kis- és nagybetű nem számít), típus (% vagy fix Ft), érték, érvényesség (kezdet–vég), max. felhasználás (opcionális), min. részösszeg (opcionális), aktív / leállítva.
2. `validatePromo(venueId, code, subtotal)` a pénztárnak (42.): érvényesség, aktív, minimum, elérhető felhasználás; hibakód fordítási kulccsal.
3. Foglalás: a `createOrder` (33.) feltételes `$inc`-kel foglal (`used < maxUses`); Megszakítva állapotnál (35.) a foglalás felszabadul. Rendelésenként egy kód.
4. Statisztika: felhasználások száma, összes kedvezmény, átlagos kosár a kóddal.

**Elfogadási feltételek.**

- [ ] 1 felhasználásos kóddal két párhuzamos rendelésből pontosan egy kap kedvezményt.
- [ ] A 15 perc után megszakított fizetés felszabadítja a felhasználást.
- [ ] Lejárt, leállított vagy minimum alatti kódnál a pénztár fordított üzenetet ad.
- [ ] A fix kedvezmény nem lehet nagyobb a részösszegnél (22.).

**Tesztelés.** Vitest a `validatePromo`-ra és párhuzamossági teszt `MongoMemoryReplSet`-en; Playwright: kód létrehozása, használata a pénztárban.

**Függőségek és kockázatok.** Függ: 20, 22, 23, 50. Erre épül: 42, 61. Kockázat: fiók nélkül a „vendégenként egyszer” korlát nem biztosítható; a megosztott kódot bárki használhatja, ezért a max. felhasználás a védelem.

#### 61. Riportok: napi riport, pultos riport, export

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 61 | Riportok: napi riport, pultos riport, export | `apps/admin/app/(dashboard)/reports/` | Nincs | A Kapu 2 mérése és a klub elszámolása erre épül | 🟠 | M |

**Jelenlegi állapot.** A doksi: bevétel napra, órára, termékre, pultra; elkészítési és átvételi idő; csúcsórák hőtérképe; borravaló; visszatérítések; rendelések QR-forrás szerint; dátumszűrés, időszak-összehasonlítás; Tulaj (Manager: napi nézet). Döntések: export CSV-ben és Excelben; pultos riport (rendelés/óra, átlagos elkészítési idő, borravaló) a PIN-ből; elkészítési idő = `paidAt` → `readyAt`; a Kapu 2 QR-aránya kézzel számolódik a klub Z-jelentéséből és ebből a riportból.

**Probléma.** A pilot sikere (Kapu 2: legalább 15% QR-arány, legfeljebb 5 perc átlagos elkészítési idő) ezekből a számokból dől el. Ha naptári napra számolunk, egy péntek éjszaka két napra esik szét.

**Megoldás.**

1. Minden riport üzleti napra (24.) és `Europe/Budapest` időzónára számol; MongoDB-aggregáció a 20. feladat indexeire.
2. Napi riport (Managernek is): rendelések, bevétel (végösszeg borravaló nélkül, a borravaló külön), átlagos kosár, átlagos és medián elkészítési idő, átlagos átvételi idő (`readyAt` → `pickedUpAt`), óránkénti bontás, top termékek, visszatérítések, lejárt rendelések.
3. Időszakos riport (Tulaj): napra, órára, termékre, pultra; hőtérkép (nap × óra); QR-forrás szerinti bontás (53.); két időszak összehasonlítása.
4. Pultos riport: a pultos által Kész-re állított rendelések száma, rendelés/óra (az első és az utolsó művelete közötti időre), átlagos Készül → Kész idő, és a borravaló a Kész-t jelölő pultoshoz rendelve.
5. Export: CSV és Excel minden nézetből (`exceljs`).

**Elfogadási feltételek.**

- [ ] Egy 22:00–04:00 közötti teszt este minden rendelése egy üzleti napon jelenik meg.
- [ ] A napi riport összegei egyeznek a Rendelések modul exportjával (56.).
- [ ] A pultos riport számai a seed adatokon kézzel ellenőrizve helyesek.
- [ ] Manager csak a napi nézetet látja.

**Tesztelés.** Vitest az aggregációkra rögzített adatokon (éjfél, üzleti nap, óraátállítás, visszatérítés); Playwright: szűrés, összehasonlítás, export.

**Függőségek és kockázatok.** Függ: 20, 23, 24, 50, 53, 54, 56, 57. Erre épül: 62, 63, 82. Kockázat: a borravaló pultoshoz rendelése (Kész-t jelölő) tájékoztató jellegű; a szétosztás a klub felelőssége, ezt a riport felülete kiírja.

#### 62. Heti riport e-mailben

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 62 | Heti riport e-mailben | `apps/api/src/inngest/weekly-report.ts`, `packages/emails/weekly-report.tsx` | Nincs | A döntés szerint a pilot előtt kell | 🟡 | S |

**Jelenlegi állapot.** Döntés: heti e-mail riport az MVP-ben; a doksi szerint a Riportok modulban kérhető.

**Probléma.** A Tulaj nem néz be naponta az Adminba; heti összefoglaló nélkül nem látja, hogy a rendszer hoz-e forgalmat.

**Megoldás.**

1. Inngest cron (35.) hétfőnként 09:00-kor, `Europe/Budapest`; az előző hét üzleti napjai (hétfőtől vasárnapig).
2. Tartalom (React Email, 37.): rendelések, bevétel, átlagos kosár, átlagos elkészítési idő, borravaló, visszatérítések, top 5 termék, változás az előző héthez képest, link a Riportokra. A számok a 61. feladat aggregációiból jönnek.
3. Címzettek: tagonkénti kapcsoló a Riportok modulban; a Tulajnál alapból be, a Managernél alapból ki. Rendelés nélküli héten nem megy levél.

**Elfogadási feltételek.**

- [ ] A levél számai egyeznek a Riportok modul ugyanarra a hétre szűrt adataival.
- [ ] Kikapcsolt tag nem kap levelet; rendelés nélküli héten senki sem.

**Tesztelés.** `@inngest/test` az időzítésre és a címzettekre; snapshot a renderelt levélre; küldés Resend teszt címre.

**Függőségek és kockázatok.** Függ: 35, 37, 61. Erre épül: –. Kockázat: kicsi.

#### 63. Irányítópult

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 63 | Irányítópult | `apps/admin/app/(dashboard)/page.tsx` | Nincs | A Manager élőben látja a terhelést és az elfogyott termékeket | 🟠 | M |

**Jelenlegi állapot.** A doksi: ma esti élő számok (bevétel, rendelésszám, átlagos kosár, átlagos elkészítési idő, aktív rendelések pultonként, várakozási idő trendje, top termékek, elfogyott termékek); szüneteltetés, elfogyottra állítás, ugrás a Pult nézetre; Manager és Tulaj. Döntés (2026-11-02): a kapacitás elérése figyelmeztetés.

**Probléma.** A Manager csúcsidőben a telefonján nézi, kell-e szüneteltetni vagy pultost átirányítani; ha a számok percekkel késnek, rossz döntést hoz.

**Megoldás.**

1. Az aktuális üzleti nap számai a 61. feladat aggregációiból; frissítés az Ably pultcsatornák eseményeire (31.), legfeljebb 5 mp-enként összevonva.
2. Kártyák: bevétel, rendelések, átlagos kosár, átlagos elkészítési idő; pultonként aktív rendelések (piros, ha elérik a kapacitást) és szünetállapot; várakozási idő az utolsó 3 órában, 15 perces bontásban; top 5 termék; elfogyott termékek.
3. Gyorsműveletek: pult szüneteltetése (5 / 10 / 15 perc) és globális szünet (50.), elfogyott be/ki, ugrás a Pult nézetre.
4. Figyelmeztetések: bekapcsolva felejtett globális szünet, lejárt rendelések, hiányzó „Nyugta beütve” (56.).

**Elfogadási feltételek.**

- [ ] Egy új rendelés 5 mp-en belül megjelenik az Irányítópult számaiban.
- [ ] A számok egyeznek a napi riporttal (61.) ugyanarra az üzleti napra.
- [ ] Telefonon (375 px) minden kártya és gyorsművelet elérhető.

**Tesztelés.** Vitest a várakozási trendre; Playwright mobil nézetben, párhuzamos teszt rendelésekkel.

**Függőségek és kockázatok.** Függ: 31, 50, 51, 54, 61. Erre épül: 81. Kockázat: minden nyitott Irányítópult egy Ably-kapcsolat; a pilotban ez 1–2 eszköz.

#### 64. Értékelések lista

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 64 | Értékelések lista | `apps/admin/app/(dashboard)/reviews/` | Nincs | Az értékelés csak akkor ér valamit, ha a klub látja | 🟡 | S |

**Jelenlegi állapot.** A doksi: csillagok és megjegyzések rendelésenként, az átlag trendje; szűrés, ugrás a rendelésre; Manager és Tulaj. Az értékelés a Köszönjük oldalon születik (45.).

**Probléma.** A rossz értékelés mellett ott kell lennie a rendelés adatának (pult, idő, elkészítési idő), különben nem derül ki, mi romlott el.

**Megoldás.**

1. Lista: csillag, szöveg, rendelésszám, üzleti nap, pult, elkészítési idő; szűrők: csillag, időszak, pult, „van szöveg”.
2. Felül: átlag és darabszám a kiválasztott időszakra, a heti átlag trendje.
3. Kattintás → a rendelés részletei (56.).

**Elfogadási feltételek.**

- [ ] Az új értékelés 1 percen belül a listában van.
- [ ] Az 1–2 csillagos szűrő csak azokat mutatja, és mindegyikből a rendelésre lehet ugrani.

**Tesztelés.** Vitest a szűrőkre és az átlagra; Playwright: értékelés a vendégoldalon, megjelenés a listában.

**Függőségek és kockázatok.** Függ: 45, 50, 56. Erre épül: 82. Kockázat: kicsi.

#### 65. Díjak és számlák

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 65 | Díjak és számlák | `apps/admin/app/(dashboard)/billing/` | Nincs | A Tulaj látja a havi jutalékot, az SMS-díjat és a számla számát | 🟡 | S |

**Jelenlegi állapot.** Döntések: pilot 1% kedvezményes jutalékkal, utána 3% alapértelmezés, klubonként állítható; a jutalék alapja a végösszeg borravaló nélkül; SMS-kérésnél 35 Ft az application fee-ben; jutalékszámla a pilotban kézzel a Számlázz.hu-ban, az API a pilot után (103.). Az Admin (2026-11-02) havonta összegeket és a számla számát mutatja; a PDF-et a Számlázz.hu küldi e-mailben.

**Probléma.** A klub a Stripe-utalásban csak a nettó összeget látja; ha nem tudja egyeztetni a levont jutalékot a számlával, a könyvelője kérdez, és a bizalom sérül.

**Megoldás.**

1. Havi táblázat (`Europe/Budapest` naptári hónap): jutalékalap, jutalék % (a FeeRule-ból, 22.), levont jutalék (application fee mínusz a visszajárt díj), SMS-darabszám és SMS-díj, összesen, számlaszám.
2. A számlaszámot a HQ-ban rögzíted a havi összesítőnél (73.); amíg nincs, „Számla folyamatban”.
3. Szöveg a lapon: „A számlát a Számlázz.hu e-mailben küldi a céges e-mail-címre.”
4. Hónaponkénti részletező letöltése CSV-ben (rendelésenkénti platformdíj).

**Elfogadási feltételek.**

- [ ] A havi levont jutalék egyezik a Stripe-ban az adott hónapra jóváírt application fee-k és a visszajárt díjak különbségével.
- [ ] A HQ-ban rögzített számlaszám megjelenik a hónap sorában.
- [ ] Manager-fiókkal a lap 403.

**Tesztelés.** Vitest a havi összesítőre (visszatérítés, SMS, hónap határa éjfélkor); egyeztetés teszt módban a Stripe Dashboarddal.

**Függőségek és kockázatok.** Függ: 22, 23, 33, 34, 50, 73. Erre épül: 103. Kockázat: egy éjfél utáni rendelés naptári hónap szerint a következő hónapra esik, üzleti nap szerint az előzőre. A számlázás naptári hónapot használ (ahogy a Stripe is), ezt a lap kiírja.

### G. Saját admin (HQ)

#### 66. HQ váz, kötelező 2FA

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 66 | HQ váz, kötelező 2FA | `apps/hq/app/(dashboard)/layout.tsx` | Nincs | A platform irányítása csak 2FA-val engedhető | 🔴 | M |

**Jelenlegi állapot.** Döntések: külön aldomain (hq.namitiszunk.hu), kötelező 2FA, külön munkamenet az Admintól; a HQ-t csak te használod, egy fiókkal; a Support és Pénzügy szerepkör a modellben megmarad, a felületük a pilot után (113.); minden írási művelet auditnaplóba kerül. A doksi opcionális IP-szűrést is említ.

**Probléma.** A HQ-ból minden klub adata és pénze elérhető. Egy ellopott jelszó vagy egy nyitva felejtett munkamenet az egész platformot kiteszi.

**Megoldás.**

1. `apps/hq` layout, menü: Helyszínek, Rendelések, Leadek, Pénzügy, Audit napló.
2. Első fiók egyszeri szkripttel: `pnpm --filter @namitiszunk/db hq:create-admin --email ...` (PlatformMember, admin). Az első belépés a TOTP beállításával kezdődik, a tartalékkódok egyszer jelennek meg (30.).
3. Munkamenet: HttpOnly süti csak a hq aldomainre, 8 órás lejárat.
4. Minden oldal és Server Action elején platformjogosultság-ellenőrzés (23.), írásnál audit (26.).
5. `noindex`, `robots.txt` tiltás, szigorú biztonsági fejlécek (CSP, `frame-ancestors 'none'`).
6. Az IP-szűrés az MVP-ben kimarad, mert változó hálózatokról dolgozol; a védelem a 2FA és a rövid munkamenet.

**Elfogadási feltételek.**

- [ ] 2FA nélkül egyetlen HQ-oldal sem érhető el.
- [ ] Klubtag (például Tulaj) fiókja a HQ-ban 403-at kap.
- [ ] A munkamenet 8 óra után újra belépést kér.
- [ ] Minden HQ-írás megjelenik az auditnaplóban (71.).

**Tesztelés.** Playwright: belépés TOTP-vel (teszt titokkal generált kóddal), tartalékkód, tiltott fiók, lejárat; Vitest a jogosultság-ellenőrzésre.

**Függőségek és kockázatok.** Függ: 16, 23, 26, 30. Erre épül: 67–73. Kockázat: ha a telefonod és a tartalékkódok is elvesznek, a HQ-hoz csak az adatbázisból lehet újra hozzáférni; a tartalékkódokat a jelszókezelődben tartsd.

#### 67. Helyszínek és jutalék

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 67 | Helyszínek és jutalék | `apps/hq/app/(dashboard)/venues/` | Nincs | Az MVP-ben csak te veszel fel klubot; az 1%-os pilotjutalék itt állítható | 🔴 | M |

**Jelenlegi állapot.** Döntések: az MVP-ben csak te veszel fel helyszínt (HQ → helyszín létrehozása → Tulaj e-mailes meghívása → a Tulaj beköti a Stripe-ot és feltölti a menüt); csak tranzakciós jutalék, havidíj nincs; jutalék helyszínenként állítható, verziózva (a meglévő ügyfél a régi áron marad); pilot 1%, utána 3% alapértelmezés. A doksi listája: név, város, állapot (Onboarding / Aktív / Felfüggesztett), Stripe-ellenőrzés, havi forgalom. FeeRule: jutalék %, érvényesség kezdete, helyszín nélkül alapértelmezett.

**Probléma.** Ha a jutalék átírható visszamenőleg, a havi összesítő (73.) és a már levont application fee nem egyezik; ha a helyszín állapota nem védi a rendelős oldalt, egy félkész klub élesben kaphat rendelést.

**Megoldás.**

1. Lista: név, város, állapot, Stripe (`chargesEnabled`, `payoutsEnabled`, 32.), aktuális jutalék %, e havi forgalom.
2. Létrehozás: név, slug (egyedi; a QR-kód nem függ tőle, 53.), cím, Tulaj e-mail → meghívó (30., 57.). Leadből előtöltve (72.).
3. Jutalék: FeeRule-lista helyszínenként; új szabály %-kal és kezdő időponttal, a múltbeli szabály nem szerkeszthető. A rendelés a létrehozásakor érvényes szabályt kapja (22.), az application fee a Paymentben rögzül.
4. Állapotok: Onboarding (a rendelős oldal csak előnézeti linkkel nyílik, 68.), Aktív, Felfüggesztett (rendelés tiltva, Admin csak olvasható, ok kötelező).
5. Minden módosítás audittal (26.); „Belépés a klub nevében” gomb (70.).

**Elfogadási feltételek.**

- [ ] Új helyszín létrehozása után a Tulaj 1 percen belül megkapja a meghívót.
- [ ] Jutalékváltás X időponttal: az előtte létrehozott rendelések a régi, az utána lévők az új application fee-t kapják.
- [ ] Felfüggesztett helyszín rendelős oldala „Ez a hely most nem fogad rendelést”, az Admin csak olvasható.
- [ ] Foglalt slug nem menthető.

**Tesztelés.** Vitest a FeeRule-kiválasztásra (határidőpont, alapértelmezett) és az állapotokra; Playwright: helyszín létrehozása, meghívó Resend teszt címre, felfüggesztés.

**Függőségek és kockázatok.** Függ: 20, 22, 26, 30, 32, 37, 66. Erre épül: 68, 70, 72, 73. Kockázat: kicsi; a jutalékmodell a 22. feladatban már verziózott.

#### 68. Onboarding varázsló

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 68 | Onboarding varázsló | `apps/hq/app/(dashboard)/venues/[id]/onboarding/` | Nincs | A klub beállítási lépéseinek követése a pilot előtt | 🟠 | M |

**Jelenlegi állapot.** A doksi: lépések helyszínenként: alapadatok → Tulaj meghívása → Stripe Connect → menü import → QR-kódok nyomtatása → tesztrendelés → élesítés; lépés jelölése, blokkoló rögzítése, emlékeztető a Tulajnak. Döntés: onboarding varázsló az MVP-ben.

**Probléma.** A klub beállítása több hétre szétfolyhat. Ha nem látszik, hol akadt el (például a Stripe-ellenőrzésnél), a pilot kezdése csúszik.

**Megoldás.**

1. Lépések automatikus pipával, ahol mérhető:
   - alapadatok: név, cím, cégadatok, adószám, nyitvatartás, kapcsolattartó e-mail kitöltve (58.);
   - Tulaj meghívása: elfogadva (57.); Stripe: `chargesEnabled` (32.);
   - menü: legalább egy elérhető tétel (51., 52.); QR-kódok: legalább egy letöltve (53.);
   - tesztrendelés: egy Átvéve állapotú rendelés előnézeti módban;
   - élesítés: gomb, amely Aktív-ra állítja a helyszínt (67.).
2. Kézi pipa és blokkoló-megjegyzés lépésenként; élesítés csak minden lépés után, vagy okkal felülírva (audit).
3. Előnézeti link: Onboarding állapotban a rendelős oldal csak tokenes linkkel nyílik. A tesztrendelés valódi, kis összegű fizetés, utána visszatérítés (56.).
4. „Emlékeztető küldése”: e-mail a Tulajnak a nyitott lépésekkel (37.).
5. Az Admin Irányítópultján (63.) ugyanez a lépéslista „Beállítási teendők” kártyaként látszik az élesítésig.

**Elfogadási feltételek.**

- [ ] A lépések a feltétel teljesülésekor kézi beavatkozás nélkül pipát kapnak.
- [ ] Nyitott lépésnél az élesítés csak okkal lehetséges, és az auditnaplóban látszik.
- [ ] Az előnézeti link működik, token nélkül a rendelős oldal „nem fogad rendelést”.
- [ ] Az emlékeztető e-mail csak a nyitott lépéseket sorolja fel.

**Tesztelés.** Vitest a lépésfeltételekre; Playwright: új helyszín végigvitele teszt módban az élesítésig.

**Függőségek és kockázatok.** Függ: 32, 37, 51, 52, 53, 57, 58, 59, 67. Erre épül: 81. Kockázat: a Stripe-ellenőrzés napokig tarthat; a varázsló ezért mutatja a Stripe által kért hiányzó adatokat (32.).

#### 69. Globális rendeléskereső és support visszatérítés

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 69 | Globális rendeléskereső és support visszatérítés | `apps/hq/app/(dashboard)/orders/` | Nincs | Pilot alatt minden vendégpanaszt rendelésszám alapján kell megtalálni | 🔴 | M |

**Jelenlegi állapot.** A doksi: minden rendelés kereshetően, helyszín szerint szűrhetően; support célból visszatérítés a helyszín nevében, naplózva. A pilotban a support e-mailben és WhatsAppon megy, a jegykezelés a pilot után. A problémajelzések másolata hozzád is megérkezik (46.).

**Probléma.** A vendég így ír: „pénteken #214 volt, nem kaptam meg”. Ha ehhez minden klub Adminjába be kell lépni, a válasz órákig tart.

**Megoldás.**

1. Keresés: helyszín + üzleti nap + rövid szám; rendelés-azonosító; Stripe PaymentIntent-azonosító; vendég e-mail-címe (pontos egyezés).
2. Részletek: mint az Admin rendelésoldala (56.), a vendég elérhetőségével (a megtartási időn belül, 28.), problémajelzésekkel és visszatérítésekkel.
3. Support visszatérítés: `refundOrder` (34.) platformszereplővel, kötelező okkal, „a klub nevében” jelöléssel; a klub e-mailt kap róla (37.), mert az összeg az ő Stripe-egyenlegét terheli.

**Elfogadási feltételek.**

- [ ] „Klub X, 2026-11-13 üzleti nap, #214” egy kereséssel megtalálható.
- [ ] A HQ-ból indított visszatérítés a klub Admin idővonalán „Platform support” szereplővel és az auditnaplóban is látszik.
- [ ] A klub e-mailt kap a support visszatérítésről az összeggel és az okkal.

**Tesztelés.** Vitest a keresőre; Playwright: keresés, részleges visszatérítés teszt módban, e-mail Resend teszt címre.

**Függőségek és kockázatok.** Függ: 24, 26, 28, 34, 37, 46, 56, 66. Erre épül: 83. Kockázat: a support visszatérítés a klub pénzéből megy; a pilotmegállapodásnak (3.) ki kell mondania, mikor téríthetsz vissza a klub nevében.

#### 70. Belépés a klub nevében

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 70 | Belépés a klub nevében | `apps/hq/app/(dashboard)/venues/[id]/impersonate/`, `packages/auth/` | Nincs | Pilot alatti távsegítség; csak naplózva és alapból csak olvasással | 🟠 | M |

**Jelenlegi állapot.** Döntések: belépés a helyszín nevében, a naplóban külön jelölve; mindig látható sáv; alapból csak olvasás. Írás (2026-11-02): egyszer megadott okkal 15 perces írási mód, minden művelet ezzel az okkal naplózódik. Az Admin és a HQ külön alkalmazás, külön munkamenettel (30.).

**Probléma.** Ez a legnagyobb jogosultságú út a rendszerben: egy hiba itt bármelyik klub adatait kiteszi, és ha a napló hiányos, utólag nem bizonyítható, ki mit módosított.

**Megoldás.**

1. HQ „Belépés” gomb → egyszer használható, 60 másodpercig érvényes token (az adatbázisban hash-elve), a platformtaghoz és a helyszínhez kötve → átirányítás az `admin.namitiszunk.hu/impersonate` címre.
2. Az Admin a tokenből megszemélyesítő munkamenetet hoz létre (60 perc): szereplő = a platformtag, helyszín, mód = olvasás, `writeUntil`. Indítás és befejezés audittal.
3. Olvasási módban a `requirePermission` (23.) a Tulaj olvasási jogait adja, minden írás 403 („Írási mód szükséges”).
4. Írási mód: a sáv gombja → ok → `writeUntil = most + 15 perc`; a sáv pirosra vált visszaszámlálással; minden írás auditja megkapja a megszemélyesítés jelölését és az okot.
5. Írási módban is tiltott: Manager vagy Tulaj meghívása és letiltása, Stripe-bekötés és utalási beállítás.
6. „Kilépés” gomb a sávban.

**Elfogadási feltételek.**

- [ ] A sáv az Admin minden oldalán látszik, amíg a megszemélyesítés tart.
- [ ] Olvasási módban minden írás 403; az írási mód 15 perc után magától lejár.
- [ ] Az auditnaplóban látszik az indítás, az ok, minden írás és a kilépés.
- [ ] A tiltott műveletek írási módban is 403-at adnak.
- [ ] Ugyanaz a token másodszor nem használható.

**Tesztelés.** Vitest a token és a módok logikájára; Playwright: HQ → Admin átlépés, olvasás, írási mód, lejárat, kilépés; a biztonsági átnézés (79.) külön pontja.

**Függőségek és kockázatok.** Függ: 23, 26, 30, 50, 66, 67. Erre épül: 83. Kockázat: a pilotmegállapodásnak és az adatfeldolgozói szerződésnek (3.) meg kell engednie a klub nevében végzett belépést.

#### 71. Audit napló felület

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 71 | Audit napló felület | `apps/hq/app/(dashboard)/audit/` | Nincs | Visszatérítés és díjváltozás utólagos ellenőrzése | 🔴 | S |

**Jelenlegi állapot.** A doksi: ki, mikor, mit csinált (különösen: belépés helyszín nevében, visszatérítés, díjváltozás); szűrés, export; minden írási művelet előtte / utána állapottal. Az írási oldal a 26. feladat.

**Probléma.** A napló csak akkor ér valamit, ha egy vitás esetnél percek alatt megtalálod benne a lényeges bejegyzést.

**Megoldás.**

1. Lista időrendben, szerveroldali lapozással; szűrők: szereplő (megszemélyesítés is), helyszín, művelettípus (visszatérítés, díjváltozás, belépés a klub nevében, állapotváltás, menü, beállítás, személyzet), időszak.
2. Részletek: előtte / utána összehasonlítás mezőnként.
3. Export CSV-ben a szűrt listáról.
4. A felületen és az API-ban nincs módosítás vagy törlés.

**Elfogadási feltételek.**

- [ ] Egy visszatérítés, egy jutalékváltás és egy megszemélyesítés 1 percen belül megtalálható a szűrőkkel.
- [ ] A részletek a megváltozott mezőket mutatják.
- [ ] Nincs olyan végpont, amely auditbejegyzést módosít vagy töröl.

**Tesztelés.** Vitest a szűrőkre; Playwright: művelet az Adminban, megjelenés a HQ naplójában, export.

**Függőségek és kockázatok.** Függ: 26, 66. Erre épül: 79. Kockázat: a napló gyorsan nő; a lekérdezések a 20. feladat időbélyeg- és helyszínindexére épülnek.

#### 72. Leadek modul

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 72 | Leadek modul | `apps/hq/app/(dashboard)/leads/` | Nincs | A demó űrlap beküldései itt kezelhetők | 🟠 | S |

**Jelenlegi állapot.** Döntések: beépített lead-lista a HQ-ban; állapotok (2026-11-02): Új → Kapcsolatfelvétel → Demó → Ajánlat → Megnyert / Elvesztett; felelős, jegyzetek, egy kattintással helyszínné alakítás. Demó űrlap mezői: név, helyszín neve, város, telefon, e-mail, helyszín típusa, becsült vendégszám, pultok száma, jelenlegi kasszarendszer, üzenet, adatkezelési hozzájárulás. Beküldés után: lead Új állapotban, e-mail neked, visszaigazoló e-mail az érdeklődőnek Google Naptár foglalási linkkel (2026-11-02).

**Probléma.** A pilot utáni növekedés ezekből a leadekből jön. Ha egy beküldés csak e-mailben él, a követés elmarad.

**Megoldás.**

1. `packages/core` `createLead(data)`: Zod-validáció (25.), mentés Új állapotban, forrás (demó űrlap / kalkulátor, UTM); a landing (74., 75., 76.) Server Actionje hívja. Védelem: honeypot mező és rate limit (29.).
2. E-mailek az Inngesten át (35., 37.): értesítés neked; visszaigazolás az érdeklődőnek a foglalási linkkel (`BOOKING_URL` környezeti változó); új React Email sablon.
3. Lista állapotszűrővel; részletek: űrlapadatok, állapotváltás, időbélyeges jegyzetek, Elvesztettnél ok; a felelős mező a modellben megvan, egyedüli használóként automatikusan te vagy. E-mail küldése `mailto:` linkkel.
4. „Helyszínné alakítás”: a 67. feladat létrehozó űrlapja előtöltve, a lead Megnyert lesz.

**Elfogadási feltételek.**

- [ ] Beküldés után 1 percen belül: lead Új állapotban, e-mail neked, visszaigazolás foglalási linkkel az érdeklődőnek.
- [ ] Kitöltött honeypot mezővel érkező beküldés nem mentődik.
- [ ] A helyszínné alakítás a lead adataival tölti elő az űrlapot.

**Tesztelés.** Vitest a `createLead`-re (validáció, honeypot); Playwright: űrlap → lead → állapotváltás → helyszínné alakítás; e-mailek a Resend teszt címére.

**Függőségek és kockázatok.** Függ: 20, 25, 29, 35, 37, 66, 67. Erre épül: 74, 75, 76. Kockázat: a Google Naptár foglalási oldal funkciói fióktípustól függhetnek; ha a saját fiókodban nem elérhető, a link cseréje csak környezeti változó.

#### 73. Pénzügy és havi jutalékösszesítő

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 73 | Pénzügy és havi jutalékösszesítő | `apps/hq/app/(dashboard)/finance/` | Nincs | A pilotban kézzel számlázol, ehhez havi összesítő kell | 🟠 | M |

**Jelenlegi állapot.** A doksi: tranzakciók, platformdíjak, utalások, vitatott terhelések, egyeztetés a Stripe-pal, SMS-darabszám és SMS-díj helyszínenként, export a könyvelőnek; havi jutalékösszesítő helyszínenként, a jutalékszámla a pilotban kézzel, a Számlázz.hu API a pilot után (103.). Döntés (2026-11-02): a számlaszámot itt rögzíted, az Admin (65.) mutatja. A platform cége alanyi adómentes; a jutalékszámla ÁFA-kezelése könyvelői kérdés (2.).

**Probléma.** Ha a havi összesítő nem egyezik a Stripe-ban ténylegesen levont és visszajárt díjakkal, a kézzel kiállított számla hibás lesz, és sztornózni kell.

**Megoldás.**

1. Havi összesítő helyszínenként (naptári hónap, `Europe/Budapest`): forgalom, jutalékalap (végösszeg borravaló nélkül), %, beszedett application fee, visszajárt díj, nettó jutalék, SMS-darabszám és SMS-díj. Ugyanaz a `packages/core` függvény számolja, mint a 65. feladat lapját.
2. Számla rögzítése a hónap soránál: számlaszám, kelte, összeg; eltérésnél a nettó jutaléktól figyelmeztetés.
3. Vitatott terhelések: a Connect-webhook `charge.dispute.created` és `charge.dispute.closed` eseményeiből (33.), helyszínnel és határidővel; riasztás (17.).
4. Egyeztetés: a napi `stripe/reconcile` (35.) eltérései listában, „Rendezve” jelöléssel és megjegyzéssel.
5. Export CSV-ben és Excelben: havi összesítő helyszínenként és rendelésenkénti platformdíj-részletező.

**Elfogadási feltételek.**

- [ ] A havi nettó jutalék egyezik a Stripe platformfiók application fee-riportjával ugyanarra a hónapra.
- [ ] A rögzített számlaszám megjelenik a klub Adminjában (65.).
- [ ] Teszt módban létrehozott vitatott terhelés megjelenik a listában, és riasztást ad.
- [ ] Egy egyeztetési eltérés „Rendezve” jelölése megjegyzéssel az auditnaplóban látszik.

**Tesztelés.** Vitest a havi összesítőre (visszatérítés, SMS, hónap határa); Stripe CLI-vel vitatott terhelés indítása; egyeztetés teszt módban a Stripe Dashboarddal.

**Függőségek és kockázatok.** Függ: 17, 22, 26, 33, 34, 35, 36, 66. Erre épül: 65, 103. Kockázat: a könyvelő válasza (2.) a számla tartalmát (ÁFA, SMS külön tételként) változtathatja, a számítást nem.

### H. Landing

#### 74. Egyoldalas demó oldal

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 74 | Egyoldalas demó oldal | `apps/landing/app/[locale]/page.tsx` | Nincs | A pilot előtti MVP része; a jogi oldalaknak is itt a helyük | 🔴 | M |

**Jelenlegi állapot.** Döntések: az MVP-ben a landing helyett egyoldalas demó oldal; a landing tulajoknak szól (B2B), a cél a demófoglalás; sötét téma, fekete alap és saját neon kiemelőszín, a logó egyszerű „Na, mit iszunk?” felirat; tartalom MDX-ben a kódban, CMS nincs; a szövegeket te írod; magyar és angol; PostHog süti nélkül, cookie banner csak nem létfontosságú sütinél; cél Lighthouse 90+ mobilon; a reklámvideók bio-linkje a landingre visz (űrlap és időpontfoglaló). Videó csak a pilot klubban készül (10.), interaktív admin demó nincs. 2026-11-02: az oldalon nincs ár; az űrlapon csak a név, a helyszín neve, az e-mail vagy a telefon és a hozzájárulás kötelező.

**Probléma.** A pilot klub megszerzéséhez (4.) és a reklámvideók bio-linkjéhez kell egy cím, ahol a klubtulaj demót kér. Az ÁSZF-nek és az adatvédelmi tájékoztatónak az első éles rendelés előtt nyilvános URL kell, mert a pénztár (42.) linkeli őket.

**Megoldás.**

1. Szekciók a doksi 13 szekciós főoldalából szűkítve:
   - fejléc: felirat-logó, nyelvváltó, Belépés (→ admin.namitiszunk.hu), „Demó kérése” gomb, amely az űrlaphoz görget;
   - hero: főcím, alcím, telefon-mockup a rendelős oldal képernyőképével;
   - Hogyan működik: Rendel és fizet → A pult elkészíti → Értesítés és átvétel;
   - előnyök tulajoknak és vendégeknek; admin bemutató a Pult nézet (54.) és az Irányítópult (63.) képernyőképeivel;
   - GYIK: képzetlen személyzet, gyenge térerő, kassza integráció, díjak („egyedi ajánlat a demón”, szám nélkül);
   - demó űrlap; lábléc: kapcsolat e-mail, jogi linkek, nyelvváltó.
2. Kimarad a pilot előtt: a Probléma szekció számai (saját mérés még nincs), Referenciák, kalkulátor (76.), app gombok, videó (10.). Ezek a 75. feladatban jönnek.
3. Szövegek a `packages/i18n` `landing` névterében (15.), `hu` és `en`; `[locale]` útvonal, alapértelmezés `hu`.
4. Űrlap: Server Action → `createLead` (72.). Kötelező: név, helyszín neve, e-mail vagy telefon (legalább az egyik), hozzájárulás (nem előre bepipálva, link a tájékoztatóra). A többi hét mező látszik, de opcionális. Honeypot, UTM-paraméterek és forrás (`demo-oldal`) mentése. Beküldés után köszönő állapot a foglalási linkkel (`BOOKING_URL`), így a csak telefonszámot megadó érdeklődő is foglalhat időpontot.
5. Jogi oldalak MDX-ből (3.): `/aszf`, `/adatvedelem`, `/cookie`, `/impresszum`. A `/cookie` oldal csak a létfontosságú sütiket sorolja fel (a PostHog süti nélküli, 18.).
6. SEO-alap: cím, leírás, Open Graph kép (`next/og`), schema.org Organization, `sitemap.xml`, `robots.txt`, hreflang (hu, en). Statikus generálás, `next/image`, `next/font`.
7. Analitika (18.): oldalmegtekintés, „Demó kérése” kattintás, sikeres beküldés, UTM-forrás szerint.
8. A landing oldalai bekerülnek a 49. feladat Lighthouse CI és axe-core ellenőrzésébe (13.).

**Elfogadási feltételek.**

- [ ] Lighthouse mobilon mind a négy kategóriában legalább 90.
- [ ] Beküldés után 1 percen belül: lead Új állapotban, e-mail neked, visszaigazolás foglalási linkkel, ha van e-mail-cím.
- [ ] Csak telefonszámmal is menthető a lead; e-mail és telefon nélkül az űrlap hibát jelez.
- [ ] Betöltés és beküldés után a böngészőben nincs süti, és nincs cookie banner.
- [ ] Az angol változat teljes, a hreflang párok helyesek, a jogi oldalak mindkét nyelvről elérhetők.
- [ ] Az oldalon sehol nincs ár.
- [ ] axe-core: 0 súlyos vagy kritikus hiba; az űrlap billentyűzettel kitölthető.

**Tesztelés.** Playwright (78.): űrlap beküldése, validációs hibák, honeypot, nyelvváltás, linkellenőrzés; Lighthouse CI és axe a CI-ban; kézi próba iPhone Safarin, Android Chrome-on és az Instagram beépített böngészőjében, mert a bio-link onnan nyílik.

**Függőségek és kockázatok.** Függ: 3, 12, 14, 15, 16, 18, 37, 72. Erre épül: 4, 75. Kockázat: ha az ügyvédi átnézés (3.) késik, a demó oldal mehet élesbe, de ÁSZF és adatvédelmi tájékoztató nélkül a pénztár nem.

#### 75. Teljes landing

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 75 | Teljes landing | `apps/landing/app/[locale]/`, `apps/landing/content/` | Nincs | Fázis 3: demókérés, app letöltés, SEO | 🟠 | L |

**Jelenlegi állapot.** A doksi oldaltérképe: főoldal, `/hogyan-mukodik`, `/vendegeknek`, `/helyszinek` (térkép és lista), `/kalkulator`, `/blog`, `/gyik`, `/demo`, jogi oldalak, Belépés. 2026-11-02: nincs Árak oldal, Árak menüpont és „Árak röviden” szekció, az ár a demón hangzik el. A főoldal szekciói: fejléc, hero, probléma (saját mérésekből), Hogyan működik, előnyök tulajoknak és vendégeknek, admin bemutató, kalkulátor, referenciák, GYIK, záró CTA, lábléc. SEO: schema.org Organization, SoftwareApplication, FAQPage, sitemap, hreflang. A Fázis 3 része, az app mellett.

**Probléma.** Az egyoldalas demó oldalnak nincsenek keresőre optimalizált aloldalai, nincs vendégeknek szóló része és partnerhelyszín-listája, és nem mutatja a pilot eredményeit. A pilot utáni értékesítés ezekre épül.

**Megoldás.**

1. Főoldal a doksi sorrendjében, ár nélkül. A Probléma szekció számai és a Referenciák a pilot méréséből (82.), a pilot klub írásos hozzájárulásával. Hero és Hogyan működik a pilot videójával (10.): poszterkép, késleltetett betöltés.
2. Aloldalak:
   - `/hogyan-mukodik`: a három lépés részletesen, videóval;
   - `/vendegeknek`: QR-os rendelés app nélkül; App Store és Google Play gomb, amint az app áruházban van (95.);
   - `/helyszinek`: az Aktív helyszínek listája (név, város, cím, link a menüre), „Megnyitás térképen” külső linkkel a Google Mapsre; beágyazott térkép nincs, így süti és banner sem kell;
   - `/gyik`: FAQPage schema; `/demo`: ugyanaz az űrlapkomponens, mint a 74.-ben;
   - `/kalkulator` (76.) és `/blog` (77.).
3. A helyszínlista adata: `packages/core` `listPublicVenues()`, ISR óránkénti újraellenőrzéssel, csak olvasási jogú Atlas-felhasználóval (14.).
4. Tartalom MDX-ben: `apps/landing/content/hu/` és `content/en/`; a 74. komponensei újrahasználva.
5. SEO: sitemap minden oldallal és nyelvvel, hreflang, Open Graph kép oldalanként, schema.org Organization, SoftwareApplication (`offers` nélkül, mert nincs ár), FAQPage.

**Elfogadási feltételek.**

- [ ] Minden oldal Lighthouse-eredménye mobilon legalább 90, a videós oldalaké is.
- [ ] A Google Rich Results Test hiba nélkül ismeri fel az Organization, SoftwareApplication és FAQPage adatokat.
- [ ] A sitemap mindkét nyelv minden oldalát tartalmazza hreflang párokkal.
- [ ] A `/helyszinek` csak Aktív helyszínt mutat; élesítés (68.) után legkésőbb 1 órán belül megjelenik.
- [ ] Ár sehol nem szerepel.

**Tesztelés.** Playwright linkellenőrzés minden oldalon és nyelven; Lighthouse CI és axe a CI-ban; Rich Results Test kézzel az élesítés előtt; Vitest a `listPublicVenues()`-ra (csak Aktív).

**Függőségek és kockázatok.** Függ: 9, 10, 14, 18, 67, 74, 79 (külső pentest), 82, 95 (app gombok). Erre épül: 76, 77. Kockázat: a pilot számainak és a klub nevének nyilvános használatához a pilotmegállapodásban (3.) hozzájárulás kell; ennélkül a Referenciák szekció kimarad.

#### 76. Megtérülés-kalkulátor

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 76 | Megtérülés-kalkulátor | `apps/landing/app/[locale]/kalkulator/` | Nincs | A döntés szerint a pilot valós adataival készül | 🟡 | S |

**Jelenlegi állapot.** A doksi: csúszkák (vendégszám egy este, átlagos italár, nyitvatartási órák), eredmény: becsült plusz bevétel; a látogató az eredménnyel demót kér. Döntések: a pilot után, valós adatokkal (2026-11-01); az eredmény azonnal, e-mail nélkül látszik, alatta „Kérj demót ezzel az eredménnyel” gomb, amely kitölti az űrlapot (2026-11-02).

**Probléma.** A kitalált szorzóval számoló kalkulátor hiteltelen, és a klubtulaj a demón számon kéri.

**Megoldás.**

1. A képlet együtthatói a pilot riportjából (82.): az egy vendégre jutó italforgalom a pilot előtti és alatti estéken, és a QR-arány. Az együtthatók egy fájlban (`apps/landing/lib/roi.ts`), forrásmegjelöléssel; a nyitvatartási órák csúszkája csak akkor marad, ha a pilotadatokból a hatása mérhető.
2. Csúszkák számmezővel; billentyűzettel állíthatók, `aria-valuetext` forintban. Az eredmény estei becslés forintban, „becslés” jelöléssel és a forrással (pilot klub, esték száma).
3. A számítás a kliensen fut, API nélkül.
4. „Kérj demót ezzel az eredménnyel”: a `/demo` űrlapra visz, kitölti a vendégszámot; a lead forrása `kalkulator`, a bemenetek és az eredmény a lead jegyzetébe kerülnek (72.).
5. PostHog-események (18.): kalkulátor használata, demó gomb.

**Elfogadási feltételek.**

- [ ] Az eredmény e-mail nélkül, a csúszka mozgatásakor azonnal frissül.
- [ ] Az együtthatók forrása az oldalon olvasható.
- [ ] A gomb után beküldött lead forrása „kalkulátor”, és a HQ-ban (72.) látszanak a bemenetek.
- [ ] Nulla vagy szélsőséges bemenetnél nincs NaN vagy negatív eredmény.

**Tesztelés.** Vitest a képletre (határértékek, kerekítés); Playwright: csúszka → eredmény → demó → lead forrása.

**Függőségek és kockázatok.** Függ: 72, 75, 82. Erre épül: nincs. Kockázat: a pilot előtti italforgalmat a klub kasszájából kell megkapni; ha nincs meg, vagy a pilot nem mutat mérhető növekedést, a kalkulátor a 82. riport után újra eldöntendő.

#### 77. Blog

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 77 | Blog | `apps/landing/app/[locale]/blog/`, `apps/landing/content/blog/` | Nincs | Keresőforgalom a pilot eredményeivel | 🟡 | S |

**Jelenlegi állapot.** Döntések: blog később, a pilot eredményeivel; a szöveget te írod, AI-segítséggel; MDX a kódban, CMS nincs; a blog csak magyarul (2026-11-02).

**Probléma.** A klubtulajok által keresett témákra (sorban állás, pultos kapacitás, QR-rendelés) a landing aloldalai nem adnak elég tartalmat a keresőforgalomhoz.

**Megoldás.**

1. `apps/landing/content/blog/*.mdx`, frontmatter: cím, leírás, dátum, szerző, borítókép, címkék, `draft`.
2. Lista `/hu/blog` dátum szerint, cikkoldal `/hu/blog/[slug]`, statikus generálás, olvasási idő.
3. Csak magyarul: az angol menüben nincs Blog, a `/en/blog` 404, a cikkeknek nincs hreflang párja.
4. SEO: schema.org BlogPosting, Open Graph kép a borítóból, RSS (`/hu/blog/rss.xml`), sitemap.
5. Minden cikk végén demókérés gomb. A Blog menüpont csak az első publikált cikk után jelenik meg.

**Elfogadási feltételek.**

- [ ] Új MDX fájl a fő ágon: a cikk megjelenik a listában, a sitemapben és az RSS-ben; `draft: true` élesben nem látszik.
- [ ] A BlogPosting adatok hiba nélküliek a Rich Results Testben.
- [ ] Az angol menüben nincs Blog, a `/en/blog` 404.
- [ ] A cikkoldalak Lighthouse-eredménye mobilon legalább 90.

**Tesztelés.** Vitest a frontmatter-sémára (hiányzó mező → build hiba); Playwright: lista, cikk, RSS, draft; Lighthouse CI.

**Függőségek és kockázatok.** Függ: 75, 82. Erre épül: nincs. Kockázat: kicsi; tartalom nélkül a blog nem indul, ezért a menüpont az első cikkhez kötött.

### I. Minőség, biztonság és pilot

#### 78. E2E tesztek (Playwright)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 78 | E2E tesztek (Playwright) | `e2e/` | Nincs | A teljes rendelés fizetéssel minden telepítés előtt tesztelendő | 🔴 | M |

**Jelenlegi állapot.** A doksi: E2E Playwrighttal, teljes rendelés fizetéssel, Stripe teszt módban; mobil E2E Maestróval (a J témakörben). A terv eddig: a preview környezetben nincs Stripe-webhook, ezért a fizetéses E2E a CI gépén fut Stripe CLI-vel (14.); seed adatok (27.); kártyas tesztek (33.); Lighthouse és axe már a CI-ban (49.).

**Probléma.** A pénz útja több alkalmazáson megy át: rendelős oldal → api webhook → Pult nézet → vendég élő oldala. Az egységtesztek nem fogják meg, ha a kettő között szakad el; egy hibás pénteki telepítés elveszett bevétel.

**Megoldás.**

1. `e2e/` Playwright-projekt a gyökérben, három profillal: Mobile Safari (WebKit, iPhone), Mobile Chrome (Pixel), Desktop Chrome (Admin, HQ).
2. Futtatás a CI gépén: a négy app és az api `next start`-tal, MongoMemoryReplSet, seed (27.); `stripe listen --forward-to localhost:3004/webhooks/stripe` teszt kulccsal (GitHub Actions secret); külön Ably-app a CI-nak; Twilio teszt hitelesítő adatok (nem küld, nem számláz); e-mail a Resend teszt címére.
3. Kritikus út: QR-URL → menü → kosár → pénztár → teszt kártya → Pult nézet Új → Készül → Kész → a vendég élő oldala Kész → átvételi kód → Átvéve.
4. További forgatókönyvek:
   - 3D Secure és elutasított teszt kártya → hibaállapot (48.);
   - elutasítás a pultnál → automatikus visszatérítés (34.);
   - menedzseri visszatérítés átvétel után (56.);
   - globális szünet és elfogyott tétel a menü oldalon (40., 48.).
5. A többi feladat Playwright-tesztjei is az `e2e/` mappában vannak, és ugyanitt futnak.
6. CI (13.): PR-onként a kritikus út, a fő ágon a teljes csomag. A fő ág védett: zöld E2E nélkül nem lehet merge-elni, így élesre sem kerül (14.). `retries: 1`; a második futásra átmenő teszt a riportban flaky jelölést kap. Hibánál trace, videó és képernyőkép a CI artifactok között.

**Elfogadási feltételek.**

- [ ] A kritikus út mindhárom profilban zöld a fő ágon.
- [ ] Egy szándékosan elrontott webhook-feldolgozó a PR-t pirosra váltja.
- [ ] A PR-futás legfeljebb 10 perc.
- [ ] Piros E2E mellett a fő ágba nem lehet merge-elni.

**Tesztelés.** Szándékos hibával (kihagyott állapotváltás) próbált PR; a teljes csomag kétszeri futtatása egymás után a stabilitás ellenőrzésére.

**Függőségek és kockázatok.** Függ: 12, 13, 14, 27, 33, 34, 40–48, 54, 56. Erre épül: 79, 81, 83. Kockázat: az Apple Pay és a Google Pay nem automatizálható Playwrightban; ezeket a zárt teszt (8.) kézzel próbálja ki.

#### 79. Biztonsági átnézés

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 79 | Biztonsági átnézés | `docs/security/checklist.md` | Nincs | Pénz és személyes adat; OWASP Top 10, rate limit, jogosultság-tesztek | 🔴 | M |

**Jelenlegi állapot.** A doksi: HTTPS mindenhol; szerveroldali szerepkör-ellenőrzés; rate limit (belépés, OTP, fizetés); 2FA; titkok környezeti változóban; OWASP Top 10 ellenőrzés. Döntés (2026-11-02): a pilot előtt saját ellenőrzőlista, jogosultság-tesztek és automatikus szkennelés; a nyilvános indulás előtt külső pentest. A kártyaadatot a Stripe Elements kezeli, a szerver nem látja.

**Probléma.** A rendszer pénzt mozgat (visszatérítés, jutalék) és személyes adatot tárol. Egyetlen jogosultsági hiba, például egy másik klub rendelésének visszatérítése, közvetlen pénzügyi kárt okoz.

**Megoldás.**

1. `docs/security/checklist.md`: az OWASP Top 10 minden pontjához: hol érinti a rendszert, mi a védelem, melyik teszt vagy beállítás bizonyítja.
2. Helyszín-izolációs tesztmátrix Vitestben a 23. feladat jogosultságtábláján: minden szerepkör × minden művelet × saját és másik helyszín. A `venueId` mindig a munkamenetből jön, nem a kérésből.
3. Bemenetek: Zod minden határon (25.), Mongoose `sanitizeFilter` a `$`-kezdetű kulcsok ellen; Stripe- és Inngest-aláírás ellenőrzése (33., 35.).
4. Rate limit (29.) ellenőrzése: belépés, e-mail link, személyzeti PIN (a rövid PIN miatt kiemelten), fizetés, lead űrlap.
5. Fejlécek és sütik: CSP, HSTS, `frame-ancestors`; sütik HttpOnly, Secure, SameSite.
6. Automatikus eszközök a CI-ban (13.): OWASP ZAP alapszkennelés a preview-n, `pnpm audit --audit-level high`, Dependabot, GitHub titokszkennelés.
7. Kézi próbák jegyzőkönyvvel: másik klub rendelésének lekérése és visszatérítése, lejárt és újrahasznált tokenek (vendégtoken, e-mail link, megszemélyesítés, 70.), PIN-próbálgatás, HQ 2FA megkerülése, auditnapló teljessége (71.).
8. Megállapítások súlyosság szerint; a kritikus és a magas a pilot előtt javítva. A külső pentest a nyilvános indulás (75., 95.) előtt; az ellenőrzőlista és a mátrix a pentester bemenete.

**Elfogadási feltételek.**

- [ ] Az ellenőrzőlista minden pontjánál van bizonyíték (teszt vagy beállítás).
- [ ] A helyszín-izolációs mátrix zöld: másik helyszín adatára minden olvasás és írás 403 vagy 404.
- [ ] A ZAP alapszkennelésnek nincs magas kockázatú találata; a `pnpm audit` nem jelez magas vagy kritikus sebezhetőséget.
- [ ] Minden kritikus és magas megállapítás javítva a 81. előtt.

**Tesztelés.** A mátrix és a ZAP a CI-ban fut; a kézi próbák eredménye az ellenőrzőlistában.

**Függőségek és kockázatok.** Függ: 13, 23, 25, 26, 29, 30, 33, 35, 70, 71, 78. Erre épül: 75, 81, 95. Kockázat: a saját kód saját átnézése vakfoltos; ezért marad a külső pentest a nyilvános indulás előtt.

#### 80. Terheléses teszt (k6)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 80 | Terheléses teszt (k6) | `load/` | Nincs | A doksi előírja az élesítés előtt | 🔴 | M |

**Jelenlegi állapot.** A doksi: pilot 1 klub, 1 pult, egy este 300 vendég alatt; később 50 rendelés/perc csúcs helyszínenként és 50 egyidejű helyszín; API p95 300 ms alatt; rendelés → pult megjelenés 2 mp alatt; terheléses teszt az élesítés előtt. Az Atlas Flex legfeljebb 500 kapcsolatot enged (20.); a rate limit MongoDB-be ír (29.). Döntés (2026-11-02): ideiglenes staging környezetben, egy napra létrehozott Flex klaszterrel és Stripe teszt kulcsokkal; utána törölve. Az 50 helyszínes mérés a 117. feladat.

**Probléma.** Péntek éjjel a rendelések hullámokban jönnek. Ha a Vercel-függvények kapcsolatai elérik a Flex korlátját, vagy a rate limit írásai lassítanak, az csak terhelés alatt derül ki.

**Megoldás.**

1. Staging: `staging` ág, amelynek a Vercel Preview környezetében ágspecifikus változók mutatnak az ideiglenes Flex klaszterre, egy külön Ably-appra és a Stripe teszt kulcsokra; Stripe teszt webhook a staging címére. Seed: egy demó helyszín, egy pult, 60 tétel (27.).
2. `load/order-peak.js` (k6): 2 perc bemelegítés, majd 30 percig 50 rendelés/perc, mellette 300 virtuális vendég menübetöltéssel és az állapot 30 másodperces lekérdezésével (40.). Fizetés: PaymentIntent teszt módban, megerősítés `pm_card_visa` teszt fizetési móddal.
3. `load/bar-flow.js`: a Pult nézet állapotváltásai (Készül, Kész, Átvéve) PIN-munkamenettel, a rendelések ütemében.
4. `load/ably-latency.ts`: Node-szkript az Ably SDK-val feliratkozik a pult csatornájára, és méri a `paidAt` és az üzenet megérkezése közti időt.
5. SMS Twilio teszt hitelesítő adatokkal, e-mail a Resend teszt címére.
6. Mért értékek: API p95, hibaarány, rendelés → pult p95, Atlas kapcsolatszám (Atlas metrikák), Vercel-függvényhibák, Ably-üzenetszám.
7. Eredmény `load/results/<dátum>.md`-ben (számok, grafikonok, következtetések), utána a Flex klaszter, az Ably-app és az ágspecifikus változók törlése.

**Elfogadási feltételek.**

- [ ] 50 rendelés/perc 30 percen át: API p95 300 ms alatt, hibaarány 1% alatt.
- [ ] Rendelés → pult megjelenés p95 2 mp alatt.
- [ ] Az Atlas kapcsolatszám csúcson az 500-as korlát alatt marad.
- [ ] A sikeres PaymentIntentek, a rendelések és a Pult nézetben megjelent rendelések száma egyezik: nincs dupla terhelés és elveszett rendelés.
- [ ] A staging erőforrások a mérés után törölve.

**Tesztelés.** A szkriptek előpróbája 5 rendelés/perccel a preview-n; a mérés egyszer, a 81. előtt, és minden olyan változtatás után újra, amely a rendelés- vagy fizetési utat érinti.

**Függőségek és kockázatok.** Függ: 14, 20, 27, 29, 31, 33, 40–43, 54. Erre épül: 81, 117. Kockázat: az Ably-kvóta a mérés alatt is fogy; ha a havi keretet veszélyezteti, a mérés idejét rövidíteni kell. A Stripe teszt módjának saját kéréskorlátja van; a 429-es válaszokat a riportban külön kell számolni.

#### 81. Pilot telepítés a klubban

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 81 | Pilot telepítés a klubban | `docs/pilot/telepites.md` | Nincs | Menü, QR-kódok, tablet, tesztrendelések a klubban | 🔴 | S |

**Jelenlegi állapot.** A doksi: a klub saját tabletje, a Pult nézet böngészőben fut (PWA); a menüt a klub tölti fel; betánítás videóval és útmutatóval (6.); rendelés zárása nyitvatartás szerint, utolsó rendelés 15 perccel zárás előtt; max. 10 tétel. A pilotmegállapodás szerint a tablet és a Wi-Fi a klubé (3.). A terv eddig: onboarding varázsló (68.), Wi-Fi-ellenőrzés a telepítéskor (54.), a VIP-host telefonján a Manager lép be (55.); a telepítés után jön a zárt teszt (8.).

**Probléma.** A klubban egy hiba ára egy elrontott péntek: rossz QR-kód a pulton, lemerült tablet, gyenge Wi-Fi a pult mögött. Ezeket az első éles este előtt, a helyszínen kell kiszűrni.

**Megoldás.** `docs/pilot/telepites.md` ellenőrzőlista egy nappali látogatásra az első este előtti héten:

1. Előtte, távolról: a 68. varázsló minden lépése kész; a 79. kritikus és magas megállapításai javítva; a 80. mérés megvan; a jogi dokumentumok aláírva és közzétéve (3.); riasztások élesek (17.).
2. Hálózat: Wi-Fi és 4G sebesség és válaszidő a pult mögött és a vendégtérben, telefonos mérővel; az eredmény a jegyzőkönyvbe.
3. Tablet: Pult nézet a kezdőképernyőre telepítve, Manager belép, pultos PIN-ek (57.), hang bekapcsolva, automatikus zárolás kikapcsolva, töltő a pultnál. VIP-host telefon beállítása, ha van VIP (55.).
4. QR-kódok: nyomtatás a 53. PDF-jéből, kihelyezés a klubbal egyeztetett helyekre; minden kód beolvasva, a pult- és zóna-előválasztás ellenőrizve.
5. Beállítások: nyitvatartás, üzleti nap, utolsó rendelés ideje, tételkorlát (58.).
6. Élő tesztrendelés saját kártyával a klub egyik QR-kódjáról: Pult nézet → Átvéve, utána visszatérítés (56.).
7. Betánítás a pultosokkal az útmutató szerint (6.); az ügyeleti telefonszám kihelyezve.
8. Jegyzőkönyv: ki mit ellenőrzött, nyitott pontok és határidők.

**Elfogadási feltételek.**

- [ ] Az ellenőrzőlista minden pontja kész, vagy a nyitott pont elfogadott kockázatként szerepel.
- [ ] Minden kihelyezett QR-kód a helyes pultra és zónára visz.
- [ ] Az élő tesztrendelés végigment, a visszatérítés látszik a Stripe-ban.
- [ ] A tablet 30 perc tétlenség után is ébren van, és hangot ad új rendelésnél.

**Tesztelés.** Maga az ellenőrzőlista; a hálózati mérés és a tesztrendelés eredménye a jegyzőkönyvben.

**Függőségek és kockázatok.** Függ: 3, 4, 6, 17, 48, 49, 52, 53, 54, 55, 63, 68, 78, 79, 80. Erre épül: 8, 10, 82, 83. Kockázat: telt házban a Wi-Fi és a mobilnet gyengébb, mint napközben; az első valós mérés a zárt teszt (8.) estéje.

#### 82. Pilot mérés és Kapu 2 riport

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 82 | Pilot mérés és Kapu 2 riport | `docs/pilot/kapu2.md`, Admin Riportok | Nincs | A ≥ 15% QR-arány és ≤ 5 perc elkészítési idő mérése | 🔴 | S |

**Jelenlegi állapot.** A doksi: Kapu 2 = legalább 15% QR-arány a pult italforgalmában, legfeljebb 5 perc átlagos elkészítési idő, és a klub folytatni akarja; a pilot 3–4 hét. A terv eddig: a QR-arány kézzel számolódik a klub Z-jelentéséből és a riportból (18., 61.); elkészítési idő = `paidAt` → `readyAt`, üzleti nap szerint (24.); az értékelések nem részei a Kapu 2-nek (45.). Döntések (2026-11-02): minden pilotest beleszámít; ha a célok nem teljesülnek, javítás után 2 hetes hosszabbítás ugyanabban a klubban, ha így sem, újratervezés.

**Probléma.** Ha a mérés módja nincs előre rögzítve, a pilot végén vita lesz arról, mi számít italforgalomnak (borravaló, visszatérítés, VIP palack, belépő).

**Megoldás.**

1. `docs/pilot/kapu2.md` a pilot első estéje előtt rögzíti és a Tulajjal egyezteti a definíciókat:
   - QR-arány = a QR-os rendelések nettó italforgalma (visszatérítés, borravaló és szervizdíj nélkül) / a pult italforgalma a Z-jelentés szerint, ugyanarra az üzleti napra. A Z-jelentés a QR-os rendeléseket is tartalmazza, mert a pultos beviszi őket a pénztárgépbe.
   - Elkészítési idő = `paidAt` → `readyAt` átlaga a Kész állapotot elért rendeléseken; médián és p90 tájékoztatásul.
   - A klub szándéka: a pilot végén írásos válasz a Tulajtól (folytatja vagy nem).
   - Minden pilotest beleszámít, az elsőtől az utolsóig.
2. Este utáni adatgyűjtés: a klub másnap elküldi a Z-jelentés italforgalmát; te beírod a `kapu2.md` táblázatába az Admin riport (61.) számai mellé.
3. A kalkulátorhoz (76.): ha a klub megadja, a pilot előtti esték Z-jelentése és vendégszáma is, legalább annyi estére, ahány pilotest van.
4. Heti köztes riport a Tulajnak: QR-arány, átlagos elkészítési idő, rendelésszám, csúcsóra, problémajelzések (46.), értékelések (45., 64.).
5. Záró riport a pilot végén: a három cél igen/nem eredménye számokkal; ha valamelyik nem teljesül, javítási lista és a 2 hetes hosszabbítás terve. A klub hozzájárulásával ebből jönnek a landing számai (75.), a kalkulátor együtthatói (76.) és az első blogcikk (77.).

**Elfogadási feltételek.**

- [ ] A definíciók az első pilotest előtt rögzítve és a Tulajjal egyeztetve.
- [ ] Minden pilotesténél megvan a Z-jelentés italforgalma és az Admin riport száma.
- [ ] A záró riport mindhárom célra igen vagy nem eredményt ad számokkal.
- [ ] Az Admin riport átlagos elkészítési ideje egyezik a `kapu2.md` számításával ugyanarra az estére.

**Tesztelés.** Az első pilotest után 10 rendelésen kézzel ellenőrizni a `paidAt` és `readyAt` időket a rendelés idővonalán, és összevetni a 61. riport átlagával.

**Függőségek és kockázatok.** Függ: 4, 8, 18, 24, 45, 61, 64, 81. Erre épül: 75, 76, 77. Kockázat: ha a Z-jelentés a belépőt vagy más pult forgalmát is tartalmazza, előre meg kell egyezni, melyik sora számít a pult italforgalmának.

#### 83. Pilot ügyelet és javítási ciklus

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 83 | Pilot ügyelet és javítási ciklus | `docs/pilot/ugyelet.md` | Nincs | 3–4 hét éles üzem; az első 2–3 estén a helyszínen | 🔴 | L |

**Jelenlegi állapot.** A doksi: az első 2–3 estén ügyelet a helyszínen, utána nyitvatartás alatt telefonon; telepítés és karbantartás csak hétköznap nappal; kritikus idősáv péntek–szombat 20:00–05:00; support e-mailben és WhatsAppon (jegykezelés a pilot után, 102.). A terv eddig: riasztások (17.), problémajelzés másolata hozzád (46.), globális Szünetel kapcsoló (50.), rendeléskereső és support visszatérítés (69.), belépés a klub nevében (70.). Döntés (2026-11-02): ha a Kapu 2 nem teljesül, 2 hetes hosszabbítás.

**Probléma.** 3–4 hétig hetente 2–3 éjszaka egyedül ügyelsz. Ha nincs előre rögzített rend, egy éjszakai hibánál menet közben kell eldönteni, hogy visszaállíts, szüneteltess vagy javíts.

**Megoldás.** `docs/pilot/ugyelet.md`:

1. Helyszíni esték (az első 2–3): nyitás előtt tablet, hang, Wi-Fi és egy tesztrendelés; az este alatt megfigyelési napló arról, hol akadt el a pultos és a vendég.
2. Telefonos ügyelet nyitvatartás alatt: riasztás a telefonodra (17.), ügyeleti szám a pultnál (6.), WhatsApp-csoport a Managerrel.
3. Éjszakai incidensrend (éjjel nincs új telepítés):
   - hibás fizetés vagy rendelésfogadás → globális Szünetel (50.) a Managerrel vagy belépéssel a klub nevében (70.); a pult hagyományosan szolgál ki;
   - hibás új verzió → Vercel Instant Rollback az előző telepítésre;
   - vendégpanasz → keresés és szükség esetén support visszatérítés okkal (69.).
4. Minden incidens a naplóba: időpont, hatás (kiesett percek, érintett rendelések), lépés, ok.
5. Javítási ciklus: hétfőn prioritási lista a hétvégi naplóból és a problémajelzésekből; javítás és telepítés kedd–csütörtök nappal; csütörtökön teljes E2E futás (78.), utána hétfőig nincs telepítés.
6. Heti 15 perces egyeztetés a Managerrel a köztes riport (82.) alapján. Hosszabbítás esetén ugyanez a rend még 2 hétig.

**Elfogadási feltételek.**

- [ ] Minden pilotestének van naplóbejegyzése (incidens vagy „rendben”).
- [ ] Minden kritikus incidensnél rögzítve a hatás és a megoldás.
- [ ] Péntek és szombat éjjel nem volt új telepítés, legfeljebb visszaállítás.
- [ ] A pilot végén minden hiba javítva, vagy átvezetve a későbbi feladatokba.

**Tesztelés.** Próbaincidens a zárt teszt (8.) estéjén: globális Szünetel és Vercel-visszaállítás kipróbálása, a reakcióidő mérésével.

**Függőségek és kockázatok.** Függ: 6, 8, 17, 46, 50, 69, 70, 78, 81. Erre épül: 9 és a J témakör (84–96.). Kockázat: a heti 2–3 éjszakás egyszemélyes ügyelet kimerítő; a riasztási küszöböket (17.) az első két hétvége után hangolni kell, hogy csak valódi hiba ébresszen.

### J. Mobilapp (Fázis 3)

#### 84. Expo app alapok

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 84 | Expo app alapok | `apps/mobile/app/_layout.tsx`, `apps/mobile/src/` | Csak üres váz van (12. feladat) | Navigáció, bejelentkezés, API kliens és fordítás nélkül egy képernyő sem működik | 🔴 | M |

**Jelenlegi állapot.** Üres Expo váz (Expo Router, NativeWind) a 12. feladatból. A doksi: Expo managed, EAS Build és EAS Update; tokenek `expo-secure-store`-ban; típusok, Zod-sémák és API kliens a közös csomagokból; alsó fülsór: Felfedezés · Rendeléseim · Szkennelés (középen) · Profil; aktív rendelésnél rögzített sáv; induló bemutató 3 diával. Döntések: rendelés fiók nélkül is; belépés Apple, Google és e-mail link, SMS-belépés nincs (2026-11-01); analitika az appban: hozzájárulással tartós azonosító, anélkül memóriában (2026-11-02).

**Probléma.** Közös alap nélkül minden képernyő külön oldja meg a belépést, az API-hívást, a fordítást és a hibákat, és az appnak fiók nélkül is működnie kell.

**Megoldás.**

1. Navigáció (Expo Router): `(tabs)` discover, orders, scan (középen kiemelve), profile; modálok: termék, kosár, fizetés; további útvonalak: `v/[slug]`, `o/[orderId]`, `staff/`.
2. Induló bemutató az első indításkor (3 dia), a végén: értesítési engedély (90.), helymeghatározás (opcionális, 85.), analitikai hozzájárulás igen/nem (a Profilban módosítható, 89.).
3. Belépés: Better Auth Expo-integráció (`@better-auth/expo`); Apple, Google, e-mail link (a link az appban nyílik, 91.) és „Folytatás vendégként”. Munkamenet és vendégtoken (30.) `expo-secure-store`-ban; belépéskor az eszköz vendégtokenjeihez tartozó rendelések a fiókhoz kerülnek.
4. API: a 39. típusos kliens egységes hibakezeléssel (hálózati hiba, 401 → újrabelépés, 429).
5. Fordítás: `packages/i18n` `mobile` névtér (15.), a készülék nyelve szerint, a Profilban váltható; dátum- és forintformázás nyelvenként. Téma: `tokens.json` NativeWinddel, sötét téma (16.).
6. Aktív rendelés sáv: globális állapot, Ably-feliratkozással (31.), minden képernyő tetején.
7. Megfigyelés: Sentry React Native (17.); PostHog React Native (18.) hozzájárulással `persistence: 'file'`, anélkül `'memory'`.
8. `app.config.ts` EAS-profilokkal (development, preview, production): api-cím és Stripe kulcs profil szerint (14.).

**Elfogadási feltételek.**

- [ ] Az app fiók nélkül elindul, és eljut a Felfedezésig.
- [ ] Apple, Google és e-mail linkes belépés működik iOS-en és Androidon; a munkamenet újraindítás után is megmarad.
- [ ] Hozzájárulás nélkül a PostHog nem ír az eszközre (újraindítás után új azonosító), hozzájárulással az azonosító megmarad.
- [ ] A nyelv a készülék nyelvét követi, és váltható.
- [ ] A production profilból küldött teszthiba megérkezik a Sentrybe.

**Tesztelés.** Jest a közös logikára (belépési állapot, hozzájárulás); Maestro (96.): első indítás → bemutató → vendégként tovább; belépés mindhárom móddal kézzel, valódi eszközön.

**Függőségek és kockázatok.** Függ: 12, 15, 16, 17, 18, 25, 29, 30, 31, 39. Erre épül: 85–96. Kockázat: az Apple felfüggeszti a jóváhagyást, ha van Google-belépés Apple nélkül, vagy ha a fiók nem törölhető az appban (89.).

#### 85. Felfedezés, helyszín oldal, QR szkenner

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 85 | Felfedezés, helyszín oldal, QR szkenner | `apps/mobile/app/(tabs)/discover/`, `apps/mobile/app/scan.tsx` | Nincs | Az app belépési pontjai | 🔴 | L |

**Jelenlegi állapot.** A doksi képernyői: Felfedezés (közeli helyek listája és térképe, ma esti események, „Most nyitva”, kedvencek), Helyszín oldal (borító, nyitvatartás, rendelési állapot, becsült várakozás, pultok), QR szkenner (zseblámpával). Döntések: rendelés csak a helyszínen, a bent kihelyezett QR-kódokról, helyellenőrzés nincs (2026-11-01); kedvencek az appal (2026-11-02); lista és térkép react-native-maps-szel (2026-11-02). A QR-kódok `/q/[kód]` címet kódolnak (53.). Események a 101. feladatban.

**Probléma.** Az app a QR-kódon kívül a Felfedezésből is elindíthat egy rendelést. Ha ezt semmi nem köti a QR-kódhoz, otthonról is lehet rendelni, ami ellentmond a döntésnek.

**Megoldás.**

1. Felfedezés: lista (helyengedéllyel távolság szerint, anélkül város szerint) és térképnézet váltóval; „Most nyitva” szűrő, keresés, városszűrő, kedvencek elöl. Adat: `GET /v1/venues` a 75. `listPublicVenues()` függvényével.
2. Térkép: react-native-maps; iOS-en Apple Maps, Androidon Google Maps SDK API-kulccsal (Google Cloud projekt; a kulcs a csomagnévre és az aláíró tanúsítványra korlátozva, `app.config.ts`).
3. Helyszín oldal: borító, név, nyitvatartás, állapot és becsült várakozás a 40. státuszvégpontjából, pultok; kedvenc (fiókkal; új gyűjtemény a 20. modellek mellé), megosztás, útvonal a telefon térképalkalmazásában.
4. Rendelés csak beolvasott QR-kóddal: a helyszín oldal „Menü” gombja a menüt csak megtekintésre nyitja; a fizetés helyett „Olvasd be a pultnál lévő QR-kódot” gomb látszik. Egy beolvasás az adott üzleti napra érvényes az eszközön.
5. QR szkenner: `expo-camera` vonalkód-olvasóval, zseblámpával. A `rendel.namitiszunk.hu/q/[kód]` tartalmat a `GET /v1/qr/[kód]` végpont oldja fel (helyszín, pult, zóna, VIP asztal), és a beolvasásszámot is növeli, mint a webes átirányítás (53.). Idegen QR-nál hibaüzenet; megtagadott kameraengedélynél magyarázat és Beállítások link.

**Elfogadási feltételek.**

- [ ] A lista és a térkép ugyanazokat az Aktív helyszíneket mutatja; helyengedély nélkül is használható.
- [ ] Saját QR-kód beolvasása 2 másodpercen belül a helyes pult menüjét nyitja; idegen QR hibát ad.
- [ ] QR-beolvasás nélkül a menü csak megtekinthető, fizetni nem lehet.
- [ ] Androidon a térkép a release buildben is betölt.

**Tesztelés.** Jest a QR-feloldásra és a beolvasás érvényességére; Maestro: Felfedezés → helyszín → menü megtekintése; szkennelés kézzel, valódi eszközön, nyomtatott kódokkal, gyenge fényben.

**Függőségek és kockázatok.** Függ: 20, 29, 40, 53, 75, 84. Erre épül: 86, 88, 91. Kockázat: hiányzó vagy rosszul korlátozott Google Maps kulcsnál a release buildben üres a térkép; ezt az első preview buildben ellenőrizni kell.

#### 86. Menü, termék és kosár mobilon

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 86 | Menü, termék és kosár mobilon | `apps/mobile/app/v/[slug]/` | Nincs | Ugyanaz a rendelési folyamat natívan | 🔴 | M |

**Jelenlegi állapot.** A doksi képernyői: menü (kategóriasáv, termékkártyák, címkék, elfogyott szürkén), termék részletei (opciók felárral, mennyiség, megjegyzés), kosár. A webes megfelelők: 40. (`getPublicMenu`, VIP-szűrés, állapot 30 másodperces lekérdezése) és 41.; a borravaló, a promóciós kód és a szervizdíj a weben a pénztárban van (42.). Tételkorlát alapból 10 (58.).

**Probléma.** Ha az app saját ár- vagy elérhetőségi logikát kap, ugyanarra a QR-kódra más menüt vagy árat mutathat, mint a web.

**Megoldás.**

1. Menü a `getPublicMenu` (40.) api-végpontjából: kategóriasáv, keresés, kártyák (kép opcionális, `expo-image`), elfogyott szürkén; „Csak VIP” kategóriák csak VIP asztal QR-jával.
2. Termék lap: opciók, felár, mennyiség, megjegyzés; a tételkorlát a helyszín beállításából.
3. Kosár helyszínenként, az eszközön tárolva az üzleti nap végéig; a borravaló, a kód és a szervizdíj a webenéhez hasonlóan a fizetés képernyőn (87.).
4. Állapot (szünet, elfogyott) 30 másodperces lekérdezéssel, mint a weben; változásnál sáv, és a kosár érintett tételei megjelölve.

**Elfogadási feltételek.**

- [ ] Ugyanarra a QR-kódra ugyanaz a menü, ár és elérhetőség, mint a weben.
- [ ] VIP kategória csak VIP asztal QR-jával látszik.
- [ ] Alapbeállításnál a 11. tétel nem tehető a kosárba.
- [ ] Ha egy kosárban lévő tétel közben elfogy, a vendég a fizetés előtt jelzést kap, és a tétel kikerül.

**Tesztelés.** Jest a kosárlogikára; Maestro: QR-link → menü → opció → kosár.

**Függőségek és kockázatok.** Függ: 22, 40, 41, 84, 85. Erre épül: 87, 92. Kockázat: kicsi; az árat a szerver a fizetés előtt mindig újraszámolja (22.).

#### 87. Fizetés mobilon (PaymentSheet)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 87 | Fizetés mobilon (PaymentSheet) | `apps/mobile/src/payments/` | Nincs | Apple Pay, Google Pay, mentett kártyák | 🔴 | M |

**Jelenlegi állapot.** A doksi: Stripe React Native SDK, PaymentSheet, Apple Pay, Google Pay; a fizetés képernyőn mentett kártyák, új kártya, 18+ nyilatkozat, ÁSZF; értesítési sorrend: app és engedély esetén push, különben élő oldal és SMS. Döntések: direct charge application fee-vel (33.); borravaló 0 / 5 / 10 / 15% vagy egyéni, alapból 0%; SMS csak a pénztárban megadott telefonszámmal (2026-11-02). A weben Stripe Link menti a kártyát (42.).

**Probléma.** Az app fő érve az egy érintéses fizetés. Direct charge-nál a kártya a kapcsolt fiókon terhelődik, ezért a platformon mentett Stripe Customer nem használható közvetlenül minden klubnál.

**Megoldás.**

1. Fizetés képernyő: részösszeg, szervizdíj, borravaló, promóciós kód (60.), végösszeg, 18+ nyilatkozat, ÁSZF. Telefonszám-mező SMS-hez csak akkor, ha az értesítés nincs engedélyezve.
2. Szerver: ugyanaz a fizetéslétrehozó függvény, mint a weben (33.), `source: app` jelöléssel; PaymentIntent a kapcsolt fiókon, application fee-vel, idempotencia-kulccsal.
3. Kliens: `initStripe` a platform kulcsával és a helyszín `stripeAccountId`-jével; PaymentSheet Apple Pay-jel (merchant ID a platformon, 7.) és Google Pay-jel.
4. Mentett fizetés: Apple Pay, Google Pay és Stripe Link a PaymentSheetben, mint a weben; saját Stripe Customer és kártyalista nincs.
5. 3D Secure a PaymentSheetben, visszatérés a `namitiszunk://stripe-redirect` címre (91.). Elutasításnál vagy megszakításnál a rendelés Fizetésre vár marad, majd Megszakítva lesz (33., 35.).

**Elfogadási feltételek.**

- [ ] Apple Pay valódi iPhone-on és Google Pay Android eszközön teszt módban sikeres; a terhelés a kapcsolt fiókon, application fee-vel látszik.
- [ ] A 3D Secure teszt kártya végigmegy, és az app a rendeléshez tér vissza.
- [ ] Elutasított kártya után a kosár megmarad, és a fizetés újrapróbálható.
- [ ] Ugyanarra a kosárra a web és az app ugyanazt a díjat számolja.

**Tesztelés.** Jest; Maestro a PaymentSheet kártyaűrlapjával, teszt kártyával; Apple Pay és Google Pay kézzel, valódi eszközön.

**Függőségek és kockázatok.** Függ: 7, 22, 33, 42, 60, 84, 86. Erre épül: 88. Kockázat: az appon belüli Apple Pay direct charge-dzsal a platform merchant ID-jával megy; ezt a fejlesztés első hetében teszt módban ki kell próbálni. A Link elérhetősége ugyanúgy a kapcsolt fiók beállításától függ, mint a weben.

#### 88. Rendelés állapota, átvétel, rendeléseim

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 88 | Rendelés állapota, átvétel, rendeléseim | `apps/mobile/app/o/[orderId].tsx`, `apps/mobile/app/(tabs)/orders/` | Nincs | Élő állapot, átvételi képernyő, egy érintéses újrarendelés | 🔴 | M |

**Jelenlegi állapot.** A doksi képernyői: rendelés állapota (nagy rendelésszám, állapotsáv, becsült idő, pult, tételek), átvétel (teljes képernyő, mozgó háttér, maximális fényerő, utána 1–5 csillag), rendeléseim (újrarendelés, problémajelzés). Döntések: átvétel szám és élő képernyő alapján (2026-11-01); a Kiegészítő döntések szerint QR-beolvasás a Fázis 3-ban, a személyzet móddal, a szám tartalékként marad (94.). A webes megfelelők: 43. (élő oldal, ketyegő óra), 44. („Ez nem nyugta”), 45. (értékelés), 46. (problémajelzés kategóriával), 47. (előzmények, „Rendeld újra”).

**Probléma.** Az átvételi képernyőnek a sötét, zsúfolt pultnál is olvashatónak kell lennie, az újrarendelésnek pedig nem szabad kikerülnie a helyszíni QR-szabályt.

**Megoldás.**

1. Állapot képernyő élő frissítéssel az Ably `order:{id}` csatornán (31.); újracsatlakozáskor egy lekérdezés pótolja a kimaradt váltást.
2. Átvétel: teljes képernyős szám, mozgó háttér és ketyegő óra, mint a weben (43.); maximális fényerő (`expo-brightness`), ébren tartás (`expo-keep-awake`).
3. Értékelés átvétel után (45.), problémajelzés kategóriával (46.); a visszaigazolás (44.) a webes oldalon, appon belüli böngészőben nyílik.
4. Rendeléseim: fiókkal a fiók rendelései, vendégként az eszköz vendégtokenjeihez tartozók. „Rendeld újra”: a kosár az aktuális árakkal és elérhetőséggel töltődik újra; fizetni csak az aznapi QR-beolvasás után lehet (85.).

**Elfogadási feltételek.**

- [ ] A pultos állapotváltása 2 másodpercen belül megjelenik az appban.
- [ ] Az átvételi képernyő maximális fényerőn és ébren marad, amíg nyitva van.
- [ ] Újrarendelésnél az elfogyott tétel kimarad, és a vendég látja, mi maradt ki.
- [ ] Vendégként leadott rendelés az app újraindítása után is látszik.

**Tesztelés.** Jest az újrarendelés logikájára; Maestro: rendelés → állapotváltás API-hívással a pult oldalán → átvétel → értékelés.

**Függőségek és kockázatok.** Függ: 31, 43, 44, 45, 46, 47, 84, 85, 87. Erre épül: 90. Kockázat: háttérben az Ably-kapcsolat megszakad; ezért a Kész jelzést a push (90.) adja, nem a nyitott kapcsolat.

#### 89. Profil, súgó, GDPR

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 89 | Profil, súgó, GDPR | `apps/mobile/app/(tabs)/profile/` | Nincs | Áruházi követelmény a fióktörlés; adatexport GDPR miatt | 🟠 | M |

**Jelenlegi állapot.** A doksi: Profil (név, telefon, e-mail, születési dátum, fizetési módok, számlázási adatok, értesítési beállítások, nyelv; export, fióktörlés, kijelentkezés) és Súgó (GYIK, kapcsolat, ÁSZF, adatvédelem); adatminimalizálás az NFR-ben. A webes vendégfiók már tud adatexportot és fióktörlést (47.). Az App Store és a Google Play is megköveteli az appon belüli fióktörlést.

**Probléma.** Fióktörlés nélkül az appot az áruházak elutasítják; ha a törlés más logikával fut, mint a weben, az adatok részben megmaradnak.

**Megoldás.**

1. Profil: név, e-mail, telefon (opcionális), nyelv, értesítési beállítások (rendelésállapot; marketing csak külön bekapcsolással, 111.), analitikai hozzájárulás, kijelentkezés, kedvencek kezelése (85.).
2. Kimarad a születési dátum (a 18+ nyilatkozattal megy, 42.), a fizetési módok listája (saját kártyatárolás nincs, 87.) és a számlázási adat (a céges számla a 104. feladat).
3. Adatexport és fióktörlés ugyanazzal a `packages/core` logikával, mint a weben (47.); fióktörlés az appban, és webes törlési link a Google Play adatlaphoz.
4. Az analitikai hozzájárulás visszavonásakor a PostHog memóriamódra vált, és törli a tárolt azonosítót.
5. Súgó: GYIK, kapcsolat e-mailben, ÁSZF és adatvédelmi tájékoztató a landing oldalairól (74.), appon belüli böngészőben.

**Elfogadási feltételek.**

- [ ] A fióktörlés a Profilból legfeljebb 3 lépésben elérhető, és a 47. törlési szabályai szerint töröl.
- [ ] Az adatexport ugyanúgy megérkezik, mint a webes fiókból.
- [ ] A hozzájárulás visszavonása után az újraindított app új azonosítót kap.
- [ ] Marketing push csak külön bekapcsolás után mehet.

**Tesztelés.** Jest; Maestro: profil szerkesztése, hozzájárulás visszavonása, fióktörlés.

**Függőségek és kockázatok.** Függ: 3, 28, 47, 74, 84. Erre épül: 95. Kockázat: az Apple adatvédelmi címkéi és a Google Play adatbiztonsági űrlapja ennek a feladatnak az adatlistájára épül (95.); ha később új adat kerül be, mindkettőt frissíteni kell.

#### 90. Push értesítések

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 90 | Push értesítések | `apps/mobile/src/notifications/`, `packages/core/src/notify/push.ts` | Nincs | Az app fő értéke a megbízható „Kész” jelzés | 🔴 | M |

**Jelenlegi állapot.** A doksi eseményei: sikeres fizetés (push), pult elkezdte (csendes push), Kész (push hanggal, SMS tartalék), 10 percig nem vette fel (push), elutasítva vagy visszatérítve (push és e-mail), marketing (csak hozzájárulással). Értesítési sorrend: app és engedély esetén push, különben élő oldal és SMS. Döntés (2026-11-02): Expo Push Service; az Expo bekerül az adatvédelmi tájékoztatóba (3.).

**Probléma.** Zárolt telefonnál, zajos klubban csak a push jut el a vendéghez. Ha egy token érvénytelen, és ezt semmi nem észleli, a Kész jelzés csendben elmarad.

**Megoldás.**

1. Token: `expo-notifications` `getExpoPushTokenAsync` az engedély után; tárolás az api-n át (felhasználó vagy vendégtoken, platform, nyelv); a rendelés létrehozásakor az eszköz tokenje a rendeléshez kapcsolódik.
2. `packages/core/src/notify/push.ts`: küldés az Expo Push API-n keresztül, kötegelve; a kézbesítési nyugták (receipts) ellenőrzése Inngest-feladattal (35.); `DeviceNotRegistered` válasznál a token törlődik.
3. Események a doksi táblázata szerint; a „10 percig nem vette fel” Inngest-időzítéssel. Szövegek a `mobile` névtérben, a token nyelvén.
4. Kész tartalék: ha nincs token, vagy a kézbesítés hibát ad, és a vendég megadta a telefonszámát, SMS megy (36.).
5. Android értesítési csatornák: „Rendelés állapota” (magas fontosság, hang) és „Ajánlatok” (111.). A Kész értesítésre koppintva az átvételi képernyő nyílik (88.).

**Elfogadási feltételek.**

- [ ] A Kész push zárolt képernyőn, hanggal 5 másodpercen belül megérkezik iOS-en és Androidon.
- [ ] Engedély nélkül, megadott telefonszámmal SMS megy helyette.
- [ ] Az érvénytelen token a hibás nyugta után törlődik.
- [ ] A push a vendég nyelvén érkezik.

**Tesztelés.** Jest a csatornaválasztásra és a tartalékra; kézi teszt valódi eszközökön zárolt képernyővel és némított módban.

**Függőségek és kockázatok.** Függ: 3, 35, 36, 84, 88. Erre épül: 93, 111, 115. Kockázat: iOS-en a push csak valódi eszközön tesztelhető teljesen; az APNs-kulcsot az EAS kezeli az Apple fejlesztői fiókból (7.).

#### 91. Deep link és universal link

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 91 | Deep link és universal link | `apps/mobile/app.config.ts`, `apps/order/public/.well-known/` | Nincs | A QR-kód telepített appnál az appban nyíljon | 🟠 | S |

**Jelenlegi állapot.** A doksi: `namitiszunk://v/[helyszín]` deep link és universal link a `rendel.namitiszunk.hu/v/[helyszín]` címre; telepített appnál a QR-kód az appban nyílik. A QR-kódok a `/q/[kód]` címet kódolják (53.), ezért ennek is az appba kell vezetnie.

**Probléma.** Ha csak a `/v/*` útvonal van bekötve, a kihelyezett QR-kódok telepített app mellett is a böngészőben nyílnak, és az app fő értéke (push, mentett fizetés) elvész.

**Megoldás.**

1. iOS: `apple-app-site-association` az `apps/order/public/.well-known/` mappában (JSON tartalomtípussal), útvonalak: `/q/*`, `/v/*`, `/o/*`; Associated Domains: `applinks:rendel.namitiszunk.hu`.
2. Android: `assetlinks.json` ugyanott, az EAS aláíró tanúsítvány SHA-256 ujjlenyomatával; intent filter `autoVerify`-jal.
3. Appútvonalak: `/q/[kód]` → feloldás (85.) → menü; `/v/[slug]` → helyszín; `/o/[orderId]` → állapot. Az e-mailes belépés (84.) és a Stripe-visszatérés (87.) a `namitiszunk://` sémán.
4. App nélkül minden link továbbra is a webes rendelős oldalt nyitja.

**Elfogadási feltételek.**

- [ ] Telepített appnál a QR-kód a telefon kamerájával beolvasva az appban nyitja a helyes pultot.
- [ ] App nélkül a webes rendelős oldal nyílik.
- [ ] Az e-mailes belépési link az appban fejezi be a belépést.

**Tesztelés.** Kézi teszt valódi eszközön (iOS kamera, Android kamera); az AASA-fájl ellenőrzése az Apple CDN-jén keresztül; `adb shell pm verify-app-links`.

**Függőségek és kockázatok.** Függ: 30, 53, 84, 85. Erre épül: 95. Kockázat: az Instagram és más appok beépített böngészője nem mindig adja át a universal linket; ilyenkor a web nyílik, ami működő tartalék.

#### 92. Offline menü

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 92 | Offline menü | `apps/mobile/src/cache/` | Nincs | Gyenge térerőnél is betöltsön a menü | 🟡 | S |

**Jelenlegi állapot.** A doksi: a menü tárolt másolatból látszik, rendelni csak online lehet, erre egyértelmű üzenet figyelmeztet.

**Probléma.** A klubban a mobilnet gyakran akad; ha a menü minden megnyitáskor a hálózatra vár, a vendég feladja.

**Megoldás.**

1. Az utoljára betöltött menü helyszínenként az eszközön (`expo-file-system`), a menü `updatedAt` értékével.
2. Megnyitáskor a tárolt menü azonnal látszik, a háttérben frissül; új verziónál cserélődik.
3. Offline sáv: „Nincs kapcsolat – a menü lehet, hogy nem friss; rendelni csak online lehet”; a fizetés gomb tiltva.
4. Képek `expo-image` lemezes gyorsítótárával.

**Elfogadási feltételek.**

- [ ] Repülőgép-módban a korábban megnyitott menü 1 másodpercen belül betölt.
- [ ] Offline a fizetés nem indítható, és a sáv látszik.
- [ ] Online visszatéréskor az árak frissülnek, mielőtt fizetni lehet.

**Tesztelés.** Jest a gyorsítótár-logikára; kézi teszt repülőgép-módban.

**Függőségek és kockázatok.** Függ: 84, 86. Erre épül: nincs. Kockázat: elavult ár; a szerver a fizetés előtt mindig újraszámol (22.).

#### 93. Személyzet mód

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 93 | Személyzet mód | `apps/mobile/app/staff/` | Nincs | Natív kamerás átvétel és pultos funkciók telefonon | 🟠 | L |

**Jelenlegi állapot.** A doksi képernyői: belépés (helyszínkód és PIN), rendelési sor (Új / Készül / Kész), átvételi szkenner, elfogyott kapcsoló, szünet 5 / 10 / 15 perc. Döntések (2026-11-02): ugyanabban az appban, már az első verzióban; a belépés a Pult nézet döntése szerint (a Manager vagy a Tulaj lép be az eszközön, utána PIN); offline csak olvasható lista. A kamerás QR-olvasás átvételkor a Kiegészítő döntések szerint a Fázis 3-ban, a személyzet móddal jön (94.).

**Probléma.** A személyzet mód ugyanazokat a pénzhez kötött műveleteket végzi, mint a Pult nézet. Ha saját logikát kap, vagy a helyszínkód és egy 4 jegyű PIN elég a belépéshez, a PIN kipróbálható, és a két felület eltérhet.

**Megoldás.**

1. Belépés: Profil → „Személyzet mód” → a Manager vagy a Tulaj belép (30.) → helyszín és pult választása → pultos vagy VIP-host PIN (57.); PIN-váltás műszakonként. Kijelentkeztetés az Adminból (57.).
2. Rendelési sor: ugyanaz az állapotváltó függvény (21.) és Ably-csatorna (31.), mint a Pult nézetben (54.); hang és rezgés új rendelésnél; „Nyugta beütve” jelölő; elutasítás okkal Új állapotban.
3. Átvétel rendelésszám alapján, „Átvéve” gombbal; a kamerás beolvasás a 94. feladat.
4. Elfogyott kapcsoló és pultszünet 5 / 10 / 15 percre, az 54. logikájával; VIP-host nézet a szerepkör szerint (55.).
5. Offline: csak olvasható lista, minden gomb tiltva, mint a Pult nézetben.

**Elfogadási feltételek.**

- [ ] A pultos a telefonján 2 másodpercen belül ugyanazokat a rendeléseket látja, mint a tableten.
- [ ] Az appból végzett állapotváltás a naplóban a PIN gazdájához kerül.
- [ ] Manager- vagy Tulaj-belépés nélkül PIN-nel nem lehet belépni.
- [ ] Offline minden gomb tiltva.

**Tesztelés.** Jest; Maestro: személyzet mód → Készül → Kész → Átvéve; párhuzamos kézi teszt tablettel és telefonnal ugyanazon a pulton.

**Függőségek és kockázatok.** Függ: 21, 30, 31, 54, 55, 57, 84, 90. Erre épül: 94, 95, 96. Kockázat: az áruházi felülvizsgálónak be kell tudnia lépni a személyzet módba, az e-mailes link viszont az ő postafiókjába nem érkezik meg; a felülvizsgálói hozzáférés módját a 95. előtt meg kell oldani.

#### 94. QR-beolvasás átvételkor

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 94 | QR-beolvasás átvételkor | `apps/admin/app/pult/[barId]/scan/`, `apps/mobile/app/staff/scan.tsx` | Nincs | A döntés szerint a Fázis 3-ban, a személyzet móddal jön; a szám + élő képernyő tartalék marad | 🟠 | M |

**Jelenlegi állapot.** Döntések: átvétel szám és élő képernyő alapján (2026-11-01); a Kiegészítő döntések szerint a QR-beolvasás a Fázis 3-ban, a személyzet móddal jön, a szám + élő képernyő tartalék marad. A doksi: az átvételi szkenner a rendelés adatait és egy „18+ ellenőrizve” jelölőt mutat; a vendég átvételi képernyőjén QR-kód és 4 jegyű kód. A személyzet mód az app első verziójában van (93.).

**Probléma.** Zsúfolt pultnál a szám alapú ellenőrzésnél előfordulhat téves átadás. A QR-kódnak képernyőfotóról és másik helyszín kódjáról sem szabad átmennie.

**Megoldás.**

1. Ütemezés: a személyzet móddal (93.) együtt, a Fázis 3-ban; a pilot mérése (82.) a vendégoldali kód megjelenését nem befolyásolja.
2. Vendégoldal: a rendelés-azonosítót és egy percenként változó HMAC-aláírást tartalmazó QR-kód a szám mellett, a webes élő oldalon (43.) és az appban (88.).
3. Pult nézet (PWA): böngészős kamera `BarcodeDetector` API-val, ahol nincs, `@zxing/browser` tartalékkal. Személyzet mód: `expo-camera`.
4. Beolvasás → a szerver ellenőrzi az aláírást, az időt és a helyszínt → rendelés adatai és „18+ ellenőrizve” jelölő → Átvéve (21.). A szám alapú átadás tartalékként marad.

**Elfogadási feltételek.**

- [ ] Beolvasástól Átvéve állapotig legfeljebb 2 másodperc.
- [ ] Képernyőfotóról (lejárt aláírás) és másik helyszín kódjáról a beolvasás hibát ad.
- [ ] A „18+ ellenőrizve” jelölés megjelenik a rendelés naplójában.

**Tesztelés.** Vitest az aláírásra és a lejáratra; kézi teszt sötét pultnál, klubfényben, tablettel és telefonnal.

**Függőségek és kockázatok.** Függ: 21, 43, 54, 88, 93. Erre épül: nincs. Kockázat: sötét pultnál és túl fényes kijelzőn a beolvasás lassú lehet; ezért marad a szám alapú tartalék.

#### 95. Áruházi kiadás (EAS)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 95 | Áruházi kiadás (EAS) | `apps/mobile/eas.json`, áruházi anyagok | Nincs | Nyilvános indulás az App Store-ban és a Google Playen | 🔴 | M |

**Jelenlegi állapot.** A doksi: EAS Build, EAS Update az áruházi jóváhagyás nélküli javításokhoz; iOS és Android egyszerre (2026-11-01). A terv eddig: Apple Developer és Google Play fiók (7.), védjegykeresés a pilot után (9.), külső pentest a nyilvános indulás előtt (79.).

**Probléma.** Az első áruházi felülvizsgálat alkoholos tartalom, fizetés és fiókkezelés miatt több körös lehet; ha az anyagok, az adatvédelmi nyilatkozatok és a felülvizsgálói hozzáférés nincsenek kész, az indulás hetekkel csúszik.

**Megoldás.**

1. `eas.json` profilok: development, preview (TestFlight és Play belső teszt), production; automatikus buildszám.
2. EAS Update csak JS-javításra, `runtimeVersion` az appverzió szerint; natív változásnál új build és felülvizsgálat.
3. Áruházi anyagok: név a 9. eredménye szerint, leírás magyarul és angolul, képernyőképek, ikon, adatvédelmi és támogatási URL (74.), kategória (Étel és ital); a korhatár-kérdőív az alkoholos tartalom szerint kitöltve.
4. Adatvédelmi nyilatkozatok: Apple adatvédelmi címkék és Google Play adatbiztonsági űrlap a 89. adatlistája szerint (Sentry, PostHog hozzájárulással, Expo push, Stripe).
5. Felülvizsgálói hozzáférés: demó helyszín Stripe teszt módban és a személyzet módhoz (93.) használható felülvizsgálói belépés.
6. Belső teszt egy hétig TestFlighton és Play belső teszten a pilot klub személyzetével és ismerősökkel; utána nyilvános kiadás mindkét áruházban, és a landing app gombjai (75.).

**Elfogadási feltételek.**

- [ ] Az app mindkét áruházban jóváhagyva és nyilvánosan elérhető.
- [ ] Egy EAS Update JS-javítás felülvizsgálat nélkül megérkezik a production buildre.
- [ ] Az adatvédelmi címkék és az adatbiztonsági űrlap egyezik az adatvédelmi tájékoztatóval (3.).

**Tesztelés.** TestFlight és Play belső teszt; ellenőrzőlista a felülvizsgálati irányelvekre (appon belüli fióktörlés, Apple-belépés, alkoholos tartalom, felülvizsgálói hozzáférés).

**Függőségek és kockázatok.** Függ: 3, 7, 9, 79, 84–94, 96. Erre épül: 75. Kockázat: az első Apple-felülvizsgálat több körös lehet; az indulás előtt 1–2 hét tartalék kell.

#### 96. Mobil E2E tesztek (Maestro)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 96 | Mobil E2E tesztek (Maestro) | `apps/mobile/.maestro/` | Nincs | A doksi szerinti tesztszint a mobilon | 🟠 | M |

**Jelenlegi állapot.** A doksi: mobil E2E Maestróval, egységtesztek Jesttel (rendelés-állapotgép, díjszámítás, jogosultságok). A webes E2E környezete (78.) és a seed adatok (27.) készen vannak.

**Probléma.** Az app a webtől függetlenül romolhat el (natív modul, Expo-frissítés, deep link), és egy hibás kiadás az áruházi felülvizsgálat miatt napokig élesben marad, ha nem JS-szel javítható.

**Megoldás.**

1. Maestro-folyamatok: első indítás és vendég mód; QR-link megnyitása `openLink`-kel a `/q/[kód]` címre (a kamera nem szimulálható); menü → kosár → fizetés teszt kártyával a PaymentSheet kártyaűrlapján; állapotváltás API-hívással → átvétel; Profil → fióktörlés; személyzet mód.
2. Futtatás preview buildre iOS szimulátoron és Android emulátoron a GitHub Actionsben, a mobil kódot érintő PR-oknál és kiadás előtt; a backend a 78. környezete Stripe teszt módban, seed adatokkal.
3. Mobil kódot érintő PR piros Maestro mellett nem merge-elhető.

**Elfogadási feltételek.**

- [ ] A kritikus út iOS szimulátoron és Android emulátoron is zöld.
- [ ] Egy szándékosan elrontott deep link-útvonal a PR-t pirosra váltja.

**Tesztelés.** Szándékos hibával próbált PR; kétszeri futtatás a stabilitás ellenőrzésére.

**Függőségek és kockázatok.** Függ: 13, 27, 78, 84–91, 93. Erre épül: 95. Kockázat: az Apple Pay és a Google Pay szimulátoron nem tesztelhető, ezek kézi tesztje valódi eszközön marad (87.); a macOS-futtató a GitHub Actionsben drágább, ezért az iOS-futás csak mobil változásnál indul.

### K. Skálázás és bővítés (Fázis 4)

#### 97. Több pult és zóna felülete

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 97 | Több pult és zóna felülete | `apps/admin/app/(dashboard)/bars/`, `apps/order/components/bar-picker/` | Az adatmodell kezeli, a felület nincs meg | Egy átlagos klubnak 3–5 pultja van | 🟠 | M |

**Jelenlegi állapot.** Döntés (2026-11-01): egy átlagos helyszínen 3–5 pult és több zóna van; a felület a pilot után, az adatmodell már most kezeli. A pilot klubban 1 pult van. A terv eddig: pultok, zónák és QR-átirányítás (53.); tételenként beállítható, melyik pulton kapható (51.); áttétel másik pultra (54.); pultonkénti bontás a riportokban és az Irányítópulton (61., 63.); becsült várakozás a 40. státuszvégpontjában. A rendelős oldal egy pultos helyszínen nem mutat választót (40.). Döntés (2026-11-02): a Fázis 4 első blokkjának része.

**Probléma.** Több pultnál a vendég nem mindig a QR-kód pultjánál akar átvenni, vagy a QR pultja bezár, szünetel. Választó nélkül a rendelés zárt pultra menne, vagy a vendég nem tud rendelni.

**Megoldás.**

1. Rendelős oldal (`bar-picker`): ha a helyszínen 1-nél több nyitott pult van, pultválasztó a fejlécben, előválasztva a QR pultjával. Pultonként: név, állapot (Nyitva / Szünetel X percig / Zárva) és becsült várakozás a 40. státuszvégpontjából. Zárt és szünetelő pult nem választható.
2. Pultváltáskor a menü a pult kínálatára szűrődik (51.). A kosár azon tételei, amelyek az új pulton nem kaphatók, jelölést kapnak, és a pénztár addig nem enged tovább, amíg el nem távolítják őket (48.).
3. Tartalék pult: a zóna beállításában (53.) opcionális tartalék pult. Ha a zóna pultja zárva van vagy szünetel, a QR-átirányítás a tartalékra visz, és a vendég ezt egy sávban látja.
4. Admin, Pultok: lista húzásos sorrenddel, nyitva / zárva kapcsoló pultonként, zóna ↔ pult hozzárendelés táblázatban; a zónák QR-kódjai egy PDF-ben letölthetők (53.).
5. Onboarding varázsló (68.): a pultok és zónák lépése több pultot is felvesz.
6. Mobilapp: ugyanez a választó a menü képernyőn (86.), ugyanazzal a státuszvégponttal.

**Elfogadási feltételek.**

- [ ] 3 pultos seed helyszínen a vendég pultot választ, a menü a pult kínálatát mutatja, és a rendelés a választott pult Pult nézetébe érkezik.
- [ ] Szünetelő pult nem választható; a zóna QR-kódja a tartalék pultra visz.
- [ ] Az új pulton nem kapható tétellel a pénztár nem fizethető.
- [ ] Egy pultos helyszínen a választó nem jelenik meg.

**Tesztelés.** Vitest a tartalék-átirányításra és a kosár-ellenőrzésre; Playwright 3 pultos seed helyszínen (pultváltás, szünet, tartalék); Maestro a mobil választóra.

**Függőségek és kockázatok.** Függ: 40, 48, 51, 53, 54, 61, 63, 68, 86. Erre épül: 108. Kockázat: nyitás után, kevés Kész rendelésnél a becsült várakozás pontatlan; ilyenkor a választó becslés nélkül mutatja a pultot.

#### 98. Láncfelület: helyszínváltó, összesített riport

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 98 | Láncfelület: helyszínváltó, összesített riport | `apps/admin/components/venue-switcher/`, `apps/admin/app/(dashboard)/reports/` | Az adatmodell kezeli, a felület nincs meg | Több klubot üzemeltető tulajok | 🟠 | M |

**Jelenlegi állapot.** Döntés (2026-11-01): láncok támogatása; módosítva: a felület (helyszínváltó, összesített riport) a pilot után, az adatmodell már most támogatja. Egy felhasználó több helyszínen lehet tag, helyszínenként más szerepkörrel (23.). Az Admin fejlécében a helyszínváltó csak akkor látszik, ha a felhasználó több helyszín tagja (50.). A riportok helyszínenként számolnak (61.).

**Probléma.** A több klubot üzemeltető Tulaj helyszínenként külön nézi a számokat, és kézzel adja össze őket. Az összesítés nem mutathat olyan helyszínt, ahol a felhasználó nem Tulaj; ha a helyszínlistát a kérés adja, egy kézzel összeállított kérés más klub adatait kérheti le.

**Megoldás.**

1. Helyszínváltó (`venue-switcher`): kereshető lista a felhasználó helyszíneiről, mellettük a szerepkörrel. A váltás a munkamenet aktív helyszínét állítja (30.), és minden szerveroldali lekérdezés ezt használja (23.).
2. Riportok → „Összes helyszín” nézet (csak a Tulaj-tagságok): bevétel, rendelésszám, átlagos kosár, átlagos elkészítési idő, borravaló és visszatérítés helyszínenként egy táblában és összesítve; időszakszűrő, két időszak összehasonlítása.
3. Az aggregáció a 61. lekérdezéseit futtatja `venueId: { $in: [...] }` feltétellel; a helyszínlista szerveroldalon a tagságokból jön, nem a kérésből.
4. Export CSV-ben és Excelben, helyszín oszloppal (61.).
5. Irányítópult: „Ma este” összesítő kártya a helyszínekről (bevétel, aktív rendelések, szünetelő pultok); kattintásra helyszínváltás (63.).

**Elfogadási feltételek.**

- [ ] Két helyszínen Tulaj, egy harmadikon Manager felhasználónál az összesített riport csak a két helyszínt tartalmazza.
- [ ] Az összesített sor egyezik a helyszínenkénti riportok összegével a seed adatokon.
- [ ] Más helyszín azonosítójával kézzel összeállított kérés 403.
- [ ] Helyszínváltás után a Menü, a Rendelések és a Riportok a választott helyszín adatait mutatja.

**Tesztelés.** Vitest jogosultság-tesztek a 23. mintájára; Playwright két helyszínes seed Tulajjal (váltás, összesítés, export).

**Függőségek és kockázatok.** Függ: 20, 23, 30, 50, 61, 63. Erre épül: nincs. Kockázat: több helyszín hosszú időszakos aggregációja lassú lehet; ha a lekérdezés 2 mp fölött van, napi előaggregált gyűjtemény kell.

#### 99. Tételenkénti elutasítás és részleges visszatérítés

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 99 | Tételenkénti elutasítás és részleges visszatérítés | `packages/core/src/orders/`, `apps/admin/app/pult/[barId]/` | A pilotban csak teljes elutasítás van | Egy elfogyott tétel miatt ne vesszen el az egész rendelés | 🟠 | M |

**Jelenlegi állapot.** Döntés (2026-11-01): elutasítani csak Új állapotban lehet, a teljes rendelést; tételenkénti elutasítás a pilot után. A doksi: „Tétel nem elérhető → a tétel áthúzása egy lépésben részleges visszatérítést indít és elfogyottra állítja a terméket.” A 34. `refundOrder` részleges összeget is kezel, idempotens, és az application fee arányos részét is visszatéríti. Munkafeltételezés: Új állapotban még nincs nyugta, így nem kell sztornó. Döntés (2026-11-02): a Fázis 4 első blokkjának része.

**Probléma.** Egy elfogyott tétel miatt ma az egész rendelés elveszik. A visszajáró összeg a kedvezmény, a szervizdíj és a borravaló miatt nem egyszerűen a tétel ára; ha rosszul számoljuk, a vendég vagy a klub jár rosszul.

**Megoldás.**

1. Pult nézet, Új kártya: „Tétel nem elérhető” → tétellista mennyiséggel; a kijelölt tételek áthúzva, megerősítés egy érintéssel. „Termék elfogyottra állítása” jelölő, alapból bejelölve.
2. `rejectItems(orderId, items[{lineId, qty}], actor)` a `packages/core/src/orders/`-ben: csak Új állapotban. Ha minden tétel kiesik, a meglévő teljes elutasítás fut (34.).
3. Visszajáró összeg: a 22. díjszámítás újrafuttatása a megmaradt tételekre, ugyanazzal a promóciós kóddal (a kód feltételei nem ellenőrződnek újra); a százalékos szervizdíj és borravaló újraszámolva, a fix szervizdíj és az egyéni borravaló változatlan. Visszatérítés = eredeti végösszeg − új végösszeg, a `refundOrder`-rel (34.), „Tétel nem elérhető” okkal.
4. A tételek `rejectedQty` mezőt kapnak; a rendelés Új állapotban marad, a pult folytatja. A vendég élő oldalán (43.) a tétel áthúzva, a visszatérítés összegével; push és e-mail (37., 90.).
5. Ugyanez a személyzet módban (93.), ugyanazzal a függvénnyel. A riportok (61.) a nettó tételeket számolják.

**Elfogadási feltételek.**

- [ ] 3 tételes rendelésből 1 tétel elutasítása után a vendég a 22. szerint újraszámolt különbözetet kapja vissza; a Stripe Dashboardon az application fee arányos része is visszajár.
- [ ] Nem Új állapotú rendelésnél a tételenkénti elutasítás 409.
- [ ] Minden tétel elutasítása teljes elutasítást és teljes visszatérítést ad.
- [ ] Dupla érintés egy Stripe-refundot hoz létre.

**Tesztelés.** Vitest a különbözetre (promóciós kód % és fix; szervizdíj % és fix; borravaló % és egyéni); Stripe CLI teszt módban; Playwright: tétel-elutasítás a Pult nézetben és a vendég élő oldala.

**Függőségek és kockázatok.** Függ: 21, 22, 34, 43, 54, 93. Erre épül: 105. Kockázat: a vendég a megcsonkított rendelést már nem akarhatja, de automatikus elfogadásnál nem mondhatja le (Kiegészítő döntések); az élő oldal ilyenkor a Problémajelzésre (46.) mutat.

#### 100. Időzített happy hour

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 100 | Időzített happy hour | `packages/core/src/pricing/price-rules.ts`, `apps/admin/app/(dashboard)/menu/` | Nincs | A döntés szerint a pilot után | 🟡 | M |

**Jelenlegi állapot.** Döntés (2026-11-01): időzített happy hour a pilot után; dinamikus árazás nincs. A doksi: a Menü modulban árszabály ütemezése (pl. happy hour 22–23 óra, −20%), az Akciók között happy hour, a menüben a happy hour ár áthúzva. A részösszeg a tételárakból jön (22.); a menü szerveroldalon renderelt és gyorsítótárazott (40.).

**Probléma.** A gyorsítótárazott menü és a fizetéskori ár eltérhet: ha 23:00-kor véget ér a happy hour, a menü még a kedvezményes árat mutathatja, a szerver pedig a teljes árat számolja. Az árnak egy helyen kell eldőlnie.

**Megoldás.**

1. `PriceRule`: név, napok, kezdés–vég (átnyúlhat éjfélen, `Europe/Budapest`), típus (% kedvezmény vagy fix ár), hatókör (termékek vagy kategóriák), aktív.
2. `effectivePrice(item, at)`: az érvényes szabályok közül a legalacsonyabb árat adó; a szabályok nem halmozódnak. A promóciós kód (60.) a happy hour árakból számolt részösszegre jön, a 22. képlete nem változik.
3. Az ár a PaymentIntent létrehozásakor dől el (33.); a rendelési tétel pillanatképe (51.) az eredeti árat és a szabály azonosítóját is tárolja. A pénztár megnyitásakor a kosár újraszámol; ha az ár változott, a vendég sávban látja.
4. Menü: áthúzott eredeti ár és „Happy hour 23:00-ig” címke. A menü gyorsítótára a szabály kezdetén és végén frissül (Inngest ütemezett `bumpMenuVersion`, 35.; a kulcs a `Venue.menuVersion`, 51.).
5. Admin: Menü → Árszabályok fül (lista, létrehozás, szüneteltetés), az Akciók oldalon is listázva (60.). Riport: a happy hour alatti rendelések száma és bevétele (61.).
6. A mobilapp ugyanazt az API-árat mutatja (86.).

**Elfogadási feltételek.**

- [ ] 22:00–23:00 közötti −20%-os szabálynál a 22:59-kor létrehozott PaymentIntent a kedvezményes, a 23:00-kor létrehozott a teljes árat tartalmazza.
- [ ] Két átfedő szabálynál a legalacsonyabb ár érvényes, halmozás nincs.
- [ ] A menü a szabály vége után 60 mp-en belül a teljes árat mutatja.
- [ ] Az éjfélen átnyúló szabály (23:00–01:00) mindkét naptári napon helyesen működik.

**Tesztelés.** Vitest rögzített órával (időzóna, éjfél, nyári időszámítás váltása); Playwright óra-szimulációval.

**Függőségek és kockázatok.** Függ: 22, 33, 35, 40, 51, 60, 61, 86. Erre épül: 101. Kockázat: a péntek éjjeli 01:00 még pénteki üzleti nap (24.); a szabály napjai üzleti napra értendők, és az Admin ezt kiírja.

#### 101. Események és eseménymenük

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 101 | Események és eseménymenük | `apps/admin/app/(dashboard)/events/` | Nincs | Eseménynaptár és saját menü vagy ár eseményenként | 🟡 | M |

**Jelenlegi állapot.** Döntés (2026-11-01): eseményenkénti menü a pilot után; addig termék elrejtése és elfogyott kapcsoló. A doksi: eseménynaptár (pl. Latin Night minden péntek); esemény kezdéssel, véggel, borítóképpel, saját menüvel vagy árakkal; megjelenik az app Felfedezés oldalán; a rendelős oldal fejlécében az esemény neve. Az Események menüpont ezzel a feladattal jön (50.).

**Probléma.** Az esemény estéjén más a kínálat és más az ár. Ha a klub ezt kézi elrejtéssel és átárazással oldja meg, utána elfelejtheti visszaállítani, és másnap rossz menü és rossz ár megy ki.

**Megoldás.**

1. `Event`: helyszín, név, leírás, borítókép (38.), kezdés, vég, ismétlődés (egyszeri vagy hetente a kiválasztott napokon, végdátummal), menümód (teljes menü vagy csak kijelölt termékek), opcionális árak a 100. `PriceRule`-jával, `eventId` hatókörrel.
2. Aktív esemény idején a menü (40., 86.) a kijelölt termékeket és az esemény árait mutatja, a fejlécben az esemény nevével; vége után automatikusan visszaáll, a 100. gyorsítótár-frissítésével.
3. A rendelés pillanatképe az `eventId`-t is tárolja; riport: bevétel és rendelésszám eseményenként (61.).
4. Admin Események modul: naptárnézet és lista, létrehozás, duplikálás, előnézet (51.). Átfedő esemény ugyanazon a helyszínen nem menthető.
5. Megjelenés az app Felfedezés oldalán és a helyszín oldalán (85.), valamint a webes rendelős oldal fejlécében.

**Elfogadási feltételek.**

- [ ] Hetente pénteken 22:00–04:00 ismétlődő eseménynél a menü péntek 22:00-kor átvált, és szombat 04:00 után visszaáll.
- [ ] Az esemény ára szerepel a PaymentIntentben; az esemény után a normál ár.
- [ ] Az esemény megjelenik a Felfedezés ma esti listájában.
- [ ] A riport eseményenként bontja a bevételt.

**Tesztelés.** Vitest az ismétlődésre (időzóna, éjfél, nyári időszámítás); Playwright: esemény létrehozása és menüváltás rögzített órával.

**Függőségek és kockázatok.** Függ: 38, 40, 50, 51, 61, 85, 86, 100. Erre épül: nincs. Kockázat: ha a klub az eseményt az utolsó pillanatban módosítja, a gyorsítótár a mentéskor frissül (51. mentési logikája), különben a vendég percekig a régi menüt látja.

#### 102. Beépített jegykezelés

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 102 | Beépített jegykezelés | `apps/hq/app/(dashboard)/support/` | A pilotban e-mail és WhatsApp | Több klubnál az e-mailes support nem követhető | 🟠 | L |

**Jelenlegi állapot.** Döntés (2026-11-01): beépített jegykezelés a Saját adminban, rendeléshez vagy helyszínhez kapcsolva; a pilotban e-mail és WhatsApp. Döntés (2026-11-02): automatikusan jegy lesz a vendég problémajelzéséből (46.), az Admin új Segítség űrlapjából és a platform support címére érkező levélből; a WhatsApp-üzenet kézzel rögzíthető. Céges postafiók nincs, a küldő cím `noreply@namitiszunk.hu` (5.). A rendeléskereső kész (69.). A Fázis 4 első blokkjának része.

**Probléma.** Több klubnál a szétszórt levelekből nem látszik, mi nyitott, mi melyik rendeléshez tartozik, és mi maradt válasz nélkül. Bejövő levélhez ma nincs cím és MX-rekord.

**Megoldás.**

1. Cím: `support@namitiszunk.hu`, a Resend bejövő levelezésével; MX-rekord a Vercel DNS-ben (5.). A bejövő levél webhookja az `api.namitiszunk.hu` egy végpontjára érkezik, aláírás-ellenőrzéssel.
2. `Ticket`: forrás (problémajelzés / Admin űrlap / e-mail / WhatsApp kézzel), helyszín és rendelés (opcionális), bejelentő elérhetősége, tárgy, üzenetek, állapot (Új / Folyamatban / Válaszra vár / Lezárva), időbélyegek; minden írás auditnaplóba kerül (26.).
3. Létrehozás: a `reportProblem` (46.) a meglévő e-mailek mellett jegyet is nyit. Az Admin Segítség űrlapja (`apps/admin/app/(dashboard)/help/`: kategória, szöveg, opcionális rendelésszám) a helyszínhez és a felhasználóhoz kötve nyit jegyet. A bejövő levél új jegyet nyit, vagy a tárgyban lévő `[#J-123]` azonosító alapján a meglévőhöz fűződik.
4. HQ Support: lista szűrőkkel (állapot, forrás, helyszín); jegy nézet a kapcsolt rendeléssel (69.) és helyszínnel; válasz a felületről (Resend, feladó `support@`, a tárgyban a jegyazonosító); belső megjegyzés; állapotváltás; „WhatsApp-üzenet rögzítése” űrlap.
5. A klub az Admin Segítség oldalán látja a saját jegyeit és a válaszokat. Új jegyről értesítés a 17. riasztási csatornáján.

**Elfogadási feltételek.**

- [ ] Problémajelzés, Admin Segítség űrlap és `support@`-ra küldött levél egyaránt jegyet nyit, a megfelelő forrással.
- [ ] A jegyre adott válaszra érkező válaszlevél ugyanahhoz a jegyhez fűződik.
- [ ] A jegy rendelésszámmal a rendeléshez kapcsolható, és onnan megnyitható.
- [ ] A klub csak a saját helyszíne jegyeit látja.

**Tesztelés.** Vitest a levél-szálkezelésre (azonosító a tárgyban, hiányzó azonosító); integrációs teszt a bejövő webhookra rögzített mintával; Playwright: Admin űrlap → HQ válasz → Admin nézet.

**Függőségek és kockázatok.** Függ: 5, 17, 26, 35, 37, 46, 50, 66, 69. Erre épül: 113. Kockázat: a Resend bejövő levelezésének elérhetőségét és díját a fejlesztés előtt ellenőrizni kell; ha nem megfelelő, másik bejövő levélszolgáltatás kell webhookkal, ami új adatfeldolgozó (3.). A jegyek személyes adatot tartalmaznak; a döntés szerint (2026-11-03) lezárás után 2 évig maradnak meg; ezt a szabályt a 28. törlési feladatai és az adatvédelmi tájékoztató (3.) közé fel kell venni.

#### 103. Automatikus jutalékszámla (Számlázz.hu API)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 103 | Automatikus jutalékszámla (Számlázz.hu API) | `packages/core/src/billing/szamlazz.ts`, `apps/api/src/inngest/monthly-invoices.ts` | A pilotban kézzel számlázol | Több klubnál a kézi számlázás nem tartható | 🟠 | M |

**Jelenlegi állapot.** Döntés (2026-11-01): Számlázz.hu API, automatikus havi jutalékszámla; a pilotban kézzel. Döntés (2026-11-02): a hónap első napján a HQ elkészíti a tervezeteket, a kiállítás jóváhagyás után, egy gombbal megy. A 73. adja a havi jutalékösszesítőt helyszínenként; a számlaszámot ott rögzíted, az Admin (65.) mutatja. A platform cége alanyi adómentes; a jutalékszámla ÁFA-kezelése könyvelői kérdés (2.). A számlázás naptári hónap szerint megy (65.); a PDF-et a Számlázz.hu küldi e-mailben.

**Probléma.** Több klubnál a kézi számlázás havonta órákat visz el, és egy elgépelt összeg vagy kimaradt klub eltérést okoz a klub könyvelésében. Egy hálózati hiba utáni újrapróbálás dupla számlát állíthat ki.

**Megoldás.**

1. A platform Számla Agent kulcsa környezeti változóban (14.). `szamlazz.ts`: XML-összeállító és kliens a Számla Agenthez (kiállítás, sztornó, lekérdezés rendelésszám alapján).
2. `monthly-invoices` (Inngest, a hónap első napján 06:00, `Europe/Budapest`): helyszínenként tervezet a 73. összesítőből. Tételek: jutalék és SMS-díj (külön vagy együtt, a könyvelő válasza szerint, 2.), alanyi adómentes jelöléssel; fizetési mód: a Stripe-kifizetésből levonva, fizetettként.
3. HQ Pénzügy → Számlák: tervezetek listája. Figyelmeztetés, ha a tervezet eltér a Stripe-on ténylegesen levont application fee-től (73. egyeztetése), vagy hiányzik a klub adószáma vagy e-mail-címe (58.).
4. „Kiállítás” egy vagy az összes jóváhagyott tervezetre. A rendelésszám mező `NMI-[helyszín]-[ÉÉÉÉ-HH]`; újrapróbálás előtt lekérdezés ezzel a rendelésszámmal, így nem lesz dupla számla. A válaszból a számlaszám a 73.-ba kerül, és az Admin (65.) automatikusan mutatja.
5. Sztornó gomb a kiállított számlán, okkal, naplózva (26.); utána új tervezet készíthető.

**Elfogadási feltételek.**

- [ ] Hónap elsején 06:00-kor minden aktív helyszínhez elkészül a tervezet a 73. összesítő összegeivel.
- [ ] Jóváhagyás előtt számla nem megy ki.
- [ ] Kiállítás közben megszakított, majd újraindított kérés egy számlát eredményez.
- [ ] A kiállított számla száma megjelenik a klub Díjak és számlák oldalán (65.).

**Tesztelés.** Vitest az XML-összeállítóra rögzített mintákkal és a duplikáció-védelemre (mockolt válaszokkal); az első éles hónapban az API-val kiállított számlák tételes összevetése az előző havi kézi számlákkal.

**Függőségek és kockázatok.** Függ: 2, 14, 26, 35, 58, 65, 66, 73. Erre épül: nincs. Kockázat: a könyvelő válasza (2.) a tételeket és az ÁFA-jelölést változtathatja; a tételsablon ezért egy helyen van. A Számlázz.hu leállásakor a tervezet megmarad, a kiállítás később megismételhető.

#### 104. Céges számla vendégeknek

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 104 | Céges számla vendégeknek | `packages/core/src/billing/venue-invoice.ts`, `apps/order/app/[locale]/v/[slug]/checkout/` | Nincs | A céges vendégek számlát kérnek | 🟡 | M |

**Jelenlegi állapot.** Döntés (2026-11-01): a pilotban nincs; aki kéri, a pultnál kapja meg; a könyvelő válasza után újranézzük. Kiegészítő döntés: a klub saját Számlázz.hu fiókjával, API kulccsal az Adminban. A doksi: céges számla adatai a pénztárban (a pilot után), számlázó API a helyszín nevében, tételenként beállítható ÁFA-kulcs (51.). A pilotban minden online rendelést tételesen beütnek a kasszába (2.). A Számlázz.hu kliens a 103.-ban készül.

**Probléma.** A számla a klub nevében, a klub fiókjából megy ki, így egy kiszivárgott kulcs a klub számlázását érinti. Hogy számla mellett mi történik a kasszába beütött rendeléssel (nyugta), a könyvelő válaszától függ; enélkül dupla bizonylat keletkezhet.

**Megoldás.**

1. Admin Beállítások (58.) → Számlázás fül (csak a Tulaj): Számla Agent kulcs, titkosítva tárolva (AES-256-GCM, a mesterkulcs környezeti változóban); a felületen csak az utolsó 4 karakter látszik; „Kapcsolat tesztelése” gomb; be/ki kapcsoló.
2. Pénztár (42.): „Céges számlát kérek” jelölő → cégnév, adószám (formátumellenőrzéssel), cím, e-mail; csak bekapcsolt klubnál látszik.
3. Fizetés után (webhook, 33.) Inngest-feladat: számla a klub kulcsával a rendelési pillanatkép tételeiből, tételenkénti ÁFA-kulccsal (51.); a szervizdíj és a borravaló a könyvelő által megadott kulccsal (2.); fizetési mód bankkártya, fizetettként. A rendelésszám mező a rendelés azonosítója, és újrapróbálás előtt lekérdezés véd a dupla számla ellen (mint a 103.-ban). A PDF-et a Számlázz.hu küldi a vendégnek.
4. A Pult nézet kártyáján „Céges számla” jelölés (54.); hogy a pultos mit tesz a kasszában, a könyvelő válasza (2.) szerint kerül a betánító útmutatóba (6.).
5. Sikertelen kiállítás (rossz kulcs, Számlázz.hu-hiba): Admin-figyelmeztetés és újrapróbálás gomb; a vendég e-mailt kap, hogy a számla késik.
6. A céges adatok a rendeléshez tárolódnak (pénzügyi adatként 8 évig), a profilba nem kerülnek (89.).

**Elfogadási feltételek.**

- [ ] Bekapcsolt klubnál a céges adatokkal fizetett rendelés után 1 percen belül kiállított számla érkezik a vendég e-mailjére, a tételek ÁFA-kulcsaival.
- [ ] Ugyanarra a rendelésre újrapróbálás után sincs második számla.
- [ ] A Számla Agent kulcs az adatbázisban titkosítva van; a Manager nem látja és nem módosítja.
- [ ] Kikapcsolt klubnál a jelölő nem látszik.

**Tesztelés.** Vitest az XML-re (vegyes ÁFA-kulcsok, szervizdíj, borravaló) és a titkosításra; integrációs teszt mockolt Számlázz.hu-val; kézi próba az első klub saját fiókjával egy valós rendelésen, a klub könyvelőjének jóváhagyásával.

**Függőségek és kockázatok.** Függ: 2, 6, 22, 33, 35, 42, 51, 54, 58, 103. Erre épül: nincs. Kockázat: a könyvelő válasza (2.) nélkül nem indítható, mert a nyugta és a számla viszonya, valamint a szervizdíj és a borravaló ÁFA-kezelése tőle függ. Előre ellenőrizni kell, hogy a klub Számlázz.hu csomagja engedi-e a Számla Agentet.

#### 105. Hűségprogram

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 105 | Hűségprogram | `packages/core/src/loyalty/`, `apps/mobile/app/(tabs)/loyalty/`, `apps/admin/app/(dashboard)/loyalty/` | Nincs | A visszatérő vendég fő oka az app letöltésére | 🟠 | L |

**Jelenlegi állapot.** Döntés (2026-11-01): a pilot után, az apppal együtt. Kiegészítő döntés: a klub kapcsolja be és állítja (X Ft = 1 pont vagy rendelésenként 1 pecsét); a jutalmat a klub adja és fizeti; borravaló és szervizdíj nem számít; 12 hónap inaktivitás után lejár; visszatérítéskor levonódik; csak az appban. A doksi mobil képernyője: pontegyenleg helyszínenként, elérhető jutalmak, beváltás; fiókot igényel.

**Probléma.** A pont pénzértékű. Ha a jóváírás fizetéskor történik, egy később elutasított rendelés pontja bent marad; ha a beváltás nem atomi, egy pont kétszer költhető. A jutalomtétel a jutalék alapját is érinti.

**Megoldás.**

1. `LoyaltyProgram` helyszínenként: mód (pont: X Ft = 1 pont / pecsét: rendelésenként 1), jutalmak (név, ár pontban vagy pecsétben, kapcsolt termék), be/ki.
2. `LoyaltyLedger`: felhasználó, helyszín, változás, ok (jóváírás / beváltás / levonás / lejárat), rendelés; egyedi index a rendelés + ok párra, így egy rendelés egyszer ír jóvá. Az egyenleg a főkönyv összege, helyszínenkénti gyorsítótár-mezővel.
3. Jóváírás Átvéve állapotban (21.): pontnál (részösszeg − kedvezmény) / X, lefelé kerekítve; borravaló és szervizdíj nem számít. Csak bejelentkezett, appból leadott rendelésnél.
4. Levonás visszatérítéskor (34.) és tételenkénti elutasításkor (99.), arányosan; az egyenleg nem mehet nulla alá.
5. Beváltás: a jutalom 0 Ft-os tételként kerül a kosárba, csak fizetős rendelés mellé. A pont a PaymentIntent létrehozásakor tranzakcióban foglalódik, sikertelen vagy lejárt fizetésnél visszajár. A 0 Ft-os tétel a részösszeget nem növeli, így jutalék sem jár utána (22.).
6. Lejárat: napi Inngest-feladat; 12 hónap aktivitás (jóváírás vagy beváltás) nélkül a helyszíni egyenleg nullázódik, 14 nappal előtte push (90.).
7. App: Hűség fül (helyszínenkénti egyenleg, jutalmak, előzmények); a kosárban „X pont jár ezért a rendelésért”. Admin: beállítás, jutalmak, statisztika (aktív tagok, kiadott és beváltott pontok).

**Elfogadási feltételek.**

- [ ] 100 Ft = 1 pont beállításnál egy 9 000 Ft részösszegű, 1 000 Ft borravalós rendelés Átvéve után 90 pontot ír jóvá.
- [ ] Elutasított rendelés nem ír jóvá; a teljes visszatérítés a jóváírt pontot levonja.
- [ ] Két párhuzamos beváltás ugyanarra az egyenlegre csak egyszer sikerül.
- [ ] 12 hónap inaktivitás után az egyenleg nulla.

**Tesztelés.** Vitest a főkönyvre (jóváírás, levonás, párhuzamos beváltás, lejárat rögzített órával); Maestro: rendelés → pont → jutalom beváltása.

**Függőségek és kockázatok.** Függ: 21, 22, 30, 33, 34, 35, 84, 86, 88, 90, 99. Erre épül: nincs. Kockázat: a pontok feltételeit (lejárat, levonás, a jutalmat a klub adja) az ÁSZF-ben (3.) rögzíteni kell; a 0 Ft-os jutalomtétel kasszába ütése a könyvelő válaszától függ (2.).

#### 106. Ajándék ital

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 106 | Ajándék ital | `packages/core/src/gifts/`, `apps/order/app/[locale]/g/[token]/` | Nincs | Új rendelési alkalom, vírusszerű terjedés | 🟡 | M |

**Jelenlegi állapot.** Döntés (2026-11-01): a pilot után. Kiegészítő döntés: link, aznapi beváltás; ha az üzleti nap végéig nem váltják be, a küldő visszakapja az árát; csak a klub által kijelölt tételek. Az üzleti nap kezdete helyszínenként állítható, alap 06:00 (24.). Rendelni csak beolvasott QR-kóddal lehet (53., 85.).

**Probléma.** Az ajándék kifizetett, de még rendelésként nem létező pénz. Ha a link kétszer beváltható, a klub kétszer ad ki italt; ha a lejárati visszatérítés elmarad, a küldő pénze bent ragad.

**Megoldás.**

1. Admin Menü (51.): „Ajándékba küldhető” jelölő termékenként; Beállítások (58.): ajándék be/ki.
2. Küldés a rendelős oldalon és az appban: tétel (csak jelölt), opcionális üzenet (max. 140 karakter), fizetés a szokásos módon (33.). Az ajándék saját állapotot kap: Fizetve → Beváltva / Visszatérítve.
3. Link: `rendel.namitiszunk.hu/g/[token]`, 128 bites véletlen tokennel; megosztás a telefon megosztó menüjével (Web Share API, az appban natívan).
4. Beváltás: a `/g/[token]` oldal mutatja az ajándékot, az üzenetet és a küldő keresztnevét. A beváltáshoz a helyszín egy QR-kódját kell beolvasni (53., 85.), utána pultválasztás és „Beváltom” → rendelés Új állapotban, fizetés nélkül, `giftId`-vel (a 21. állapotgép új belépési pontja). A token egyszer használható, atomi frissítéssel.
5. Lejárat: az üzleti nap végén (24.) Inngest-feladat a be nem váltott ajándékokat teljesen visszatéríti (34.); a küldő e-mailt kap, ha megadta a címét.
6. Riport: eladott, beváltott és visszatérített ajándékok (61.).

**Elfogadási feltételek.**

- [ ] Egy link egyszer váltható be; a második próbálkozás „Már beváltva” üzenetet ad.
- [ ] QR-beolvasás nélkül a beváltás nem indul.
- [ ] Az üzleti nap végéig be nem váltott ajándék ára és az application fee visszajár.
- [ ] Nem jelölt termék nem küldhető ajándékba (szerveroldali ellenőrzés).

**Tesztelés.** Vitest (párhuzamos beváltás, lejárat az üzleti nap határán); Playwright: küldés teszt kártyával → link → QR → beváltás → Pult nézet; Stripe CLI a lejárati visszatérítésre.

**Függőségek és kockázatok.** Függ: 21, 22, 24, 33, 34, 35, 37, 40, 51, 53, 58, 85. Erre épül: nincs. Kockázat: a fizetés és a kiadás időben elválik; hogy a nyugta a vásárláskor vagy a beváltáskor jár, a könyvelő kérdése (2.). Az ajándék feltételei az ÁSZF-be (3.) kerülnek.

#### 107. Asztalfoglalás

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 107 | Asztalfoglalás | `apps/order/app/[locale]/v/[slug]/foglalas/`, `apps/admin/app/(dashboard)/reservations/` | Nincs | VIP asztalok előre foglalása | 🟡 | M |

**Jelenlegi állapot.** Döntés (2026-11-01): VIP palackrendelés már az MVP-ben, asztalfoglalás nélkül. Kiegészítő döntés: kérés (dátum, létszám, asztaltípus), a klub jóváhagyja, előleg nincs. VIP zónák és asztalok: 53.

**Probléma.** Előleg nélkül a foglalás nem kötelez, a klub a jóváhagyással dönt. Ha a kérés csak e-mailben jön, elveszik; ha az űrlapot bárki korlát nélkül küldheti, a klub szemét kéréseket kap.

**Megoldás.**

1. Admin Foglalások: be/ki; asztaltípusok (név, max. létszám; a VIP zónákból előtöltve, 53.); a legkorábbi és legkésőbbi foglalási idő (pl. 2 órával előtte, 30 nappal előre).
2. Űrlap a webes helyszín oldalon (`/v/[slug]/foglalas`) és az app helyszín oldalán (85.): dátum (a nyitvatartás napjai, 58.), érkezés ideje, létszám, asztaltípus, név, telefon vagy e-mail, megjegyzés, link az adatkezelési tájékoztatóra. Rate limit IP-re és elérhetőségre (29.).
3. `Reservation`: Kérés → Jóváhagyva / Elutasítva / Lemondva. Minden változásról e-mail a vendégnek (appos vendégnek push is), a klub üzenetével (37., 90.).
4. Admin lista napok szerint; új kérés jelzése a harangban (50.) és e-mail a klub kapcsolattartó címére (58.); jóváhagyás vagy elutasítás egy gombbal, opcionális üzenettel.
5. A vendég az e-mailben kapott linkkel lemondhatja a foglalást.

**Elfogadási feltételek.**

- [ ] A kérés 1 percen belül megjelenik az Adminban, és a klub e-mailt kap.
- [ ] Jóváhagyás után a vendég e-mailt kap a klub üzenetével.
- [ ] Zárt napra és a beállított időablakon kívülre nem küldhető kérés.
- [ ] A 29. rate limitjén túl a kérés 429-et kap.

**Tesztelés.** Vitest (időablak, nyitvatartás, állapotok); Playwright: kérés → jóváhagyás → e-mail a Resend teszt címeivel.

**Függőségek és kockázatok.** Függ: 23, 29, 37, 50, 53, 58, 85, 90. Erre épül: nincs. Kockázat: a foglaló neve és elérhetősége személyes adat; a döntés szerint (2026-11-03) a foglalás napja után 30 napig marad meg; ezt a szabályt a 28. törlési feladatai és az adatvédelmi tájékoztató (3.) közé fel kell venni. Előleg nélkül a meg nem jelenés gyakori lehet; ez a klub kockázata.

#### 108. Asztalhoz szállítás

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 108 | Asztalhoz szállítás | `packages/core/src/orders/delivery.ts`, `apps/admin/app/waiter/` | Nincs | Sima rendelés asztalhoz, felszolgálói szerepkörrel | 🟡 | L |

**Jelenlegi állapot.** Döntés (2026-11-01): az MVP-ben csak pultnál lehet átvenni; asztalhoz szállítás (felszolgálói szerepkör, asztaltérkép, kiszállítási állapot) a pilot után. Kiegészítő döntés: felszolgáló név + PIN-nel, felár nélkül, zónánként bekapcsolható. A VIP rendelést a pult elkészíti, a VIP-host „Kivinni” listájába kerül, és az asztalnál „Átadva” gombbal Átvéve lesz (55.). A doksi funkciókapcsoló-példája: „asztalhoz szállítás béta” (112.). A felszolgálói szerepkör a Személyzet modulba ezzel a feladattal kerül (57.).

**Probléma.** Sima asztalnál nincs VIP-host; ha a kész italt senki nem viszi ki, a vendég nem tudja, menjen-e a pulthoz. Ha a szállítás nem ugyanazon az állapotgépen megy, mint a VIP, két külön logika romolhat el.

**Megoldás.**

1. Zóna beállítás (53.): „Asztalhoz szállítás” kapcsoló, csak a 112. kapcsolójával engedélyezett helyszínen (béta). A zóna asztalai saját QR-kódot kapnak, amely az asztalt is azonosítja (53.).
2. Szállítós zónából jövő rendelés `delivery.tableId` mezőt kap; az állapotgép (21.) a VIP-ágat használja: Kész → „Kivinni” → „Átadva” az asztalnál (Átvéve). Felár nincs, a 22. nem változik.
3. Felszolgálói nézet (`apps/admin/app/waiter/`): a VIP-host nézet (55.) általánosítása szerepkör szerint; „Kivinni” lista zóna és asztal szerint, hanggal; asztaltérkép zónánként (az Adminban rácson elhelyezett asztalok, dnd-kit), a kiszállításra váró asztalok kiemelve. A személyzet módban is (93.).
4. „Nem találom” gomb: a rendelés visszakerül a pultra, a vendég élő oldala pultos átvételre vált.
5. Személyzet modul (57.): felszolgáló szerepkör név + PIN-nel; jogosultság (23.): csak Kész rendelést vihet ki, elutasítani és visszatéríteni nem tud.
6. Vendég élő oldala (43.): „Az asztalodhoz visszük” az asztal nevével, az átvételi utasítás helyett. Riport: Kész → Átvéve idő felszolgálónként (61.).

**Elfogadási feltételek.**

- [ ] Szállítós zóna asztali QR-járól leadott rendelés a Kész után 2 mp-en belül a felszolgáló „Kivinni” listájában van, az asztal nevével.
- [ ] Felszolgáló PIN-nel az elutasítás és a visszatérítés 403.
- [ ] Kikapcsolt zónában a rendelés a szokásos pultos átvétellel megy.
- [ ] „Nem találom” után a vendég élő oldala 2 mp-en belül a pultos átvételt mutatja.

**Tesztelés.** Vitest az állapotgépre és a jogosultságra; Playwright három böngészővel (vendég, pult, felszolgáló); kézi próba egy klubban egy estén, béta kapcsolóval.

**Függőségek és kockázatok.** Függ: 21, 23, 43, 53, 55, 57, 61, 93, 97, 112. Erre épül: nincs. Kockázat: zónás, sötét helyiségben a felszolgáló nem találja az asztalt; az asztaltérkép és az asztalon lévő, jól látható asztalszám ennél többet számít, ezért a QR-kártya (53.) nagy asztalszámot kap.

#### 109. Kasszaintegráció: Fruitsys

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 109 | Kasszaintegráció: Fruitsys | `packages/integrations/pos/fruitsys/` | Nincs; a Fruitsysnek nincs nyilvános API-ja | Kézi beütés nélkül a rendelés a klub NTAK-minősített kasszájába kerül, és az a klub pénztárgépén nyugtáz (2028-tól e-pénztárgépen is) | 🟠 | L |

**Jelenlegi állapot.** Döntés (2026-11-01): elsőként a Fruitsys, partneri megállapodással (support@fruitsys.hu); NTAK-minősített, a budapesti romkocsmákban és klubokban a legelterjedtebb; nyilvános API-ja nincs; tartalék: Orsys, eSystem. A pilotban a klub minden online rendelést tételesen beüt a saját rendszerébe, a Pult nézetben „Nyugta beütve” jelölővel (54.). Ha a könyvelő elveti a kézi beütést, a tartalék ez a feladat (2.).

**Probléma.** A kézi beütés csúcsidőben rendelésenként plusz munka és hibaforrás: egy elmaradt vagy rossz tétel NTAK-eltérést okoz. Nyilvános API nélkül a kapcsolódás módja (felhős API, helyi ügynök, fájlcsere) a Fruitsystől függ; amíg ez nincs meg, a munka nem becsülhető pontosan.

**Megoldás.**

1. Partneri megkeresés (support@fruitsys.hu): integrációs mód, dokumentáció, teszt környezet, díj, szerződés. Ha 4 héten belül nincs érdemi válasz, az Orsys és az eSystem megkeresése.
2. `packages/integrations/pos`: `PosAdapter` interfész (`pushOrder`, `getStatus`, `mapItems`); a Fruitsys az első megvalósítás.
3. Tételpárosítás: Admin → Kassza fül, a menü termékei ↔ kassza-cikkszámok táblázatban. Párosítatlan terméknél figyelmeztetés, és az a rendelés kézi beütésre marad.
4. Küldés a Készül gombnál (ahol ma a kézi beütés történik, 54.), Inngest-feladattal, újrapróbálással és idempotens rendelésazonosítóval; sikeres visszaigazolásnál a „Nyugta beütve” automatikusan bejelölődik.
5. Hiba esetén a Pult nézet kártyáján piros „Kézzel üsd be” jelzés; a kézi út mindig megmarad.
6. Bekapcsolás helyszínenként, funkciókapcsolóval (112.).

**Elfogadási feltételek.**

- [ ] Teszt környezetben a Készül után 10 mp-en belül a rendelés tételesen megjelenik a kasszában, a 2. szerinti fizetési móddal.
- [ ] Sikeres küldésnél a „Nyugta beütve” automatikus.
- [ ] Kassza-kiesésnél a kártya „Kézzel üsd be” jelzést mutat, és a rendelés nem vész el.
- [ ] Ugyanaz a rendelés újrapróbálás után sem kerül kétszer a kasszába.

**Tesztelés.** Vitest az adapter-szerződésre mockolt kasszával; a Fruitsys teszt környezetében (ha van), különben egy klub próbakasszáján, a klub jelenlétében.

**Függőségek és kockázatok.** Függ: 2, 35, 51, 54, 112 és a partneri megállapodás. Erre épül: nincs. Kockázat: ha a Fruitsys csak helyi (a klub gépén futó) kapcsolatot enged, helyi híd alkalmazás kell, ami a méretet L fölé viszi és új telepítési feladatot ad. Ha a megállapodás nem jön létre, a tartalék az Orsys vagy az eSystem.

#### 110. Nyilvános API és webhook

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 110 | Nyilvános API és webhook | `apps/api/app/public/v1/`, `packages/core/src/webhooks/` | Nincs | A klubok saját rendszerei lekérhetik a rendeléseket | 🟡 | M |

**Jelenlegi állapot.** Döntés (2026-11-01): a pilot után. Kiegészítő döntés: olvasás (rendelések, menü) és webhook, API kulccsal. A Zod sémákból OpenAPI készül (25.); rate limit és hibakezelés az API vázban van (29.).

**Probléma.** Egy kiszivárgott API kulccsal a klub teljes rendelési adata lekérhető. A webhook címét a klub adja: a szerverünk idegen címre küld adatot, egy belső címre mutató URL belső szolgáltatást érhet el, egy lassú cím pedig nem akaszthatja meg a rendelési utat.

**Megoldás.**

1. API kulcsok: Admin Beállítások → Fejlesztőknek (csak a Tulaj): létrehozás névvel és jogosultsággal (`orders:read`, `menu:read`); a kulcs egyszer látszik, az adatbázisban SHA-256 hash; visszavonás; utolsó használat ideje; audit (26.).
2. Végpontok: `GET /public/v1/orders` (időszak, állapot, kurzoros lapozás), `GET /public/v1/orders/{id}`, `GET /public/v1/menu`. A kulcs helyszínhez kötött, más helyszín adata 404. A vendég e-mail-címe és telefonszáma nincs a válaszban. Rate limit kulcsonként (29.).
3. Webhook: Adminban URL (csak HTTPS, belső és privát IP-címre felóldódó cím tiltva, a küldéskor újra ellenőrizve) és események (`order.paid`, `order.status_changed`, `order.refunded`). Aláírás HMAC-SHA256-tal, időbélyeggel, fejlécben. Küldés Inngesttel, 5 mp időkorláttal, exponenciális újrapróbálással 24 óráig; 3 napnyi folyamatos hiba után a webhook kikapcsol, és a Tulaj e-mailt kap.
4. Dokumentáció: OpenAPI (25.) a `public/v1` végpontokra, az `api.namitiszunk.hu` dokumentációs oldalán, aláírás-ellenőrzési példakóddal.

**Elfogadási feltételek.**

- [ ] `orders:read` kulccsal a menü végpont 403, a rendelések 200.
- [ ] Másik helyszín rendelésének azonosítójával 404.
- [ ] A webhook aláírása a dokumentált példakóddal ellenőrizhető; leállt végpontnál a rendelési út nem lassul.
- [ ] Belső IP-címre (pl. 127.0.0.1, 10.0.0.0/8) mutató webhook URL nem menthető.

**Tesztelés.** Vitest (kulcs-hash, jogosultság, aláírás, IP-szűrő); integrációs teszt helyi webhook-fogadóval, leállással és újrapróbálással.

**Függőségek és kockázatok.** Függ: 23, 25, 26, 29, 35, 58. Erre épül: nincs. Kockázat: egy klub a vendégek elérhetőségét is kérheti; adatminimalizálás miatt ez szándékosan nincs az API-ban, és csak külön döntéssel kerülhet be.

#### 111. Push kampányok

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 111 | Push kampányok | `apps/admin/app/(dashboard)/campaigns/`, `apps/api/src/inngest/campaigns.ts` | Nincs | A klub elérheti a hozzájárult vendégeit | 🟡 | M |

**Jelenlegi állapot.** Döntés (2026-11-01): csak a helyszín küldhet kampányt, a saját, hozzájárult vendégeinek. Kiegészítő döntés: heti max. 2, 10–22 óra között, leiratkozás egy koppintással. A doksi HQ-modulként is említi szegmensekkel; a döntés szerint a platform nem küld kampányt, ezért a feladat az Adminban készül. A Profilban a marketing értesítés csak külön bekapcsolással megy (89.); Androidon van „Ajánlatok” csatorna (90.); push: Expo Push Service (2026-11-02). Az Akciókat csak a Tulaj kezeli (60.).

**Probléma.** Hozzájárulás nélkül a marketing push jogsértő, a túl sok értesítés miatt pedig a vendég a rendelésállapot-pusht is kikapcsolja vagy törli az appot. A korlátokat szerveroldalon kell kikényszeríteni, nem az Admin felületén.

**Megoldás.**

1. Hozzájárulás helyszínenként: „Kérek ajánlatokat ettől a helytől” kapcsoló a helyszín oldalán (85.) és a Köszönjük képernyőn; a Profilban (89.) a marketing főkapcsoló és a helyszínek listája. A hozzájárulás időbélyeggel tárolódik.
2. Admin Kampányok (csak a Tulaj): cím (max. 50 karakter), szöveg (max. 150), opcionális cél (menü vagy esemény, 101.), időzítés; a címzettek száma küldés előtt látszik.
3. Kikényszerítés a küldéskor (Inngest `campaigns`): csak 10:00–22:00 között (`Europe/Budapest`), helyszínenként legfeljebb heti 2 kampány (gördülő 7 nap), csak hozzájárult és nem leiratkozott vendégnek. Küldés az Expo Push Service-en 100-as csomagokban, a hibás tokenek törlésével (90.).
4. Leiratkozás egy koppintással: az értesítés „Leiratkozás” gombja (értesítési kategória művelettel) azonnal visszavonja a helyszíni hozzájárulást.
5. Statisztika: kiküldött, kézbesített és megnyitott értesítések; a megnyitás PostHog esemény, csak analitikai hozzájárulással (18.).

**Elfogadási feltételek.**

- [ ] 22:00 utánra időzített kampány nem menthető; a heti harmadik kampány nem küldhető.
- [ ] Hozzájárulás nélküli vagy leiratkozott vendég nem kap kampányt.
- [ ] A „Leiratkozás” gomb után a vendég ettől a helytől több kampányt nem kap.
- [ ] A rendelésállapot-push a leiratkozástól függetlenül megérkezik.

**Tesztelés.** Vitest a korlátokra rögzített órával; kézi teszt valódi iOS- és Android-eszközön (Leiratkozás gomb, Ajánlatok csatorna).

**Függőségek és kockázatok.** Függ: 3, 18, 35, 85, 89, 90, 101. Erre épül: nincs. Kockázat: az Apple felülvizsgálati irányelvei a marketing pusht kifejezett hozzájáruláshoz és leiratkozási lehetőséghez kötik; a hozzájárulási szövegnek az adatvédelmi tájékoztatóval (3.) egyeznie kell.

#### 112. Funkciókapcsolók és app verziók

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 112 | Funkciókapcsolók és app verziók | `packages/core/src/flags/`, `apps/hq/app/(dashboard)/flags/` | Nincs | Béta funkciók klubonként, kényszerített appfrissítés | 🟡 | M |

**Jelenlegi állapot.** A doksi HQ-modulja: funkciók helyszínenként (pl. asztalhoz szállítás béta), ki- és bekapcsolás. Döntés (2026-11-02): saját megoldás MongoDB-ben (helyszínenkénti kapcsolók és minimális appverzió), a HQ-ból szerkesztve; PostHog feature flag nincs. Az EAS Update csak JS-javításra megy, `runtimeVersion` szerint (95.).

**Probléma.** Egy béta funkciót ma csak kódváltozással és telepítéssel lehet egy klubnál be- vagy kikapcsolni. Egy régi appverziót, amely egy API-változás után már nem működik, nem lehet a felhasználóknál leállítani.

**Megoldás.**

1. `FeatureFlag` gyűjtemény: kulcs, leírás, alapérték, helyszínenkénti felülírások. `AppConfig`: minimális appverzió platformonként (iOS, Android), opcionális üzenet.
2. `isEnabled(flag, venueId)`: 60 mp-es memóriagyorsítótár szerverpéldányonként; ismeretlen kulcs kikapcsoltnak számít.
3. `GET /v1/config`: az app induláskor és előtérbe kerüléskor lekéri a minimális verziót és az aktuális helyszín kapcsolóit.
4. Kényszerített frissítés: ha az app verziója kisebb a minimálisnál, teljes képernyős „Frissítsd az appot” áruházi linkkel; egy folyamatban lévő rendelés követése (88.) ekkor is elérhető.
5. HQ Funkciókapcsolók: lista, helyszínenkénti kapcsolás, minimális verzió szerkesztése; minden módosítás auditnaplóba kerül (26.).
6. Első kapcsolók: asztalhoz szállítás (108.) és kasszaintegráció (109.).

**Elfogadási feltételek.**

- [ ] Egy kapcsoló HQ-s átállítása 60 mp-en belül minden szerverpéldányon érvényes.
- [ ] A minimálisnál régebbi app a frissítési képernyőt mutatja, de egy folyamatban lévő rendelés állapota elérhető.
- [ ] Ismeretlen kulcs kikapcsoltnak számít.
- [ ] Minden kapcsolás megjelenik az auditnaplóban.

**Tesztelés.** Vitest (gyorsítótár, felülírás, verzió-összehasonlítás); Maestro: régi buildszám szimulálása a kényszerített frissítésre.

**Függőségek és kockázatok.** Függ: 26, 29, 66, 84, 88, 95. Erre épül: 108, 109. Kockázat: a 60 mp-es gyorsítótár miatt egy kikapcsolás legfeljebb 1 percet késik; az azonnali leállítás eszköze továbbra is a globális Szünetel kapcsoló (50.).

#### 113. Support és Pénzügy szerepkör felülete

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 113 | Support és Pénzügy szerepkör felülete | `apps/hq/app/(dashboard)/team/` | A modellben megvan, a felület nincs | Ha bővül a csapat | 🟡 | S |

**Jelenlegi állapot.** Döntés (2026-11-01): a HQ-t csak te használod, egy fiókkal, 2FA-val; a Support és a Pénzügy szerepkör a modellben megmarad, a felületük később. A Pénzügy csak olvas és exportál (23.). A HQ-ban a 2FA kötelező (66.). A doksi jogosultsági mátrixában külön oszlop van a Platform Supportnak.

**Probléma.** Ha bővül a csapat, ma minden új tag Platform Admin lenne, azaz egy support munkatárs a jutalékot és a helyszínek állapotát is módosíthatná.

**Megoldás.**

1. HQ Csapat: meghívás e-mailben (30.) szerepkörrel (Platform Admin / Support / Pénzügy); kötelező 2FA az első belépéskor (66.); letiltás; utolsó belépés.
2. Support: rendeléskereső és support-visszatérítés (69.), jegyek (102.), belépés a klub nevében (70.), a doksi mátrixa szerint; jutalék, helyszínállapot és funkciókapcsolók nem.
3. Pénzügy: a Pénzügy modul, a havi összesítő és a számlák olvasása és exportja (73., 103.); írás nincs.
4. A HQ menüje a szerepkör szerint; a szerver minden végponton a 23. mátrixa szerint ellenőriz.

**Elfogadási feltételek.**

- [ ] Support szerepkörrel a jutalék módosítása 403.
- [ ] Pénzügy szerepkörrel az export működik, bármely írás 403.
- [ ] 2FA beállítása nélkül a meghívott nem lép be a HQ-ba.

**Tesztelés.** Vitest jogosultság-tesztek szerepkörönként minden HQ-végpontra (a 23. mintájára); Playwright: meghívás, 2FA, menü szerepkör szerint.

**Függőségek és kockázatok.** Függ: 23, 30, 66, 69, 70, 73, 102, 103. Erre épül: nincs. Kockázat: minden új HQ-végpontnál a mátrixot bővíteni kell; a 23. tesztjei ezt kikényszerítik.

#### 114. Bonnyomtató (Star CloudPRNT)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 114 | Bonnyomtató (Star CloudPRNT) | `apps/api/app/v1/cloudprnt/route.ts` | Nincs | Ha egy klub kéri | 🟡 | M |

**Jelenlegi állapot.** Kiegészítő döntés: Star CloudPRNT. A bonnyomtató a pilot után jön (54.), akkor, ha egy klub kéri.

**Probléma.** A CloudPRNT-nyomtató maga kérdezi le a szervert, ezért a mi végpontunk felel azért, hogy a bon a megfelelő nyomtatón jelenjen meg. Egy rossz azonosítás más klub rendelését nyomtatja ki, egy elveszett visszaigazolás duplán nyomtat.

**Megoldás.**

1. Admin Pultok (53.): nyomtató hozzáadása a pulthoz (MAC-cím a nyomtató önteszt-lapjáról). A rendszer pultonként titkos URL-t ad, amelyet a nyomtató webes felületén CloudPRNT szerverként kell beállítani.
2. `cloudprnt/route.ts`: a nyomtató POST-ja (állapot, MAC) → ha van nyomtatandó, `jobReady: true` a támogatott formátummal; GET → a bon; DELETE → visszaigazolás, ekkor a feladat Kinyomtatva. A titkos token és a MAC-cím együtt azonosít.
3. Nyomtatási feladat a rendelés Új állapotba kerülésekor (fizetés után). A bon: rövid rendelésszám, pult, tételek opciókkal, VIP- vagy asztaljelölés, idő, „Ez nem nyugta”.
4. Admin: nyomtató állapota (utolsó lekérdezés, papír kifogyott, offline) és „Tesztbon” gomb; ha az utolsó lekérdezés 2 percnél régebbi, figyelmeztetés a Pult nézetben.
5. A nyomtató opcionális: a Pult nézet nélküle is teljes.

**Elfogadási feltételek.**

- [ ] Fizetés után 10 mp-en belül kinyomtatódik a bon a pult nyomtatóján.
- [ ] Visszaigazolt bon nem nyomtatódik újra.
- [ ] Ismeretlen MAC-címmel vagy rossz tokennel a végpont nem ad ki bont.
- [ ] Az ő és ű betű helyesen nyomtatódik.

**Tesztelés.** Vitest a protokoll állapotaira; kézi teszt valódi CloudPRNT-képes Star nyomtatóval a klub hálózatán.

**Függőségek és kockázatok.** Függ: 21, 29, 53, 54. Erre épül: nincs. Kockázat: a nyomtatót a klub veszi, a CloudPRNT-képes típust a vásárlás előtt egyeztetni kell. Elveszett visszaigazolásnál a bon kétszer nyomtatódhat; ez pénzt nem érint. Az ékezetes betűk kódlapját a valódi nyomtatón kell ellenőrizni.

#### 115. iOS Live Activity

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 115 | iOS Live Activity | `apps/mobile/targets/live-activity/` | Nincs | Rendelésállapot a zárolt képernyőn | 🟡 | M |

**Jelenlegi állapot.** Döntés (2026-11-01): az app első verziója után. A doksi: Kész értesítés pushsal, opcionálisan iOS Live Activity a zárolt képernyőn. Push: Expo Push Service (2026-11-02); az APNs-kulcsot az EAS kezeli (90.).

**Probléma.** A Live Activity natív (SwiftUI, ActivityKit) widget-bővítményt igényel, amit az Expo alapból nem épít. A frissítését saját tokenes APNs-push végzi; ha nem érkezik meg, a zárolt képernyőn elavult állapot látszik.

**Megoldás.**

1. Widget-bővítmény a `targets/live-activity/` alatt Expo config pluginnal (pl. `@bacons/apple-targets`). SwiftUI nézet: rendelésszám, pult, állapot (Készül / Kész), eltelt idő; Dynamic Island kompakt nézet.
2. Indítás fizetés után az appból, natív modulon át; a Live Activity push tokenje a rendeléshez kerül a szerveren.
3. Frissítés állapotváltáskor (21.) Inngest-feladattal, APNs `liveactivity` push típussal. Kész után 15 perccel, átvételkor azonnal véget ér.
4. Ha a Live Activity nem indítható (régi iOS, a felhasználó letiltotta), a meglévő push (90.) marad.

**Elfogadási feltételek.**

- [ ] Fizetés után a zárolt képernyőn megjelenik a rendelés, és a Kész állapot 5 mp-en belül frissül.
- [ ] Átvétel után a tevékenység eltűnik.
- [ ] Letiltott Live Activitynél a sima push megérkezik.

**Tesztelés.** Kézi teszt valódi iPhone-on, zárolt képernyővel és Dynamic Islanddel; Jest a token-kezelésre.

**Függőségek és kockázatok.** Függ: 7, 14, 21, 35, 84, 88, 90, 95. Erre épül: nincs. Kockázat: a fejlesztés előtt ellenőrizni kell, kezeli-e az Expo Push Service a Live Activity push tokeneket; ha nem, a frissítés közvetlenül az APNs-re megy saját APNs-kulccsal (7.), ami új titok a környezetben (14.). A natív bővítmény minden változása új áruházi buildet igényel (95.).

#### 116. Átállás M10-re időpontra visszaállítással (PITR)

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 116 | Átállás M10-re időpontra visszaállítással (PITR) | Atlas, `docs/runbooks/restore.md` | Flex-en nincs PITR | Kb. 10 helyszín felett a napi mentés kevés | 🟠 | S |

**Jelenlegi állapot.** Kiegészítő döntés: éles adatbázis Atlas Flex (8–30 USD/hó), napi automatikus snapshot, max. 500 kapcsolat; PITR az M10-re váltáskor, kb. 10 helyszín felett. A runbook, az ellenőrző szkript és a havi próbavisszaállítás a 19.-ben készül. Kb. 10 helyszín felett fizetős Atlas-szint kell, ezt a jutalék fedezi (2026-11-01).

**Probléma.** Napi snapshotnál egy péntek éjjeli adatvesztés vagy hibás migráció akár egy napnyi rendelés- és pénzügyi adatot visz el; 10 klubnál ez kézzel, a Stripe-ból már nem pótolható. A váltás maga is kockázat: rossz időpontban a rendelési út kiesik.

**Megoldás.**

1. Kiváltó feltétel: 10 aktív helyszín, vagy ha a kapcsolatszám a 17. riasztása szerint tartósan 400 fölé (az 500-as korlát 80%-a) megy.
2. Váltás hétköznap délelőtt, amikor egy klub sincs nyitva: előtte friss snapshot és a 19. ellenőrző szkriptje; az Atlas felületén a Flex klaszter frissítése M10-re, ugyanabban a régióban.
3. Continuous Cloud Backup (PITR) bekapcsolása, 7 napos visszaállítási ablakkal.
4. Runbook bővítése: időpontra visszaállítás új, ideiglenes klaszterre, ellenőrzés a szkripttel, majd a kiválasztott adatok visszamásolása; az éles klaszter felülírása továbbra is tilos (19.).
5. Próba: időpontra visszaállítás egy ideiglenes klaszterre; ettől kezdve a havi próbák (19.) PITR-rel mennek.

**Elfogadási feltételek.**

- [ ] Az éles adatbázis M10-en fut, a Continuous Cloud Backup be van kapcsolva.
- [ ] Egy adott percre, ideiglenes klaszterre visszaállított adatbázison az ellenőrző szkript (19.) a várt dokumentumszámot és utolsó rendelési időt adja.
- [ ] A váltás után egy teszt rendelés a demó helyszínen végigmegy.

**Tesztelés.** Maga a próbavisszaállítás az ellenőrző szkripttel; teszt rendelés a váltás után.

**Függőségek és kockázatok.** Függ: 14, 17, 19. Erre épül: 117. Kockázat: a frissítés idejére az Atlas rövid kiesést jelezhet, és a kapcsolati karakterlánc megváltozhat; ezért a váltás nyitvatartáson kívül történik, a Vercel környezeti változóinak (14.) frissítésével. Az M10 havidíja magasabb a Flexnél.

#### 117. Skálázási teszt (50 helyszín) és fizetős szintek

| # | Feladat | Hol (fájl/modul) | Probléma | Miért fontos | Súly | Méret |
| --- | --- | --- | --- | --- | --- | --- |
| 117 | Skálázási teszt (50 helyszín) és fizetős szintek | `load/`, Atlas, Ably | Nincs mérve | A cél 50 egyidejű helyszín, helyszínenként 50 rendelés/perc | 🟠 | M |

**Jelenlegi állapot.** Döntés (2026-11-01): helyszínenként 50 rendelés/perc csúcs, 50 egyidejű helyszín; kb. 10 helyszín felett fizetős Atlas- és Ably-szint, ezt a jutalék fedezi. Döntés (2026-11-02): a terheléses teszt ideiglenes staging környezetben fut. A 80. méri a pilot méretét (API p95 300 ms alatt, rendelés → pult 2 mp alatt), az 50 helyszínes mérés ez a feladat. Az Ably ingyenes szintje 200 egyidejű kapcsolat (31.); a MongoDB-alapú rate limit cseréjéről a k6-mérés dönt (29.).

**Probléma.** 50 × 50 = 2 500 rendelés/perc (kb. 42/mp), mellette több ezer élő oldal és Pult nézet kapcsolat. Mérés nélkül nem tudni, hol a szűk keresztmetszet (adatbázis-kapcsolatok, Ably-kapcsolatok, a rate limit írásai), és melyik fizetős szint kell. A Stripe teszt módjának kéréskorlátja (25 művelet/mp) kisebb a célnál.

**Megoldás.**

1. Ideiglenes staging a 80. mintájára, a tervezett éles szintekkel: M10 klaszter (116.), külön Ably-app a tervezett fizetős csomaggal, Vercel staging környezet.
2. Seed: 50 helyszín, helyszínenként 3 pult és 60 tétel (27.).
3. Fizetés: a mérés idejére a staging fizetési csonkot használ (a PaymentIntent-hívás és a webhook szimulálva), amely csak `VERCEL_ENV !== 'production'` mellett kapcsolható be. A valódi Stripe-utat a 80. mérése fedi le.
4. `load/scale-50.js` (k6): 5 perc felfutás, majd 30 percig 2 500 rendelés/perc 50 helyszínre elosztva; mellette helyszínenként 300 virtuális vendég menübetöltéssel és élő oldallal, pultonként egy Pult nézet-kapcsolat, a 80. szkriptjének mintájára.
5. Mért értékek: API p95, rendelés → pult megjelenés, hibaarány, Atlas-kapcsolatok és CPU, Ably egyidejű kapcsolatok és üzenetek, Vercel-függvények hidegindítása.
6. Döntések a mérés alapján: Atlas-szint (M10 vagy nagyobb), Ably-csomag, a rate limit tárolója (29.), kapcsolatkészlet mérete. Az eredmény és a havi költség a `docs/scaling.md`-be kerül.

**Elfogadási feltételek.**

- [ ] 30 percen át 2 500 rendelés/perc mellett az API p95 300 ms, a rendelés → pult megjelenés p95 2 mp alatt marad, a hibaarány 0,1% alatt.
- [ ] Az Atlas-kapcsolatok és az Ably-kapcsolatok a választott szint korlátjának 70%-a alatt maradnak.
- [ ] A fizetési csonk production környezetben nem kapcsolható be (teszttel ellenőrizve).
- [ ] A staging környezet a mérés után törölve.

**Tesztelés.** Maga a mérés, kétszer futtatva az eredmény stabilitására; Vitest a csonk környezeti zárjára.

**Függőségek és kockázatok.** Függ: 27, 29, 31, 80, 116. Erre épül: nincs. Kockázat: a mérés egy napra fizetős Atlas- és Ably-szintet igényel, ennek díja van. Egy k6-futtató gép nem biztos, hogy elbír 15 000 egyidejű kapcsolatot; ilyenkor több futtató vagy felhős k6-futtatás kell.

## 3. Javasolt sorrend

A becslés a feladatok méretéből jön: alsó érték S = 0,5, M = 2, L = 5 nap; középérték S = 1, M = 3, L = 7 nap, heti 5 fejlesztői nappal, egy fővel. Döntés (2026-11-03): a pilot előtt minden pilot előtti feladat elkészül; ez 24–36 hét, és a korábbi 10–15 hetes becslés helyett ez érvényes. A teljes release (Fázis 4 végéig) 45–70 hét.

### Ütemterv szakaszonként

| Szakasz | Feladatok | Fejlesztői nap | Hét |
| --- | --- | --- | --- |
| 1. Alapok és adatmodell | 11–28 | 21–34 | 4–7 |
| 2. Backend és fizetés | 29–39 | 24–35 | 5–7 |
| 3. Rendelős oldal | 40–49 | 22–32 | 4–6 |
| 4. Klub Admin | 50–65 | 31–46 | 6–9 |
| 5. HQ és demó oldal | 66–74 | 15–23 | 3–5 |
| 6. Minőség, zárt teszt | 78–80, 8 | 6–9 | 1–2 |
| **Pilotig összesen** |  | **118–179** | **24–36** |
| 7. Pilot | 81–83 | – | 3–4 (+2 hosszabbítás) |
| 8. Mobilapp és landing (Fázis 3) | 84–96, 75–77 | 37–55 | 8–13 (benne 1–2 hét áruházi tartalék) |
| 9. Fázis 4 | 97–117 | 51–75 | 10–15 |
| **Release-ig összesen** |  |  | **45–70** |

### Sorrend a szakaszokon belül

1. **Alapok és adatmodell.** 12 monorepó → 13 CI → 14 környezetek; mellette 11 drótvázak (a 16. és a 40. előtt kész). Utána 15, 16, 17, 18, 19. Az adatmodellben 20 → 21, 22, 23, 24 → 25, 26, 27, 28. A 21–23. mindenre ráépül, ezért a tesztjeik itt készülnek el.
2. **Backend és fizetés.** 29 → 30 → 31; 32 → 33 → 34 (ehhez az 1. kell: Stripe platformfiók); 35, 36, 37 (ehhez az 5. kell: DNS és küldő domain), 38, 39.
3. **Rendelős oldal.** 40 → 41 → 42 → 43 → 44, 45, 46 → 47 → 48 → 49. A 42. a 3. jogi dokumentumait is igényli (ÁSZF, adatvédelmi tájékoztató).
4. **Klub Admin.** 50 → 58 → 51, 52, 53 → 54 → 55 → 56, 57 → 59, 60, 61 → 62, 63, 64, 65. Az 54. véglegesítése előtt kell a könyvelő válasza (2.), mert a nyugta menete a Pult nézetet változtathatja.
5. **HQ és demó oldal.** 66 → 67 → 68, 69, 70, 71, 72, 73; 74 a pilot klub megkeresése (4.) előtt kész.
6. **Minőség, zárt teszt.** 78 → 79 → 80 → 8 zárt teszt valódi fizetéssel → 6 betánítás.
7. **Pilot.** 81 → 82 és 83 párhuzamosan. A javítások hétfőtől csütörtökig mennek (83.); a maradék időben indulhat a 84. és a 76.
8. **Mobilapp és landing.** 84 → 85, 86 → 87 → 88 → 89, 90, 91, 92 → 93 → 94 → 96 → 95. A 75. a pilot eredményeivel (82.) készül, az app gombjai a 95. után kerülnek rá; a 77. az első poszttal.
9. **Fázis 4.** Első blokk (eldöntve, 2026-11-02): 97, 99, 103, 102 (11–16 nap). Utána az app értéke (eldöntve, 2026-11-03): 105, 111, 106 (9–13 nap). Utána a kassza: 112 → 109 (7–10 nap, a partneri megállapodástól függően). A végén: 100 → 101, 113, 110, 107, 108, 114, 115, 117 (24–36 nap). Eseményhez kötött feladatok: 116 a 10. aktív helyszín előtt, 98 az első több helyszínes tulajnál, 104 a könyvelő válasza után.

### Nem fejlesztési feladatok időzítése

| Feladat | Mikor | Miért akkor |
| --- | --- | --- |
| 1 Stripe platformfiók | Most | A 32–34. előtt kell; az ellenőrzés napokig tarthat |
| 7 Apple Developer és Google Play | Most | A D-U-N-S szám napokig-hetekig tart; a 84. előtt kell |
| 5 DNS és küldő domain | Most | A névszerver-váltás akár 48 óráig terjed; a 37. előtt kell |
| 2 Könyvelő | Most, legkésőbb a 4. szakasz előtt | A válasza az 54., 58. és 104. menetét változtathatja |
| 3 Jogi dokumentumok | A 3. szakasz végéig | A 42. és a zárt teszt (8.) nem indulhat nélkülük |
| 4 Pilot klub | Kb. 8 héttel a tervezett pilot előtt (a 4–5. szakasz alatt) | Korábban a klub elfelejti, később a pilot csúszik |
| 6 Betánítás | A 8. zárt teszt után | A végleges felület kell hozzá |
| 10 Landing videó | A pilot alatt | A pilot klubban készül |
| 9 Védjegykeresés | A pilot után, a 95. előtt | A nyilvános indulás előtt kell |

### Kritikus út

12 → 14 → 20 → 21 → 33 → 42 → 54 → 78 → 80 → 8 → 81 → 82. Ezen a láncon minden csúszás a pilotot tolja. A külső függőségek közül az 1. (Stripe), a 2. (könyvelő) és a 3. (jogi) áll rá.

### Kockázatok az ütemre

- A becslés egy főre, teljes munkaidőre szól. Az AI-asszisztens gyorsítása nincs beleszolva; az 1. szakasz végén a tényleges napokat a becsléshez kell mérni, és ha eltér, újrabecsülni.
- Ha a Kapu 2 nem teljesül, a 2 hetes hosszabbítás a pilotot 5–6 hétre nyújtja; ha utána sem, újratervezés jön, és a 8–9. szakasz nem indul.
- Az első áruházi felülvizsgálat több körös lehet; erre a 8. szakaszban 1–2 hét tartalék van.
- A 109. mérete a Fruitsys által adott kapcsolódási módtól függ; helyi híd alkalmazásnál több is lehet.

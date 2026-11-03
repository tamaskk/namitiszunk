# UX wireframes (T-011)

Low-fidelity wireframes for the five main flows. They fix the screens' content and order only;
colour and typography belong to T-016, details are decided in code. Copy on the wireframes is
illustrative Hungarian UI text, not final i18n strings.

| File | Flow | Device |
| --- | --- | --- |
| `guest.excalidraw` / `.png` | QR → menu → product → cart → checkout → live status → pick-up → thank you, plus every error and order state | Phone, 375 px |
| `bar-view.excalidraw` / `.png` | PIN, New / In progress / Ready board, reject with reason, sold-out toggles, pause, pick-up check, offline | Tablet, landscape |
| `vip-host.excalidraw` / `.png` | PIN, "Kivinni" list per VIP table, delivered | Phone |
| `club-admin.excalidraw` / `.png` | Menu editor, product panel, bars / zones / QR codes, orders, order detail with full refund | Desktop |
| `hq.excalidraw` / `.png` | 2FA sign-in, venues + create venue and invite owner, order search, support refund and audit log | Desktop |

Order states covered on the guest screens (task 21): Fizetésre vár (failed payment), Új, Készül, Kész,
Átvéve, Megszakítva, Elutasítva, Lejárt, Visszatérítve.

## Editing

Open a `.excalidraw` file at https://excalidraw.com (or the VS Code Excalidraw extension), edit,
save it back here, then export a PNG with the same name (Export image → PNG, background on).
Commit both files together so the PNG never drifts from its source.

## Review

Walk through the PNGs with 2–3 people thinking aloud, and the bar view with a bartender. Record
the findings in the wireframes before tasks 40 and 54 start.

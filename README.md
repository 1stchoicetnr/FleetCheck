# FleetCheck

A professional, mobile-first internal web app for vehicle documentation, damage tracking, mileage tracking, and **checkout reports (CR)** across multiple companies.

## Driver vs office

**Driver (phone)**  
Start a Checkout Report: pick company → **Unit #** → confirm year/make/model → enter odometer start, **Clover serial (last digits)** of the borrowed card reader, driver name, and dispatcher. Fill **Precheck** (paper checklist, tread rating, clean Y/N, damage notes, traffic light). Clover is the payment device drivers borrow from Rad Cab — it is **not** the vehicle unit number. **Green** or **Yellow** continues to the guided photo walkaround (tire-tread photo slots are dropped — tread lives on Precheck). **Red** parks the van: no photos, sign, Office gets a repairs flag. Submit when required photos (if any) are filled and the report is signed. The report is saved **Complete** with a timestamp on the **shared server** so office can see it on another phone.

**EV units**  
If the unit is EV (Tesla, powertrain=EV toggle, or other electric make/model), **Oil** and **Fuel Level** on Precheck are N/A and not required. Gas vans keep them required. Set EV/Gas when adding a unit on Checkout or on Office → Units.

The older **Check In / Out** shift flow (mileage, fuel, signature, Slack PDF) is **retired on this preview**. Those reports never wrote to Neon, so they never appeared in Office. `/check-in` now redirects to Checkout Report.

**Office (tablet/desktop or phone)**  
Unlock with the office PIN, list **shared** reports (filter by company, unit, status), open the gallery + metadata, compare side-by-side against the last 1–2 reports for the **same unit**, then mark **PASS**, **Conditional** (retake list), or **FAIL**.

**Archive a unit**  
Office → **Manage units (archive)** (or Dashboard → **Units**). PIN-gated like other office changes. Archive hides the van from Driver Checkout and from the Office unit picker. Past checkout reports and photos stay in Office. Unarchive puts the van back on the active list.

**DAMAGE flags + signature**  
After each accepted photo, drivers can mark that angle as **DAMAGE**. Office gallery/compare lists flagged angles first. PDF marks them. Submit requires a finger/stylus **driver signature**, shown on Office detail and PDF page 1.

**Precheck**  
Office detail and PDF page 1 show **Unit #** (the van) and **Clover serial (last digits)** (the borrowed card reader — not the vehicle), plus the traffic light (Green / Yellow / Red), tread rating, checklist results, optional notes, interior/exterior clean Y/N, side damage notes, additional comments, and issue flags. Red reports are flagged for Office / repairs and may have no photos.

Demo office PIN: **1357** (override with `OFFICE_PIN`)

## Shared backend (required for team beta)

Checkout reports, companies, units, review status, and photos are stored on the **server**. Two phones on the same preview URL see the same data.

| Env var | Used for | Required on Vercel |
|---------|----------|--------------------|
| `DATABASE_URL` or `POSTGRES_URL` | Neon / Vercel Postgres — companies, units, CR metadata | **Yes** |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob — driver-captured photos | **Yes** (seeded example photos work without it) |
| `OFFICE_PIN` | Office review PIN (default `1357`) | Optional |

`next dev` **without** those vars uses a server-side file store in `.data/` (gitignored). Two browser profiles on the same laptop still share CRs. That fallback is **never** used on Vercel / production — preview will return 503 until Postgres is attached.

### Provision on Vercel (Ashley)

1. Open the FleetCheck project on [vercel.com](https://vercel.com).
2. **Storage → Create Database → Neon Postgres** (or Vercel Postgres). Connect it to Preview + Production. This sets `DATABASE_URL` / `POSTGRES_URL`.
3. **Storage → Create Blob Store**. Connect it. This sets `BLOB_READ_WRITE_TOKEN`.
4. Optional: **Settings → Environment Variables →** `OFFICE_PIN=1357`.
5. **Redeploy** the latest preview (or push a commit) so the new env is available.
6. Share the **preview URL** (this PR) with drivers and office. Do not rely on `localhost`.

Copy `.env.example` to `.env.local` only if you want to point local `next dev` at real Neon/Blob.

### Prove two devices share one CR

1. Phone A (Driver): open the preview URL → Driver → Checkout Report → Unit 12 → submit.
2. Phone B (Office, different network): same preview URL → Office → PIN `1357` → the new report and photos appear in the list.

Or locally: `npm run dev`, then Chrome + a Chrome Incognito window against `http://localhost:3000`.

## Multi-company

Architecture is `companies (tenants) → units/vehicles → checkout reports`.

- **Rad Cab** is seeded on the **server** as the first company (Units 12, 18, 23, and plate CXB9373) with two prior PASS reports on Unit 12 and one pending on Unit 18.
- Dispatchers can **add any plate / unit** on the Checkout start screen. That van is saved to Neon so Office can list it even if it was never pre-seeded.
- Also seeded: **1st Choice Recovery**, **Pinkie Tow**, **Other fleets**.
- Do not add RDN / 1st Choice billing in this app.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Demo login (tap a role)

| Button | Role | Lands on |
|--------|------|----------|
| **Start Checkout Report** | Driver | Checkout Report start (use this) |
| Driver | Driver | Checkout Report start |
| Office | Management | Office review (PIN 1357) |
| Tech | Tech | Dashboard (office + maintenance) |
| Super Admin | Super Admin | Full access |

`/check-in` redirects to `/checkout`. Office lists **every** Neon checkout report — not only seeded units 12/18/23.

## Policy notes (Rad Cab default checklist)

Walkaround order (photo slots after Precheck — tire-tread photos dropped; same list for Rad Cab and other companies). **One clockwise lap grouped by station** so the driver does not circle the van twice:

1. **Driver seat** — odometer/fuel, windshield, radio/climate, registration (date + VIN)
2. **Driver door / left-front** — driver door interior, driver-side doors, LF fender, LF wheel, LF 3/4
3. **Front**
4. **Passenger front** — RF 3/4, RF fender, RF wheel, passenger front interior, passenger doors
5. **Passenger rear** — RR quarter, RR wheel, RR 3/4, passenger rear interior
6. **Rear** — straight-on rear, trunk/hatch
7. **Driver rear** — LR 3/4, LR quarter, LR wheel, driver rear interior
8. **Engine bay last** — oil dipstick (keep oily hands off the rest of the walk)

- Example angle photos live in `public/photo-examples/` (paths keyed by angle, not step number).
- Tire tread is a Precheck rating **per tire** (LF / RF / LR / RR: Good / Fair / Low / Bald). Wheel-well photos: close enough and well-lit is OK.
- Clover serial (last digits of the borrowed card reader) is **optional**.
- EV units: Oil and Fuel on Precheck are N/A and do not block advance.
- Registration: office mainly needs date + VIN readable.
- Dash / odometer: office mainly needs mileage readable.
- Night interiors: turn the lights on.
- **Take photo** opens the phone’s native rear camera. **Choose from library** is the backup. There is no in-app Live Preview or flashlight.
- Checkout header has a **Feedback** pill (Bug / Glitch / Idea, optional note + screenshot) on start, Precheck, and photo walkaround. Mail goes to `ashley@warecovery.com` (or `FEEDBACK_TO_EMAIL`).
- Super Admin **Add Vehicle** writes to the shared checkout unit list (not IndexedDB-only).
- Super Admin can allow/deny **drivers adding vehicles** on Checkout (default off).

## Feedback mailer (Vercel)

The Feedback UI always opens. Real email needs these Vercel env vars, then a redeploy:

| Var | Required | Notes |
|---|---|---|
| `RESEND_API_KEY` | yes for delivery | Resend API key |
| `FEEDBACK_FROM_EMAIL` | yes for delivery | Verified Resend from-address, e.g. `FleetCheck <noreply@warecovery.com>` |
| `FEEDBACK_TO_EMAIL` | no | Defaults to `ashley@warecovery.com` |

If the mailer is not wired, submit shows a clear error (HTTP 503). Local `next dev` logs the report instead of emailing.

## PWA

On mobile: open in Chrome/Safari → **Add to Home Screen**

## Tech Stack

- Next.js 15 · TypeScript · Tailwind CSS
- Neon / Vercel Postgres + Vercel Blob for shared CRs
- IndexedDB (idb) for shift check-in/out only · jsPDF · Service Worker

## Project Structure

```
src/app/checkout         Driver checkout report
src/app/office           Office review + flag queue + unit archive
src/app/api/             Shared CR / companies / vehicles / Blob
src/lib/server           Postgres + local-dev store
src/lib/storage          IndexedDB (shift check-in only)
```

## Future

A Slack PDF in `#radcabcr` is **not** the Office record. Checkout submit writes **Neon first**; Slack is an optional copy (`SLACK_WEBHOOK_RADCABCR` or `SLACK_WEBHOOK_RAD_CAB_REPAIRS`). Office `/office` is the source of truth.

## License

Private — internal use only.

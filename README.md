# FleetCheck

A professional, mobile-first internal web app for vehicle documentation, damage tracking, mileage tracking, and **checkout reports (CR)** across multiple companies.

## Driver vs office

**Driver (phone)**  
Start a Checkout Report: pick company → unit # → confirm year/make/model → enter odometer, driver, and dispatcher. Then walk the guided photo checklist (one slot at a time, camera, retake, progress). Submit when every required slot is filled. The report is saved **Complete** with a timestamp on the **shared server** so office can see it on another phone.

The older **Check In / Out** shift flow (mileage, fuel, signature, Slack PDF) is **retired on this preview**. Those reports never wrote to Neon, so they never appeared in Office. `/check-in` now redirects to Checkout Report.

**Office (tablet/desktop or phone)**  
Unlock with the office PIN, list **shared** reports (filter by company, unit, status), open the gallery + metadata, compare side-by-side against the last 1–2 reports for the **same unit**, then mark **PASS**, **Conditional** (retake list), or **FAIL**.

**Archive a unit**  
Office → **Manage units (archive)** (or Dashboard → **Units**). PIN-gated like other office changes. Archive hides the van from Driver Checkout and from the Office unit picker. Past checkout reports and photos stay in Office. Unarchive puts the van back on the active list.

**DAMAGE flags + signature**  
After each accepted photo, drivers can mark that angle as **DAMAGE**. Office gallery/compare lists flagged angles first. PDF marks them. Submit requires a finger/stylus **driver signature**, shown on Office detail and PDF page 1.

**Live preview silhouette**  
Live preview + flashlight shows a per-angle ghost outline. Native **Take photo** cannot overlay a guide.

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

Walkaround order (30 required slots — same list for Rad Cab and other companies):

1. **Docs from the driver seat** — odometer/fuel, registration (date + VIN), windshield, radio/climate
2. **Clockwise exterior from the LF corner** — LF cluster (corner, fender, tire, wheel) → front → RF cluster → passenger doors → RR cluster → rear → LR cluster → driver-side doors
3. **Wheels/tires as you pass each corner** (not a separate later block)
4. **Interior** — driver door in, driver rear, trunk/cargo, passenger rear, passenger front
5. **Engine bay last** — oil dipstick

- Example angle photos live in `public/photo-examples/` (paths keyed by angle, not step number).
- Tire tread / wheel-well: hard shots — close enough and well-lit is OK.
- Registration: office mainly needs date + VIN readable.
- Dash / odometer: office mainly needs mileage readable.
- Night interiors: turn the lights on.
- **Take photo** opens the phone’s native rear camera (one-shot flash only — the web page cannot add a flashlight to that picker).
- **Live preview + flashlight** is the path for dark shots that need a continuous torch. Rear / environment lens is the default; Flip Camera is available. Torch uses `applyConstraints({ advanced: [{ torch }] })` on Android Chrome. It is typically **not** available in iOS Safari — use Take photo + Camera flash, or the Control Center LED torch.
- Choose from library is a backup.
- Photos are compressed on the phone (max edge 1920px, JPEG ~0.75) before upload.

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

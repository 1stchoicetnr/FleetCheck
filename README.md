# FleetCheck

A professional, mobile-first internal web app for vehicle documentation, damage tracking, mileage tracking, and **checkout reports (CR)** across multiple companies.

## Driver vs office

**Driver (phone)**  
Start a Checkout Report: pick company → unit # → confirm year/make/model → enter odometer, driver, and dispatcher. Then walk the guided photo checklist (one slot at a time, camera, retake, progress). Submit when every required slot is filled. The report is saved **Complete** with a timestamp and waits for office review.

The older **Check In / Out** shift flow (mileage, fuel, signature, known issues) is still available from the dashboard.

**Office (tablet/desktop or phone)**  
Unlock with the office PIN, list reports (filter by company, unit, status), open the gallery + metadata, compare side-by-side against the last 1–2 reports for the **same unit**, then mark **PASS**, **Conditional** (retake list), or **FAIL**. Notes for new damage vs prior go on the report. Conditional, FAIL, and new-damage notes land in the **flag queue**.

Demo office PIN: **1357**

## Multi-company

Architecture is `companies (tenants) → units/vehicles → checkout reports`.

- **Rad Cab** is seeded as the first company and uses the 30-photo taxi checkout policy (well-lit shots; night interiors with lights on; say “vehicle” not “van”).
- Other companies are seeded so the picker is not hard-coded to Rad Cab: **1st Choice Recovery**, **Pinkie Tow**, and **Other fleets**. Each company can later get its own checklist; they currently share the 30-step list.
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
| Driver | Driver | Checkout Report start |
| Office | Management | Office review (PIN 1357) |
| Tech | Tech | Dashboard (office + maintenance) |
| Super Admin | Super Admin | Full access |

### Demo Rad Cab units

| Unit | Vehicle | Notes |
|------|---------|--------|
| 12 | 2014 Dodge Grand Caravan | Two prior PASS reports (for compare) |
| 18 | 2018 Dodge Grand Caravan | One pending report to review |
| 23 | 2022 Toyota Camry | Existing taxi demo (plate ABC-1234) |

## Policy notes (Rad Cab default checklist)

- ~30 mandatory photos; example angle photos live in `public/photo-examples/`.
- Tire tread / wheel-well: hard shots — close enough and well-lit is OK.
- Registration: office mainly needs date + VIN readable.
- Dash / odometer: office mainly needs mileage readable.
- Night interiors: turn the lights on.

## Deploy to Vercel

1. Push to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Deploy (Next.js auto-detected)

```bash
npx vercel
```

## PWA

On mobile: open in Chrome/Safari → **Add to Home Screen**

## Tech Stack

- Next.js 15 · TypeScript · Tailwind CSS
- IndexedDB (idb) · jsPDF · Service Worker

## Project Structure

```
src/app/checkout    Driver checkout report
src/app/office      Office review + flag queue
src/app/check-in    Existing shift check-in/out
src/lib/companies   Tenants + checklist resolver
src/lib/storage     IndexedDB: companies, units, CR
```

## Roadmap

- [ ] Backend API (Supabase / Postgres)
- [ ] Real Slack/email webhook delivery
- [ ] Push notifications

## Future

Slack bot posting into `#radcabcr` is **out of scope** for this PR. Radar already watches that channel. A later integration can notify office when a CR is submitted or flagged.

## License

Private — internal use only.

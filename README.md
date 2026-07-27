# FleetCheck

A professional, mobile-first internal web app for vehicle documentation, damage tracking, mileage tracking, and accountability across multiple fleets.

## Features

- **Role-based access**: Super Admin (Ashley/James), Management, Tech, Driver
- **6 fleet types**: Taxi, Tow, Turo, Service Vehicle, Camera Car, Other — workflow auto-adjusts
- **Driver workflow**: QR/plate lookup, 10 guided photos (8 exterior + odometer + fuel), mileage, damage report, signature, condition rating
- **Offline mode**: IndexedDB storage + service worker (PWA)
- **PDF reports**: Photos, mileage, signature, fuel receipt
- **Vehicle status**: Ready / Needs Work / Out of Service
- **Notifications**: Slack + email toggles (local queue, ready for webhooks)
- **Mobile-first UI**: Progress bars, voice-to-text, large touch targets

## Quick Start

```bash
cd FleetCheck
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Demo login (tap a role)

| Button | Role |
|--------|------|
| Driver | Check in/out, photos, mileage |
| Tech | Maintenance & vehicle status |
| Management | Reports & alerts |
| Super Admin | Full access, can override steps |

### Demo vehicles

| Plate | Fleet Type | QR Code |
|-------|------------|---------|
| ABC-1234 | Taxi | FC-ABC1234 |
| TOW-5678 | Tow Truck | FC-TOW5678 |
| TUR-9012 | Turo | FC-TUR9012 |
| SVC-3456 | Service Vehicle | FC-SVC3456 |
| CAM-7890 | Camera Car | FC-CAM7890 |
| GEN-2468 | Other | FC-GEN2468 |

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
src/app/          Pages (check-in, dashboard, vehicles, reports, alerts, admin)
src/components/   UI (guided photos, damage report, signature, QR scanner)
src/lib/          Storage, types, PDF, fleet config, notifications
src/hooks/        Auth, offline sync, speech recognition
```

## Roadmap

- [ ] Backend API (Supabase / Postgres)
- [ ] Real Slack/email webhook delivery
- [ ] Push notifications

## License

Private — internal use only.

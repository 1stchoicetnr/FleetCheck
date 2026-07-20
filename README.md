# FleetCheck

A professional, mobile-first internal web app for vehicle documentation, damage tracking, mileage tracking, and accountability across multiple fleets.

## Features

- **Role-based access**: Super Admin, Management, Tech, and Driver roles
- **Guided driver workflow**: QR/plate lookup, 10 mandatory photos, odometer, issue reporting, signature
- **Fleet-type awareness**: Auto-adjusts for Taxi, Tow, Turo, Service Vehicle, Camera Car, and Other
- **Offline mode**: IndexedDB storage with service worker caching (PWA)
- **PDF reports**: Downloadable reports with photos, mileage, and signature
- **Vehicle status tracking**: Ready / Needs Work / Out of Service
- **Notifications**: Configurable Slack and email alert toggles
- **Mobile-first UI**: Progress bar, voice-to-text, large touch targets

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm

### Install & Run

```bash
cd FleetCheck
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Demo Users

On first load, the app seeds demo data. Select any user on the login screen:

| User    | Role         |
|---------|--------------|
| Ashley  | Super Admin  |
| James   | Super Admin  |
| Manager | Management   |
| Tech    | Tech         |
| Driver  | Driver       |

Demo vehicles across three fleet types:

| Plate     | Fleet Type | QR Code      |
|-----------|------------|--------------|
| ABC-1234  | Taxi       | FC-ABC1234   |
| TOW-5678  | Tow Truck  | FC-TOW5678   |
| TUR-9012  | Turo       | FC-TUR9012   |

## Deploy to Vercel

1. Push the repo to GitHub
2. Import the project in [Vercel](https://vercel.com/new)
3. Vercel auto-detects Next.js — no extra config needed
4. Deploy

Or use the CLI:

```bash
npm i -g vercel
vercel
```

## PWA Install

On mobile, open the app in Chrome/Safari and use "Add to Home Screen" to install FleetCheck as a standalone app.

## Project Structure

```
src/
├── app/              # Next.js App Router pages
│   ├── check-in/     # Driver check-in/out workflow
│   ├── dashboard/    # Role-based home
│   ├── vehicles/     # Fleet overview
│   ├── reports/      # Check records & PDF export
│   ├── alerts/       # Maintenance & condition alerts
│   └── admin/        # Super Admin panel
├── components/       # UI components
├── hooks/            # Auth, offline, speech recognition
└── lib/              # Storage, types, PDF, fleet config
```

## Tech Stack

- **Next.js 15** (App Router, Turbopack)
- **TypeScript** + **Tailwind CSS**
- **IndexedDB** (via idb) for local storage
- **jsPDF** for PDF generation
- **Service Worker** for offline PWA support

## Roadmap

- [ ] Backend API (Supabase / Postgres)
- [x] Camera QR scanner (BarcodeDetector API)
- [ ] Push notifications
- [x] Slack/email notification queue (local, ready for webhooks)
- [ ] Multi-fleet management UI

## License

Private — internal use only.

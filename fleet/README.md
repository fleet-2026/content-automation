# FleetOS

Fleet management for a ~300-vehicle fleet: track vehicles, driver profiles,
license/document expiries, and book trips Uber-style.

This is a fresh, self-contained project that lives alongside (but separate from)
the Creator OS content-automation app in this repo.

## What's in the box

```
fleet/
├── server-web/   Next.js — admin dashboard + REST API (the backend) + Prisma DB
└── mobile/       Expo / React Native — rider & driver app (trip booking)
```

The **web app is also the backend**: its `/api/*` routes are what the mobile app
calls. One data model, one source of truth.

### Data model (Prisma)

- **Vehicle** — plate, make/model/year, status (Available / On trip / Maintenance), mileage
- **Driver** — profile, phone, rating, status, assigned vehicle
- **Document** — a compliance doc with an expiry date, attached to a vehicle *or* a
  driver (driver license, registration, insurance, inspection, permit). This powers
  the **Licenses & Expiries** feature.
- **Trip** — Uber-style request → assign → in-progress → completed, linking a
  rider, a driver, and a vehicle.
- **User** — sign-in accounts with roles (Admin / Dispatcher / Driver / Rider).

The expiry engine (`src/lib/compliance.ts`) derives a status from each document's
date: **Expired**, **Expiring soon** (≤ 30 days), or **Valid**.

## Features in this MVP

| Area | Status |
|---|---|
| 300-vehicle fleet inventory + statuses | ✅ web |
| Driver profiles + assigned vehicle + license status | ✅ web |
| Licenses & expiries dashboard with alerts (expired / expiring) | ✅ web |
| Trip request (rider) | ✅ mobile + API |
| Auto-assign a free driver + vehicle | ✅ API + web dispatch board |
| Trip lifecycle: assign → start → complete → cancel | ✅ web + mobile |
| Live trip status polling for the rider | ✅ mobile |

## Run it

### 1. Web admin + API (the backend)

```bash
cd fleet/server-web
cp .env.example .env        # SQLite — no external DB needed
npm install
npm run db:push             # create the SQLite schema
npm run seed                # 300 vehicles, 120 drivers, docs (some expiring), sample trips
npm run dev                 # http://localhost:3001
```

Seeded admin login (for when auth is wired up): `admin@fleet.local` / `admin1234`.

### 2. Mobile app (Expo)

```bash
cd fleet/mobile
npm install
npm start                   # press i / a, or scan the QR with Expo Go
```

On a physical device, set `expo.extra.apiBaseUrl` in `app.json` to your
machine's LAN IP (e.g. `http://192.168.1.20:3001`) so the phone can reach the API.

## Production notes

- **Database**: switch `prisma/schema.prisma` `provider` to `postgresql` and point
  `DATABASE_URL` at Postgres (Neon/Supabase/RDS). SQLite is dev-only.
- The API currently has no auth gate — see roadmap.

## Roadmap (next slices)

1. **Auth** — NextAuth on web (admin/dispatcher) + token auth for the mobile app;
   scope the driver screen to the signed-in driver.
2. **Maps & real GPS** — `react-native-maps` + Expo Location for live pickup/driver
   tracking; geocode addresses to lat/lng.
3. **Push notifications** — Expo push for "driver assigned" / "driver arriving".
4. **Real-time** — replace polling with websockets / server-sent events.
5. **Automated expiry reminders** — scheduled job that emails/notifies before a
   document expires (the data + status engine are already in place).
6. **Maintenance & fuel logs**, trip history/exports, and fare rules.

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
| **Auth** — JWT login (web cookie + mobile bearer), role-aware, protected routes | ✅ web + mobile |
| **Maps & GPS** — device location, map view, address geocoding on the rider screen | ✅ mobile |
| **Push notifications** — Expo push on driver-assigned / trip status + expiry alerts | ✅ |
| **Automated expiry reminders** — idempotent scheduled scan, deduped per milestone | ✅ |

### How the new pieces fit

- **Auth** (`src/lib/auth.ts`): one JWT signed with `AUTH_SECRET`, verified the same
  way for the web cookie and the mobile `Authorization: Bearer` header. `middleware.ts`
  redirects unauthenticated web visitors to `/login` and 401s protected API calls.
  The mobile app stores its token in `expo-secure-store` and restores the session on
  launch. Trips are scoped to the signed-in user (`?mine=rider|driver`).
- **Maps & GPS** (`app/rider.tsx`): `expo-location` gets the device position, reverse-
  geocodes it into the pickup field, and the trip is created with `pickupLat/Lng`.
  `react-native-maps` shows the map + pickup marker.
- **Push** (`src/lib/push.ts` + `mobile/src/push.ts`): the app registers an Expo push
  token after login (`POST /api/auth/push-token`); the server pushes the driver and
  rider as the trip progresses, and pushes staff on document expiries.
- **Expiry reminders** (`src/lib/reminders.ts`): scans every document, and for each
  expired / expiring-soon one that hasn't been reminded yet, records a `Reminder`
  (unique per `documentId + milestone`) and sends a push. Re-running is a no-op.

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

Seeded logins:

| Role | Email | Password |
|---|---|---|
| Admin (web) | `admin@fleet.local` | `admin1234` |
| Rider (mobile) | `rider@fleet.local` | `password` |
| Driver (mobile) | `driver@fleet.local` | `password` |

### 2. Expiry reminders (scheduled job)

```bash
npm run reminders                       # run the scan once from the CLI
# or hit the protected endpoint from your scheduler (Vercel Cron / GitHub Action):
curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3001/api/cron/expiry-reminders
```

### 3. Mobile app (Expo)

```bash
cd fleet/mobile
npm install
npm start                   # press i / a, or scan the QR with Expo Go
```

On a physical device, set `expo.extra.apiBaseUrl` in `app.json` to your machine's
LAN IP (e.g. `http://192.168.1.20:3001`) so the phone can reach the API. For Android
maps, drop a Google Maps key into `android.config.googleMaps.apiKey`. Push
notifications and GPS require a real device (not a simulator).

## Production notes

- **Database**: switch `prisma/schema.prisma` `provider` to `postgresql` and point
  `DATABASE_URL` at Postgres (Neon/Supabase/RDS). SQLite is dev-only.
- Set a strong `AUTH_SECRET` (`openssl rand -base64 32`) and a `CRON_SECRET`.
- Schedule `GET /api/cron/expiry-reminders` (e.g. daily) with the secret header.

## Roadmap (next slices)

1. **Live driver tracking** — stream the driver's GPS to the rider's map (replace
   status polling with websockets / SSE).
2. **Email channel** for expiry reminders alongside push (the engine already records
   `Reminder.channel`).
3. **Maintenance & fuel logs**, trip history/exports, and fare rules.
4. **Driver onboarding** — invite flow + document upload from the app.

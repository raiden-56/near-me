# NearMe — Everything Around You

Discover places. Find services. Know what's happening nearby.

NearMe is an installable, location-first web app: a city guide, a map, a live neighbourhood feed
and a business directory in one. It runs out of the box on real OpenStreetMap data with no API
keys.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Type-check, then production build with the service worker |
| `npm run preview` | Serve the production build (use this to test install and offline) |
| `npm run typecheck` | TypeScript only |
| `npm test` | Unit tests for the core logic (opening hours, search intent, trust scoring, place classification) |
| `npm run check:apis` | Checks that every public data provider is reachable from your network |
| `npm run icons` | Regenerates the PWA icons from the mark |
| `npm run imagery -- --review` / `--write` | Rebuilds the illustrative photo pool (see below) |

Copy `.env.example` to `.env.local` to change providers, the starting area, or to connect Supabase.
Every value is optional.

## What is real and what is sample

| | Source | Notes |
| --- | --- | --- |
| Places, names, categories | OpenStreetMap via OpenFreeMap vector tiles | Fast baseline: every place within the radius |
| Hours, phone, website, cuisine, amenities | OpenStreetMap via Nominatim and Overpass | Shown only where the map records them |
| Map | OpenFreeMap tiles, recoloured to the brand palette | `VITE_MAP_STYLE_URL` swaps the provider |
| Location search, area names | Photon, Nominatim | |
| Routes and travel times | OSRM (routing.openstreetmap.de) | Drive, cycle, walk |
| Photos | Wikimedia Commons (category photos bundled, nearby photos live) | Tagged "Photo taken nearby" or "Illustrative photo" unless tagged on the place itself |
| Ratings, reviews, live updates, deals, events | **Sample data**, generated and labelled "Sample" | Switch off in Settings → Data and sources |
| Anything you post (reviews, updates, saved places) | Real, stored on this device | Moves to Supabase when a backend is connected |

OpenStreetMap has no ratings, queues or offers, and no backend is connected yet, so the community
layer is filled with deterministic sample content attached to real places. It is always tagged,
never stored, and health and safety services (hospitals, clinics, pharmacies, police) never receive
a sample rating.

The public provider instances are best-effort community services. They are fine for development
and demos; for production traffic host your own or use a commercial provider. Overpass and
Wikimedia both rate-limit shared networks: the app falls back (tiles + Nominatim for places, a
designed cover for photos) rather than failing.

## Architecture

```
src/
  app/            router, providers, shell layout
  components/     ui/ (design-system primitives), common/, navigation/
  features/       discovery, search, maps, businesses, reviews, community, deals, events,
                  emergency, saved, profile, notifications, auth, admin, business-portal
  services/       one module per domain; the only code that talks to providers or storage
    places/       tiles → Overpass → Nominatim pipeline with caching and a circuit breaker
    backend/      localDb: the local-mode backend (IndexedDB)
  hooks/          TanStack Query hooks over the services
  store/          Zustand stores (location, settings, auth, ui), persisted to IndexedDB
  data/           category taxonomy and OSM tag rules, sample generators, imagery pool
  lib/            geo, opening hours parser, community trust logic, schemas (zod), http
supabase/         PostgreSQL + PostGIS schema, RLS, functions, storage, seed
```

UI never calls a provider or storage directly: components → hooks → services.

**Place pipeline.** `useNearbyPlaces` reads the `poi` layer of the same vector tiles the map draws
(served from a CDN, ~100 ms), then upgrades records with full OSM tags when Overpass or Nominatim
answers. Results are cached in IndexedDB so the last area still opens offline.

**Search** parses intent locally (`services/search.ts`): category synonyms, typo tolerance,
"open now", "cheap", "under ₹2000", "with low queue", and "X near <landmark>".

**NearMe Live.** Every update has a type-specific lifetime (`AdminConfig.expiryMinutes`), a
verification state (business confirmed, community verified, unverified, disputed) and a
confidence score from reporter reputation, confirmations, disagreements and age
(`lib/community.ts`). Expired updates are never shown as current. Re-posting the same update
refreshes it instead of duplicating it, votes are one per person, and points are only awarded
once a contribution is verified.

## Local mode and Supabase

Without `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` the app runs in **local mode**: accounts,
reviews, live updates, collections, listings and moderation decisions live in IndexedDB on the
device. Settings → Workspaces lets a local account open the business portal (`/business`) and the
admin area (`/admin`) so both can be explored without a server.

With the keys set, sign-in uses Supabase Auth (email, Google, phone OTP) and the profile's role
comes from the database. The schema, Row Level Security policies, functions and storage rules are
in `supabase/`; see `supabase/README.md` for how to apply them and how each `src/services/*.ts`
module maps to tables and RPCs. The migrations were validated on PGlite (PostgreSQL 17 and 19 with
real PostGIS, 423 behavioural checks) but have not yet been applied to a real Supabase project.
**The data services still read and write the local store**:
switching them to the Supabase tables is the remaining integration step, and it is contained in
`src/services/`.

Never put the Supabase service-role key in a `VITE_*` variable.

## PWA

- Manifest, icons (192, 512, maskable), shortcuts and standalone display: `vite.config.ts`
- Service worker generated by Workbox: app shell precached; map tiles cache-first; place data
  network-first with offline fallback; images stale-while-revalidate
- Custom install card, iOS "Add to Home Screen" instructions, and an in-app update prompt
- Offline: cached areas, saved places and recently viewed places stay readable, an offline banner
  makes clear that live data is paused, and reviews or updates written offline are queued and
  sent on reconnect (`services/outbox.ts`)
- Push: `public/sw-push.js` handles push and notification clicks; set `VITE_VAPID_PUBLIC_KEY` and
  store subscriptions server-side to send them

The service worker is only active in the production build: `npm run build && npm run preview`.

## Deploying

The app is a static site: `npm run build` produces `dist/`, which any static host can serve as
long as unknown paths fall back to `index.html`.

**GitHub Pages.** `.github/workflows/deploy.yml` runs on every push to `main`: it installs, runs
the tests, builds with `VITE_BASE=/<repository-name>/` and force-pushes the result to the
`gh-pages` branch. In the repository's Settings → Pages, choose "Deploy from a branch" and
`gh-pages` / root. The site is then at `https://<owner>.github.io/<repository-name>/`.

Two details make a sub-path host work:

- `VITE_BASE` sets the public path. Routes, the manifest, the service worker scope, share links
  and bundled photos all follow it (`BASE_PATH`, `appUrl`, `assetUrl` in `src/lib/env.ts`).
- `npm run build:pages` also copies `index.html` to `404.html`, because GitHub Pages has no
  rewrite rules: a deep link such as `/place/n123` is served through the 404 page, the app boots
  and the router shows the right screen.

To build for Pages by hand: `VITE_BASE=near-me npm run build:pages` (leave out the slashes in Git
Bash on Windows, which rewrites values that start with `/`).

## Location and privacy

- Location is never required. Denied or unavailable permission falls back to a manual area.
- A GPS fix is stored coarsened to about 100 m and no history is kept.
- Area-level live updates are placed on a ~300 m grid; place updates use the place's position.
- Nothing shows one person's location to another.

## Illustrative photos

About 150 Wikimedia Commons photographs, chosen per category, are bundled in `public/imagery/` as
WebP in two sizes (480 px for cards, up to 960 px for covers), so cards do not depend on
Wikimedia being reachable. `public/imagery/CREDITS.md` lists the author, licence and source page
of every photo, and the same credit is shown in the app when a photo is opened. Keep that file
with the images: the licences require attribution.

To rebuild the pool: `npm run imagery -- --review` writes a contact sheet to
`public/_imagery-review.html`; note the indexes to reject in `REVIEWED_EXCLUDE` in
`scripts/build-imagery.mjs`, then run `npm run imagery -- --write --bundle` and delete the contact
sheet. Without `--bundle` the photos are hot-linked from Wikimedia instead of downloaded.

## Attribution

Map data © OpenStreetMap contributors (ODbL). Tiles by OpenFreeMap / OpenMapTiles. Geocoding by
Photon and Nominatim. Routing by OSRM. Photographs from Wikimedia Commons under their individual
licences.

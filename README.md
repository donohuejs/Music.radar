# Music Radar

Music Radar is a location-based event finder for live music at venues, bars,
breweries, festivals, parks, and city-sponsored concert series. It combines
commercial listings with indexed local sources and background source discovery.

Production: [music-radar-one.vercel.app](https://music-radar-one.vercel.app)

## Features

- Search by typed location or browser geolocation with a reverse-geocoded
  city/state/ZIP confirmation.
- Tonight, tomorrow, weekend, next-seven-days, and visual custom-range searches.
- Separate categories for live music, participatory music, trivia, theater, and
  comedy.
- Result-driven genre filters with honest unknown-genre handling.
- Ticketmaster and registered local-source ingestion.
- Conservative cross-source deduplication using artist, start time, and venue
  location signals while preserving provider IDs and ticket links.
- Geographic discovery of municipal, brewery, bar, festival, and venue sources.
- ICS, RSS, JSON-LD, linked-event listing, embedded Tockify, custom venue, and
  recurring-series collectors.
- PDF/image poster detection and OCR staging.
- Cached, conservative MusicBrainz genre enrichment.

## Local development

Requirements: Node.js 20 or newer and npm.

```powershell
npm.cmd install
npm.cmd run dev
```

Validation:

```powershell
npm.cmd test
npm.cmd run build
```

Copy `.env.example` to a local environment file only when local API/Firebase
testing is needed. Never commit populated environment files.

## Production configuration

Vercel server variables:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `TICKETMASTER_API_KEY`
- `INGEST_SECRET`
- `CRON_SECRET`
- `INDEXED_SEARCH_ENABLED=true`

The browser-safe `VITE_FIREBASE_*` values are documented in `.env.example`.
Server credentials must never use the `VITE_` prefix.

GitHub Actions requires one repository secret:

- `MUSIC_RADAR_INGEST_SECRET` — the same value as Vercel's `INGEST_SECRET`.

MusicBrainz read access requires no account credentials or API key. The app
identifies itself through its server-side User-Agent and obeys the service's
request limit.

## Operator commands

In PowerShell, load the ingestion secret without putting it in shell history:

```powershell
$secret = Read-Host "Paste your INGEST_SECRET"
```

Refresh registered event sources:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "https://music-radar-one.vercel.app/api/ingest-sources" `
  -Headers @{ Authorization = "Bearer $secret" }
```

Run a bounded MusicBrainz enrichment batch:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "https://music-radar-one.vercel.app/api/enrich-genres" `
  -ContentType "application/json" `
  -Headers @{ Authorization = "Bearer $secret" } `
  -Body '{"limit":8}'
```

Both operations also run on schedules. Manual calls are useful immediately
after deploying normalization changes or when diagnosing data gaps.

The `Discover local event sources` GitHub workflow can also be started manually
with optional latitude, longitude, radius, and force inputs. A verified source
name, URL, and reusable parser may be supplied as an operational fallback. The
workflow queues discovery, processes bounded batches, and ingests registered
sources using the repository secret without exposing it to the operator shell.

## Documentation

- [Project handoff](docs/project-handoff.md)
- [Source registry](docs/source-registry.md)
- [Source discovery](docs/source-discovery.md)

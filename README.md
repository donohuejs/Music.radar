# Music Radar

Music Radar is a location-based event finder for live music at venues, bars,
breweries, festivals, parks, and city-sponsored concert series. It combines
commercial listings with indexed local sources and background source discovery.

Production: [music-radar-one.vercel.app](https://music-radar-one.vercel.app)

## Features

- Search by typed location or browser geolocation with a reverse-geocoded
  city/state/ZIP confirmation.
- Free, locally indexed city/state/ZIP suggestions with prefix and typo-tolerant
  matching; submitted locations still use the server geocoder.
- Tonight, tomorrow, weekend, next-7-day, next-14-day, next-30-day, and visual
  custom-range searches.
- Automatic removal of events after their start time, plus result-level
  walkable, short-trip, across-town, and custom-distance filters.
- Separate categories for live music, participatory music, trivia and games, theater, and
  comedy.
- Conservative removal of explicit venue-hours and no-performance placeholders
  so the live-music inventory remains focused on artist performances.
- Result-driven genre filters with honest unknown-genre handling.
- Category-aware, paginated Ticketmaster collection and registered local-source
  ingestion.
- Conservative cross-source deduplication using artist, start time, and venue
  location signals while preserving provider IDs and ticket links.
- Geographic discovery of municipal, brewery, bar, festival, and venue sources.
- ICS, RSS, JSON-LD, linked-event listing, embedded Tockify, custom venue, and
  recurring-series collectors.
- PDF/image poster detection and OCR staging.
- Field-poster and social-screenshot intake from the protected dashboard, with
  optional pasted OCR for immediate processing and scheduled OCR otherwise.
- Public missing-event feedback from the footer and sparse-result states,
  accepting a poster/screenshot, an artist or venue events-page link, or both.
  Submissions are deduplicated, rate-limited, and held for human review in a
  bounded evidence queue compatible with Firebase's no-cost Spark plan.
- Conservative poster draft extraction requiring explicit years or a supplied
  capture date corroborated by a stated recurring weekday, with every inferred
  date held for human review before publication.
- Protected poster review with editable event details, required IANA time-zone
  validation, audited publication, stable event IDs, and draft dismissal.
- Cached, conservative, provider-neutral artist genre enrichment, currently
  backed by MusicBrainz.

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
- `FEEDBACK_RATE_LIMIT_SALT` (optional dedicated salt for hashed public-feedback rate limits)
- `TICKETMASTER_API_KEY`
- `INGEST_SECRET`
- `CRON_SECRET`
- `INDEXED_SEARCH_ENABLED=true`

The browser-safe `VITE_FIREBASE_*` values are documented in `.env.example`.
Server credentials must never use the `VITE_` prefix.

The checked-in location suggestion index is generated from GeoNames US city
and postal data under CC BY 4.0. Rebuild it with
`node scripts/build-location-suggestions.js <US.txt> <cities15000.txt>`.

GitHub Actions requires one repository secret:

- `MUSIC_RADAR_INGEST_SECRET` — the same value as Vercel's `INGEST_SECRET`.

The scheduled discovery workflow supplements OpenStreetMap with the free
Overture Places dataset. It resolves the latest release automatically, queries
only queued geographic cells, and requires no places API key. Returned websites
remain untrusted leads until a reusable event calendar is validated.

MusicBrainz read access requires no account credentials or API key. The app
identifies itself through its server-side User-Agent and obeys the service's
request limit.

Optional genre corroboration providers use server-only credentials:

- `DISCOGS_TOKEN` enables repeated-release genre/style evidence from Discogs.
- `APPLE_MUSIC_DEVELOPER_TOKEN` enables Apple Music catalog artist genres.
- `APPLE_MUSIC_STOREFRONT` selects the Apple catalog storefront and defaults to
  `us`.

If these values are absent, enrichment skips those providers and continues with
MusicBrainz. When multiple providers match, a genre must be supported by at
least two before it is written to an event.

Discogs-enabled enrichment refreshes every four hours. Its evidence expires
after six hours; stale Discogs-influenced genres are suppressed from search
responses. Public listings link attributed genre data to a supporting Discogs
release, and the interface includes the trademark notice required by Discogs.

## Operator commands

In PowerShell, load the ingestion secret without putting it in shell history:

```powershell
$secret = Read-Host "Paste your INGEST_SECRET"
```

Process registered event sources in resumable batches until the current registry
cycle is complete:

```powershell
do {
  $result = Invoke-RestMethod `
    -Method Post `
    -Uri "https://music-radar-one.vercel.app/api/ingest-sources" `
    -ContentType "application/json" `
    -Headers @{ Authorization = "Bearer $secret" } `
    -Body '{"limit":4}'
} until ($result.cycleComplete)
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

Both operations also run on schedules. The genre workflow repeatedly requests
batches of four and follows Firestore page cursors until the complete eligible
backlog is drained. It saves its cursor between workflow runs, processes at most
80 batches per run, and resumes on the next schedule; provider and API failures
still fail visibly without discarding completed progress. Manual calls are useful
immediately after deploying normalization changes or when diagnosing data gaps.

The `Discover local event sources` GitHub workflow can also be started manually
with optional latitude, longitude, radius, and force inputs. The force input
bypasses both discovery freshness and registered-source ingestion schedules. A verified source
name, URL, reusable parser, and default category may be supplied as an
operational fallback. The workflow queues discovery, processes bounded batches,
and ingests registered sources using the repository secret without exposing it
to the operator shell.

## Operations dashboard

Open `/admin` in the deployed app and enter `INGEST_SECRET` to view the
read-only coverage dashboard. The secret is kept only in the page's memory and
is sent as a bearer token to `/api/operations`. The dashboard summarizes source
health, ingestion schedules, discovery cells, review candidates, and recent
failed runs. Protected controls can approve or reject candidates, refresh one
source, enable or disable ingestion, and hide an event by its exact source or
ticket URL. Every attempted mutation is recorded
in `operationalAudit`; approval is limited to reusable supported parsers and
duplicate registered URLs are blocked. Rejections store a structured reason and
survive rediscovery. Single-event JSON-LD pages cannot be approved as reusable
sources. Active URL suppressions are applied during both ingestion and search;
they can be reversed from the dashboard.

Operators can also submit photographed posters or social screenshots. The
browser compresses the image before the protected API stores it in Firebase
Firestore as a private evidence document. The queue accepts at most 500 images,
limits each image to 550 KB, and removes evidence after the review is complete
or it reaches 90 days old. Evidence is returned only through authenticated
dashboard and OCR endpoints. Venue coordinates, capture date,
time zone, optional recurring weekday, source URL, and optional device OCR text
are retained with the review candidate. Pasted text creates drafts immediately;
otherwise the scheduled discovery workflow runs Tesseract. Dates with an
inferred year are never auto-published and remain editable in poster review.

Visitors can use the “Missing an event?” link in the footer or a low-coverage
result state to submit a poster/screenshot or public events-page URL. The public
endpoint rejects private-network URLs, limits each hashed client address to five
submissions per rolling day, uses a bot honeypot, and deduplicates identical
images or URLs. Raw client addresses are never stored. These community leads
enter the same protected candidate/OCR queue and can never publish without an
operator review action.

This media path deliberately avoids Cloud Storage and remains compatible with
the Firebase Spark plan. At the queue limit, image submissions fail closed with
a request to provide an event-page URL; the application never enables billing
or silently expands storage capacity.

Successful indexed searches also write a coarse coverage diagnostic with a
30-day retention marker to
`searchCoverage`. Records include the resolved place label, radius, category,
date window, contributing source names, and discovery-cell IDs. They do not
store user identifiers or precise coordinates. New searches opportunistically
delete expired records. The operations dashboard uses
these records to flag searches with no results, Ticketmaster-only results, or
completed discovery cells that produced no registered local source.

The dashboard also summarizes cached genre-provider impact: provider matches,
Discogs-only incremental coverage, corroboration, conflicts, errors, affected
events, and recent artist outcomes. Discogs evidence older than six hours is
excluded from dashboard details and supporting links.

## Documentation

- [Project handoff](docs/project-handoff.md)
- [Source registry](docs/source-registry.md)
- [Source discovery](docs/source-discovery.md)

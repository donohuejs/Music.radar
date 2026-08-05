# Music Radar project handoff

Updated: 2026-08-04

## Mission

Make it easy to discover live music near any location, including events that
large ticketing platforms miss: brewery and bar performances, free municipal
series, festivals, parks, and neighborhood venues. The product must grow through
reusable discovery and ingestion systems rather than a worldwide hardcoded venue
list.

## Current system

```text
User search
  -> geocode or browser coordinates
  -> indexed Firestore events + Ticketmaster
  -> distance/date/category filtering and deduplication
  -> immediate results
  -> asynchronous geographic source-discovery queue

Scheduled workers
  -> registered source ingestion -> normalized Firestore events
  -> discovery -> candidate calendars/pages/posters -> validated sources
  -> poster extraction -> stored OCR text
  -> MusicBrainz enrichment -> cached artist genres -> updated events
```

The React/Vite client is deployed by Vercel from GitHub `main`. Vercel API
functions implement search and protected operational endpoints. Firebase Admin
stores indexed events, registered sources, discovery state, ingestion records,
and artist-genre cache records.

Browser geolocation is reverse-geocoded server-side for a visible city/state/ZIP
confirmation, while searches continue to use the precise browser coordinates.

## Event model highlights

Important normalized fields include:

- stable `id` and optional `externalId`
- `name`, `artistName`, `venueName`, and address fields
- latitude, longitude, and `geoCell`
- ISO `startTime` and optional `endTime`
- `category`: `music`, `participatory`, `trivia`, `theater`, `comedy`,
  `community`, or `other`
- `genres`, using `Genre not listed` instead of invented metadata
- source attribution, confidence, and verification timestamps

Search-time deduplication uses normalized artist, exact start minute, and postal
code or canonical venue signals. Merged results retain provider IDs and ticket
URLs for diagnostics.

Ticketmaster searches map product categories to provider classifications,
paginate through available results, and split date windows when a dense query
would exceed the provider's deep-paging boundary. Automatically discovered
calendars are treated as mixed-category sources unless an operator supplies a
verified default.

## Shipped Greenville verification sources

Greenville is the initial coverage test market, not a search-system special
case. Shipped sources currently include Radio Room, Smiley's on the Roxx,
Swanson's Warehouse, Peace Center, Foundry at Judson Mill, PNG Downtown Alive,
and Greenville Heritage Main Street Fridays. The two municipal series use the
reusable `series-schedule` collector because their lineups were published in
poster/PDF assets.

## Automation

- Vercel runs one resumable `/api/ingest-sources` registry batch daily, and the
  discovery workflow drains additional batches. A persisted cursor removes the
  former 250-source ceiling; per-source due times and conditional ICS/RSS
  requests reduce unnecessary collection work.
- `.github/workflows/discovery.yml` processes geographic discovery jobs and
  poster extraction. Its repeated bounded calls advance a persisted
  organization cursor and return unfinished work to `pending` before the
  serverless deadline. Queue selection is priority-aware and oldest-first,
  interrupted jobs are recovered through expiring leases, and complete search
  radii retain their outer discovery cells.
- `.github/workflows/genre-enrichment.yml` processes bounded MusicBrainz genre
  batches.
- Both GitHub workflows use `MUSIC_RADAR_INGEST_SECRET`.

## Security and operations

- Firebase Admin credentials, Ticketmaster keys, and ingestion secrets live in
  Vercel, never in Git.
- Protected APIs accept only `INGEST_SECRET` or Vercel's `CRON_SECRET`.
- `/admin` is an operations dashboard backed by the protected `/api/operations`
  endpoint. It surfaces source health, discovery coverage, candidate review
  backlog, and ingestion failures without shipping secrets to the client
  bundle. Candidate approval/rejection and source refresh/enable controls are
  server-validated and recorded in `operationalAudit`.
- Indexed searches write coarse `searchCoverage` diagnostics with no user
  identifier or precise coordinates. Records carry a 30-day retention marker
  and new searches opportunistically remove expired records. The dashboard aggregates these into
  area-level warnings for empty searches, commercial-only coverage, and
  completed discovery cells with no registered local source.
- Firestore client rules allow public reads only for intended public
  collections; server-side writes use Firebase Admin.
- Source discovery rejects private/local addresses and bounds geographic cells,
  organizations, pages, response sizes, and worker batches.

## Known limitations

1. Poster discovery stores OCR text but does not yet generically transform every
   arbitrary poster layout into events. Structured recurring-series data is the
   verified fallback.
2. Many small/local artists are absent from MusicBrainz. Exact-name and
   high-confidence matching intentionally leaves uncertain artists unclassified.
3. Discovery now recognizes linked JSON-LD event listings as durable sources,
   but novel JavaScript calendars and HTML-only event detail pages still require
   a reusable adapter. They remain candidates rather than publishing guessed
   dates or time zones.
4. Search quality must still be tested in markets beyond Greenville. The
   dashboard now identifies weak markets from recent searches, but it does not
   replace deliberate dense-city, rural, tourism, and international testing.
5. The administrative dashboard does not yet support ambiguous artist-match
   review or detailed per-source ingestion history. Candidate approval requires
   an already recognized reusable parser.

## Recommended next priorities

1. Add ambiguous genre-match review and detailed per-source ingestion history
   to the admin dashboard.
2. Add scheduled aggregation and deletion for expired search coverage records,
   plus richer map visualization for weak geographic cells.
3. Generalize poster normalization using OCR coordinates, recurring weekday
   validation, and human approval before publication.
4. Test several contrasting markets: a dense major city, a midsize city, a
   rural/tourism area, and an international destination.
5. Add monitoring for ingestion failures, stale sources, enrichment backlog,
   duplicates, and events with missing coordinates.

## Starting a fresh Codex task

Open this repository as the Codex project and begin with a short prompt such as:

> Continue Music Radar. Read AGENTS.md, README.md, and
> docs/project-handoff.md first. Inspect the current branch and preserve
> unrelated changes. Today's goal is: [describe the next gap or feature].

The repository documents are the durable source of context. The old chat is
useful historical evidence but should not be required for routine continuation.

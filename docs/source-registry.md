# Music Radar source registry

Music Radar indexes events before users search. Event sources live in the
Firestore `sources` collection, so adding a compatible calendar does not
require a code deployment.

## Supported source types

- `ical`: iCalendar/ICS feeds, including timezone-aware event dates.
- `calendar-page`: venue or organization pages that embed a supported public
  calendar. Tockify calendars are detected automatically and imported through
  their ICS feed.
- `rss`: event RSS feeds that expose an explicit event start field.
- `json-ld`: pages containing Schema.org Event JSON-LD.
- `radio-room`, `squarespace`, `peace-center`, `foundry`: existing custom
  adapters retained for sites whose markup needs special handling.

## Source document

```json
{
  "name": "Downtown Friday Night Music",
  "parser": "ical",
  "url": "https://example.gov/events.ics",
  "enabled": true,
  "venueName": "Main Street Plaza",
  "address": "100 Main Street",
  "city": "Greenville",
  "state": "SC",
  "postalCode": "29601",
  "latitude": 34.8526,
  "longitude": -82.394,
  "category": "music"
}
```

Coordinates are required for radius search. The scheduled ingestion endpoint
normalizes source events, assigns a geographic cell, and upserts them into the
Firestore `events` collection.

Sources can be registered without a deployment through `POST /api/sources`.
Send the source document as JSON with `Authorization: Bearer <INGEST_SECRET>`.
`GET /api/sources` returns the current registry and uses the same authorization.

Location-based candidate discovery and poster extraction are documented in
`docs/source-discovery.md`.

## Initial setup

1. Configure `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and
   `FIREBASE_PRIVATE_KEY` in Vercel.
2. Configure random, secret values for `INGEST_SECRET` and `CRON_SECRET`.
3. Deploy the Firestore rules and composite index in this repository.
4. Call `POST /api/ingest-sources` once with
   `Authorization: Bearer <INGEST_SECRET>`.
   The first run automatically seeds the current source registry.
5. Confirm that events and a successful `ingestionRuns` record exist.
6. Set `INDEXED_SEARCH_ENABLED=true` in Vercel and redeploy.

Until the final flag is enabled, search remains in `hybrid-live` mode. This
keeps the existing site functional while Firestore is being configured and
populated.

## Scheduling

Vercel calls `/api/ingest-sources` daily at 09:00 UTC. Vercel supplies
`CRON_SECRET` as a bearer token. The endpoint reads a deterministic bounded page
of the registry and persists its cursor only after event and health writes
succeed. The discovery workflow drains additional pages daily, while a partial
cycle resumes on its next run instead of dropping sources beyond a fixed limit.

Every source stores `nextIngestAt`. Changed sources are checked on a normal
cadence, unchanged conditional-feed responses avoid repeat downloads, empty
sources back off, and failures use bounded exponential retries. Individual
sources remain isolated, so one broken calendar does not stop the others.

## Adding coverage

Prefer official public calendars from cities, parks, breweries, bars,
festivals, tourism offices, and venues. Add a custom adapter only when a source
does not expose ICS, event RSS, or JSON-LD.

For a page that embeds its calendar, register the public page with
`parser: "calendar-page"`. The importer detects the calendar provider and feed
identifier, so the source does not need a provider-specific scraper or feed URL.

# Music Radar source registry

Music Radar indexes events before users search. Event sources live in the
Firestore `sources` collection, so adding a compatible calendar does not
require a code deployment.

## Supported source types

- `ical`: iCalendar/ICS feeds, including timezone-aware event dates.
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
`CRON_SECRET` as a bearer token. Individual sources are isolated, so one broken
calendar does not stop the others from being indexed.

## Adding coverage

Prefer official public calendars from cities, parks, breweries, bars,
festivals, tourism offices, and venues. Add a custom adapter only when a source
does not expose ICS, event RSS, or JSON-LD.

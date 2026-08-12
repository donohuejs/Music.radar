# Music Radar source discovery

Music Radar expands indexed local coverage asynchronously. Search remains fast:
the search endpoint returns existing indexed events, then queues new or stale
geographic coverage cells regardless of how many commercial events are already
stored for the area.

## Discovery flow

1. A searched radius is divided into overlapping discovery cells. New cells and
   cells not completed in the previous seven days are queued. The complete cell
   set is retained for supported search radii instead of dropping outer cells.
2. The protected discovery worker queries OpenStreetMap for nearby government
   organizations, breweries, bars, pubs, music and concert venues, cultural
   venues, parks, and other likely event hosts that publish an official
   `website` or `contact:website`. Before inspection, the scheduled GitHub
   workflow also queries the free Overture Places release for the queued cells,
   selecting music, performing-arts, cultural, gallery, community, auditorium,
   and event venues with websites. Results are deduplicated by website; no city
   or venue is embedded in the discovery rules.
3. Each website is inspected with strict page and response limits. Calendar and
   show-listing URLs are prioritized ahead of individual event URLs, and up to
   24 relevant pages are inspected per organization.
4. Recognized ICS, RSS, JSON-LD, linked JSON-LD event listings (including
   common `/event-details/` collection routes), and embedded Tockify calendars
   become source candidates. A linked listing is registered
   as one durable venue source and follows a bounded set of current detail pages
   during each ingestion run; individual event pages are not registered when a
   covering listing is available. Confidence increases with repeated sightings.
5. Before automatic registration, a high-confidence structured candidate is
   fetched through its real parser and must produce plausible upcoming events.
   It then enters probation rather than being immediately marked trusted.
   Automatically discovered mixed calendars do not force a music category;
   event-level evidence is classified during normalization.
6. Discovery jobs retain an organization cursor and process a small organization
   batch per serverless invocation. Expiring leases recover interrupted jobs,
   oldest work runs first within each priority, and consecutive failures are
   tracked separately from successful batches. The workflow drains bounded
   calls until no immediately eligible work remains.
7. Successful scheduled ingestion runs increase source confidence. Three
   successful runs can promote a source to trusted; three consecutive failures
   degrade it for review.
8. PDF or image schedules are retained with `status: needs-extraction` and an
   asset URL. The GitHub Actions worker runs Poppler or Tesseract only when the
   asset hash changes, then saves the extracted text on the candidate.

The system stores operational state in:

- `discoveryJobs`: deduplicated location coverage jobs.
- `sourceCandidates`: scored calendars, event pages, and poster assets.
- `sources`: approved or high-confidence automatically registered sources.

## GitHub Actions setup

Add one Actions repository secret named `MUSIC_RADAR_INGEST_SECRET`. Its value
must match the current `INGEST_SECRET` in Vercel. The scheduled workflow calls
the protected discovery API and processes poster candidates with open-source
tools on an Ubuntu runner.

The workflow may also be started manually from the repository Actions tab.
Optional latitude, longitude, radius, and force inputs queue a reusable
geographic refresh before the bounded worker calls begin; no city is embedded
in the workflow configuration. Operators may also register a verified URL with
an existing reusable parser, after which the workflow runs source ingestion.

## Safety and quality controls

- Discovery is independent of indexed event count, so cities with large
  commercial inventories still receive municipal and small-venue discovery.
- The Overture Places worker is a discovery seed only. A returned venue is not
  registered unless its official website exposes a reusable supported calendar
  and that parser returns plausible upcoming events.
- Discovery is bounded by radius, cell count, organization count, pages per organization,
  response size, and worker batch size.
- Localhost and private-address URLs are rejected.
- A failed organization does not stop the rest of a location job.
- Poster detection requires an actual PDF or image asset; an ordinary page named
  `shows`, `lineup`, or `schedule` is not sent to OCR.
- Unstructured or poster-only pages are not automatically added to live search.
- After OCR, poster candidates move to `poster-review`. Explicit full dates may
  produce structured draft suggestions, but missing times and time zones remain
  visible validation errors and no draft is publishable without operator review.
  The protected operations dashboard lets an operator correct the title, date,
  local time, IANA time zone, venue, and category before publishing a stable
  normalized event. Publication and dismissal are recorded in the audit log.
- Existing source documents are preserved and remain administratively
  disableable.

Poster text is intentionally stored before automatic event creation. A later
normalization stage will combine OCR coordinates, recurring-series metadata,
and date/weekday validation. This prevents a poor OCR result from publishing
incorrect events.

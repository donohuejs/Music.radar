# Music Radar repository instructions

## Product goal

Music Radar helps people find live music near home or while traveling. Coverage
must scale geographically; do not solve general discovery gaps by adding search
logic tied to one city. Prefer structured feeds, reusable parsers, asynchronous
source discovery, and cached metadata enrichment. Local source configuration is
acceptable as a verified fallback, but it must use a reusable source type.

## User experience principles

- Keep search fast by querying indexed events and doing discovery in background
  jobs.
- Default results to artist performances. Keep participatory events, trivia,
  theater, and comedy available through separate categories.
- Never invent genres. Use source metadata, deterministic inference, or a
  high-confidence cached artist match; otherwise show `Genre not listed`.
- Request browser location only after the user clicks the location button.
- Genre controls filter returned results and belong in the results area, not in
  the search form.
- Preserve accessible labels, keyboard-operable controls, responsive layouts,
  and reduced-motion behavior.

## Architecture boundaries

- `src/`: React/Vite interface and browser-only utilities.
- `api/`: Vercel serverless endpoints.
- `lib/server/`: collectors, normalization, discovery, enrichment, geospatial
  logic, and Firestore operations.
- `lib/server/venueSources.js`: shipped source records; avoid adding a custom
  parser when an ICS, RSS, JSON-LD, embedded-calendar, or series-schedule source
  can work.
- Firestore `events` is the indexed search source when
  `INDEXED_SEARCH_ENABLED=true`.
- Protected operational endpoints accept `INGEST_SECRET` or `CRON_SECRET`.
- Never expose Firebase Admin credentials or ingestion secrets to client code.

## Required validation

Run before handing off code changes:

```powershell
npm.cmd test
npm.cmd run build
git diff --check
```

If the environment prevents Vite/esbuild from resolving workspace dependencies,
report that limitation explicitly; do not claim the build passed. Add focused
Node tests for server logic and pure browser utilities.

## Git and deployment

- Preserve unrelated user changes and untracked `.firebaserc` unless the user
  explicitly asks to include it.
- Do not commit `.env` files, service-account JSON, API keys, or secret values.
- Production deploys from `main` to Vercel.
- Data-model or normalization changes often require a protected ingestion or
  enrichment run after deployment. Pure UI changes do not.
- GitHub Actions uses the repository secret `MUSIC_RADAR_INGEST_SECRET`, whose
  value must equal Vercel's `INGEST_SECRET`.

## Documentation

Update `README.md` when setup or operator commands change. Update
`docs/project-handoff.md` when architecture, production workflows, limitations,
or priorities materially change.

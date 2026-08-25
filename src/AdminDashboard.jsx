import { useEffect, useMemo, useState } from "react";
import { compressedImageDataUrl } from "./lib/imageUpload.js";

function formatTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Unknown";
}

function Status({ tone = "neutral", children }) {
  return <span className={`ops-status ops-status--${tone}`}>{children}</span>;
}

function MediaLeadIntake({ busyAction, runAction }) {
  const [file, setFile] = useState(null);
  const [intakeError, setIntakeError] = useState("");
  const [input, setInput] = useState({
    name: "", sourceUrl: "", capturedAt: new Date().toISOString().slice(0, 10),
    statedWeekday: "", latitude: "", longitude: "", timeZone: "",
    venueName: "", address: "", city: "", state: "", postalCode: "", transcription: "",
  });

  function update(field, value) {
    setInput((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!file) return;
    const form = event.currentTarget;
    setIntakeError("");
    try {
      const imageDataUrl = await compressedImageDataUrl(file);
      const succeeded = await runAction("media-lead.create", { ...input, imageDataUrl });
      if (succeeded) {
        setFile(null);
        setInput((current) => ({ ...current, name: "", sourceUrl: "", venueName: "", address: "", transcription: "" }));
        form.reset();
      }
    } catch (error) {
      setIntakeError(error.message);
    }
  }

  return <section className="ops-panel">
    <div className="ops-panel__heading"><div><p className="results__kicker">FIELD DISCOVERY</p><h2>Submit a poster</h2></div><span>Human-reviewed before publication</span></div>
    <form className="media-lead-form" onSubmit={submit}>
      <p className="media-lead-form__help">Upload a photographed flyer or social screenshot. Paste device OCR text when available for immediate drafts; otherwise the scheduled poster worker will extract it.</p>
      <div className="poster-draft__fields">
        <label>Poster image<input required type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
        <label>Series or venue name<input required value={input.name} onChange={(event) => update("name", event.target.value)} placeholder="Holland Park Live Music Series" /></label>
        <label>Source website<input type="url" value={input.sourceUrl} onChange={(event) => update("sourceUrl", event.target.value)} placeholder="https://venue.example" /></label>
        <label>Photo captured<input required type="date" value={input.capturedAt} onChange={(event) => update("capturedAt", event.target.value)} /></label>
        <label>Stated recurrence<select value={input.statedWeekday} onChange={(event) => update("statedWeekday", event.target.value)}><option value="">Not stated</option>{["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map((day) => <option value={day} key={day}>Every {day}</option>)}</select></label>
        <label>Time zone<input required value={input.timeZone} onChange={(event) => update("timeZone", event.target.value)} placeholder="America/New_York" /></label>
        <label>Latitude<input required type="number" step="any" value={input.latitude} onChange={(event) => update("latitude", event.target.value)} /></label>
        <label>Longitude<input required type="number" step="any" value={input.longitude} onChange={(event) => update("longitude", event.target.value)} /></label>
        <label>Venue name<input value={input.venueName} onChange={(event) => update("venueName", event.target.value)} /></label>
        <label>Street address<input value={input.address} onChange={(event) => update("address", event.target.value)} /></label>
        <label>City<input value={input.city} onChange={(event) => update("city", event.target.value)} /></label>
        <label>State/region<input value={input.state} onChange={(event) => update("state", event.target.value)} /></label>
        <label>Postal code<input value={input.postalCode} onChange={(event) => update("postalCode", event.target.value)} /></label>
      </div>
      <label className="media-lead-form__transcription">Poster text (optional)<textarea rows="8" value={input.transcription} onChange={(event) => update("transcription", event.target.value)} placeholder="Paste Live Text, Lens, or other OCR output here…" /></label>
      {intakeError ? <span className="field-message field-message--error" role="alert">{intakeError}</span> : null}
      <button className="button button--primary" disabled={Boolean(busyAction || !file)}>Create review lead</button>
    </form>
  </section>;
}

function GenreImpact({ impact, filter }) {
  const query = filter.trim().toLowerCase();
  const artists = (impact.recentArtists || []).filter((artist) =>
    !query || [artist.artistName, artist.outcome, ...(artist.genres || []), ...(artist.providers || [])]
      .some((value) => String(value || "").toLowerCase().includes(query)),
  );
  const providerLabel = (provider) => provider === "appleMusic"
    ? "Apple Music"
    : provider === "musicbrainz" ? "MusicBrainz" : "Discogs";

  return (
    <section className="ops-panel">
      <div className="ops-panel__heading">
        <div><p className="results__kicker">GENRE ENRICHMENT</p><h2>Provider impact</h2></div>
        <span>{impact.incrementalCoveragePercent}% Discogs incremental coverage</span>
      </div>
      <section className="ops-metrics ops-metrics--genre" aria-label="Genre provider summary">
        {[
          ["Checked artists", impact.checkedArtists],
          ["Published genres", impact.publishedArtists],
          ["Discogs matches", impact.discogsMatches],
          ["Discogs-only lift", impact.discogsOnly],
          ["Corroborated", impact.corroborated],
          ["Conflicts", impact.conflicts],
          ["Affected events", impact.affectedEvents],
          ["Provider errors", impact.providerErrors],
        ].map(([label, value]) => (
          <article className="ops-metric" key={label}><strong>{value}</strong><span>{label}</span></article>
        ))}
      </section>
      <div className="ops-table-wrap"><table><thead><tr><th>Provider</th><th>Matched</th><th>No genre/match</th><th>Unavailable</th><th>Errors</th></tr></thead>
        <tbody>{(impact.providers || []).map((provider) => <tr key={provider.provider}><td><strong>{providerLabel(provider.provider)}</strong></td><td>{provider.matched}</td><td>{provider.noMatch}</td><td>{provider.unavailable}</td><td>{provider.errors ? <Status tone="bad">{provider.errors}</Status> : 0}</td></tr>)}</tbody>
      </table></div>
      <div className="ops-panel__subheading"><strong>Recent artist outcomes</strong><span>{impact.staleDiscogs || 0} stale Discogs records excluded</span></div>
      <div className="ops-table-wrap"><table><thead><tr><th>Artist</th><th>Outcome</th><th>Published genres</th><th>Matching providers</th><th>Events</th><th>Checked</th></tr></thead>
        <tbody>{artists.slice(0, 100).map((artist) => <tr key={artist.id}><td>{artist.discogsUrl ? <a href={artist.discogsUrl} target="_blank" rel="noreferrer"><strong>{artist.artistName}</strong></a> : <strong>{artist.artistName}</strong>}</td><td><Status tone={["discogs-only", "corroborated"].includes(artist.outcome) ? "good" : artist.outcome === "conflict" ? "bad" : artist.outcome === "stale" ? "warn" : "neutral"}>{artist.outcome.replaceAll("-", " ")}</Status></td><td>{artist.genres.join(", ") || "Genre not listed"}</td><td>{artist.providers.map(providerLabel).join(", ") || "None"}</td><td>{artist.affectedEventCount}</td><td>{formatTime(artist.checkedAt)}</td></tr>)}</tbody>
      </table></div>
    </section>
  );
}

function PosterDraftReview({ candidate, busyAction, runAction }) {
  const [open, setOpen] = useState(false);
  const [edits, setEdits] = useState({});
  const drafts = candidate.posterDrafts || [];

  function values(draft) {
    return {
      name: draft.name || "",
      localDate: draft.localDate || "",
      localTime: draft.localTime || "",
      timeZone: candidate.timeZone || "",
      venueName: candidate.venueName || candidate.name || "",
      address: candidate.address || "",
      city: candidate.city || "",
      state: candidate.state || "",
      postalCode: candidate.postalCode || "",
      category: "music",
      ...(edits[draft.id] || {}),
    };
  }

  function update(draftId, field, value) {
    setEdits((current) => ({
      ...current,
      [draftId]: { ...(current[draftId] || {}), [field]: value },
    }));
  }

  return (
    <div className="poster-review">
      <button className="poster-review__toggle" type="button" onClick={() => setOpen((value) => !value)}>
        {open ? "Hide poster drafts" : `Review ${drafts.length} poster draft${drafts.length === 1 ? "" : "s"}`}
      </button>
      {open ? <div className="poster-review__drafts">{drafts.map((draft) => {
        const edit = values(draft);
        const complete = edit.name && edit.localDate && edit.localTime && edit.timeZone && edit.venueName;
        return <section className="poster-draft" key={draft.id}>
          <div className="poster-draft__heading"><strong>{draft.name || "Untitled draft"}</strong><Status tone={draft.status === "published" ? "good" : draft.status === "dismissed" ? "neutral" : "warn"}>{draft.status}</Status></div>
          <small>{draft.context}</small>
          {draft.status === "needs-review" ? <>
            <div className="poster-draft__fields">
              <label>Event name<input value={edit.name} onChange={(event) => update(draft.id, "name", event.target.value)} /></label>
              <label>Date<input type="date" value={edit.localDate} onChange={(event) => update(draft.id, "localDate", event.target.value)} /></label>
              <label>Local time<input type="time" value={edit.localTime} onChange={(event) => update(draft.id, "localTime", event.target.value)} /></label>
              <label>Time zone<input value={edit.timeZone} onChange={(event) => update(draft.id, "timeZone", event.target.value)} placeholder="America/Chicago" /></label>
              <label>Venue<input value={edit.venueName} onChange={(event) => update(draft.id, "venueName", event.target.value)} /></label>
              <label>Street address<input value={edit.address} onChange={(event) => update(draft.id, "address", event.target.value)} /></label>
              <label>City<input value={edit.city} onChange={(event) => update(draft.id, "city", event.target.value)} /></label>
              <label>State/region<input value={edit.state} onChange={(event) => update(draft.id, "state", event.target.value)} /></label>
              <label>Postal code<input value={edit.postalCode} onChange={(event) => update(draft.id, "postalCode", event.target.value)} /></label>
              <label>Category<select value={edit.category} onChange={(event) => update(draft.id, "category", event.target.value)}><option value="music">Live music</option><option value="theater">Theater</option><option value="comedy">Comedy</option><option value="participatory">Participatory</option><option value="trivia">Trivia</option><option value="community">Community</option></select></label>
            </div>
            <div className="ops-actions">
              <button disabled={Boolean(busyAction || !complete)} onClick={() => runAction("poster.publish", { candidateId: candidate.id, draftId: draft.id, ...edit }, `Publish ${edit.name || "this poster draft"} to Music Radar?`)}>Publish event</button>
              <button disabled={Boolean(busyAction)} onClick={() => runAction("poster.dismiss", { candidateId: candidate.id, draftId: draft.id, note: "Dismissed from poster review" }, `Dismiss ${draft.name || "this poster draft"}?`)}>Dismiss draft</button>
            </div>
          </> : draft.reviewedValues ? <small>Published as {draft.reviewedValues.name} at {formatTime(draft.reviewedValues.startTime)}</small> : null}
        </section>;
      })}</div> : null}
    </div>
  );
}

function SubmissionEvidence({ candidate, secret }) {
  const [open, setOpen] = useState(false);
  const [assetUrl, setAssetUrl] = useState(candidate.assetUrl || null);
  const [assetStatus, setAssetStatus] = useState("idle");

  useEffect(() => {
    if (!open || !candidate.evidenceDocumentId) {
      setAssetUrl(candidate.assetUrl || null);
      setAssetStatus("idle");
      return undefined;
    }
    let active = true;
    let objectUrl = null;
    setAssetStatus("loading");
    fetch(`/api/operations?mediaEvidenceId=${encodeURIComponent(candidate.evidenceDocumentId)}`, {
      headers: { Authorization: `Bearer ${secret.trim()}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Could not load poster evidence.");
        }
        objectUrl = URL.createObjectURL(await response.blob());
        if (active) {
          setAssetUrl(objectUrl);
          setAssetStatus("success");
        }
      })
      .catch((error) => {
        if (active) {
          setAssetUrl(null);
          setAssetStatus(error.message);
        }
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [candidate.assetUrl, candidate.evidenceDocumentId, open, secret]);

  if (
    !candidate.publicSubmission &&
    !candidate.mediaLead &&
    !candidate.assetUrl &&
    !candidate.evidenceDocumentId
  ) return null;
  return <div className="poster-review">
    <button className="poster-review__toggle" type="button" onClick={() => setOpen((value) => !value)}>
      {open ? "Hide submission evidence" : "View submission evidence"}
    </button>
    {open ? <div className="submission-evidence">
      {assetStatus === "loading" ? <small>Loading private poster evidence…</small> : null}
      {assetStatus !== "idle" && assetStatus !== "loading" && assetStatus !== "success" ? <small className="ops-error">{assetStatus}</small> : null}
      {assetUrl ? <a href={assetUrl} target="_blank" rel="noreferrer"><img className="poster-review__image" src={assetUrl} alt={`Submitted poster for ${candidate.name || "event review"}`} /></a> : null}
      {candidate.venueName ? <small><strong>Venue:</strong> {candidate.venueName}</small> : null}
      {candidate.discoveryLocation ? <small><strong>Location:</strong> {candidate.discoveryLocation}</small> : null}
      {candidate.eventDate ? <small><strong>Reported date:</strong> {candidate.eventDate}</small> : null}
      {candidate.notes ? <small><strong>Notes:</strong> {candidate.notes}</small> : null}
      {candidate.sourceUrl ? <small><a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Open submitted events page</a></small> : null}
    </div> : null}
  </div>;
}

function CandidateActions({ candidate, busyAction, runAction }) {
  const oneTimeEvent = candidate.sourceScope === "single-event" || candidate.reusableSource === false;
  const [reason, setReason] = useState(oneTimeEvent ? "one-time-event" : "not-reusable-source");
  const [suppressEvent, setSuppressEvent] = useState(oneTimeEvent);
  return <div className="ops-candidate-actions">
    <Status tone={candidate.status === "validated-candidate" ? "good" : "warn"}>{Math.round(Number(candidate.score || 0) * 100)}%</Status>
    {oneTimeEvent ? <small className="ops-error">One-time event page; cannot become a source</small> : null}
    <button disabled={Boolean(busyAction || candidate.duplicateSourceId || !candidate.parser || oneTimeEvent)} onClick={() => runAction("candidate.approve", { candidateId: candidate.id }, `Approve ${candidate.name || "this candidate"} as an ingestion source?`)}>Approve</button>
    <select aria-label={`Rejection reason for ${candidate.name || "candidate"}`} value={reason} onChange={(event) => setReason(event.target.value)}>
      <option value="not-reusable-source">Not a reusable source</option><option value="one-time-event">One-time event</option><option value="wrong-category">Wrong category</option><option value="duplicate">Duplicate</option><option value="irrelevant">Irrelevant</option><option value="other">Other</option>
    </select>
    <label><input type="checkbox" checked={suppressEvent} onChange={(event) => setSuppressEvent(event.target.checked)} /> Hide matching event URL</label>
    <button disabled={Boolean(busyAction)} onClick={() => runAction("candidate.reject", { candidateId: candidate.id, reason, suppressEvent, note: "Rejected from operations dashboard" }, `Reject ${candidate.name || "this candidate"}${suppressEvent ? " and hide events using this exact URL" : ""}?`)}>Reject</button>
  </div>;
}

export default function AdminDashboard() {
  const [secret, setSecret] = useState("");
  const [diagnostics, setDiagnostics] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");
  const [candidateStatus, setCandidateStatus] = useState("all");
  const [busyAction, setBusyAction] = useState("");
  const [suppressionUrl, setSuppressionUrl] = useState("");
  const [suppressionReason, setSuppressionReason] = useState("wrong-category");

  async function loadDiagnostics(event) {
    event?.preventDefault();
    if (!secret.trim()) return;
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch("/api/operations", {
        headers: { Authorization: `Bearer ${secret.trim()}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load diagnostics.");
      setDiagnostics(body);
      setStatus("success");
      const unavailable = Object.entries(body.collectionHealth || {})
        .filter(([, health]) => health?.ok === false)
        .map(([name]) => name);
      setMessage(
        unavailable.length
          ? `Dashboard loaded with unavailable data: ${unavailable.join(", ")}.`
          : "",
      );
    } catch (error) {
      setDiagnostics(null);
      setStatus("error");
      setMessage(error.message);
    }
  }

  async function runAction(action, payload, confirmation) {
    if (confirmation && !window.confirm(confirmation)) return;
    const actionKey = `${action}:${payload.candidateId || payload.sourceId || payload.suppressionId || payload.url}`;
    setBusyAction(actionKey);
    setMessage("");
    try {
      const response = await fetch("/api/operations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, ...payload }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Operation failed.");
      await loadDiagnostics();
      return true;
    } catch (error) {
      setMessage(error.message);
      setStatus("error");
      return false;
    } finally {
      setBusyAction("");
    }
  }

  const filteredSources = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return (diagnostics?.sources || []).filter((source) =>
      !query || [source.name, source.parser, source.url, source.lastError]
        .some((value) => String(value || "").toLowerCase().includes(query)),
    );
  }, [diagnostics, filter]);

  const filteredCandidates = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return (diagnostics?.candidates || []).filter((candidate) => {
      const matchesStatus = candidateStatus === "all" ||
        (candidate.status || candidate.lifecycle) === candidateStatus;
      const matchesQuery = !query || [candidate.name, candidate.venueName, candidate.url, candidate.parser, candidate.discoveryLocation, candidate.notes]
        .some((value) => String(value || "").toLowerCase().includes(query));
      return matchesStatus && matchesQuery;
    });
  }, [candidateStatus, diagnostics, filter]);

  return (
    <main className="ops-shell">
      <header className="ops-header">
        <div>
          <a href="/" className="ops-back">← Music Radar</a>
          <p className="results__kicker">OPERATIONS</p>
          <h1>Coverage dashboard</h1>
          <p>Review collection health and discovery gaps without exposing operational data publicly.</p>
        </div>
        <form className="ops-auth" onSubmit={loadDiagnostics}>
          <label>
            Ingestion secret
            <input
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="Enter secret"
            />
          </label>
          <button className="button button--primary" disabled={status === "loading"}>
            {status === "loading" ? "Loading…" : diagnostics ? "Refresh dashboard" : "Open dashboard"}
          </button>
          {message ? <span className="field-message field-message--error" role="alert">{message}</span> : null}
        </form>
      </header>

      {diagnostics ? (
        <div className="ops-content">
          <p className="ops-generated">Updated {formatTime(diagnostics.generatedAt)}</p>
          <div className="ops-filters">
            <label>Filter dashboard<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="City, source, parser, or error" /></label>
            <label>Candidate status<select value={candidateStatus} onChange={(event) => setCandidateStatus(event.target.value)}><option value="all">All review statuses</option><option value="validated-candidate">Validated candidates</option><option value="discovered">Discovered</option><option value="needs-extraction">Needs extraction</option><option value="poster-review">Poster review</option></select></label>
          </div>
          <section className="ops-metrics" aria-label="Operational summary">
            {[
              ["Enabled sources", diagnostics.summary.enabledSources],
              ["Degraded sources", diagnostics.summary.degradedSources],
              ["Stale sources", diagnostics.summary.staleSources],
              ["Sources due", diagnostics.summary.dueSources],
              ["Pending discovery", diagnostics.summary.pendingDiscovery],
              ["Review candidates", diagnostics.summary.reviewCandidates],
              ["Failed runs", diagnostics.summary.failedRuns],
              ["Coverage warnings", diagnostics.summary.blindSpotSearches],
            ].map(([label, value]) => (
              <article className="ops-metric" key={label}><strong>{value}</strong><span>{label}</span></article>
            ))}
          </section>

          <GenreImpact impact={diagnostics.genreImpact} filter={filter} />

          <MediaLeadIntake busyAction={busyAction} runAction={runAction} />

          <section className="ops-panel">
            <div className="ops-panel__heading"><div><p className="results__kicker">EVENT MODERATION</p><h2>Hidden events</h2></div><span>{(diagnostics.eventSuppressions || []).filter((item) => item.active !== false).length} active</span></div>
            <div className="ops-filters">
              <label>Event URL<input type="url" value={suppressionUrl} onChange={(event) => setSuppressionUrl(event.target.value)} placeholder="https://venue.example/event/..." /></label>
              <label>Reason<select value={suppressionReason} onChange={(event) => setSuppressionReason(event.target.value)}><option value="wrong-category">Wrong category</option><option value="one-time-event">One-time event</option><option value="duplicate">Duplicate</option><option value="irrelevant">Irrelevant</option><option value="other">Other</option></select></label>
              <button disabled={Boolean(busyAction || !suppressionUrl)} onClick={async () => { await runAction("event.suppress", { url: suppressionUrl, reason: suppressionReason, note: "Hidden from operations dashboard" }, "Hide every event matching this exact URL?"); setSuppressionUrl(""); }}>Hide event</button>
            </div>
            <div className="ops-list">{(diagnostics.eventSuppressions || []).filter((item) => item.active !== false).slice(0, 30).map((item) => <article key={item.id}><div><a href={item.url} target="_blank" rel="noreferrer"><strong>{item.url}</strong></a><small>{String(item.reason || "other").replaceAll("-", " ")} · {formatTime(item.updatedAt)}</small></div><button disabled={Boolean(busyAction)} onClick={() => runAction("event.unsuppress", { suppressionId: item.id }, "Allow this event URL again?")}>Allow again</button></article>)}</div>
          </section>

          <section className="ops-panel">
            <div className="ops-panel__heading"><div><p className="results__kicker">SEARCH COVERAGE</p><h2>Geographic blind spots</h2></div><span>{diagnostics.summary.trackedSearches} recent searches</span></div>
            <div className="ops-table-wrap"><table><thead><tr><th>Area</th><th>Searches</th><th>Warnings</th><th>Commercial only</th><th>No results</th><th>Weak cells</th><th>Contributors</th><th>Last searched</th></tr></thead>
              <tbody>{diagnostics.coverageAreas.filter((area) => !filter.trim() || area.displayName.toLowerCase().includes(filter.trim().toLowerCase())).map((area) => <tr key={area.displayName}><td><strong>{area.displayName}</strong></td><td>{area.searchCount}</td><td>{area.blindSpotSearches ? <Status tone="warn">{area.blindSpotSearches}</Status> : <Status tone="good">0</Status>}</td><td>{area.commercialOnlySearches}</td><td>{area.emptySearches}</td><td>{area.weakDiscoveryCellCount}</td><td>{area.sourceContributors.join(", ") || "None"}</td><td>{formatTime(area.lastSearchedAt)}</td></tr>)}</tbody>
            </table></div>
          </section>

          <section className="ops-panel">
            <div className="ops-panel__heading"><div><p className="results__kicker">RECENT SEARCHES</p><h2>Source contribution</h2></div><span>Coarse diagnostics only</span></div>
            <div className="ops-list">{diagnostics.searchCoverage.filter((search) => !filter.trim() || [search.displayName, search.category, ...(search.sourceContributors || [])].some((value) => String(value).toLowerCase().includes(filter.trim().toLowerCase()))).slice(0, 40).map((search) => <article key={search.id}><div><strong>{search.displayName}</strong><small>{search.category} · {search.radiusMiles} mi · {search.returnedCount} results · {formatTime(search.searchedAt)}</small><small>{(search.sourceContributors || []).join(", ") || "No contributing sources"}</small></div><Status tone={search.coverageState === "local-supported" && !search.blindSpot ? "good" : search.coverageState === "empty" ? "bad" : "warn"}>{String(search.coverageState || "unknown").replace("-", " ")}</Status></article>)}</div>
          </section>

          <section className="ops-panel">
            <div className="ops-panel__heading"><div><p className="results__kicker">SOURCES</p><h2>Ingestion health</h2></div><span>{diagnostics.sources.length} registered</span></div>
            <div className="ops-table-wrap"><table><thead><tr><th>Source</th><th>State</th><th>Last run</th><th>Events</th><th>Next run</th><th>Last error</th><th>Actions</th></tr></thead>
              <tbody>{filteredSources.map((source) => <tr key={source.id}><td><a href={source.url} target="_blank" rel="noreferrer"><strong>{source.name || source.id}</strong></a><small>{source.parser || "Unknown parser"}</small></td><td>{source.enabled === false ? <Status>Disabled</Status> : source.degraded ? <Status tone="bad">Degraded</Status> : source.stale ? <Status tone="warn">Stale</Status> : <Status tone="good">Healthy</Status>}</td><td>{formatTime(source.lastRunAt)}</td><td>{source.lastRunEventCount ?? "—"}</td><td>{formatTime(source.nextIngestAt)}</td><td className="ops-error">{source.lastError || "—"}</td><td><div className="ops-actions"><button disabled={busyAction} onClick={() => runAction("source.refresh", { sourceId: source.id })}>Refresh</button><button disabled={busyAction} onClick={() => runAction("source.set-enabled", { sourceId: source.id, enabled: source.enabled === false }, `${source.enabled === false ? "Enable" : "Disable"} ${source.name || source.id}?`)}>{source.enabled === false ? "Enable" : "Disable"}</button></div></td></tr>)}</tbody>
            </table></div>
          </section>

          <div className="ops-columns">
            <section className="ops-panel"><div className="ops-panel__heading"><div><p className="results__kicker">DISCOVERY</p><h2>Coverage cells</h2></div><span>{diagnostics.summary.discoveryCells} tracked</span></div>
              <div className="ops-list">{diagnostics.discoveryJobs.slice(0, 30).map((job) => <article key={job.id}><div><strong>{job.displayName || `${Number(job.latitude).toFixed(2)}, ${Number(job.longitude).toFixed(2)}`}</strong><small>{job.candidateCount || 0} candidates · {job.registeredSourceCount || 0} sources</small></div><Status tone={job.status === "failed" ? "bad" : job.status === "complete" ? "good" : "warn"}>{job.leaseExpired ? "lease expired" : job.status}</Status></article>)}</div>
            </section>
            <section className="ops-panel"><div className="ops-panel__heading"><div><p className="results__kicker">REVIEW QUEUE</p><h2>Source candidates</h2></div><span>{diagnostics.candidates.length} waiting</span></div>
              <div className="ops-list">{filteredCandidates.slice(0, 30).map((candidate) => <article key={candidate.id}><div>{candidate.url ? <a href={candidate.url} target="_blank" rel="noreferrer"><strong>{candidate.name || candidate.url}</strong></a> : <strong>{candidate.name || "Submitted event"}</strong>}<small>{candidate.discoveryLocation || "Unknown area"} · {candidate.parser || candidate.kind}</small>{candidate.publicSubmission ? <small>Community submission · received {candidate.submissionCount || 1} time{Number(candidate.submissionCount || 1) === 1 ? "" : "s"}</small> : null}<SubmissionEvidence candidate={candidate} secret={secret} />{candidate.status === "poster-review" ? <><small>{candidate.posterDraftCount || 0} structured drafts awaiting human validation</small><PosterDraftReview candidate={candidate} busyAction={busyAction} runAction={runAction} /></> : null}{candidate.duplicateSourceId ? <small className="ops-error">Duplicates {candidate.duplicateSourceId}</small> : null}</div><CandidateActions candidate={candidate} busyAction={busyAction} runAction={runAction} /></article>)}</div>
            </section>
          </div>

          <section className="ops-panel"><div className="ops-panel__heading"><div><p className="results__kicker">AUDIT LOG</p><h2>Recent operator actions</h2></div><span>{diagnostics.auditLog.length} recorded</span></div>
            <div className="ops-list">{diagnostics.auditLog.slice(0, 30).map((entry) => <article key={entry.id}><div><strong>{entry.action}</strong><small>{entry.targetType}: {entry.targetId} · {formatTime(entry.createdAt)}</small></div><Status tone={entry.outcome === "success" ? "good" : "bad"}>{entry.outcome}</Status></article>)}</div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

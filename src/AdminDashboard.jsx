import { useMemo, useState } from "react";

function formatTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Unknown";
}

function Status({ tone = "neutral", children }) {
  return <span className={`ops-status ops-status--${tone}`}>{children}</span>;
}

export default function AdminDashboard() {
  const [secret, setSecret] = useState("");
  const [diagnostics, setDiagnostics] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");
  const [candidateStatus, setCandidateStatus] = useState("all");
  const [busyAction, setBusyAction] = useState("");

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
    } catch (error) {
      setDiagnostics(null);
      setStatus("error");
      setMessage(error.message);
    }
  }

  async function runAction(action, payload, confirmation) {
    if (confirmation && !window.confirm(confirmation)) return;
    const actionKey = `${action}:${payload.candidateId || payload.sourceId}`;
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
    } catch (error) {
      setMessage(error.message);
      setStatus("error");
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
      const matchesQuery = !query || [candidate.name, candidate.url, candidate.parser, candidate.discoveryLocation]
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
            <label>Candidate status<select value={candidateStatus} onChange={(event) => setCandidateStatus(event.target.value)}><option value="all">All review statuses</option><option value="validated-candidate">Validated candidates</option><option value="discovered">Discovered</option><option value="needs-extraction">Needs extraction</option></select></label>
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
            ].map(([label, value]) => (
              <article className="ops-metric" key={label}><strong>{value}</strong><span>{label}</span></article>
            ))}
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
              <div className="ops-list">{filteredCandidates.slice(0, 30).map((candidate) => <article key={candidate.id}><div><a href={candidate.url} target="_blank" rel="noreferrer"><strong>{candidate.name || candidate.url}</strong></a><small>{candidate.discoveryLocation || "Unknown area"} · {candidate.parser || candidate.kind}</small>{candidate.duplicateSourceId ? <small className="ops-error">Duplicates {candidate.duplicateSourceId}</small> : null}</div><div className="ops-candidate-actions"><Status tone={candidate.status === "validated-candidate" ? "good" : "warn"}>{Math.round(Number(candidate.score || 0) * 100)}%</Status><button disabled={Boolean(busyAction || candidate.duplicateSourceId || !candidate.parser)} onClick={() => runAction("candidate.approve", { candidateId: candidate.id }, `Approve ${candidate.name || "this candidate"} as an ingestion source?`)}>Approve</button><button disabled={Boolean(busyAction)} onClick={() => runAction("candidate.reject", { candidateId: candidate.id, note: "Rejected from operations dashboard" }, `Reject ${candidate.name || "this candidate"}?`)}>Reject</button></div></article>)}</div>
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

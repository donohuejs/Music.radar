import { useState } from "react";

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
            <div className="ops-table-wrap"><table><thead><tr><th>Source</th><th>State</th><th>Last run</th><th>Events</th><th>Next run</th><th>Last error</th></tr></thead>
              <tbody>{diagnostics.sources.map((source) => <tr key={source.id}><td><strong>{source.name || source.id}</strong><small>{source.parser || "Unknown parser"}</small></td><td>{source.enabled === false ? <Status>Disabled</Status> : source.degraded ? <Status tone="bad">Degraded</Status> : source.stale ? <Status tone="warn">Stale</Status> : <Status tone="good">Healthy</Status>}</td><td>{formatTime(source.lastRunAt)}</td><td>{source.lastRunEventCount ?? "—"}</td><td>{formatTime(source.nextIngestAt)}</td><td className="ops-error">{source.lastError || "—"}</td></tr>)}</tbody>
            </table></div>
          </section>

          <div className="ops-columns">
            <section className="ops-panel"><div className="ops-panel__heading"><div><p className="results__kicker">DISCOVERY</p><h2>Coverage cells</h2></div><span>{diagnostics.summary.discoveryCells} tracked</span></div>
              <div className="ops-list">{diagnostics.discoveryJobs.slice(0, 30).map((job) => <article key={job.id}><div><strong>{job.displayName || `${Number(job.latitude).toFixed(2)}, ${Number(job.longitude).toFixed(2)}`}</strong><small>{job.candidateCount || 0} candidates · {job.registeredSourceCount || 0} sources</small></div><Status tone={job.status === "failed" ? "bad" : job.status === "complete" ? "good" : "warn"}>{job.leaseExpired ? "lease expired" : job.status}</Status></article>)}</div>
            </section>
            <section className="ops-panel"><div className="ops-panel__heading"><div><p className="results__kicker">REVIEW QUEUE</p><h2>Source candidates</h2></div><span>{diagnostics.candidates.length} waiting</span></div>
              <div className="ops-list">{diagnostics.candidates.slice(0, 30).map((candidate) => <article key={candidate.id}><div><a href={candidate.url} target="_blank" rel="noreferrer"><strong>{candidate.name || candidate.url}</strong></a><small>{candidate.discoveryLocation || "Unknown area"} · {candidate.parser || candidate.kind}</small></div><Status tone={candidate.status === "validated-candidate" ? "good" : "warn"}>{Math.round(Number(candidate.score || 0) * 100)}%</Status></article>)}</div>
            </section>
          </div>
        </div>
      ) : null}
    </main>
  );
}

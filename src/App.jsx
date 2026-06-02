import { useState, useRef } from "react";

const QUICK_LOCATIONS = [
  { label: "Greenville", value: "Greenville, SC" },
  { label: "Greer", value: "Greer, SC" },
  { label: "Spartanburg", value: "Spartanburg, SC" },
  { label: "Asheville", value: "Asheville, NC" },
  { label: "Charlotte", value: "Charlotte, NC" },
  { label: "Atlanta", value: "Atlanta, GA" },
];

const DATE_OPTIONS = [
  { label: "Tonight", value: "tonight" },
  { label: "This Weekend", value: "this weekend" },
  { label: "This Week", value: "this week" },
  { label: "Next Week", value: "next week" },
];

function Spinner() {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
      <p className="spinner-text">Scanning the scene...</p>
    </div>
  );
}

export default function App() {
  const [location, setLocation] = useState("Greenville, SC");
  const [customLocation, setCustomLocation] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [dateRange, setDateRange] = useState("tonight");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const resultsRef = useRef(null);

  const activeLocation = useCustom ? customLocation : location;

  async function fetchEvents() {
    if (!activeLocation.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: activeLocation, dateRange }),
      });

      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setResults(data);
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const totalEvents =
    results?.categories?.reduce((sum, c) => sum + c.events.length, 0) || 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #0a0a0f;
          color: #e8e8f0;
          font-family: 'DM Sans', sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        #root {
          min-height: 100vh;
          padding-bottom: 60px;
        }

        /* ── Header ── */
        .header {
          padding: 44px 24px 28px;
          text-align: center;
          position: relative;
        }
        .header::before {
          content: '';
          position: absolute;
          top: 0; left: 50%;
          transform: translateX(-50%);
          width: 600px; height: 320px;
          background: radial-gradient(ellipse at center top, rgba(139,92,246,0.18) 0%, transparent 70%);
          pointer-events: none;
        }
        .logo-eyebrow {
          font-family: 'Space Mono', monospace;
          font-size: 11px;
          letter-spacing: 5px;
          color: #7c3aed;
          text-transform: uppercase;
          margin-bottom: 10px;
        }
        h1 {
          font-family: 'Space Mono', monospace;
          font-size: clamp(28px, 7vw, 44px);
          font-weight: 700;
          color: #fff;
          line-height: 1.1;
          margin-bottom: 8px;
        }
        h1 span { color: #a78bfa; }
        .subtitle {
          color: #5a5a7a;
          font-size: 14px;
          font-weight: 300;
        }

        /* ── Cards ── */
        .card {
          background: #13131f;
          border: 1px solid #1e1e30;
          border-radius: 16px;
          padding: 20px;
          margin: 0 16px 14px;
        }
        .section-label {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          letter-spacing: 3px;
          color: #4a4a6a;
          text-transform: uppercase;
          margin-bottom: 12px;
        }

        /* ── Location chips ── */
        .quick-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 12px;
        }
        .chip {
          background: #1a1a2e;
          border: 1px solid #2a2a45;
          border-radius: 20px;
          padding: 7px 14px;
          font-size: 13px;
          color: #9090b8;
          cursor: pointer;
          transition: all 0.15s;
          font-family: 'DM Sans', sans-serif;
        }
        .chip:hover { border-color: #7c3aed; color: #c4b5fd; }
        .chip.active {
          background: #2d1b6e;
          border-color: #7c3aed;
          color: #c4b5fd;
        }
        .custom-input {
          width: 100%;
          background: #0f0f1a;
          border: 1px solid #2a2a45;
          border-radius: 10px;
          padding: 11px 14px;
          color: #e8e8f0;
          font-size: 14px;
          font-family: 'DM Sans', sans-serif;
          outline: none;
          transition: border-color 0.15s;
          margin-top: 4px;
        }
        .custom-input:focus { border-color: #7c3aed; }
        .custom-input::placeholder { color: #3a3a5a; }

        /* ── Date chips ── */
        .date-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .date-chip {
          background: #1a1a2e;
          border: 1px solid #2a2a45;
          border-radius: 10px;
          padding: 11px 12px;
          font-size: 13px;
          color: #9090b8;
          cursor: pointer;
          text-align: center;
          transition: all 0.15s;
          font-family: 'DM Sans', sans-serif;
        }
        .date-chip:hover { border-color: #7c3aed; color: #c4b5fd; }
        .date-chip.active {
          background: #2d1b6e;
          border-color: #7c3aed;
          color: #c4b5fd;
        }

        /* ── Search button ── */
        .search-btn {
          display: block;
          width: calc(100% - 32px);
          margin: 4px 16px 0;
          background: linear-gradient(135deg, #7c3aed, #5b21b6);
          border: none;
          border-radius: 14px;
          padding: 16px;
          color: #fff;
          font-size: 15px;
          font-weight: 700;
          font-family: 'Space Mono', monospace;
          letter-spacing: 2px;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s;
        }
        .search-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #8b4cf5, #6d28d9);
          transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(124,58,237,0.45);
        }
        .search-btn:active:not(:disabled) { transform: translateY(0); }
        .search-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

        /* ── Spinner ── */
        .spinner-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          padding: 52px 0;
        }
        .spinner {
          width: 38px; height: 38px;
          border: 3px solid #1e1e30;
          border-top-color: #7c3aed;
          border-radius: 50%;
          animation: spin 0.75s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner-text {
          font-family: 'Space Mono', monospace;
          font-size: 11px;
          letter-spacing: 3px;
          color: #a78bfa;
          text-transform: uppercase;
        }

        /* ── Results ── */
        .results-header {
          padding: 28px 16px 4px;
        }
        .results-meta {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          color: #4a4a6a;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .results-title {
          font-size: 22px;
          font-weight: 600;
          color: #e8e8f0;
        }
        .results-title span { color: #a78bfa; }

        .category-heading {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          letter-spacing: 3px;
          color: #7c3aed;
          text-transform: uppercase;
          margin: 22px 16px 10px;
        }

        .event-card {
          background: #13131f;
          border: 1px solid #1e1e30;
          border-radius: 14px;
          padding: 18px 18px 16px 22px;
          margin: 0 16px 10px;
          position: relative;
          overflow: hidden;
          transition: border-color 0.15s;
        }
        .event-card::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 3px;
          background: linear-gradient(180deg, #7c3aed, #4f46e5);
        }
        .event-card:hover { border-color: #2d2d50; }

        .event-artist {
          font-size: 16px;
          font-weight: 600;
          color: #fff;
          margin-bottom: 3px;
        }
        .event-venue {
          font-size: 13px;
          color: #6060a0;
          margin-bottom: 10px;
        }
        .event-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 8px;
        }
        .tag {
          border-radius: 6px;
          padding: 3px 9px;
          font-size: 11px;
          font-family: 'Space Mono', monospace;
        }
        .tag-time { background: #1e1535; border: 1px solid #3d2d6e; color: #a78bfa; }
        .tag-genre { background: #1a1a2e; border: 1px solid #2a2a45; color: #6060a0; }
        .tag-tickets { background: #0f2018; border: 1px solid #1a3d30; color: #6ee7b7; }

        .event-desc {
          font-size: 12px;
          color: #50507a;
          line-height: 1.55;
          font-style: italic;
        }

        /* ── Scout tip ── */
        .tip-card {
          background: #13131f;
          border: 1px solid #2d1b6e;
          border-radius: 14px;
          padding: 18px;
          margin: 20px 16px 0;
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }
        .tip-icon { font-size: 20px; flex-shrink: 0; margin-top: 2px; }
        .tip-label {
          font-family: 'Space Mono', monospace;
          font-size: 10px;
          letter-spacing: 2px;
          color: #c4b5fd;
          text-transform: uppercase;
          margin-bottom: 5px;
        }
        .tip-text { font-size: 13px; color: #9090b8; line-height: 1.6; }

        /* ── Error ── */
        .error-box {
          background: #1a1015;
          border: 1px solid #3d1a1a;
          border-radius: 14px;
          padding: 24px;
          margin: 20px 16px;
          text-align: center;
        }
        .error-icon { font-size: 28px; margin-bottom: 10px; }
        .error-msg { color: #f87171; font-size: 14px; }

        /* ── Reset ── */
        .divider { height: 1px; background: #1e1e30; margin: 28px 16px 0; }
        .clear-btn {
          display: block;
          margin: 16px auto 0;
          background: none;
          border: 1px solid #2a2a45;
          border-radius: 8px;
          padding: 9px 22px;
          color: #4a4a6a;
          font-size: 11px;
          cursor: pointer;
          font-family: 'Space Mono', monospace;
          letter-spacing: 2px;
          text-transform: uppercase;
          transition: all 0.15s;
        }
        .clear-btn:hover { color: #9090b8; border-color: #3a3a5a; }
      `}</style>

      {/* Header */}
      <div className="header">
        <div className="logo-eyebrow">🎵 Live Music Radar</div>
        <h1>Find the <span>Scene</span></h1>
        <p className="subtitle">AI-powered local music discovery</p>
      </div>

      {/* Location */}
      <div className="card">
        <div className="section-label">Location</div>
        <div className="quick-chips">
          {QUICK_LOCATIONS.map((loc) => (
            <button
              key={loc.value}
              className={`chip ${!useCustom && location === loc.value ? "active" : ""}`}
              onClick={() => { setLocation(loc.value); setUseCustom(false); }}
            >
              {loc.label}
            </button>
          ))}
          <button
            className={`chip ${useCustom ? "active" : ""}`}
            onClick={() => setUseCustom(true)}
          >
            ✈ Traveling...
          </button>
        </div>
        {useCustom && (
          <input
            className="custom-input"
            type="text"
            placeholder="Any city — e.g. New Orleans, LA or London, UK"
            value={customLocation}
            onChange={(e) => setCustomLocation(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchEvents()}
            autoFocus
          />
        )}
      </div>

      {/* Date */}
      <div className="card">
        <div className="section-label">When</div>
        <div className="date-grid">
          {DATE_OPTIONS.map((d) => (
            <button
              key={d.value}
              className={`date-chip ${dateRange === d.value ? "active" : ""}`}
              onClick={() => setDateRange(d.value)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <button
        className="search-btn"
        onClick={fetchEvents}
        disabled={loading || !activeLocation.trim()}
      >
        {loading ? "Searching..." : "Find Shows"}
      </button>

      {/* Loading */}
      {loading && <Spinner />}

      {/* Error */}
      {error && !loading && (
        <div className="error-box">
          <div className="error-icon">🎸</div>
          <div className="error-msg">{error}</div>
        </div>
      )}

      {/* Results */}
      {results && !loading && (
        <div ref={resultsRef}>
          <div className="results-header">
            <div className="results-meta">{results.dateRange} · {results.location}</div>
            <div className="results-title">
              <span>{totalEvents}</span> {totalEvents === 1 ? "show" : "shows"} found
            </div>
          </div>

          {results.categories?.map((cat) => (
            <div key={cat.name}>
              <div className="category-heading">{cat.name}</div>
              {cat.events.map((ev, i) => (
                <div className="event-card" key={i}>
                  <div className="event-artist">{ev.artist}</div>
                  <div className="event-venue">📍 {ev.venue}</div>
                  <div className="event-tags">
                    {ev.time && ev.time !== "TBD" && ev.time !== "unknown" && (
                      <span className="tag tag-time">🕐 {ev.time}</span>
                    )}
                    {ev.genre && ev.genre !== "unknown" && (
                      <span className="tag tag-genre">{ev.genre}</span>
                    )}
                    {ev.tickets && ev.tickets !== "unknown" && ev.tickets !== "TBD" && (
                      <span className="tag tag-tickets">🎟 {ev.tickets}</span>
                    )}
                  </div>
                  {ev.description && ev.description !== "unknown" && (
                    <div className="event-desc">{ev.description}</div>
                  )}
                </div>
              ))}
            </div>
          ))}

          {results.tip && (
            <div className="tip-card">
              <div className="tip-icon">💡</div>
              <div>
                <div className="tip-label">Scout's Tip</div>
                <div className="tip-text">{results.tip}</div>
              </div>
            </div>
          )}

          <div className="divider" />
          <button className="clear-btn" onClick={() => setResults(null)}>
            New Search
          </button>
        </div>
      )}
    </>
  );
}

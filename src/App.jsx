import { useMemo, useState } from "react";
import { getDateRange } from "./lib/dateRange.js";

const RADIUS_OPTIONS = [5, 10, 25, 50, 100];
const DATE_OPTIONS = [
  { label: "Tonight", value: "tonight" },
  { label: "Tomorrow", value: "tomorrow" },
  { label: "This weekend", value: "weekend" },
  { label: "Next 7 days", value: "week" },
];
const CATEGORY_OPTIONS = [
  { label: "Live music", value: "music" },
  { label: "Open mic, jams & karaoke", value: "participatory" },
  { label: "Theater", value: "theater" },
  { label: "Comedy", value: "comedy" },
  { label: "All events", value: "all" },
];

function formatDate(value) {
  if (!value) return "Time TBD";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time TBD";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function EventCard({ event }) {
  return (
    <article className="event-card">
      <div className="event-card__image-wrap">
        {event.imageUrl ? (
          <img className="event-card__image" src={event.imageUrl} alt="" />
        ) : (
          <div className="event-card__placeholder" aria-hidden="true">♫</div>
        )}
      </div>

      <div className="event-card__body">
        <div className="event-card__eyebrow">
          {formatDate(event.startTime)}
          {Number.isFinite(event.distanceMiles)
            ? ` · ${event.distanceMiles.toFixed(1)} mi`
            : ""}
        </div>
        <h2>{event.name}</h2>
        <p className="event-card__venue">
          {event.venueName || "Venue TBD"}
          {event.city ? ` · ${event.city}${event.state ? `, ${event.state}` : ""}` : ""}
        </p>

        <div className="event-card__meta">
          <span>{event.sourceName || "Event source"}</span>
          {event.category ? <span>{event.category.replace("_", " ")}</span> : null}
          {event.confidence ? <span>{Math.round(event.confidence * 100)}% confidence</span> : null}
        </div>

        {event.ticketUrl ? (
          <a className="button button--small" href={event.ticketUrl} target="_blank" rel="noreferrer">
            Event details
          </a>
        ) : null}
      </div>
    </article>
  );
}

export default function App() {
  const [locationText, setLocationText] = useState("");
  const [coordinates, setCoordinates] = useState(null);
  const [radius, setRadius] = useState(25);
  const [dateOption, setDateOption] = useState("weekend");
  const [category, setCategory] = useState("music");
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const resultSummary = useMemo(() => {
    if (status === "loading") return "Scanning nearby sources…";
    if (status === "error") return message;
    if (status === "success") {
      return `${events.length} event${events.length === 1 ? "" : "s"} found`;
    }
    return "Search nationwide listings, enhanced by local venue coverage where available.";
  }, [events.length, message, status]);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage("This browser does not support location access.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCoordinates({ latitude: coords.latitude, longitude: coords.longitude });
        setLocationText("Current location");
        setMessage("");
        setStatus("idle");
      },
      () => {
        setMessage("Location access was denied. You can still type a city.");
        setStatus("error");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function runSearch(event) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    const dates = getDateRange(dateOption);
    const params = new URLSearchParams({
      radius: String(radius),
      startDate: dates.startDate,
      endDate: dates.endDate,
      category,
    });

    if (coordinates) {
      params.set("lat", String(coordinates.latitude));
      params.set("lng", String(coordinates.longitude));
    } else {
      params.set("location", locationText.trim());
    }

    try {
      const response = await fetch(`/api/search?${params.toString()}`);
      const text = await response.text();
      let body;

      try {
        body = JSON.parse(text);
      } catch {
        throw new Error(
          response.ok
            ? "Search returned an invalid response."
            : `Search failed with HTTP ${response.status}.`,
        );
      }

      if (!response.ok) {
        throw new Error(body.error || "Search failed.");
      }

      setEvents(Array.isArray(body.events) ? body.events : []);
      setStatus("success");
    } catch (error) {
      setMessage(error.message || "Search failed.");
      setStatus("error");
    }
  }

  return (
    <main>
      <section className="hero">
        <div className="hero__content">
          <div className="brand">
            <span className="brand__radar" aria-hidden="true">◉</span>
            MUSIC RADAR
          </div>
          <h1>Find the show<br />you didn’t know about.</h1>
          <p>
            Live music nearby—from neighborhood bars and breweries to national touring acts.
          </p>

          <form className="search-panel" onSubmit={runSearch}>
            <label>
              Location
              <div className="location-row">
                <input
                  value={locationText}
                  onChange={(event) => {
                    setLocationText(event.target.value);
                    setCoordinates(null);
                  }}
                  placeholder="Enter a city, state, or ZIP"
                  required={!coordinates}
                />
                <button className="button button--secondary" type="button" onClick={useCurrentLocation}>
                  Use current location
                </button>
              </div>
            </label>

            <div className="control-grid">
              <label>
                When
                <select value={dateOption} onChange={(event) => setDateOption(event.target.value)}>
                  {DATE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label>
                Distance
                <select value={radius} onChange={(event) => setRadius(Number(event.target.value))}>
                  {RADIUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>Within {option} miles</option>
                  ))}
                </select>
              </label>

              <label>
                Category
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <button className="button button--primary" type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Scanning…" : "Scan for live music"}
            </button>
          </form>
        </div>
      </section>

      <section className="results">
        <div className="results__header">
          <div>
            <p className="results__kicker">RADAR RESULTS</p>
            <h2>{resultSummary}</h2>
          </div>
          <p className="coverage-note">Sources are shown on every listing so gaps stay visible.</p>
        </div>

        {status === "success" && events.length === 0 ? (
          <div className="empty-state">
            <h2>No events found yet.</h2>
            <p>Try a larger radius or broader date range. This result may also indicate a coverage gap.</p>
          </div>
        ) : null}

        <div className="event-grid">
          {events.map((event) => <EventCard key={event.id} event={event} />)}
        </div>
      </section>
    </main>
  );
}

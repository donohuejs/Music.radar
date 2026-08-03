import { useMemo, useState } from "react";
import { getDateRange } from "./lib/dateRange.js";

const RADIUS_OPTIONS = [5, 10, 25, 50, 100];
const DATE_OPTIONS = [
  { label: "Tonight", value: "tonight" },
  { label: "Tomorrow", value: "tomorrow" },
  { label: "This weekend", value: "weekend" },
  { label: "Next 7 days", value: "week" },
  { label: "Choose a date", value: "date" },
  { label: "Custom dates", value: "custom" },
];
const CATEGORY_OPTIONS = [
  { label: "Live music", value: "music" },
  { label: "Open mic, jams & karaoke", value: "participatory" },
  { label: "Trivia", value: "trivia" },
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

function localDateInput(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
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
          {(event.genres || []).map((genre) => (
            <span className="genre-tag" key={genre}>{genre}</span>
          ))}
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
  const [dateOption, setDateOption] = useState("week");
  const [selectedDate, setSelectedDate] = useState(localDateInput());
  const [customStart, setCustomStart] = useState(localDateInput());
  const [customEnd, setCustomEnd] = useState(
    localDateInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
  );
  const [category, setCategory] = useState("music");
  const [genre, setGenre] = useState("all");
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [locationStatus, setLocationStatus] = useState("idle");
  const [locationMessage, setLocationMessage] = useState("");

  const genreOptions = useMemo(() => {
    const counts = new Map();
    events.forEach((event) => {
      (event.genres || []).forEach((eventGenre) => {
        counts.set(eventGenre, (counts.get(eventGenre) || 0) + 1);
      });
    });
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [events]);
  const visibleEvents = useMemo(
    () => genre === "all"
      ? events
      : events.filter((event) => (event.genres || []).includes(genre)),
    [events, genre],
  );

  const resultSummary = useMemo(() => {
    if (status === "loading") return "Scanning nearby sources…";
    if (status === "error") return message;
    if (status === "success") {
      const filtered = visibleEvents.length !== events.length;
      return `${visibleEvents.length} event${visibleEvents.length === 1 ? "" : "s"} found${filtered ? ` (${events.length} before genre filter)` : ""}`;
    }
    return "Search nationwide listings, enhanced by local venue coverage where available.";
  }, [events.length, message, status, visibleEvents.length]);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationMessage("This browser does not support location access.");
      setLocationStatus("error");
      return;
    }

    setLocationStatus("loading");
    setLocationMessage("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCoordinates({ latitude: coords.latitude, longitude: coords.longitude });
        setLocationText("Current location");
        setLocationMessage("Location ready. Press Scan to search nearby.");
        setLocationStatus("success");
      },
      () => {
        setLocationMessage("Location access was denied. You can still type a city.");
        setLocationStatus("error");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function runSearch(event) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    setGenre("all");

    let dates;
    try {
      dates = getDateRange(dateOption, customStart, customEnd, selectedDate);
    } catch (error) {
      setMessage(error.message);
      setStatus("error");
      return;
    }
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
                    setLocationMessage("");
                    setLocationStatus("idle");
                  }}
                  placeholder="Enter a city, state, or ZIP"
                  required={!coordinates}
                />
                <button className="button button--secondary" type="button" onClick={useCurrentLocation} disabled={locationStatus === "loading"}>
                  {locationStatus === "loading" ? "Locating…" : "Use current location"}
                </button>
              </div>
              {locationMessage ? <span className={`field-message field-message--${locationStatus}`}>{locationMessage}</span> : null}
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

              <label>
                Genre
                <select value={genre} onChange={(event) => setGenre(event.target.value)} disabled={!genreOptions.length}>
                  <option value="all">All genres</option>
                  {genreOptions.map((option) => (
                    <option key={option.name} value={option.name}>{option.name} ({option.count})</option>
                  ))}
                </select>
              </label>
            </div>

            {dateOption === "date" ? (
              <div className="single-date-picker">
                <label>
                  Select a date
                  <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} required />
                </label>
              </div>
            ) : null}

            {dateOption === "custom" ? (
              <div className="custom-date-grid">
                <label>
                  Start date
                  <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} required />
                </label>
                <label>
                  End date
                  <input type="date" min={customStart} value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} required />
                </label>
              </div>
            ) : null}

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

        {status === "success" && visibleEvents.length === 0 ? (
          <div className="empty-state">
            <h2>{events.length ? "No events match that genre." : "No events found yet."}</h2>
            <p>{events.length ? "Try another genre or choose All genres." : "Try a larger radius or broader date range. This result may also indicate a coverage gap."}</p>
          </div>
        ) : null}

        <div className="event-grid">
          {visibleEvents.map((event) => <EventCard key={event.id} event={event} />)}
        </div>
      </section>
    </main>
  );
}

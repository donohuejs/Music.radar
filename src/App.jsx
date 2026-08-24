import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getDateRange } from "./lib/dateRange.js";
import {
  addDaysToDateValue,
  calendarDays,
  dateValueInTimeZone,
  parseLocalDate,
  toLocalDateValue,
} from "./lib/calendar.js";
import {
  confidenceExplanation,
  filterAndSortEvents,
  filterUpcomingEvents,
  groupTheaterRuns,
  scanButtonLabel,
} from "./lib/eventDisplay.js";
import { buildProximityModel, PROXIMITY_PRESETS } from "./lib/proximityFilters.js";
import { formatEventDate, formatTheaterRun } from "./lib/eventDate.js";
import { buildSearchContext } from "./lib/searchContext.js";
import { countActiveRefinements } from "./lib/resultRefinements.js";
import LocationAutocomplete from "./LocationAutocomplete.jsx";
import ResultFilters from "./ResultFilters.jsx";

const RADIUS_OPTIONS = [5, 10, 25, 50, 100];
const PROXIMITY_STORAGE_KEY = "music-radar-proximity";
const DATE_OPTIONS = [
  { label: "Tonight", value: "tonight" },
  { label: "Tomorrow", value: "tomorrow" },
  { label: "This weekend", value: "weekend" },
  { label: "Next 7 days", value: "week" },
  { label: "Next 14 days", value: "fortnight" },
  { label: "Next 30 days", value: "month" },
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
const RESULTS_PAGE_SIZE = 24;

function loadProximityPreference() {
  const fallback = { mode: "all", customMiles: "3" };
  if (typeof window === "undefined") return fallback;
  try {
    const stored = JSON.parse(window.localStorage.getItem(PROXIMITY_STORAGE_KEY));
    const validModes = ["all", "custom", ...PROXIMITY_PRESETS.map((option) => option.value)];
    const customMiles = Number(stored?.customMiles);
    return {
      mode: validModes.includes(stored?.mode) ? stored.mode : fallback.mode,
      customMiles: Number.isFinite(customMiles) && customMiles > 0
        ? String(customMiles)
        : fallback.customMiles,
    };
  } catch {
    return fallback;
  }
}

function displayDate(value) {
  const date = parseLocalDate(value);
  return date
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date)
    : "Choose a date";
}

function RadarLogo() {
  const notes = [
    { x: 14, y: 18, delay: "0s" },
    { x: 31, y: 14, delay: ".7s" },
    { x: 34, y: 32, delay: "1.4s" },
  ];

  return (
    <svg className="brand__radar" viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="radar-sweep" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b1ff47" stopOpacity=".55" />
          <stop offset="1" stopColor="#b1ff47" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle className="radar-face" cx="24" cy="24" r="21" />
      <circle className="radar-ring" cx="24" cy="24" r="14" />
      <circle className="radar-ring" cx="24" cy="24" r="7" />
      <path className="radar-axis" d="M3 24h42M24 3v42" />
      <g className="radar-sweep">
        <path d="M24 24V3a21 21 0 0 1 17.8 9.9Z" fill="url(#radar-sweep)" />
        <path d="M24 24V3" />
      </g>
      {notes.map(({ x, y, delay }) => (
        <g className="radar-note" key={`${x}-${y}`} style={{ animationDelay: delay }}>
          <circle cx={x} cy={y} r="2.1" />
          <path d={`M${x + 2} ${y}v-7l5-1.2v2.3l-5 1.2`} />
        </g>
      ))}
      <circle className="radar-center" cx="24" cy="24" r="1.7" />
    </svg>
  );
}

function CalendarPicker({ mode, start, end, onStartChange, onEndChange, timeZone }) {
  const initialDate = parseLocalDate(start) || new Date();
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), 1),
  );
  const [selectingEnd, setSelectingEnd] = useState(false);
  const days = calendarDays(visibleMonth);
  const today = dateValueInTimeZone(new Date(), timeZone);

  function chooseDay(date) {
    const value = toLocalDateValue(date);
    if (mode === "single") {
      onStartChange(value);
      return;
    }
    if (!selectingEnd || !start) {
      onStartChange(value);
      // A single click is already a valid one-day range. A second click can
      // expand it without requiring a separate single-date mode.
      onEndChange(value);
      setSelectingEnd(true);
      return;
    }
    if (value < start) {
      onStartChange(value);
      onEndChange(value);
      setSelectingEnd(true);
      return;
    }
    onEndChange(value);
    setSelectingEnd(false);
  }

  function moveMonth(amount) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  }

  function selectToday() {
    const todayDate = parseLocalDate(today);
    setVisibleMonth(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
    chooseDay(todayDate);
  }

  function clear() {
    onStartChange("");
    if (onEndChange) onEndChange("");
    setSelectingEnd(false);
  }

  return (
    <div className="calendar-picker">
      <div className="calendar-fields">
        <div><span>{mode === "range" ? "Start date" : "Selected date"}</span><strong>{displayDate(start)}</strong></div>
        {mode === "range" ? <div><span>End date</span><strong>{displayDate(end)}</strong></div> : null}
      </div>
      <div className="calendar-header">
        <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month">‹</button>
        <strong>{new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(visibleMonth)}</strong>
        <button type="button" onClick={() => moveMonth(1)} aria-label="Next month">›</button>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="calendar-days">
        {days.map((date) => {
          const value = toLocalDateValue(date);
          const outside = date.getMonth() !== visibleMonth.getMonth();
          const selected = value === start || value === end;
          const inRange = mode === "range" && start && end && value > start && value < end;
          return (
            <button
              className={[outside && "is-outside", selected && "is-selected", inRange && "is-in-range", value === today && "is-today"].filter(Boolean).join(" ")}
              key={value}
              type="button"
              onClick={() => chooseDay(date)}
              aria-pressed={Boolean(selected)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
      <div className="calendar-actions">
        <button type="button" onClick={selectToday}>Today</button>
        <button type="button" onClick={clear}>Clear</button>
        {mode === "range" ? <span>{selectingEnd ? "One day selected; choose another to expand" : start && end ? "Range selected" : "Choose a start date"}</span> : null}
      </div>
    </div>
  );
}

function EventCard({ event, timeZone }) {
  const confidenceId = useId();

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
          {event.runEndTime
            ? formatTheaterRun(event.startTime, event.runEndTime, timeZone)
            : formatEventDate(event.startTime, timeZone)}
          {event.performanceCount ? ` · ${event.performanceCount} performances` : ""}
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
          {event.confidence ? (
            <span className="confidence">
              <button type="button" aria-describedby={confidenceId}>
                {Math.round(event.confidence * 100)}% confidence
              </button>
              <span className="confidence__tooltip" id={confidenceId} role="tooltip">
                {confidenceExplanation(event)}
              </span>
            </span>
          ) : null}
          {(event.genres || []).map((genre) => (
            <span className="genre-tag" key={genre}>{genre}</span>
          ))}
          {event.genreAttribution?.provider === "discogs" ? (
            <a
              className="discogs-attribution"
              href={event.genreAttribution.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {event.genreAttribution.label}
            </a>
          ) : null}
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
  const initialCustomStart = dateValueInTimeZone();
  const [customStart, setCustomStart] = useState(initialCustomStart);
  const [customEnd, setCustomEnd] = useState(addDaysToDateValue(initialCustomStart, 7));
  const [customDatesTouched, setCustomDatesTouched] = useState(false);
  const [category, setCategory] = useState("music");
  const [genre, setGenre] = useState("all");
  const [resultQuery, setResultQuery] = useState("");
  const [resultSort, setResultSort] = useState("date");
  const [proximity, setProximity] = useState(loadProximityPreference);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [visibleCount, setVisibleCount] = useState(RESULTS_PAGE_SIZE);
  const [events, setEvents] = useState([]);
  const [searchMeta, setSearchMeta] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [locationStatus, setLocationStatus] = useState("idle");
  const [locationMessage, setLocationMessage] = useState("");
  const [planningTimeZone, setPlanningTimeZone] = useState(null);
  const [planningTimeZoneStatus, setPlanningTimeZoneStatus] = useState("idle");
  const locationRequestId = useRef(0);

  const resultRadius = Number(searchMeta?.radiusMiles) || radius;
  const resultsUseCurrentLocation = searchMeta?.resolvedLocation?.source === "browser";
  const searchContext = useMemo(() => buildSearchContext(searchMeta), [searchMeta]);
  const activeRefinementCount = useMemo(() => countActiveRefinements({
    genre,
    proximityMode: proximity.mode,
    query: resultQuery,
    sort: resultSort,
  }), [genre, proximity.mode, resultQuery, resultSort]);
  const {
    availablePresets: availableProximityPresets,
    customDistance,
    maxDistance,
    summary: proximitySummary,
  } = useMemo(
    () => buildProximityModel(proximity, resultRadius),
    [proximity, resultRadius],
  );

  const upcomingEvents = useMemo(
    () => filterUpcomingEvents(events, currentTime),
    [currentTime, events],
  );
  const displayedEvents = useMemo(() => groupTheaterRuns(upcomingEvents), [upcomingEvents]);

  const genreOptions = useMemo(() => {
    const counts = new Map();
    displayedEvents.forEach((event) => {
      (event.genres || []).forEach((eventGenre) => {
        counts.set(eventGenre, (counts.get(eventGenre) || 0) + 1);
      });
    });
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [displayedEvents]);
  const matchingEvents = useMemo(
    () => filterAndSortEvents(displayedEvents, { genre, query: resultQuery }),
    [displayedEvents, genre, resultQuery],
  );
  const filteredEvents = useMemo(
    () => filterAndSortEvents(displayedEvents, {
      genre,
      query: resultQuery,
      sort: resultSort,
      maxDistance,
    }),
    [displayedEvents, genre, maxDistance, resultQuery, resultSort],
  );
  const visibleEvents = filteredEvents.slice(0, visibleCount);

  useEffect(() => setVisibleCount(RESULTS_PAGE_SIZE), [genre, proximity, resultQuery, resultSort, events]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PROXIMITY_STORAGE_KEY, JSON.stringify(proximity));
    } catch {
      // Search still works when storage is unavailable or disabled.
    }
  }, [proximity]);

  useEffect(() => {
    if (!planningTimeZone || customDatesTouched) return;
    const start = dateValueInTimeZone(new Date(), planningTimeZone);
    setCustomStart(start);
    setCustomEnd(addDaysToDateValue(start, 7));
  }, [customDatesTouched, planningTimeZone]);

  useEffect(() => {
    if (status !== "success") return undefined;
    const refreshCurrentTime = () => setCurrentTime(Date.now());
    refreshCurrentTime();
    const intervalId = window.setInterval(refreshCurrentTime, 60_000);
    return () => window.clearInterval(intervalId);
  }, [status]);

  useEffect(() => {
    if (status !== "success" || !searchMeta) return;
    setProximity((current) => {
      const preset = PROXIMITY_PRESETS.find((option) => option.value === current.mode);
      const nextMode = preset && preset.miles >= resultRadius ? "all" : current.mode;
      const nextCustomMiles = Math.min(Number(current.customMiles) || 3, resultRadius);
      if (nextMode === current.mode && String(nextCustomMiles) === current.customMiles) return current;
      return { mode: nextMode, customMiles: String(nextCustomMiles) };
    });
  }, [resultRadius, searchMeta, status]);

  const resultSummary = useMemo(() => {
    if (status === "loading") return "Scanning nearby sources…";
    if (status === "error") return message;
    if (status === "success") {
      const filtered = filteredEvents.length !== displayedEvents.length;
      return `${filteredEvents.length} event${filteredEvents.length === 1 ? "" : "s"} found${filtered ? ` (${displayedEvents.length} total)` : ""}`;
    }
    return "Search nationwide listings, enhanced by local venue coverage where available.";
  }, [displayedEvents.length, filteredEvents.length, message, status]);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationMessage("This browser does not support location access.");
      setLocationStatus("error");
      return;
    }

    const requestId = ++locationRequestId.current;
    setPlanningTimeZone(null);
    setPlanningTimeZoneStatus("loading");
    setLocationStatus("loading");
    setLocationMessage("");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        if (requestId !== locationRequestId.current) return;
        const current = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          source: "browser",
        };
        setCoordinates(current);
        setLocationMessage("Coordinates found. Identifying your city…");
        try {
          const params = new URLSearchParams({
            lat: String(current.latitude),
            lng: String(current.longitude),
          });
          const response = await fetch(`/api/reverse-geocode?${params.toString()}`);
          const body = await response.json();
          if (!response.ok || !body.displayName) throw new Error("Location name unavailable");
          if (requestId !== locationRequestId.current) return;
          setLocationText(body.displayName);
          setPlanningTimeZone(body.timeZone || null);
          setPlanningTimeZoneStatus(body.timeZone ? "success" : "idle");
          setLocationMessage(`✓ Location found: ${body.displayName}.`);
        } catch {
          if (requestId !== locationRequestId.current) return;
          setLocationText("");
          setPlanningTimeZone(null);
          setPlanningTimeZoneStatus("idle");
          setLocationMessage("✓ Location coordinates found. Press Scan to search nearby.");
        }
        setLocationStatus("success");
      },
      () => {
        if (requestId !== locationRequestId.current) return;
        setPlanningTimeZoneStatus("idle");
        setLocationMessage("Location access was denied. You can still type a city.");
        setLocationStatus("error");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function resolvePlanningTimeZone(value) {
    const location = String(value || "").trim();
    if (!location) return;
    const requestId = ++locationRequestId.current;
    setPlanningTimeZoneStatus("loading");
    try {
      const params = new URLSearchParams({ location });
      const response = await fetch(`/api/geocode?${params.toString()}`);
      const body = await response.json();
      if (!response.ok || !body.timeZone) throw new Error("Time zone unavailable");
      if (requestId !== locationRequestId.current) return;
      setPlanningTimeZone(body.timeZone);
      setPlanningTimeZoneStatus("success");
      if (Number.isFinite(body.latitude) && Number.isFinite(body.longitude)) {
        setCoordinates({
          latitude: body.latitude,
          longitude: body.longitude,
          source: "geocoder",
        });
      }
    } catch {
      if (requestId !== locationRequestId.current) return;
      setPlanningTimeZone(null);
      setPlanningTimeZoneStatus("idle");
    }
  }

  async function runSearch(event) {
    event.preventDefault();
    locationRequestId.current += 1;
    setStatus("loading");
    setMessage("");
    setGenre("all");
    setResultQuery("");
    setSearchMeta(null);

    let dates;
    try {
      dates = getDateRange(dateOption, customStart, customEnd);
    } catch (error) {
      setMessage(error.message);
      setStatus("error");
      return;
    }
    const params = new URLSearchParams({
      radius: String(radius),
      startDate: dates.startDate,
      endDate: dates.endDate,
      dateOption,
      category,
    });
    if (dateOption === "custom") {
      params.set("customStart", customStart);
      params.set("customEnd", customEnd);
    }

    if (coordinates) {
      params.set("lat", String(coordinates.latitude));
      params.set("lng", String(coordinates.longitude));
      params.set("locationSource", coordinates.source || "browser");
      if (locationText.trim()) params.set("location", locationText.trim());
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
      setSearchMeta(body.meta || null);
      setPlanningTimeZone(body.meta?.resolvedLocation?.timeZone || null);
      setPlanningTimeZoneStatus(body.meta?.resolvedLocation?.timeZone ? "success" : "idle");
      setStatus("success");
    } catch (error) {
      setMessage(error.message || "Search failed.");
      setStatus("error");
    }
  }

  function resetResultRefinements() {
    setGenre("all");
    setProximity((current) => ({ ...current, mode: "all" }));
    setResultQuery("");
    setResultSort("date");
  }

  return (
    <main>
      <section className="hero">
        <div className="hero__content">
          <div className="brand">
            <RadarLogo />
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
                <LocationAutocomplete
                  value={locationText}
                  onChange={(value) => {
                    locationRequestId.current += 1;
                    setLocationText(value);
                    setCoordinates(null);
                    setPlanningTimeZone(null);
                    setPlanningTimeZoneStatus("idle");
                    setLocationMessage("");
                    setLocationStatus("idle");
                  }}
                  onSelect={(value) => {
                    setLocationText(value);
                    setCoordinates(null);
                    setLocationMessage(`Location selected: ${value}.`);
                    setLocationStatus("idle");
                    resolvePlanningTimeZone(value);
                  }}
                  onCommit={dateOption === "custom" ? resolvePlanningTimeZone : undefined}
                  required={!coordinates}
                />
                <button className={`button button--secondary ${locationStatus === "success" ? "is-success" : ""}`} type="button" onClick={useCurrentLocation} disabled={locationStatus === "loading"}>
                  {locationStatus === "loading" ? "Locating…" : locationStatus === "success" ? "✓ Location found" : "Use current location"}
                </button>
              </div>
              {locationMessage ? <span aria-live="polite" className={`field-message field-message--${locationStatus}`}>{locationMessage}</span> : null}
            </label>

            <div className="control-grid">
              <label>
                When
                <select
                  value={dateOption}
                  onChange={(event) => {
                    const option = event.target.value;
                    setDateOption(option);
                    if (option === "custom") resolvePlanningTimeZone(locationText);
                  }}
                >
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

            {dateOption === "custom" ? (
              <div className="custom-date-grid">
                <CalendarPicker
                  mode="range"
                  start={customStart}
                  end={customEnd}
                  onStartChange={(value) => {
                    setCustomDatesTouched(true);
                    setCustomStart(value);
                  }}
                  onEndChange={(value) => {
                    setCustomDatesTouched(true);
                    setCustomEnd(value);
                  }}
                  timeZone={planningTimeZone}
                />
                <span className="field-message" aria-live="polite">
                  {planningTimeZoneStatus === "loading"
                    ? "Checking the location’s calendar day…"
                    : planningTimeZone
                      ? `Dates use ${planningTimeZone.replaceAll("_", " ")}.`
                      : "Dates will be confirmed in the searched location’s time zone."}
                </span>
              </div>
            ) : null}

            <button className="button button--primary" type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Scanning…" : scanButtonLabel(category)}
            </button>
          </form>
        </div>
      </section>

      <section className="results">
        <div className="results__header">
          <div>
            <p className="results__kicker">RADAR RESULTS</p>
            <h2>{resultSummary}</h2>
            {searchContext.length ? (
              <ul className="results__context" aria-label="Search details">
                {searchContext.map((detail) => <li key={detail}>{detail}</li>)}
              </ul>
            ) : null}
          </div>
        </div>

        {status === "success" && displayedEvents.length ? (
          <>
            <ResultFilters
              activeRefinementCount={activeRefinementCount}
              availableProximityPresets={availableProximityPresets}
              customDistance={customDistance}
              displayedEventCount={displayedEvents.length}
              genre={genre}
              genreOptions={genreOptions}
              matchingEvents={matchingEvents}
              proximity={proximity}
              proximitySummary={proximitySummary}
              resultRadius={resultRadius}
              resultsUseCurrentLocation={resultsUseCurrentLocation}
              onReset={resetResultRefinements}
              setGenre={setGenre}
              setProximity={setProximity}
            />
            <div className="result-tools" role="group" aria-label="Search and sort results">
              <label>
                Find in results
                <input
                  type="search"
                  value={resultQuery}
                  onChange={(event) => setResultQuery(event.target.value)}
                  placeholder="Artist, venue, neighborhood, or genre"
                />
              </label>
              <label>
                Sort by
                <select value={resultSort} onChange={(event) => setResultSort(event.target.value)}>
                  <option value="date">Soonest</option>
                  <option value="distance">Nearest</option>
                </select>
              </label>
            </div>
          </>
        ) : null}

        {status === "success" && (searchMeta?.ticketmasterTruncated || searchMeta?.discoveryQueued) ? (
          <p className="coverage-note" role="status">
            {searchMeta.ticketmasterTruncated
              ? "This area has more commercial listings than the provider returned in one scan. Narrow the date range or distance for complete results."
              : "We’re expanding local-source coverage for this area in the background. Check back for newly indexed venue listings."}
          </p>
        ) : null}

        {status === "success" && filteredEvents.length === 0 ? (
          <div className="empty-state">
            <h2>{displayedEvents.length ? "No events match those filters." : events.length ? "No upcoming events remain." : "No events found yet."}</h2>
            <p>{displayedEvents.length
              ? "Clear a results filter or choose a wider distance."
              : events.length
                ? "Events are removed automatically after their start time."
                : "Try a larger radius or broader date range. This result may also indicate a coverage gap."}</p>
          </div>
        ) : null}

        <div className="event-grid">
          {visibleEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              timeZone={searchMeta?.resolvedLocation?.timeZone}
            />
          ))}
        </div>
        {visibleEvents.length < filteredEvents.length ? (
          <button className="button load-more" type="button" onClick={() => setVisibleCount((count) => count + RESULTS_PAGE_SIZE)}>
            Show more ({filteredEvents.length - visibleEvents.length} remaining)
          </button>
        ) : null}
      </section>
      <footer className="site-footer">
        <p>
          This application uses Discogs’ API but is not affiliated with,
          sponsored or endorsed by Discogs. ‘Discogs’ is a trademark of Zink
          Media, LLC.
        </p>
        <p>City and ZIP suggestions contain <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> data licensed under CC BY 4.0.</p>
      </footer>
    </main>
  );
}

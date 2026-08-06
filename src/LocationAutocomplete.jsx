import { useEffect, useId, useRef, useState } from "react";
import { buildLocationIndex, suggestLocations } from "./lib/locationSuggestions.js";

let locationIndexPromise;
function loadLocationIndex() {
  if (!locationIndexPromise) {
    locationIndexPromise = fetch("/location-suggestions.json")
      .then((response) => {
        if (!response.ok) throw new Error("Location suggestions are unavailable.");
        return response.json();
      })
      .then(buildLocationIndex);
  }
  return locationIndexPromise;
}

export default function LocationAutocomplete({ value, onChange, onSelect, required }) {
  const listboxId = useId();
  const [index, setIndex] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const suppressNextOpen = useRef(false);

  async function ensureIndex() {
    if (index || loading) return;
    setLoading(true);
    try {
      setIndex(await loadLocationIndex());
    } catch {
      // Free-form location entry and submit-time geocoding remain available.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const next = suggestLocations(index, value);
    setSuggestions(next);
    setActiveIndex(-1);
    if (suppressNextOpen.current) {
      suppressNextOpen.current = false;
      setOpen(false);
      return;
    }
    setOpen(Boolean(index && String(value).trim().length >= 2 && next.length));
  }, [index, value]);

  function choose(suggestion) {
    suppressNextOpen.current = true;
    onSelect(suggestion.value);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event) {
    if (!open && ["ArrowDown", "ArrowUp"].includes(event.key) && suggestions.length) {
      setOpen(true);
      setActiveIndex(event.key === "ArrowDown" ? 0 : suggestions.length - 1);
      event.preventDefault();
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown") {
      setActiveIndex((current) => (current + 1) % suggestions.length);
      event.preventDefault();
    } else if (event.key === "ArrowUp") {
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
      event.preventDefault();
    } else if (event.key === "Enter" && activeIndex >= 0) {
      choose(suggestions[activeIndex]);
      event.preventDefault();
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      event.preventDefault();
    }
  }

  return (
    <div className="location-autocomplete">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => { ensureIndex(); if (suggestions.length) setOpen(true); }}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder="Enter a city, state, or ZIP"
        required={required}
        autoComplete="off"
        role="combobox"
        aria-label="Location"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
      />
      {open ? (
        <div className="location-suggestions" id={listboxId} role="listbox" aria-label="Location suggestions">
          {suggestions.map((suggestion, suggestionIndex) => (
            <button
              id={`${listboxId}-${suggestionIndex}`}
              className={suggestionIndex === activeIndex ? "is-active" : ""}
              key={`${suggestion.type}:${suggestion.value}`}
              type="button"
              role="option"
              aria-selected={suggestionIndex === activeIndex}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(suggestion)}
            >
              <span>{suggestion.label}</span><small>{suggestion.type}</small>
            </button>
          ))}
        </div>
      ) : null}
      {loading ? <span className="location-autocomplete__status" aria-live="polite">Loading suggestions…</span> : null}
    </div>
  );
}

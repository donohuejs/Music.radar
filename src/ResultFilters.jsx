import { useCallback, useMemo, useState } from "react";
import ResultFilterMenu from "./ResultFilterMenu.jsx";
import { countEventsByProximity } from "./lib/proximityFilters.js";
import { TRAVEL_MODE_OPTIONS } from "./lib/travelTimeFilters.js";

export default function ResultFilters({
  availableProximityPresets,
  activeRefinementCount,
  customDistance,
  displayedEventCount,
  genre,
  genreOptions,
  matchingEvents,
  proximity,
  proximitySummary,
  resultRadius,
  resultsUseCurrentLocation,
  travel,
  onChooseTravelMode,
  onReset,
  onTravelMinutesChange,
  onUseMileage,
  setGenre,
  setProximity,
}) {
  const [openFilter, setOpenFilter] = useState(null);
  const openMenu = useCallback((name, reason) => setOpenFilter({ name, reason }), []);
  const closeMenu = useCallback(() => setOpenFilter(null), []);
  const proximityCounts = useMemo(
    () => countEventsByProximity(matchingEvents, availableProximityPresets, customDistance),
    [availableProximityPresets, customDistance, matchingEvents],
  );

  function chooseGenre(value, closePopover) {
    setGenre(value);
    closePopover({ restoreFocus: true });
  }

  function chooseDistance(mode, closePopover) {
    onUseMileage();
    setProximity((current) => ({ ...current, mode }));
    closePopover({ restoreFocus: true });
  }

  return (
    <div className="filter-menu-bar" role="group" aria-label="Genre and travel filters">
      <ResultFilterMenu
        name="genre"
        label="Genre"
        value={genre === "all" ? "All genres" : genre}
        active={genre !== "all"}
        openFilter={openFilter}
        onOpen={openMenu}
        onClose={closeMenu}
      >
        {(closePopover) => (
          <div className="genre-filters" aria-label="Filter results by genre">
            <button
              className={genre === "all" ? "is-active" : ""}
              type="button"
              onClick={() => chooseGenre("all", closePopover)}
              aria-pressed={genre === "all"}
            >
              All ({displayedEventCount})
            </button>
            {genreOptions.map((option) => (
              <button
                className={genre === option.name ? "is-active" : ""}
                key={option.name}
                type="button"
                onClick={() => chooseGenre(option.name, closePopover)}
                aria-pressed={genre === option.name}
              >
                {option.name} ({option.count})
              </button>
            ))}
          </div>
        )}
      </ResultFilterMenu>
      <ResultFilterMenu
        name="distance"
        label="Travel"
        value={proximitySummary}
        active={travel.enabled || proximity.mode !== "all"}
        align="right"
        openFilter={openFilter}
        onOpen={openMenu}
        onClose={closeMenu}
      >
        {(closePopover) => (
          <div className="proximity-filter">
            <div className="proximity-filter__heading">
              <strong>Travel time from you</strong>
              <small>Estimated leaving now.</small>
            </div>
            <div className="travel-mode-options" role="group" aria-label="Travel mode">
              {TRAVEL_MODE_OPTIONS.map((option) => (
                <button
                  className={travel.enabled && travel.mode === option.value ? "is-active" : ""}
                  key={option.value}
                  type="button"
                  disabled={!resultsUseCurrentLocation || travel.status === "loading"}
                  onClick={() => onChooseTravelMode(option.value)}
                  aria-pressed={travel.enabled && travel.mode === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {resultsUseCurrentLocation ? (
              travel.enabled ? (
                <div className="travel-time-control" aria-busy={travel.status === "loading"}>
                  <label htmlFor="travel-time-range">
                    Maximum travel time
                    <strong>{travel.maxMinutes} minutes</strong>
                  </label>
                  <input
                    id="travel-time-range"
                    type="range"
                    min="10"
                    max="60"
                    step="5"
                    value={travel.maxMinutes}
                    onChange={(event) => onTravelMinutesChange(event.target.value)}
                  />
                  <small aria-live="polite">
                    {travel.status === "loading"
                      ? "Calculating routes…"
                      : `${travel.matchCount} of ${matchingEvents.length} events match.`}
                  </small>
                  {travel.meta?.truncated ? (
                    <small>Travel estimates cover the first 100 upcoming events.</small>
                  ) : null}
                  <button className="travel-time-control__fallback" type="button" onClick={onUseMileage}>
                    Use mileage instead
                  </button>
                </div>
              ) : travel.message ? (
                <small className="proximity-filter__note" role="status">{travel.message}</small>
              ) : (
                <small className="proximity-filter__note">Choose a mode to calculate precise travel times.</small>
              )
            ) : (
              <small className="proximity-filter__note">
                Use current location to unlock walking, transit, and car estimates.
              </small>
            )}
            <div className="proximity-filter__divider" aria-hidden="true" />
            <div className="proximity-filter__heading">
              <strong>Mileage fallback</strong>
              <small>The scan still covers {resultRadius} miles.</small>
            </div>
            <div className="proximity-options" role="group" aria-label="Filter results by distance">
              <button
                className={!travel.enabled && proximity.mode === "all" ? "is-active" : ""}
                type="button"
                onClick={() => chooseDistance("all", closePopover)}
                aria-pressed={!travel.enabled && proximity.mode === "all"}
              >
                All ({proximityCounts.all})
              </button>
              {availableProximityPresets.map((option) => (
                <button
                  className={!travel.enabled && proximity.mode === option.value ? "is-active" : ""}
                  key={option.value}
                  type="button"
                  onClick={() => chooseDistance(option.value, closePopover)}
                  aria-pressed={!travel.enabled && proximity.mode === option.value}
                >
                  {option.label} · ≤{option.miles} mi ({proximityCounts.presets[option.value]})
                </button>
              ))}
              <button
                className={!travel.enabled && proximity.mode === "custom" ? "is-active" : ""}
                type="button"
                onClick={() => {
                  onUseMileage();
                  setProximity((current) => ({ ...current, mode: "custom" }));
                }}
                aria-pressed={!travel.enabled && proximity.mode === "custom"}
              >
                Custom
              </button>
            </div>
            {proximity.mode === "custom" ? (
              <label className="custom-distance">
                Within
                <input
                  type="number"
                  min="0.5"
                  max={resultRadius}
                  step="0.5"
                  value={proximity.customMiles}
                  onChange={(event) => setProximity((current) => ({
                    ...current,
                    customMiles: event.target.value,
                  }))}
                  onBlur={() => setProximity((current) => ({
                    ...current,
                    customMiles: String(customDistance),
                  }))}
                  aria-label="Custom distance in miles"
                />
                miles ({proximityCounts.custom})
              </label>
            ) : null}
          </div>
        )}
      </ResultFilterMenu>
      {activeRefinementCount > 0 ? (
        <button
          className="filter-menu-bar__reset"
          type="button"
          onClick={() => {
            closeMenu();
            onReset();
          }}
        >
          Reset filters ({activeRefinementCount})
        </button>
      ) : null}
    </div>
  );
}

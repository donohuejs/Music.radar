import { useCallback, useMemo, useState } from "react";
import ResultFilterMenu from "./ResultFilterMenu.jsx";
import { countEventsByProximity } from "./lib/proximityFilters.js";

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
  onReset,
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
    setProximity((current) => ({ ...current, mode }));
    closePopover({ restoreFocus: true });
  }

  return (
    <div className="filter-menu-bar" role="group" aria-label="Genre and distance filters">
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
        label="Distance"
        value={proximitySummary}
        active={proximity.mode !== "all"}
        align="right"
        openFilter={openFilter}
        onOpen={openMenu}
        onClose={closeMenu}
      >
        {(closePopover) => (
          <div className="proximity-filter">
            <div className="proximity-filter__heading">
              <strong>{resultsUseCurrentLocation ? "Distance from you" : "Distance from search center"}</strong>
              <small>The scan still covers {resultRadius} miles.</small>
            </div>
            <div className="proximity-options" role="group" aria-label="Filter results by distance">
              <button
                className={proximity.mode === "all" ? "is-active" : ""}
                type="button"
                onClick={() => chooseDistance("all", closePopover)}
                aria-pressed={proximity.mode === "all"}
              >
                All ({proximityCounts.all})
              </button>
              {availableProximityPresets.map((option) => (
                <button
                  className={proximity.mode === option.value ? "is-active" : ""}
                  key={option.value}
                  type="button"
                  onClick={() => chooseDistance(option.value, closePopover)}
                  aria-pressed={proximity.mode === option.value}
                >
                  {option.label} · ≤{option.miles} mi ({proximityCounts.presets[option.value]})
                </button>
              ))}
              <button
                className={proximity.mode === "custom" ? "is-active" : ""}
                type="button"
                onClick={() => setProximity((current) => ({ ...current, mode: "custom" }))}
                aria-pressed={proximity.mode === "custom"}
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
            {!resultsUseCurrentLocation ? (
              <small className="proximity-filter__note">
                Use current location for an accurate “from you” distance.
              </small>
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

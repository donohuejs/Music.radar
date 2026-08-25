import { useEffect, useId, useRef, useState } from "react";
import { buildMapUrl, MAP_APP_OPTIONS } from "./lib/mapLinks.js";

const FOCUSABLE_SELECTOR = "a[href], button:not([disabled]), input:not([disabled])";

export default function DirectionsChooser({ event, preferredApp, onChoose, onClose }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => panelRef.current?.querySelector(FOCUSABLE_SELECTOR)?.focus());

    function handleKeyDown(keyEvent) {
      if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        onClose();
        return;
      }
      if (keyEvent.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll(FOCUSABLE_SELECTOR)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (keyEvent.shiftKey && document.activeElement === first) {
        keyEvent.preventDefault();
        last.focus();
      } else if (!keyEvent.shiftKey && document.activeElement === last) {
        keyEvent.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="directions-chooser">
      <button
        className="directions-chooser__backdrop"
        type="button"
        aria-label="Close directions menu"
        onClick={onClose}
      />
      <section
        className="directions-chooser__panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="directions-chooser__heading">
          <div>
            <span>Directions</span>
            <h2 id={titleId}>{event.venueName || event.name || "Event venue"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close directions menu">×</button>
        </div>
        <p>Choose the app you want to use. Your current location and route stay inside that app.</p>
        <div className="directions-chooser__options">
          {MAP_APP_OPTIONS.map((option) => (
            <a
              className={preferredApp === option.value ? "is-preferred" : ""}
              href={buildMapUrl(option.value, event)}
              key={option.value}
              onClick={() => onChoose(option.value, remember)}
            >
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
              {preferredApp === option.value ? <small>Saved</small> : <span aria-hidden="true">→</span>}
            </a>
          ))}
        </div>
        <label className="directions-chooser__remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(changeEvent) => setRemember(changeEvent.target.checked)}
          />
          Remember my choice on this device
        </label>
      </section>
    </div>
  );
}

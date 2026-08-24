import { useCallback, useEffect, useId, useRef, useState } from "react";

const HOVER_INTENT_MS = 200;
const SHEET_MEDIA_QUERY = "(max-width: 800px), (hover: none), (pointer: coarse)";
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function useSheetMode() {
  const [isSheet, setIsSheet] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(SHEET_MEDIA_QUERY).matches
  );

  useEffect(() => {
    const media = window.matchMedia(SHEET_MEDIA_QUERY);
    const update = () => setIsSheet(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isSheet;
}

export default function ResultFilterMenu({
  name,
  label,
  value,
  align = "left",
  openFilter,
  onOpen,
  onClose,
  children,
}) {
  const panelId = useId();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const hoverTimerRef = useRef(null);
  const isSheet = useSheetMode();
  const isOpen = openFilter?.name === name;
  const openReason = isOpen ? openFilter.reason : null;

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
  }, []);

  const closeMenu = useCallback(({ restoreFocus = false } = {}) => {
    clearHoverTimer();
    onClose();
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, [clearHoverTimer, onClose]);

  useEffect(() => () => clearHoverTimer(), [clearHoverTimer]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    if (isSheet) document.body.style.overflow = "hidden";
    if (openReason !== "hover") {
      window.requestAnimationFrame(() => panelRef.current?.focus());
    }

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) closeMenu();
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu({ restoreFocus: true });
        return;
      }
      if (event.key !== "Tab" || !isSheet || !panelRef.current) return;

      const focusable = [...panelRef.current.querySelectorAll(FOCUSABLE_SELECTOR)]
        .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenu, isOpen, isSheet, openReason]);

  function handlePointerEnter(event) {
    if (event.pointerType !== "mouse") return;
    clearHoverTimer();
    if (isOpen) return;
    hoverTimerRef.current = window.setTimeout(() => onOpen(name, "hover"), HOVER_INTENT_MS);
  }

  function handlePointerLeave(event) {
    if (event.pointerType !== "mouse") return;
    clearHoverTimer();
    if (isOpen && openReason === "hover") {
      hoverTimerRef.current = window.setTimeout(onClose, HOVER_INTENT_MS);
    }
  }

  return (
    <div
      className={`filter-menu filter-menu--${align} ${isOpen ? "is-open" : ""}`}
      ref={rootRef}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <button
        className="filter-menu__trigger"
        ref={triggerRef}
        type="button"
        aria-controls={panelId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => {
          if (isOpen && openReason !== "hover") closeMenu({ restoreFocus: true });
          else onOpen(name, "click");
        }}
      >
        <span>{label}</span>
        <strong>{value}</strong>
        <span className="filter-menu__chevron" aria-hidden="true">⌄</span>
      </button>
      {isOpen ? (
        <button
          className="filter-menu__backdrop"
          type="button"
          aria-label={`Close ${label.toLowerCase()} filters`}
          tabIndex="-1"
          onClick={() => closeMenu()}
        />
      ) : null}
      <div
        className="filter-menu__popover"
        id={panelId}
        ref={panelRef}
        role="dialog"
        aria-label={`${label} filters`}
        aria-modal={isOpen && isSheet ? "true" : undefined}
        tabIndex="-1"
        hidden={!isOpen}
      >
        <div className="filter-menu__heading">
          <strong>{label}</strong>
          <button type="button" onClick={() => closeMenu({ restoreFocus: true })} aria-label={`Close ${label.toLowerCase()} filters`}>×</button>
        </div>
        {typeof children === "function" ? children(closeMenu) : children}
        <button className="filter-menu__done" type="button" onClick={() => closeMenu({ restoreFocus: true })}>Done</button>
      </div>
    </div>
  );
}

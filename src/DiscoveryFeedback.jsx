import { useEffect, useId, useRef, useState } from "react";
import { compressedImageDataUrl } from "./lib/imageUpload.js";

const FOCUSABLE_SELECTOR = "button:not([disabled]), input:not([disabled]):not([tabindex='-1']), textarea:not([disabled]), select:not([disabled]), a[href]";

function initialInput(location) {
  return {
    name: "",
    venueName: "",
    sourceUrl: "",
    location: location || "",
    eventDate: "",
    notes: "",
    website: "",
  };
}

export default function DiscoveryFeedback({ defaultLocation, onClose }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [input, setInput] = useState(() => initialInput(defaultLocation));
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => panelRef.current?.querySelector("input[type='file']")?.focus());

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll(FOCUSABLE_SELECTOR)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  function update(field, value) {
    if (status !== "idle") {
      setStatus("idle");
      setMessage("");
    }
    setInput((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!file && !input.sourceUrl.trim()) {
      setStatus("error");
      setMessage("Add a poster or a link to an artist or venue events page.");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const imageDataUrl = file ? await compressedImageDataUrl(file) : null;
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, imageDataUrl }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not submit this event right now.");
      setStatus("success");
      setMessage("Thanks—this has been added to the review queue. Nothing is published until it is verified.");
      setFile(null);
      setInput(initialInput(defaultLocation));
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      setStatus("error");
      setMessage(error.message);
    }
  }

  return (
    <div className="feedback-dialog">
      <button className="feedback-dialog__backdrop" type="button" aria-label="Close event feedback" onClick={onClose} />
      <section className="feedback-dialog__panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="feedback-dialog__heading">
          <div>
            <span>Help improve discovery</span>
            <h2 id={titleId}>Missing an event?</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close event feedback">×</button>
        </div>
        <p>Send a poster, screenshot, or events-page link. A person reviews every submission before anything can appear in Music Radar.</p>
        <form className="feedback-form" onSubmit={submit}>
          <label className="feedback-form__upload">
            Poster or screenshot
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setStatus("idle");
                setMessage("");
              }}
            />
            <small>{file ? file.name : "JPEG, PNG, or WebP. Optional when you provide a link."}</small>
          </label>
          <div className="feedback-form__divider"><span>or</span></div>
          <label>
            Artist or venue events page
            <input type="url" value={input.sourceUrl} onChange={(event) => update("sourceUrl", event.target.value)} placeholder="https://venue.example/events" />
          </label>
          <div className="feedback-form__grid">
            <label>
              Event or artist name <small>Optional</small>
              <input value={input.name} onChange={(event) => update("name", event.target.value)} maxLength="160" />
            </label>
            <label>
              Venue <small>Optional</small>
              <input value={input.venueName} onChange={(event) => update("venueName", event.target.value)} maxLength="160" />
            </label>
            <label>
              City or location <small>Optional</small>
              <input value={input.location} onChange={(event) => update("location", event.target.value)} maxLength="200" />
            </label>
            <label>
              Event date <small>Optional</small>
              <input type="date" value={input.eventDate} onChange={(event) => update("eventDate", event.target.value)} />
            </label>
          </div>
          <label>
            Anything else we should know? <small>Optional</small>
            <textarea rows="3" value={input.notes} onChange={(event) => update("notes", event.target.value)} maxLength="1000" placeholder="Weekly series, multiple dates, where you found it…" />
          </label>
          <label className="feedback-form__honeypot" aria-hidden="true">
            Website
            <input tabIndex="-1" autoComplete="off" value={input.website} onChange={(event) => update("website", event.target.value)} />
          </label>
          <p className="feedback-form__privacy">Images are stored privately for discovery review. Please avoid uploading personal information unrelated to the event.</p>
          {message ? <p className={`field-message field-message--${status === "success" ? "success" : "error"}`} role={status === "error" ? "alert" : "status"}>{message}</p> : null}
          <button
            className="button button--primary"
            type={status === "success" ? "button" : "submit"}
            disabled={status === "loading"}
            onClick={status === "success" ? () => { setStatus("idle"); setMessage(""); } : undefined}
          >
            {status === "loading" ? "Submitting…" : status === "success" ? "Submit another event" : "Send for review"}
          </button>
        </form>
      </section>
    </div>
  );
}

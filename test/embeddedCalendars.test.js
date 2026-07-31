import test from "node:test";
import assert from "node:assert/strict";

import { discoverEmbeddedCalendars } from "../lib/server/embeddedCalendars.js";

test("discovers a Tockify iframe and derives its public ICS feed", () => {
  const html = `
    <main>
      <iframe title="calendar" src="https://tockify.com/smileysroxxlivemusic"></iframe>
    </main>
  `;

  assert.deepEqual(
    discoverEmbeddedCalendars(html, "https://smileysroxx.com/music-lineup"),
    [
      {
        provider: "tockify",
        calendarId: "smileysroxxlivemusic",
        parser: "ical",
        url: "https://tockify.com/api/feeds/ics/smileysroxxlivemusic",
      },
    ],
  );
});

test("deduplicates embed and feed links for the same Tockify calendar", () => {
  const html = `
    <div data-tockify-calendar="community.music" data-tockify-component="calendar"></div>
    <iframe src="https://tockify.com/community.music"></iframe>
    <a href="https://tockify.com/api/feeds/ics/community.music">Subscribe</a>
  `;

  assert.equal(discoverEmbeddedCalendars(html, "https://example.com").length, 1);
});

test("discovers the Tockify data attribute before its iframe is rendered", () => {
  const html = `
    <div data-tockify-calendar="smileysroxxlivemusic" data-tockify-component="calendar"></div>
    <script src="https://public.tockify.com/browser/embed.js"></script>
  `;

  assert.deepEqual(
    discoverEmbeddedCalendars(html, "https://smileysroxx.com/music-lineup"),
    [
      {
        provider: "tockify",
        calendarId: "smileysroxxlivemusic",
        parser: "ical",
        url: "https://tockify.com/api/feeds/ics/smileysroxxlivemusic",
      },
    ],
  );
});

test("ignores unsupported and reserved Tockify URLs", () => {
  const html = `
    <iframe src="https://calendar.example.com/events"></iframe>
    <script src="https://tockify.com/api/widget.js"></script>
  `;

  assert.deepEqual(discoverEmbeddedCalendars(html, "https://example.com"), []);
});

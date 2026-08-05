import test from "node:test";
import assert from "node:assert/strict";

import { fetchICalendarEvents } from "../lib/server/calendarFeeds.js";

test("uses conditional headers and records an unchanged calendar", async (context) => {
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  let requestHeaders;
  global.fetch = async (_url, options) => {
    requestHeaders = options.headers;
    return {
      ok: false,
      status: 304,
      headers: new Map([
        ["etag", '"calendar-v2"'],
        ["last-modified", "Wed, 05 Aug 2026 12:00:00 GMT"],
      ]),
    };
  };

  const events = await fetchICalendarEvents({
    id: "venue",
    name: "Venue",
    url: "https://venue.example/events.ics",
    httpEtag: '"calendar-v1"',
    httpLastModified: "Tue, 04 Aug 2026 12:00:00 GMT",
  });

  assert.equal(requestHeaders["If-None-Match"], '"calendar-v1"');
  assert.equal(
    requestHeaders["If-Modified-Since"],
    "Tue, 04 Aug 2026 12:00:00 GMT",
  );
  assert.equal(events.length, 0);
  assert.equal(events.collectionStatus.notModified, true);
  assert.equal(events.collectionStatus.httpEtag, '"calendar-v2"');
});

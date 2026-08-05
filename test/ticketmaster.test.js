import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchTicketmasterEvents,
  ticketmasterCategory,
  ticketmasterClassifications,
} from "../lib/server/ticketmaster.js";

function rawEvent(id, segment = "Music", genre = "Rock") {
  return {
    id,
    name: `Event ${id}`,
    dates: { start: { dateTime: "2026-09-16T01:00:00Z" } },
    classifications: [{ segment: { name: segment }, genre: { name: genre } }],
    _embedded: {
      venues: [{ name: "Example Hall", location: { latitude: "41.9", longitude: "-87.6" } }],
      attractions: [{ name: `Artist ${id}` }],
    },
  };
}

test("maps product categories to Ticketmaster classifications", () => {
  assert.deepEqual(ticketmasterClassifications("all"), ["music", "arts & theatre"]);
  assert.deepEqual(ticketmasterClassifications("theater"), ["arts & theatre"]);
  assert.deepEqual(ticketmasterClassifications("trivia"), []);
  assert.equal(
    ticketmasterCategory(rawEvent("comic", "Arts & Theatre", "Comedy")),
    "comedy",
  );
});

test("paginates Ticketmaster results and normalizes their category", async (context) => {
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  const requestedPages = [];
  const requestedClassifications = [];
  global.fetch = async (value) => {
    const url = new URL(value);
    const page = Number(url.searchParams.get("page"));
    requestedPages.push(page);
    requestedClassifications.push(url.searchParams.get("classificationName"));
    return {
      ok: true,
      text: async () => JSON.stringify({
        page: { totalPages: 2, totalElements: 201 },
        _embedded: { events: [rawEvent(`page-${page}`, "Arts & Theatre", "Comedy")] },
      }),
    };
  };

  const events = await fetchTicketmasterEvents({
    apiKey: "key",
    lat: 41.9,
    lng: -87.6,
    startDate: new Date("2026-09-01T00:00:00Z"),
    endDate: new Date("2026-09-30T23:59:59Z"),
    category: "comedy",
  });
  assert.deepEqual(requestedPages, [0, 1]);
  assert.deepEqual(requestedClassifications, ["comedy", "comedy"]);
  assert.equal(events.length, 2);
  assert.ok(events.every((event) => event.category === "comedy"));
  assert.equal(events.collectionStatus.truncated, false);
});

test("splits dense date windows before deep paging", async (context) => {
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  const requests = [];
  global.fetch = async (value) => {
    const url = new URL(value);
    const start = new Date(url.searchParams.get("startDateTime"));
    const end = new Date(url.searchParams.get("endDateTime"));
    const durationDays = (end - start) / 86_400_000;
    requests.push({ start, end });
    const dense = durationDays > 20;
    return {
      ok: true,
      text: async () => JSON.stringify({
        page: { totalPages: dense ? 6 : 1, totalElements: dense ? 1200 : 1 },
        _embedded: { events: dense ? [] : [rawEvent(`window-${start.toISOString()}`)] },
      }),
    };
  };

  const events = await fetchTicketmasterEvents({
    apiKey: "key",
    startDate: new Date("2026-09-01T00:00:00Z"),
    endDate: new Date("2026-10-01T00:00:00Z"),
    category: "music",
  });
  assert.equal(requests.length, 3);
  assert.equal(events.length, 2);
  assert.equal(events.collectionStatus.truncated, false);
});

test("keeps successful classifications when another Ticketmaster query fails", async (context) => {
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  global.fetch = async (value) => {
    const classification = new URL(value).searchParams.get("classificationName");
    if (classification === "arts & theatre") {
      return { ok: false, status: 503, text: async () => "temporarily unavailable" };
    }
    return {
      ok: true,
      text: async () => JSON.stringify({
        page: { totalPages: 1, totalElements: 1 },
        _embedded: { events: [rawEvent("music-result")] },
      }),
    };
  };

  const events = await fetchTicketmasterEvents({
    apiKey: "key",
    startDate: new Date("2026-09-01T00:00:00Z"),
    endDate: new Date("2026-09-30T23:59:59Z"),
    category: "all",
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].category, "music");
  assert.equal(events.collectionStatus.errors.length, 1);
  assert.match(events.collectionStatus.errors[0], /^arts & theatre:/);
});

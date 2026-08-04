import test from "node:test";
import assert from "node:assert/strict";

import { mergeAndDedupe } from "../lib/server/events.js";

const base = {
  category: "music",
  city: "Chicago",
  state: "IL",
  startTime: "2026-09-19T01:00:00Z",
  sourceName: "Ticketmaster",
  confidence: 0.98,
};

test("merges provider duplicates with title and venue suffix differences", () => {
  const events = mergeAndDedupe([
    {
      ...base,
      id: "ticketmaster:primary",
      externalId: "primary",
      name: "LAUNDRY DAY Presents: The Larger Than LIFE Tour",
      artistName: "LAUNDRY DAY",
      venueName: "Chop Shop",
      address: "2033 W North Ave",
      postalCode: "60647",
      ticketUrl: "https://dice.fm/example",
    },
    {
      ...base,
      id: "ticketmaster:alternate",
      externalId: "alternate",
      name: "LAUNDRY DAY",
      artistName: "LAUNDRY DAY",
      venueName: "Chop Shop - IL",
      address: "2033 W North Ave",
      postalCode: "60647",
      ticketUrl: "https://ticketmaster.com/example",
    },
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].name, "LAUNDRY DAY Presents: The Larger Than LIFE Tour");
  assert.deepEqual(events[0].externalIds.sort(), ["alternate", "primary"]);
  assert.equal(events[0].ticketUrls.length, 2);
});

test("merges same artist, time, and postal code despite venue address aliases", () => {
  const events = mergeAndDedupe([
    { ...base, name: "Calle 24 - Eterno Tour", artistName: "Calle 24", venueName: "Riviera Theatre", address: "4746 N Racine Ave", postalCode: "60640" },
    { ...base, name: "Calle 24 - Eterno Tour", artistName: "Calle 24", venueName: "Riviera Theatre- IL", address: "4750 N. Broadway", postalCode: "60640" },
  ]);
  assert.equal(events.length, 1);
});

test("keeps separate performances when start times differ", () => {
  const events = mergeAndDedupe([
    { ...base, name: "Example Artist", artistName: "Example Artist", venueName: "Example Hall", postalCode: "60640" },
    { ...base, name: "Example Artist", artistName: "Example Artist", venueName: "Example Hall", postalCode: "60640", startTime: "2026-09-19T03:00:00Z" },
  ]);
  assert.equal(events.length, 2);
});

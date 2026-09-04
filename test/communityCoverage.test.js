import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eventDetailUrl, isEventDetailPath, isEventListingPath } from "../lib/server/eventLinks.js";
import { detectPageSource, eventDetailLinks, inspectOrganization, overpassQuery } from "../lib/server/sourceDiscovery.js";
import { fetchVenueEvents, parseJsonLdEvents } from "../lib/server/jsonLdEvents.js";
import { fetchCustomVenueEvents, normalizeDetailPage, venueLocalIso, easternIso } from "../lib/server/venueParsers.js";
import { inferEventCategory } from "../lib/server/eventCategory.js";
import { normalizeEvent } from "../lib/server/cleanEvent.js";
import { VENUE_SOURCES } from "../lib/server/venueSources.js";

const source = { id: "community", name: "Community Hall", url: "https://host.example/our-events", parser: "squarespace", latitude: 41.88, longitude: -87.63, discovered: true, categoryMode: "mixed" };
const ld = (event) => `<script type="application/ld+json">${JSON.stringify({ "@type": "Event", ...event })}</script>`;
const links = (route) => ["one", "two", "three"].map((slug) => `<a href="/${route}/${slug}">${slug}</a>`).join("");
function mockPages(context, pages) {
  const requested = [];
  const original = global.fetch;
  context.after(() => { global.fetch = original; });
  global.fetch = async (url) => {
    requested.push(String(url));
    return { ok: pages.has(String(url)), status: pages.has(String(url)) ? 200 : 404,
      headers: new Headers(), text: async () => pages.get(String(url)) || "" };
  };
  return requested;
}

test("recognizes whole community listing/detail route segments including Wix", () => {
  for (const route of ["happenings", "our-events", "event-details", "events", "show", "shows", "calendar", "concerts", "garcias-events"]) {
    assert.equal(isEventListingPath(`/${route}/`), true, route);
    assert.equal(isEventDetailPath(`/${route}/artist-night`), true, route);
  }
  assert.equal(isEventDetailPath("/event/porch/2026-09-04/"), true);
  assert.equal(isEventDetailPath("/en/our-events/artist-night"), true);
});

test("rejects navigation, recurrence indexes, downloads and unrelated routes", () => {
  for (const path of ["/news/happenings-around-town", "/event-planning/weddings", "/showroom/sale", "/events", "/events/calendar/sports", "/events/category/music", "/happenings/month", "/event/porch/all/", "/events/page/2", "/events/flyer.pdf"]) {
    assert.equal(isEventDetailPath(path), false, path);
  }
  for (const url of ["/our-events/one?format=ical", "/our-events/one?ical=1", "https://other.example/our-events/one", "javascript:alert(1)"]) {
    assert.equal(eventDetailUrl(url, source.url), null, url);
  }
  assert.equal(eventDetailUrl("/our-events/one?utm_source=social#tickets", source.url), "https://host.example/our-events/one");
});

test("Commons-style happenings listings need three unique details, not eight", () => {
  const html = links("event") + '<a href="/event/one?utm_source=test">One again</a><a href="/event/one/all/">All dates</a>';
  const detection = detectPageSource(html, "https://host.example/happenings/");
  assert.equal(detection.parser, "json-ld-listing");
  assert.equal(detection.linkedEventCount, 3);
  assert.equal(detectPageSource(links("event"), "https://host.example/about"), null);
  assert.equal(detectPageSource(links("event") + links("shows") + links("calendar"), "https://host.example/event/main"), null);
});

test("Squarespace listing markup selects reusable parser, not individual ICS exports", () => {
  const html = `<article class="eventlist-event eventlist-event--upcoming"><a href="/our-events/one">One</a><a href="/our-events/one?format=ical">ICS</a></article>`;
  const detection = detectPageSource(html, source.url);
  assert.equal(detection.parser, "squarespace");
  assert.equal(detection.reusableSource, true);
  assert.equal(detection.linkedEventCount, 1);
  assert.deepEqual(eventDetailLinks(html, source.url), ["https://host.example/our-events/one"]);
  assert.equal(detectPageSource(html, "https://host.example/our-events/detail"), null);
});

test("discovery prioritizes happenings listings over many event-detail sitemap entries", async (context) => {
  const root = "https://host.example/";
  const html = links("events") + '<a href="/happenings/">Happenings</a>';
  const pages = new Map([[root, html], [root + "happenings/", links("event")], [root + "sitemap.xml", "<urlset></urlset>"]]);
  const requested = mockPages(context, pages);
  const candidates = await inspectOrganization({ ...source, url: root, timeZone: "America/Chicago" }, { maxPages: 1 });
  assert.equal(candidates[0].url, root + "happenings/");
  assert.equal(candidates[0].timeZone, "America/Chicago");
  assert.ok(requested.includes(root + "happenings/"));
});

test("JSON-LD listing ingestion follows happenings and our-events links once", async (context) => {
  const pages = new Map([[source.url, links("our-events") + '<a href="/our-events/one?format=ical">ICS</a>'],
    ...["one", "two", "three"].map((slug) => [`https://host.example/our-events/${slug}`, ld({ name: slug, startDate: "2026-09-05T16:00:00-0400" })])]);
  const requested = mockPages(context, pages);
  const events = await fetchVenueEvents({ ...source, parser: "json-ld-listing" });
  assert.equal(events.length, 3);
  assert.equal(requested.length, 4);
  assert.ok(events.every((event) => event.sourceUrl.includes("/our-events/")));
});

function squareArticle(title, date = "Saturday, September 5, 2026", time = "4:00 PM", description = "Local makers and food vendors.") {
  return `<article class="eventitem"><h1>${title}</h1><ul class="eventitem-meta event-meta-date-time-container"><li>${date}</li><li>${time}</li></ul><div class="eventitem-column-content"><p>${description}</p></div></article>`;
}

test("dynamically discovered Squarespace fallback uses coordinates and stays mixed-category", async (context) => {
  const pages = new Map([[source.url, links("our-events")],
    ["https://host.example/our-events/one", squareArticle("Market Night") + "<footer>Live music and karaoke every week</footer>"],
    ["https://host.example/our-events/two", squareArticle("Porch Sessions", undefined, undefined, "Live musicians perform on the porch.")],
    ["https://host.example/our-events/three", squareArticle("Trivia Night")]]);
  mockPages(context, pages);
  const events = (await fetchCustomVenueEvents(source)).map(normalizeEvent);
  assert.equal(events.length, 3);
  assert.ok(events.every((event) => event.startTime === "2026-09-05T21:00:00.000Z"));
  assert.equal(events.find((event) => event.name === "Market Night").category, "other");
  assert.equal(events.find((event) => event.name === "Porch Sessions").category, "music");
  assert.equal(events.find((event) => event.name === "Trivia Night").category, "trivia");
});

test("timezone conversion handles winter, DST transition and fractional offsets", () => {
  for (const [month, day, clock, zone, expected] of [
    ["January", 5, "4:00 PM", "America/Los_Angeles", "2026-01-06T00:00:00.000Z"],
    ["September", 5, "4:00 PM", "America/Los_Angeles", "2026-09-05T23:00:00.000Z"],
    ["March", 8, "4:00 PM", "America/New_York", "2026-03-08T20:00:00.000Z"],
    ["November", 1, "4:00 PM", "America/New_York", "2026-11-01T21:00:00.000Z"],
    ["September", 5, "4:00 PM", "Asia/Kolkata", "2026-09-05T10:30:00.000Z"],
  ]) assert.equal(venueLocalIso(month, day, 2026, clock, zone), expected);
  assert.equal(venueLocalIso("March", 8, 2026, "2:30 AM", "America/New_York"), null);
  assert.equal(easternIso("September", 5, 2026, "4:00 PM"), "2026-09-05T20:00:00.000Z");
  assert.equal(normalizeDetailPage(squareArticle("Market"), { ...source, timeZone: "America/Los_Angeles" }, source.url)[0].startTime, "2026-09-05T23:00:00.000Z");
  assert.deepEqual(normalizeDetailPage(squareArticle("Market"), { ...source, latitude: null, longitude: null }, source.url), []);
  assert.deepEqual(normalizeDetailPage(squareArticle("Market", undefined, "Time TBD"), source, source.url), []);
  assert.deepEqual(normalizeDetailPage("<h1>About us</h1><footer>Saturday, September 5, 2026 at 4:00 PM</footer>", source, source.url), []);
  const doors = squareArticle("Concert", undefined, "4:00 PM", "Show: 8:00 PM is a different performance.");
  assert.equal(normalizeDetailPage(doors, source, source.url)[0].startTime, "2026-09-05T21:00:00.000Z");
});

test("legacy manually registered music venues retain their default category", async (context) => {
  mockPages(context, new Map([[source.url, '<a href="/our-events/artist">Artist</a>'],
    ["https://host.example/our-events/artist", ld({ name: "Alex Example", startDate: "2026-09-05T16:00:00-0400" })]]));
  const [event] = await fetchCustomVenueEvents({ ...source, discovered: false, categoryMode: undefined, category: null });
  assert.equal(event.category, "music");
});

test("JSON-LD preserves explicit offsets and resolves floating dates in event/source zones", () => {
  const parse = (event, overrides = {}) => parseJsonLdEvents(ld({ name: "Event", ...event }), { ...source, ...overrides })[0];
  assert.equal(parse({ startDate: "2026-09-05T16:00:00-0400" }).startTime, "2026-09-05T20:00:00.000Z");
  assert.equal(parse({ startDate: "2026-09-05T16:00:00" }).startTime, "2026-09-05T21:00:00.000Z");
  assert.equal(parse({ startDate: "2026-09-05T16:00:00", timeZone: "Asia/Kolkata" }).startTime, "2026-09-05T10:30:00.000Z");
  assert.equal(parse({ startDate: "2026-09-05T16:00:00", location: { geo: { latitude: 34.05, longitude: -118.24 } } }).startTime, "2026-09-05T23:00:00.000Z");
});

test("JSON-LD description and schema type reach inference without broad-word false positives", () => {
  const parse = (event) => normalizeEvent(parseJsonLdEvents(ld({ name: "Neighborhood Gathering", startDate: "2026-09-05T16:00:00-0400", ...event }), source)[0]);
  assert.equal(parse({ description: "&lt;p&gt;Free live music on the porch.&lt;/p&gt;" }).category, "music");
  assert.equal(parse({ "@type": ["Event", "MusicEvent"] }).category, "music");
  for (const description of ["Play outside with vendors from across the country.", "Pop into our market.", "No live music tonight.", "Background music while you shop."]) {
    assert.equal(parse({ description }).category, "other", description);
  }
  assert.equal(parse({ name: "Music Bingo", description: "Live music and prizes." }).category, "trivia");
  assert.equal(parse({ name: "Open Mic", description: "Live music." }).category, "participatory");
  assert.equal(parse({ name: "Broadway Musical", description: "Live music." }).category, "theater");
  assert.equal(parse({ name: "Stand-Up Comedy", description: "Live music." }).category, "comedy");
});

test("registered Commons and Village backstops use reusable mixed parsers", () => {
  const commons = VENUE_SOURCES.find((item) => item.id === "the-commons");
  const village = VENUE_SOURCES.find((item) => item.id === "village-west-greenville");
  assert.equal(commons.parser, "json-ld-listing");
  assert.equal(village.parser, "squarespace");
  assert.equal(commons.categoryMode, "mixed");
  assert.equal(village.categoryMode, "mixed");
  // Reduced publisher examples verified 2026-09-04; not scheduled event records.
  const porch = parseJsonLdEvents(ld({ name: "Live &#038; Local on the Porch", startDate: "2026-09-04T17:00:00-07:00", endDate: "2026-09-04T20:00:00-07:00", description: "Enjoy free live music from local musicians." }), commons)[0];
  assert.equal(porch.name, "Live & Local on the Porch");
  assert.equal(porch.startTime, "2026-09-04T21:00:00.000Z");
  assert.equal(porch.endTime, "2026-09-05T00:00:00.000Z");
  assert.equal(inferEventCategory(porch), "music");
  const villive = parseJsonLdEvents(ld({ name: "VilLive Music &amp; Arts Fest", startDate: "2026-09-05T16:00:00-0400", location: { name: "Pace Yard", address: "1238 Pendleton Street" } }), village)[0];
  assert.equal(villive.startTime, "2026-09-05T20:00:00.000Z");
  assert.equal(villive.venueName, "Pace Yard");
  assert.equal(villive.address, "1238 Pendleton Street");
  assert.equal(inferEventCategory(villive), "music");
});

test("Bridgeway description supports music inference but regional source awaits quality fixes", () => {
  const event = parseJsonLdEvents(ld({ name: "Beats, Brews, & The Bridgeway Block Party", startDate: "2026-09-05", description: "Three rounds of running, music, beer, and block-party fun." }), source)[0];
  assert.equal(inferEventCategory(event), "music");
  assert.equal(VENUE_SOURCES.some((item) => item.url.includes("visitgreenvillesc.com")), false);
});

test("community hosts enter bounded global OSM and Overture discovery", () => {
  const query = overpassQuery({ latitude: 40, longitude: -105 });
  for (const tag of ["food_court", "marketplace", "community_centre", "visitor_centre", 'shop"="mall', 'office"~"^(tourism|association)']) assert.ok(query.includes(tag), tag);
  assert.ok(query.includes("out center tags 500"));
  const worker = readFileSync(new URL("../scripts/overture-place-worker.py", import.meta.url), "utf8");
  for (const category of ["food_hall", "public_market", "mixed_use", "visitor_center", "arts_district", "community_center"]) assert.ok(worker.includes(category), category);
  assert.ok(worker.includes("LIMIT 100"));
});

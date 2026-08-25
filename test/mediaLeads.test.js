import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMediaLead,
  buildPublicDiscoveryLead,
  MAX_MEDIA_BYTES,
  mediaLeadIdentity,
  parseMediaDataUrl,
  publicHttpUrl,
  publicLeadIdentity,
} from "../lib/server/mediaLeads.js";

test("validates and normalizes an operator poster lead", () => {
  const lead = buildMediaLead({
    name: "Holland Park Live Music Series",
    latitude: 34.84,
    longitude: -82.38,
    capturedAt: "2026-08-19",
    statedWeekday: "Friday",
    sourceUrl: "https://hollandparkevents.com",
  }, { now: Date.parse("2026-08-20T00:00:00Z") });
  assert.equal(lead.statedWeekday, "friday");
  assert.equal(lead.sourceUrl, "https://hollandparkevents.com/");
  assert.equal(lead.mediaLead, true);
});

test("accepts bounded image data and creates stable identity", () => {
  const parsed = parseMediaDataUrl("data:image/jpeg;base64,/9j/AA==");
  assert.equal(parsed.bytes.subarray(0, 3).toString("hex"), "ffd8ff");
  assert.deepEqual(mediaLeadIdentity(parsed.bytes, "Poster"), mediaLeadIdentity(parsed.bytes, "Poster"));
});

test("rejects unsafe media lead input", () => {
  assert.throws(() => parseMediaDataUrl("data:text/plain;base64,aGVsbG8="), /JPEG/);
  assert.throws(() => parseMediaDataUrl("data:image/jpeg;base64,aGVsbG8="), /contents/);
  const oversized = Buffer.alloc(MAX_MEDIA_BYTES + 1);
  oversized.set([0xff, 0xd8, 0xff]);
  assert.throws(() => parseMediaDataUrl(`data:image/jpeg;base64,${oversized.toString("base64")}`), /550 KB/);
  assert.throws(() => buildMediaLead({ name: "Poster", latitude: 200, longitude: 0 }), /latitude/);
  assert.throws(() => buildMediaLead({ name: "Poster", latitude: 1, longitude: 1, sourceUrl: "file:///tmp/a" }), /HTTP/);
});

test("normalizes a public event tip without requiring operator-only coordinates", () => {
  const lead = buildPublicDiscoveryLead({
    sourceUrl: "https://venue.example/events/?utm_source=social#tonight",
    name: "Late Set",
    location: "Brooklyn, NY",
    eventDate: "2026-08-28",
  }, { now: Date.parse("2026-08-24T16:00:00Z") });
  assert.equal(lead.sourceUrl, "https://venue.example/events");
  assert.equal(lead.discoveryLocation, "Brooklyn, NY");
  assert.equal(lead.publicSubmission, true);
  assert.equal(lead.reviewRequired, true);
  assert.equal(lead.requiresExtraction, false);
});

test("requires public evidence and rejects private-network event URLs", () => {
  assert.throws(() => buildPublicDiscoveryLead({}), /poster or a link/i);
  assert.throws(() => publicHttpUrl("http://127.0.0.1/events"), /public HTTP/);
  assert.throws(() => publicHttpUrl("http://[::1]/events"), /public HTTP/);
  assert.throws(() => publicHttpUrl("http://localhost/events"), /public HTTP/);
  assert.throws(() => publicHttpUrl("https://name:secret@example.com/events"), /public HTTP/);
  assert.throws(() => buildPublicDiscoveryLead({ sourceUrl: "https://venue.example", eventDate: "2026-02-30" }), /date is invalid/i);
});

test("deduplicates public poster evidence by its bytes", () => {
  const first = publicLeadIdentity({ bytes: Buffer.from("same poster"), sourceUrl: "https://one.example" });
  const second = publicLeadIdentity({ bytes: Buffer.from("same poster"), sourceUrl: "https://two.example" });
  assert.deepEqual(first, second);
  assert.equal(first.assetHash.length, 64);
});

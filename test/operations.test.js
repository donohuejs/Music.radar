import test from "node:test";
import assert from "node:assert/strict";

import handler, { loadOperationalCollection, operationalCollectionFailure } from "../api/operations.js";

function mockResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("rejects unauthenticated operations requests", async () => {
  const response = mockResponse();
  await handler({ method: "GET", headers: {} }, response);
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: "Unauthorized." });
});

test("limits the operations endpoint to reads and protected actions", async () => {
  const response = mockResponse();
  await handler({ method: "DELETE", headers: {} }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.Allow, "GET, POST");
});

test("keeps diagnostics available when one collection query fails", async () => {
  const result = await loadOperationalCollection("Sources", async () => {
    throw new Error("service unavailable");
  });

  assert.deepEqual(result, {
    documents: [],
    health: { ok: false, error: "service unavailable" },
  });
});

test("bounds a stalled diagnostics collection query", async () => {
  const result = await loadOperationalCollection(
    "Sources",
    () => new Promise(() => {}),
    { timeoutMs: 5 },
  );

  assert.deepEqual(result, {
    documents: [],
    health: { ok: false, error: "Sources timed out after 5ms." },
  });
});

test("reports exhausted Firestore quota instead of rendering false zeroes", () => {
  const collections = Array.from({ length: 8 }, () => ({
    documents: [],
    health: { ok: false, error: "Quota exceeded." },
  }));

  assert.equal(
    operationalCollectionFailure(collections),
    "Firestore quota is exhausted. Operational data will be available after the quota resets or billing capacity is increased.",
  );
});

test("allows partial operational diagnostics when at least one collection loads", () => {
  const collections = [
    { documents: [], health: { ok: false, error: "Quota exceeded." } },
    { documents: [{ id: "source-1" }], health: { ok: true, error: null } },
  ];

  assert.equal(operationalCollectionFailure(collections), null);
});

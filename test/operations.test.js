import test from "node:test";
import assert from "node:assert/strict";

import handler, { loadOperationalCollection } from "../api/operations.js";

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

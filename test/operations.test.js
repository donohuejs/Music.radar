import test from "node:test";
import assert from "node:assert/strict";

import handler from "../api/operations.js";

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

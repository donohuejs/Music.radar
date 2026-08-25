import test from "node:test";
import assert from "node:assert/strict";

import handler from "../api/feedback.js";

function response() {
  return {
    headers: {}, statusCode: null, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("only accepts POST feedback", async () => {
  const result = response();
  await handler({ method: "GET", headers: {} }, result);
  assert.equal(result.statusCode, 405);
  assert.equal(result.headers.Allow, "POST");
});

test("silently discards honeypot submissions", async () => {
  const result = response();
  await handler({ method: "POST", headers: {}, body: { website: "spam.example" } }, result);
  assert.equal(result.statusCode, 202);
  assert.deepEqual(result.body, { accepted: true });
});

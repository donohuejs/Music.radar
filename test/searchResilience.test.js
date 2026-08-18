import test from "node:test";
import assert from "node:assert/strict";
import { initializeSearchDb, settledSource } from "../api/search.js";

test("degrades gracefully when Firebase Admin cannot initialize", () => {
  const result = initializeSearchDb(() => {
    throw new Error("invalid credential");
  });

  assert.deepEqual(result, { db: null, error: "invalid credential" });
});

test("uses an empty fallback when optional search data cannot be loaded", async () => {
  const result = await settledSource("Optional data", async () => {
    throw new Error("service unavailable");
  }, []);

  assert.deepEqual(result, {
    value: [],
    health: { ok: false, error: "service unavailable" },
  });
});

test("stops waiting for an optional search dependency", async () => {
  const result = await settledSource(
    "Slow data",
    () => new Promise(() => {}),
    [],
    { timeoutMs: 5 },
  );

  assert.deepEqual(result, {
    value: [],
    health: { ok: false, error: "Slow data timed out after 5ms." },
  });
});

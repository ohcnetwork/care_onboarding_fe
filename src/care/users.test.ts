import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { ensureMembership } from "./users";

const originalFetch = globalThis.fetch;
beforeEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://clinic.local" } } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => "token" } });
});
afterEach(() => { globalThis.fetch = originalFetch; });

test("does not silently replace an existing staff role", async () => {
  globalThis.fetch = async (_url, options) => {
    assert.equal(options?.method, "GET");
    return Response.json({ count: 1, results: [{ user: { id: "user" }, role: { id: "other-role" } }] });
  };
  await assert.rejects(ensureMembership("facility", "department", "user", "doctor"), /different role/);
});

test("reconciles a successful membership write whose response was lost", async () => {
  let created = false;
  globalThis.fetch = async (_url, options) => {
    if (options?.method === "POST") {
      created = true;
      throw new TypeError("connection interrupted");
    }
    return Response.json({ count: created ? 1 : 0, results: created ? [{ user: { id: "user" }, role: { id: "doctor" } }] : [] });
  };
  assert.equal(await ensureMembership("facility", "department", "user", "doctor"), true);
});

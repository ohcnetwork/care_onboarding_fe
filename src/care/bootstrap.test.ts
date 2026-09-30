import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { prepareInstance, STATES } from "./bootstrap";
import { ROLE_ORGANIZATIONS } from "./organizations";

const originalFetch = globalThis.fetch;
beforeEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://clinic.local" } } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => "token" } });
});
afterEach(() => { globalThis.fetch = originalFetch; });

test("a failed staff-group import never proceeds to states or marks preparation complete", async () => {
  globalThis.fetch = async (url, options) => {
    if (options?.method === "GET") {
      assert.match(String(url), /org_type=role/);
      return Response.json({ count: 0, results: [] });
    }
    return Response.json({ detail: "Invalid data" }, { status: 400 });
  };
  assert.equal(await prepareInstance(() => {}, () => {}), false);
});

test("a completed geography import is idempotent across all 726 districts", async () => {
  let writes = 0;
  globalThis.fetch = async (url, options) => {
    if (options?.method !== "GET") writes++;
    const parsed = new URL(String(url));
    const offset = Number(parsed.searchParams.get("offset"));
    const limit = Number(parsed.searchParams.get("limit"));
    const rows = parsed.searchParams.get("org_type") === "role"
      ? ROLE_ORGANIZATIONS.map((name, i) => ({ name, id: `role-${i}` }))
      : parsed.searchParams.get("level_cache") === "0"
        ? STATES.map((s, i) => ({ name: s.name, id: `state-${i}` }))
        : STATES.flatMap((s, i) => s.districts.map((name) => ({ name, parent: { id: `state-${i}` } })));
    return Response.json({ count: rows.length, results: rows.slice(offset, offset + limit) });
  };
  assert.equal(await prepareInstance(() => {}, (roles) => assert.equal(Object.keys(roles).length, 7)), true);
  assert.equal(writes, 0);
});

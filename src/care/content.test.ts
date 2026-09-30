import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { ensureQuestionnaire, type QuestionnaireFixture } from "./content";

const fixture: QuestionnaireFixture = { slug: "standard-form", title: "Standard form", status: "active", subject_type: "patient", questions: [] };
const originalFetch = globalThis.fetch;
beforeEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://clinic.local" } } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => "token" } });
});
afterEach(() => { globalThis.fetch = originalFetch; });

test("repairs existing form sharing without replacing its content or removing other access", async () => {
  const writes: unknown[] = [];
  globalThis.fetch = async (url, options) => {
    if (options?.method === "POST") {
      assert.match(String(url), /standard-form\/set_organizations\/$/);
      writes.push(JSON.parse(String(options.body)));
      return Response.json({});
    }
    if (String(url).includes("get_organizations")) return Response.json({ count: 1, results: [{ id: "existing-team" }] });
    return Response.json({ id: "id", slug: fixture.slug, title: fixture.title });
  };
  assert.equal(await ensureQuestionnaire(fixture, ["clinic-team"]), "repaired");
  assert.deepEqual(writes, [{ organizations: ["existing-team", "clinic-team"] }]);
});

test("creates curated content once and leaves complete forms unchanged on retry", async () => {
  let created = false;
  let writes = 0;
  globalThis.fetch = async (url, options) => {
    if (options?.method === "POST") {
      writes++;
      const body = JSON.parse(String(options.body));
      assert.equal(body.id, undefined);
      assert.deepEqual(body.organizations, ["team"]);
      assert.equal(body.slug, fixture.slug);
      created = true;
      return Response.json({ id: "new-id", slug: fixture.slug, title: fixture.title });
    }
    if (String(url).includes("get_organizations")) return Response.json({ count: 1, results: [{ id: "team" }] });
    return created ? Response.json({ id: "new-id", slug: fixture.slug }) : Response.json({}, { status: 404 });
  };
  assert.equal(await ensureQuestionnaire({ ...fixture, id: "source-id" }, ["team"]), "created");
  assert.equal(await ensureQuestionnaire(fixture, ["team"]), "skipped");
  assert.equal(writes, 1);
});

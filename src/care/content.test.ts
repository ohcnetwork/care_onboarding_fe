import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { ensureQuestionnaire, findQuestionnaire, loadTemplates, type QuestionnaireFixture } from "./content";

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
      assert.match(String(url), /questionnaire-id\/set_organizations\/$/);
      writes.push(JSON.parse(String(options.body)));
      return Response.json({});
    }
    if (String(url).includes("get_organizations")) return Response.json({ count: 1, results: [{ id: "existing-team" }] });
    assert.match(String(url), /questionnaire\/\?slug=standard-form&auth_context=instance/);
    return Response.json({ count: 1, results: [{ id: "questionnaire-id", slug: fixture.slug, title: fixture.title }] });
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
      assert.deepEqual(body.actions, []);
      created = true;
      return Response.json({ id: "new-id", slug: fixture.slug, title: fixture.title });
    }
    if (String(url).includes("get_organizations")) return Response.json({ count: 1, results: [{ id: "team" }] });
    return Response.json({ count: created ? 1 : 0, results: created ? [{ id: "new-id", slug: fixture.slug }] : [] });
  };
  assert.equal(await ensureQuestionnaire({ ...fixture, id: "source-id" }, ["team"]), "created");
  assert.equal(await ensureQuestionnaire(fixture, ["team"]), "skipped");
  assert.equal(writes, 1);
});

test("questionnaire lookup requires an exact unique slug and propagates API errors", async () => {
  globalThis.fetch = async () => Response.json({ count: 1, results: [{ id: "other", slug: "different" }] });
  assert.equal(await findQuestionnaire(fixture.slug), null);
  globalThis.fetch = async () => Response.json({ count: 2, results: [
    { id: "one", slug: fixture.slug }, { id: "two", slug: fixture.slug },
  ] });
  await assert.rejects(findQuestionnaire(fixture.slug), /More than one/);
  globalThis.fetch = async () => Response.json({}, { status: 500 });
  await assert.rejects(findQuestionnaire(fixture.slug), /CARE could not save/);
});

test("template retries match facility-prefixed slugs without duplicating reports", async () => {
  let writes = 0;
  globalThis.fetch = async (_url, options) => {
    if (options?.method === "POST") writes++;
    return Response.json({ count: 1, results: [{
      id: "report", slug: "f-ae39e21e-0432-4988-b4fc-e4551c82fc87-treatment-summary",
    }] });
  };
  const result = await loadTemplates("clinic", () => {});
  assert.equal(result.skipped, 1);
  assert.equal(result.failed, 0);
  assert.equal(writes, 0);
});

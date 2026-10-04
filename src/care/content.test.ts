import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { CONTENT_OPTIONS, ensureQuestionnaire, findQuestionnaire, loadQuestionnaires, loadTemplates, type QuestionnaireFixture } from "./content";
import treatmentForms from "../../data_source/questionnaire_fixtures.json";
import treatmentTemplates from "../../data_source/template_fixtures.json";

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
      id: "report", slug: "f-ae39e21e-0432-4988-b4fc-e4551c82fc87-treatment-form-summary",
    }] });
  };
  const result = await loadTemplates(["treatment-form-summary"], "clinic", () => {});
  assert.equal(result.skipped, 1);
  assert.equal(result.failed, 0);
  assert.equal(writes, 0);
});

test("catalog contains only the supplied treatment form and its report", () => {
  assert.deepEqual(CONTENT_OPTIONS.questionnaires.map((q) => q.slug), ["treatment-form"]);
  assert.deepEqual(CONTENT_OPTIONS.templates.map((t) => t.slug), ["treatment-form-summary"]);
  assert.equal(treatmentForms.length, 1);
  assert.equal(treatmentForms[0].version, "0.1");
  assert.equal(treatmentForms[0].subject_type, "encounter");
  assert.equal(treatmentForms[0].questions.length, 10);
  assert.equal(treatmentTemplates.length, 1);
  assert.ok(treatmentTemplates[0].template_data.includes("Treatment Form"));
  assert.ok(!treatmentTemplates[0].template_data.includes("discharge-summary--ent"));
  assert.ok(!treatmentTemplates[0].template_data.includes("discharge-advice-and-medi"));
});

test("unselected or unavailable forms and templates cause no API calls", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected request"); };
  for (const selected of [[], ["medicine"], ["treatment-form", "medicine"]]) {
    await assert.rejects(loadQuestionnaires(selected, ["team"], () => {}), /Choose at least one/);
  }
  for (const selected of [[], ["treatment-summary"], ["treatment-form-summary", "unknown"]]) {
    await assert.rejects(loadTemplates(selected, "clinic", () => {}), /Choose at least one/);
  }
  assert.equal(calls, 0);
});

test("selected treatment form imports its original questions and shares only that form", async () => {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  let created = false;
  let sharing: string[] = [];
  globalThis.fetch = async (url, options) => {
    const path = new URL(String(url)).pathname;
    if (options?.method === "POST") {
      const body = JSON.parse(String(options.body));
      writes.push({ path, body });
      if (path.endsWith("set_organizations/")) {
        sharing = body.organizations;
        return Response.json({});
      }
      created = true;
      return Response.json({ id: "form-id", slug: "treatment-form", title: "Treatment Form" });
    }
    if (path.endsWith("get_organizations/")) return Response.json({ count: sharing.length, results: sharing.map((id) => ({ id })) });
    return Response.json({ count: created ? 1 : 0, results: created ? [{ id: "form-id", slug: "treatment-form", title: "Customized locally" }] : [] });
  };
  const result = await loadQuestionnaires(["treatment-form"], ["role", "district"], () => {});
  assert.equal(result.created, 1);
  assert.deepEqual(writes[0].body.questions, treatmentForms[0].questions);
  assert.equal(writes[0].body.version, "0.1");
  assert.deepEqual(writes[0].body.actions, []);
  assert.deepEqual(sharing, ["role", "district"]);
  const retry = await loadQuestionnaires(["treatment-form"], ["role", "district"], () => {});
  assert.equal(retry.skipped, 1);
  assert.equal(writes.length, 2);
});

test("selected report imports independently without any questionnaire writes", async () => {
  const writes: Record<string, unknown>[] = [];
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).includes("/template/"));
    if (options?.method === "POST") {
      writes.push(JSON.parse(String(options.body)));
      return Response.json({ id: "report-id", slug: "f-clinic-treatment-form-summary" });
    }
    return Response.json({ count: 0, results: [] });
  };
  assert.equal((await loadTemplates(["treatment-form-summary"], "clinic", () => {})).created, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].slug_value, "treatment-form-summary");
  assert.equal(writes[0].template_data, treatmentTemplates[0].template_data);
  assert.equal(writes[0].facility, "clinic");
});

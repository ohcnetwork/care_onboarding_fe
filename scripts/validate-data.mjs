import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = new URL("../data_source/", import.meta.url);
const read = async (file) => JSON.parse(await readFile(new URL(file, base), "utf8"));
const manifest = await read("manifest.json");
function unique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} must be unique`);
}
function nonempty(value, label) {
  assert.equal(typeof value, "string", `${label} must be text`);
  assert.ok(value.trim(), `${label} cannot be empty`);
}

const states = await read("states-and-districts.json");
assert.equal(states.length, manifest.included.states);
unique(states.map((s) => s.state.trim().toLowerCase()), "States");
let districtCount = 0;
for (const state of states) {
  nonempty(state.state, "State");
  const districts = state.districts.split(",").map((d) => d.trim()).filter(Boolean);
  unique(districts.map((d) => d.toLowerCase()), `${state.state} districts`);
  districtCount += districts.length;
}
assert.equal(districtCount, manifest.included.districts);

const questionnaires = await read("questionnaire_fixtures.json");
const contentIndex = await read("content-index.json");
assert.deepEqual(contentIndex.questionnaires.map((q) => q.slug), questionnaires.map((q) => q.slug));
assert.equal(questionnaires.length, manifest.included.questionnaires);
unique(questionnaires.map((q) => q.slug), "Questionnaire slugs");
for (const questionnaire of questionnaires) {
  nonempty(questionnaire.title, "Questionnaire title");
  nonempty(questionnaire.slug, "Questionnaire slug");
  nonempty(questionnaire.version, "Questionnaire version");
  assert.ok(["active", "draft", "retired"].includes(questionnaire.status));
  assert.ok(Array.isArray(questionnaire.questions) && questionnaire.questions.length);
  const ids = [], links = [];
  const visit = (questions) => {
    for (const question of questions) {
      nonempty(question.id, "Question ID");
      nonempty(question.link_id, "Question link ID");
      nonempty(question.type, "Question type");
      ids.push(question.id);
      links.push(question.link_id);
      if (question.questions) visit(question.questions);
    }
  };
  visit(questionnaire.questions);
  unique(ids, `${questionnaire.slug} question IDs`);
  unique(links, `${questionnaire.slug} link IDs`);
}
const templates = await read("template_fixtures.json");
assert.deepEqual(contentIndex.templates.map((t) => t.slug), templates.map((t) => t.slug_value));
assert.equal(templates.length, manifest.included.report_templates);
unique(templates.map((t) => t.slug_value), "Template slugs");
for (const template of templates) {
  for (const key of ["name", "slug_value", "template_type", "context", "default_format", "template_data"]) nonempty(template[key], key);
  assert.equal(template.template_type, "discharge_summary");
  assert.equal(template.context, "encounter_base");
  assert.ok(!template.template_data.includes("discharge-summary--ent") && !template.template_data.includes("discharge-advice-and-medi"));
}
assert.equal(questionnaires.length, 1);
assert.equal(questionnaires[0].slug, "treatment-form");
assert.equal(templates.length, 1);
assert.equal(templates[0].slug_value, "treatment-form-summary");

const index = await read("activity-definitions/index.json");
unique(index.map((c) => c.key), "Clinical category keys");
assert.deepEqual(index.map((c) => c.key).sort(), ["biochemistry", "microbiology", "pathology", "procedures", "radiology"]);
let activityCount = 0;
const slugs = [];
for (const category of index) {
  assert.deepEqual(Object.keys(category).sort(), ["count", "key", "name"], "Clinical category index must contain only current setup metadata");
  const data = await read(`activity-definitions/${category.key}.json`);
  assert.deepEqual(Object.keys(data).sort(), ["category", "items"]);
  assert.equal(data.category, category.name);
  assert.equal("needs" in category, false);
  assert.equal(data.items.length, category.count);
  activityCount += data.items.length;
  for (const item of data.items) {
    nonempty(item.title, "Activity title");
    nonempty(item.code?.system, "Activity code system");
    nonempty(item.code?.code, "Activity code");
    assert.match(item.slug_value, /^[a-z0-9][a-z0-9_-]*$/);
    assert.ok(["laboratory", "imaging", "counselling", "surgical_procedure", "education"].includes(item.classification));
    assert.ok(["active", "draft", "retired", "unknown"].includes(item.status));
    assert.deepEqual(Object.keys(item).sort(), ["title", "slug_value", "description", "usage", "status", "classification", "code"].sort(), "Standalone fixtures must contain only current clinical data");
    slugs.push(item.slug_value);
  }
}
unique(slugs, "Activity slugs");
assert.equal(activityCount, manifest.clinical_catalog.activity_definitions);
assert.equal(manifest.clinical_catalog.enabled, true);
console.log(`Validated ${states.length} states, ${districtCount} districts, ${questionnaires.length} forms, ${templates.length} report template and ${activityCount} standalone activities in ${index.length} categories.`);

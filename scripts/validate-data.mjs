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
assert.equal(questionnaires.length, manifest.included.questionnaires);
unique(questionnaires.map((q) => q.slug), "Questionnaire slugs");
for (const questionnaire of questionnaires) {
  nonempty(questionnaire.title, "Questionnaire title");
  nonempty(questionnaire.slug, "Questionnaire slug");
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
assert.equal(templates.length, manifest.included.report_templates);
unique(templates.map((t) => t.slug_value), "Template slugs");
for (const template of templates) {
  for (const key of ["name", "slug_value", "template_type", "context", "default_format", "template_data"]) nonempty(template[key], key);
}

const index = await read("activity-definitions/index.json");
let activityCount = 0;
const slugs = [];
for (const category of index) {
  const data = await read(`activity-definitions/${category.key}.json`);
  assert.equal(data.items.length, category.count);
  activityCount += data.items.length;
  for (const item of data.items) {
    nonempty(item.title, "Activity title");
    nonempty(item.code?.system, "Activity code system");
    nonempty(item.code?.code, "Activity code");
    slugs.push(item.slug_value);
  }
}
unique(slugs, "Activity slugs");
assert.equal(activityCount, manifest.clinical_catalog.activity_definitions);
assert.equal(manifest.clinical_catalog.enabled, false, "Clinical data must not be enabled before its complete import pipeline is implemented");
console.log(`Validated ${states.length} states, ${districtCount} districts, ${questionnaires.length} forms and ${templates.length} report template. Clinical source retained but not enabled.`);

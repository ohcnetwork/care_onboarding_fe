import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyProgress, nextStep, parseProgress, progressKey, STEP_IDS } from "./progress";

test("round trips checkpoints without persisting credentials", () => {
  const value = emptyProgress();
  assert.deepEqual(parseProgress(JSON.stringify(value)), value);
  assert.equal(/password|token|email|phone/.test(JSON.stringify(value)), false);
});

test("refuses invalid, incompatible and incomplete checkpoints", () => {
  for (const patch of [{ version: 1 }, { dataset: "other" }, { step: "invalid" }, { departments: [{}] }, { roleOrganizations: [] }, { step: "users", facilityId: "" }]) {
    assert.throws(() => parseProgress(JSON.stringify({ ...emptyProgress(), ...patch })));
  }
  assert.throws(() => parseProgress("broken-json"));
});

test("API instances have different progress records", () => {
  assert.notEqual(progressKey("https://one.local"), progressKey("https://two.local"));
});

test("migrates an unfinished combined content step without losing clinic progress", () => {
  const old = { ...emptyProgress(), version: 2, step: "content", facilityId: "clinic", done: { facility: true } };
  const migrated = parseProgress(JSON.stringify(old));
  assert.equal(migrated.version, 5);
  assert.equal(migrated.step, "questionnaires");
  assert.equal(migrated.facilityId, "clinic");
  assert.deepEqual(migrated.done, { facility: true });
  assert.deepEqual(parseProgress(JSON.stringify(migrated)), migrated);
});

test("clinical data migration preserves older in-progress and completed setup without forcing imports", () => {
  for (const step of ["patient-id", "questionnaires", "templates", "done"] as const) {
    const migrated = parseProgress(JSON.stringify({
      ...emptyProgress(), version: 3, step, facilityId: "clinic", done: { facility: true },
    }));
    assert.equal(migrated.version, 5);
    assert.equal(migrated.step, step);
    assert.deepEqual(migrated.clinicalCategories, []);
    assert.equal(!!migrated.skipped["clinical-data"], step !== "patient-id");
    assert.deepEqual(parseProgress(JSON.stringify(migrated)), migrated);
  }
});

test("old dataset checkpoints migrate without losing clinic or completed work and select no new content", () => {
  for (const version of [2, 3, 4]) {
    const old = { ...emptyProgress(), version, dataset: "2026-09-30", step: "done", facilityId: "clinic",
      done: version === 2 ? { content: true } : { questionnaires: true, templates: true } };
    const migrated = parseProgress(JSON.stringify(old));
    assert.equal(migrated.version, 5);
    assert.equal(migrated.dataset, "2026-10-04");
    assert.equal(migrated.step, "done");
    assert.equal(migrated.facilityId, "clinic");
    assert.deepEqual(migrated.contentSelections, { questionnaires: [], templates: [] });
    assert.equal(migrated.done.questionnaires, true);
    assert.equal(migrated.done.templates, true);
  }
});

test("content selections persist and reject unavailable, duplicate and malformed choices", () => {
  const progress = { ...emptyProgress(), contentSelections: { questionnaires: ["treatment-form"], templates: ["treatment-form-summary"] } };
  assert.deepEqual(parseProgress(JSON.stringify(progress)), progress);
  for (const contentSelections of [
    null, {}, { questionnaires: "treatment-form", templates: [] },
    { questionnaires: ["medicine"], templates: [] },
    { questionnaires: [], templates: ["treatment-summary"] },
    { questionnaires: ["treatment-form", "treatment-form"], templates: [] },
  ]) assert.throws(() => parseProgress(JSON.stringify({ ...progress, contentSelections })));
});

test("clinical category choices persist and reject unknown or duplicate categories", () => {
  const progress = { ...emptyProgress(), clinicalCategories: ["biochemistry", "radiology"] };
  assert.deepEqual(parseProgress(JSON.stringify(progress)), progress);
  for (const clinicalCategories of [["unknown"], ["pathology", "pathology"], null, [123]]) {
    assert.throws(() => parseProgress(JSON.stringify({ ...progress, clinicalCategories })));
  }
});

test("completed legacy imports mark both new content steps complete", () => {
  const migrated = parseProgress(JSON.stringify({
    ...emptyProgress(), version: 2, step: "done", facilityId: "clinic", done: { content: true },
  }));
  assert.equal(migrated.step, "done");
  assert.deepEqual(migrated.done, { questionnaires: true, templates: true });
  assert.equal("content" in migrated.done, false);
});

test("patient numbers precede invoices and numbering navigation respects older checkpoints", () => {
  assert.ok(STEP_IDS.indexOf("patient-id") < STEP_IDS.indexOf("invoice"));
  assert.equal(nextStep("users", emptyProgress()), "patient-id");
  assert.equal(nextStep("patient-id", { done: { "patient-id": true }, skipped: {} }), "invoice");
  assert.equal(nextStep("invoice", { done: { invoice: true }, skipped: {} }), "patient-id");
  assert.equal(nextStep("patient-id", { done: { invoice: true, "patient-id": true }, skipped: {} }), "clinical-data");
  assert.equal(nextStep("invoice", { done: { invoice: true }, skipped: { "patient-id": true } }), "clinical-data");
  assert.equal(nextStep("patient-id", { done: {}, skipped: { invoice: true, "patient-id": true } }), "clinical-data");
});

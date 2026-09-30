import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyProgress, parseProgress, progressKey } from "./progress";

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
  assert.equal(migrated.version, 3);
  assert.equal(migrated.step, "questionnaires");
  assert.equal(migrated.facilityId, "clinic");
  assert.deepEqual(migrated.done, { facility: true });
  assert.deepEqual(parseProgress(JSON.stringify(migrated)), migrated);
});

test("completed legacy imports mark both new content steps complete", () => {
  const migrated = parseProgress(JSON.stringify({
    ...emptyProgress(), version: 2, step: "done", facilityId: "clinic", done: { content: true },
  }));
  assert.equal(migrated.step, "done");
  assert.deepEqual(migrated.done, { questionnaires: true, templates: true });
  assert.equal("content" in migrated.done, false);
});

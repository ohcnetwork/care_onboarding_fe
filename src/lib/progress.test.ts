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

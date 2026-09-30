import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, openRequestScope } from "./api";
import { runBatch } from "./batch";

test("bounded batches count every outcome and retain failures", async () => {
  let active = 0, maximum = 0;
  const report = await runBatch([1, 2, 3, 4], String, async (n) => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    if (n === 4) throw new Error("Could not save");
    return n === 1 ? "created" : n === 2 ? "skipped" : "repaired";
  }, () => {}, 2);
  assert.equal(maximum, 2);
  assert.deepEqual([report.created, report.skipped, report.repaired, report.failed, report.done], [1, 1, 1, 1, 4]);
});

test("authentication and connection failures stop scheduling more work", async () => {
  for (const status of [0, 401, 403]) {
    let calls = 0;
    const report = await runBatch([1, 2, 3], String, async () => {
      calls++;
      throw new ApiError(status, "stopped", "POST", "/organization/");
    }, () => {}, 1);
    assert.equal(calls, 1);
    assert.equal(report.done, 1);
    assert.equal(report.failed, 1);
    assert.equal(report.total, 3);
  }
});

test("progress snapshots are independent", async () => {
  const counts: number[] = [];
  await runBatch([1, 2], String, async () => "created", (p) => counts.push(p.done), 1);
  assert.deepEqual(counts, [0, 1, 2]);
});

test("leaving the page prevents further writes in an active batch", async () => {
  const close = openRequestScope();
  let writes = 0;
  const report = await runBatch([1, 2, 3], String, async () => {
    writes++;
    close();
    return "created";
  }, () => {}, 1);
  assert.equal(writes, 1);
  assert.equal(report.created, 1);
  assert.equal(report.failed, 1);
});

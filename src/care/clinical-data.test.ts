import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { CLINICAL_CATEGORIES, importClinicalData, loadClinicalData, type ActivityFixture, type ClinicalDataset } from "./clinical-data";
import type { BatchProgress } from "@/lib/batch";

const facility = "ae39e21e-0432-4988-b4fc-e4551c82fc87";
const fixture: ActivityFixture = {
  title: "Example test", slug_value: "example-test", description: "", usage: "",
  status: "active", classification: "laboratory",
  code: { system: "http://snomed.info/sct", code: "123", display: "Example test" },
};
const dataset: ClinicalDataset = { key: "biochemistry", name: "Biochemistry", items: [fixture] };
const originalFetch = globalThis.fetch;
beforeEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://clinic.local" } } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => "token" } });
});
afterEach(() => { globalThis.fetch = originalFetch; });

function mock() {
  const categories: Record<string, unknown>[] = [];
  const activities: Record<string, unknown>[] = [];
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const reads: string[] = [];
  let failure: { resource: string; status: number; saved: boolean } | undefined;
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(String(url));
    const path = parsed.pathname;
    const category = path.endsWith("/resource_category/");
    assert.ok(category || path.endsWith("/activity_definition/"), `Unexpected supporting resource request: ${path}`);
    const records = category ? categories : activities;
    if (options?.method === "POST") {
      const body = JSON.parse(String(options.body));
      writes.push({ path, body });
      const record = { ...body, slug: `f-${facility}-${body.slug_value}` };
      const rejected = failure && path.endsWith(`/${failure.resource}/`);
      if (!rejected || failure?.saved) records.push(record);
      if (rejected) {
        const status = failure!.status;
        failure = undefined;
        return Response.json({ detail: "Rejected" }, { status });
      }
      return Response.json(record);
    }
    reads.push(String(url));
    const offset = Number(parsed.searchParams.get("offset"));
    const limit = Number(parsed.searchParams.get("limit"));
    return Response.json({ count: records.length, results: records.slice(offset, offset + limit) });
  };
  return { categories, activities, writes, reads, rejectNext: (resource: string, status = 400, saved = false) => { failure = { resource, status, saved }; } };
}

test("creates categories first and sends only standalone activities; retry keeps existing customization", async () => {
  const { writes, activities } = mock();
  const reports: string[] = [];
  assert.equal(await importClinicalData(facility, [dataset], (title) => reports.push(title)), true);
  assert.deepEqual(writes[0].body, {
    title: "Biochemistry", slug_value: "clinical-biochemistry", description: "",
    resource_type: "activity_definition", resource_sub_type: "all:other", parent: null, is_child: false,
  });
  assert.deepEqual(writes[1].body, {
    title: fixture.title, slug_value: fixture.slug_value, description: "", usage: "",
    status: "active", classification: "laboratory", kind: "service_request", code: fixture.code,
    category: `f-${facility}-clinical-biochemistry`, body_site: null, diagnostic_report_codes: [],
    derived_from_uri: null, locations: [], specimen_requirements: [], observation_result_requirements: [],
    healthcare_service: null, charge_item_definitions: [],
  });
  assert.ok(reports.indexOf("Categories") < reports.indexOf("Biochemistry"));
  activities[0].title = "Locally customized name";
  assert.equal(await importClinicalData(facility, [dataset], () => {}), true);
  assert.equal(writes.length, 2);
  assert.equal(activities[0].title, "Locally customized name");
});

test("reuses an unambiguous existing activity category, not a charge category with the same name", async () => {
  const { categories, writes } = mock();
  categories.push(
    { title: "Biochemistry", slug: `f-${facility}-charges`, resource_type: "charge_item_definition", resource_sub_type: "all:other", is_child: false },
    { title: " biochemistry ", slug: `f-${facility}-existing-labs`, resource_type: "activity_definition", resource_sub_type: "all:other", is_child: false },
  );
  assert.equal(await importClinicalData(facility, [dataset], () => {}), true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.category, `f-${facility}-existing-labs`);
});

test("category collisions and ambiguous names prevent all definition writes", async () => {
  for (const collision of ["wrong-type", "renamed", "ambiguous", "child"]) {
    const { categories, writes } = mock();
    const category = {
      title: collision === "renamed" ? "Other category" : dataset.name,
      slug: `f-${facility}-clinical-biochemistry`, resource_type: collision === "wrong-type" ? "charge_item_definition" : "activity_definition",
      resource_sub_type: "all:other", is_child: collision === "child",
    };
    categories.push(category);
    if (collision === "ambiguous") {
      category.slug = `f-${facility}-one`;
      categories.push({ ...category, slug: `f-${facility}-two` });
    }
    let report: BatchProgress | undefined;
    assert.equal(await importClinicalData(facility, [dataset], (_title, progress) => { report = progress; }), false);
    assert.equal(report?.failed, 1);
    assert.equal(writes.length, 0);
  }
});

test("failed category writes prevent activities and a lost successful response is recovered on retry", async () => {
  const { writes, rejectNext } = mock();
  rejectNext("resource_category", 502, true);
  assert.equal(await importClinicalData(facility, [dataset], () => {}), false);
  assert.equal(writes.length, 1);
  assert.equal(await importClinicalData(facility, [dataset], () => {}), true);
  assert.equal(writes.filter((w) => w.path.endsWith("/resource_category/")).length, 1);
  assert.equal(writes.filter((w) => w.path.endsWith("/activity_definition/")).length, 1);
});

test("reads all existing activity pages and matches exact slugs case-insensitively, never fuzzy titles", async () => {
  const { activities, reads, writes } = mock();
  for (let i = 0; i < 105; i++) activities.push({ slug: `f-${facility}-unrelated-${i}`, title: fixture.title });
  activities.push({ slug: `f-${facility}-${fixture.slug_value}`.toUpperCase() });
  assert.equal(await importClinicalData(facility, [dataset], () => {}), true);
  assert.ok(reads.some((url) => url.includes("activity_definition/") && url.includes("offset=100")));
  assert.equal(writes.length, 1);
});

test("partial imports retry only missing entries and permission failures stop later categories", async () => {
  const { writes, rejectNext } = mock();
  const second = { ...fixture, title: "Second", slug_value: "second" };
  const first = { ...dataset, items: [fixture, second] };
  const later = { ...dataset, key: "pathology", name: "Pathology", items: [{ ...fixture, slug_value: "later" }] };
  rejectNext("activity_definition", 403);
  assert.equal(await importClinicalData(facility, [first, later], () => {}), false);
  assert.equal(writes.some((w) => w.body.slug_value === "later"), false);
  assert.equal(await importClinicalData(facility, [first, later], () => {}), true);
  assert.equal(writes.filter((w) => w.body.slug_value === "second").length, 1);
  assert.equal(writes.filter((w) => w.body.slug_value === "example-test").length, 2);
});

test("only selected bundled categories load and invalid selections make no requests", async () => {
  const { writes } = mock();
  for (const selected of [[], ["unknown"], ["biochemistry", "unknown"]]) {
    await assert.rejects(loadClinicalData(facility, selected, () => {}), /Choose at least one/);
  }
  assert.equal(writes.length, 0);
  assert.equal(await loadClinicalData(facility, ["biochemistry"], () => {}), true);
  assert.equal(writes.filter((w) => w.path.endsWith("/resource_category/")).length, 1);
  assert.equal(writes.filter((w) => w.path.endsWith("/activity_definition/")).length, 29);
});

test("malformed category and activity lists report an error instead of blind writes", async () => {
  for (const resource of ["resource_category", "activity_definition"]) {
    const { categories, activities, writes } = mock();
    if (resource === "resource_category") categories.push({ title: "Invalid" });
    else activities.push({ title: "Invalid" });
    await assert.rejects(importClinicalData(facility, [dataset], () => {}), /unexpected/);
    assert.equal(writes.filter((w) => w.path.endsWith("/activity_definition/")).length, 0);
  }
});

test("all bundled categories import exactly 2023 activities and five categories without supporting writes", async () => {
  const { writes } = mock();
  assert.equal(await loadClinicalData(facility, CLINICAL_CATEGORIES.map((c) => c.key), () => {}), true);
  assert.equal(writes.filter((w) => w.path.endsWith("/resource_category/")).length, 5);
  assert.equal(writes.filter((w) => w.path.endsWith("/activity_definition/")).length, 2023);
});

import categoryIndex from "../../data_source/activity-definitions/index.json";
import { api, listAll } from "@/lib/api";
import { runBatch, type BatchProgress } from "@/lib/batch";
import { sameName } from "@/care/organizations";

export const CLINICAL_CATEGORIES = categoryIndex;
export type ActivityFixture = {
  title: string;
  slug_value: string;
  description: string;
  usage: string;
  status: string;
  classification: string;
  code: { system: string; code: string; display: string };
};
export type ClinicalDataset = { key: string; name: string; items: ActivityFixture[] };
type Category = {
  slug: string;
  title: string;
  resource_type: string;
  resource_sub_type: string;
  is_child: boolean;
};

const loaders: Record<string, () => Promise<{ default: { category: string; items: ActivityFixture[] } }>> = {
  biochemistry: () => import("../../data_source/activity-definitions/biochemistry.json"),
  microbiology: () => import("../../data_source/activity-definitions/microbiology.json"),
  pathology: () => import("../../data_source/activity-definitions/pathology.json"),
  procedures: () => import("../../data_source/activity-definitions/procedures.json"),
  radiology: () => import("../../data_source/activity-definitions/radiology.json"),
};
const fullSlug = (facilityId: string, value: string) => `f-${facilityId}-${value}`.toLowerCase();

export function activityPayload(item: ActivityFixture, category: string) {
  return {
    title: item.title, slug_value: item.slug_value, description: item.description, usage: item.usage,
    status: item.status, classification: item.classification, kind: "service_request", code: item.code,
    category, body_site: null, diagnostic_report_codes: [], derived_from_uri: null,
    locations: [], specimen_requirements: [], observation_result_requirements: [],
    healthcare_service: null, charge_item_definitions: [],
  };
}

export async function importClinicalData(
  facilityId: string,
  datasets: ClinicalDataset[],
  onProgress: (title: string, progress: BatchProgress) => void,
): Promise<boolean> {
  if (!facilityId || !datasets.length) throw new Error("Choose at least one clinical data category for your clinic.");
  const base = `/facility/${encodeURIComponent(facilityId)}`;
  const existingCategories = await listAll<Category>(`${base}/resource_category/`);
  if (existingCategories.some((c) => typeof c.slug !== "string" || typeof c.title !== "string")) {
    throw new Error("CARE returned an unexpected category list. Ask your administrator for help.");
  }
  const categories = new Map<string, string>();
  const categoryReport = await runBatch(datasets, (d) => d.name, async (dataset) => {
    const slugValue = `clinical-${dataset.key}`;
    const expectedSlug = fullSlug(facilityId, slugValue);
    const exact = existingCategories.filter((c) => c.slug.toLowerCase() === expectedSlug);
    if (exact.length > 1 || exact.some((c) => c.resource_type !== "activity_definition" || c.resource_sub_type !== "all:other" || c.is_child || !sameName(c.title, dataset.name))) {
      throw new Error(`${dataset.name} conflicts with an existing category. Ask your administrator to review it in CARE settings.`);
    }
    const matches = exact.length ? exact : existingCategories.filter((c) =>
      sameName(c.title, dataset.name) && c.resource_type === "activity_definition" &&
      c.resource_sub_type === "all:other" && c.is_child === false,
    );
    if (matches.length > 1) throw new Error(`More than one ${dataset.name} category exists. Ask your administrator to review it in CARE settings.`);
    const category = matches[0] ?? await api.post<Category>(`${base}/resource_category/`, {
      title: dataset.name, slug_value: slugValue, description: "",
      resource_type: "activity_definition", resource_sub_type: "all:other", parent: null, is_child: false,
    });
    if (typeof category.slug !== "string" || !category.slug.toLowerCase().startsWith(`f-${facilityId}-`.toLowerCase())) {
      throw new Error("CARE did not confirm the new category. Try again to check what was saved.");
    }
    categories.set(dataset.key, category.slug);
    return matches.length ? "skipped" : "created";
  }, (report) => onProgress("Categories", report), 1);
  if (categoryReport.failed || categoryReport.done !== categoryReport.total) return false;

  const existing = await listAll<{ slug: string }>(`${base}/activity_definition/`);
  if (existing.some((item) => typeof item.slug !== "string")) {
    throw new Error("CARE returned an unexpected clinical data list. Ask your administrator for help.");
  }
  const present = new Set(existing.map((item) => item.slug.toLowerCase()));
  for (const dataset of datasets) {
    const category = categories.get(dataset.key);
    if (!category) throw new Error("A clinical data category is missing. Try again.");
    const result = await runBatch(dataset.items, (item) => item.title, async (item) => {
      const slug = fullSlug(facilityId, item.slug_value);
      if (present.has(slug)) return "skipped";
      await api.post(`${base}/activity_definition/`, activityPayload(item, category));
      present.add(slug);
      return "created";
    }, (report) => onProgress(dataset.name, report), 2);
    if (result.failed || result.done !== result.total) return false;
  }
  return true;
}

export async function loadClinicalData(
  facilityId: string,
  selected: string[],
  onProgress: (title: string, progress: BatchProgress) => void,
): Promise<boolean> {
  if (!selected.length || selected.some((key) => !CLINICAL_CATEGORIES.some((c) => c.key === key))) {
    throw new Error("Choose at least one of the listed clinical data categories.");
  }
  const datasets = await Promise.all(CLINICAL_CATEGORIES.filter((c) => selected.includes(c.key)).map(async (category) => {
    const { default: data } = await loaders[category.key]();
    return { key: category.key, name: category.name, items: data.items };
  }));
  return importClinicalData(facilityId, datasets, onProgress);
}

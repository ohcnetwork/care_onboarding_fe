import contentIndex from "../../data_source/content-index.json" with { type: "json" };

export const DATA_VERSION = "2026-10-04";
export const CLINICAL_CATEGORY_KEYS = ["biochemistry", "microbiology", "pathology", "procedures", "radiology"] as const;
export const STEP_IDS = ["states", "district", "facility", "departments", "users", "patient-id", "invoice", "clinical-data", "questionnaires", "templates", "done"] as const;
export type StepId = typeof STEP_IDS[number];
export type Department = { name: string; organizationId: string; locationId: string };
export type Progress = {
  version: 5;
  dataset: string;
  step: StepId;
  done: Partial<Record<StepId, boolean>>;
  skipped: Partial<Record<StepId, boolean>>;
  stateId: string;
  stateName: string;
  districtId: string;
  districtName: string;
  facilityId: string;
  facilityName: string;
  initials: string;
  administrationId: string;
  roleOrganizations: Record<string, string>;
  departments: Department[];
  users: string[];
  facilityIntent: { name: string; districtId: string } | null;
  clinicalCategories: string[];
  contentSelections: { questionnaires: string[]; templates: string[] };
};

export function emptyProgress(): Progress {
  return {
    version: 5, dataset: DATA_VERSION, step: "states", done: {}, skipped: {},
    stateId: "", stateName: "", districtId: "", districtName: "",
    facilityId: "", facilityName: "", initials: "", administrationId: "",
    roleOrganizations: {}, departments: [], users: [], facilityIntent: null, clinicalCategories: [],
    contentSelections: { questionnaires: [], templates: [] },
  };
}

export function nextStep(step: StepId, progress: Pick<Progress, "done" | "skipped">): StepId {
  if (["clinical-data", "questionnaires"].includes(step) && (progress.done.templates || progress.skipped.templates)) return "done";
  if (step === "patient-id" || step === "invoice") {
    // Older checkpoints can reach numbering in the previous order.
    const pending = (["patient-id", "invoice"] as const).find((id) => !progress.done[id] && !progress.skipped[id]);
    return pending ?? "clinical-data";
  }
  return STEP_IDS[Math.min(STEP_IDS.indexOf(step) + 1, STEP_IDS.length - 1)];
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function parseProgress(raw: string | null): Progress {
  if (!raw) return emptyProgress();
  const value: unknown = JSON.parse(raw);
  const invalid = () => new Error("Saved setup progress could not be read. Please contact your administrator; no clinic data has been changed.");
  if (!record(value) || ![2, 3, 4, 5].includes(value.version as number) ||
    !(value.dataset === DATA_VERSION || (value.version !== 5 && value.dataset === "2026-09-30"))) throw invalid();
  const legacySteps = STEP_IDS.filter((step) => step !== "clinical-data");
  const allowedSteps: readonly string[] = value.version === 2
    ? [...legacySteps.filter((step) => step !== "questionnaires" && step !== "templates"), "content"]
    : value.version === 3 ? legacySteps : STEP_IDS;
  if (typeof value.step !== "string" || !allowedSteps.includes(value.step)) throw invalid();
  for (const key of ["stateId", "stateName", "districtId", "districtName", "facilityId", "facilityName", "initials", "administrationId"]) {
    if (typeof value[key] !== "string") throw invalid();
  }
  for (const key of ["done", "skipped"]) {
    if (!record(value[key]) || Object.entries(value[key]).some(([step, done]) => !allowedSteps.includes(step) || typeof done !== "boolean")) throw invalid();
  }
  if (!record(value.roleOrganizations) || Object.values(value.roleOrganizations).some((id) => typeof id !== "string")) throw invalid();
  if (!Array.isArray(value.users) || value.users.some((id) => typeof id !== "string")) throw invalid();
  if (!Array.isArray(value.departments) || value.departments.some((d) =>
    !record(d) || ["name", "organizationId", "locationId"].some((key) => typeof d[key] !== "string"))) throw invalid();
  if (value.facilityIntent !== null && (!record(value.facilityIntent) || typeof value.facilityIntent.name !== "string" || typeof value.facilityIntent.districtId !== "string")) throw invalid();
  if (!["states", "district", "facility"].includes(value.step as string) && !value.facilityId) throw invalid();
  if ((value.version === 4 || value.version === 5) && (!Array.isArray(value.clinicalCategories) ||
    value.clinicalCategories.some((key) => typeof key !== "string" || !(CLINICAL_CATEGORY_KEYS as readonly string[]).includes(key)) ||
    new Set(value.clinicalCategories).size !== value.clinicalCategories.length)) throw invalid();
  const selections: Progress["contentSelections"] = { questionnaires: [], templates: [] };
  if (value.version === 5) {
    if (!record(value.contentSelections)) throw invalid();
    for (const kind of ["questionnaires", "templates"] as const) {
      const selected = value.contentSelections[kind];
      if (!Array.isArray(selected) || selected.some((slug) => typeof slug !== "string" || !contentIndex[kind].some((item) => item.slug === slug)) ||
        new Set(selected).size !== selected.length) throw invalid();
      selections[kind] = selected;
    }
  }
  const parsed: Progress = {
    ...emptyProgress(),
    version: 5, dataset: DATA_VERSION, step: value.step as StepId,
    stateId: value.stateId as string, stateName: value.stateName as string,
    districtId: value.districtId as string, districtName: value.districtName as string,
    facilityId: value.facilityId as string, facilityName: value.facilityName as string,
    initials: value.initials as string, administrationId: value.administrationId as string,
    done: value.done as Progress["done"], skipped: value.skipped as Progress["skipped"],
    roleOrganizations: value.roleOrganizations as Progress["roleOrganizations"],
    departments: value.departments as Department[], users: value.users as string[],
    facilityIntent: value.facilityIntent as Progress["facilityIntent"],
    clinicalCategories: value.version === 4 || value.version === 5 ? value.clinicalCategories as string[] : [],
    contentSelections: selections,
  };
  if (value.version === 2) {
    const { content: completed, ...done } = value.done as Record<string, boolean>;
    const { content: _skipped, ...skipped } = value.skipped as Record<string, boolean>;
    return {
      ...parsed,
      step: value.step === "content" ? "questionnaires" : parsed.step,
      done: completed || value.step === "done" ? { ...done, questionnaires: true, templates: true } : done,
      skipped: ["content", "done"].includes(value.step) ? { ...skipped, "clinical-data": true } : skipped,
      clinicalCategories: [],
    };
  }
  if (value.version === 3) return {
    ...parsed,
    skipped: ["questionnaires", "templates", "done"].includes(value.step)
      ? { ...parsed.skipped, "clinical-data": true } : parsed.skipped,
  };
  return parsed;
}

export function progressKey(base: string): string {
  return `care_onboarding_fe:${base}:progress`;
}

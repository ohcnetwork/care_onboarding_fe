export const DATA_VERSION = "2026-09-30";
export const STEP_IDS = ["states", "district", "facility", "departments", "users", "invoice", "patient-id", "questionnaires", "templates", "done"] as const;
export type StepId = typeof STEP_IDS[number];
export type Department = { name: string; organizationId: string; locationId: string };
export type Progress = {
  version: 3;
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
};

export function emptyProgress(): Progress {
  return {
    version: 3, dataset: DATA_VERSION, step: "states", done: {}, skipped: {},
    stateId: "", stateName: "", districtId: "", districtName: "",
    facilityId: "", facilityName: "", initials: "", administrationId: "",
    roleOrganizations: {}, departments: [], users: [], facilityIntent: null,
  };
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function parseProgress(raw: string | null): Progress {
  if (!raw) return emptyProgress();
  const value: unknown = JSON.parse(raw);
  const invalid = () => new Error("Saved setup progress could not be read. Please contact your administrator; no clinic data has been changed.");
  if (!record(value) || ![2, 3].includes(value.version as number) || value.dataset !== DATA_VERSION) throw invalid();
  const allowedSteps: readonly string[] = value.version === 2
    ? [...STEP_IDS.filter((step) => step !== "questionnaires" && step !== "templates"), "content"]
    : STEP_IDS;
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
  if (value.version === 2) {
    const { content: completed, ...done } = value.done as Record<string, boolean>;
    const { content: _skipped, ...skipped } = value.skipped as Record<string, boolean>;
    return {
      ...value,
      version: 3,
      step: value.step === "content" ? "questionnaires" : value.step,
      done: completed || value.step === "done" ? { ...done, questionnaires: true, templates: true } : done,
      skipped,
    } as Progress;
  }
  return value as Progress;
}

export function progressKey(base: string): string {
  return `care_onboarding_fe:${base}:progress`;
}

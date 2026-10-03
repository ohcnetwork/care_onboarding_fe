import statesData from "../../data_source/states-and-districts.json";
import { runBatch, type BatchProgress } from "@/lib/batch";
import { createDistrict, createRoleOrganization, createState, listAllDistricts, listRoleOrganizations, listStates, ROLE_ORGANIZATIONS, sameName } from "./organizations";

export const STATES = statesData.map((s) => ({
  name: s.state.trim(),
  districts: s.districts.split(",").map((d) => d.trim()).filter(Boolean),
}));
const key = (parent: string, name: string) => `${parent}::${name.trim().toLowerCase()}`;

export async function prepareInstance(
  onProgress: (title: string, progress: BatchProgress) => void,
  saveRoles: (ids: Record<string, string>) => void,
): Promise<boolean> {
  const roles = await listRoleOrganizations();
  const roleIds: Record<string, string> = {};
  const roleReport = await runBatch(ROLE_ORGANIZATIONS, (name) => name, async (name) => {
    const existing = roles.find((org) => sameName(org.name, name));
    roleIds[name] = (existing ?? await createRoleOrganization(name)).id;
    return existing ? "skipped" : "created";
  }, (p) => onProgress("Roles", p), 2);
  saveRoles(roleIds);
  if (roleReport.failed) return false;

  const states = await listStates();
  const stateIds = new Map(states.map((s) => [s.name.trim().toLowerCase(), s.id]));
  const stateReport = await runBatch(STATES, (s) => s.name, async (state) => {
    if (stateIds.has(state.name.toLowerCase())) return "skipped";
    stateIds.set(state.name.toLowerCase(), (await createState(state.name)).id);
    return "created";
  }, (p) => onProgress("States and union territories", p), 2);
  if (stateReport.failed) return false;

  const districts = await listAllDistricts();
  const districtKeys = new Set(districts.map((d) => key(d.parent?.id ?? "", d.name)));
  const report = await runBatch(
    STATES.flatMap((s) => s.districts.map((name) => ({ stateId: stateIds.get(s.name.toLowerCase())!, name }))),
    (d) => d.name,
    async (district) => {
      if (districtKeys.has(key(district.stateId, district.name))) return "skipped";
      await createDistrict(district.stateId, district.name);
      return "created";
    },
    (p) => onProgress("Districts", p),
    3,
  );
  return report.failed === 0;
}

import { api, ApiError, listAll } from "@/lib/api";
import type { Outcome, BatchProgress } from "@/lib/batch";
import { runBatch } from "@/lib/batch";

export type QuestionnaireFixture = {
  id?: string;
  slug: string;
  title: string;
  description?: string;
  version?: string;
  status: string;
  subject_type: string;
  styling_metadata?: Record<string, unknown>;
  questions: unknown[];
};

export type TemplateFixture = {
  name: string;
  slug_value: string;
  description?: string;
  template_type: string;
  context: string;
  default_format: string;
  status: string;
  template_data: string;
  options?: Record<string, unknown>;
};

export type Questionnaire = { id: string; slug: string; title: string };
export type Template = { id: string; slug: string; name: string };

export async function findQuestionnaire(slug: string): Promise<Questionnaire | null> {
  try {
    return await api.get<Questionnaire>(`/questionnaire/${encodeURIComponent(slug)}/`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function createQuestionnaire(
  fixture: QuestionnaireFixture,
  organizations: string[],
): Promise<Questionnaire> {
  const { id: _id, ...body } = fixture;
  const created = await api.post<Questionnaire>("/questionnaire/", {
    ...body,
    auth_context: "instance",
    organizations,
  });
  return created;
}

export async function ensureQuestionnaire(fixture: QuestionnaireFixture, organizations: string[]): Promise<Outcome> {
  const found = await findQuestionnaire(fixture.slug);
  const questionnaire = found ?? await createQuestionnaire(fixture, organizations);
  const path = `/questionnaire/${encodeURIComponent(questionnaire.slug)}`;
  const existing = await listAll<{ id: string }>(`${path}/get_organizations/`);
  const linked = new Set(existing.map((org) => org.id));
  const missing = organizations.filter((id) => !linked.has(id));
  if (missing.length) {
    await api.post(`${path}/set_organizations/`, { organizations: [...new Set([...linked, ...missing])] });
  }
  return !found ? "created" : missing.length ? "repaired" : "skipped";
}

export function listTemplates(facilityId: string): Promise<Template[]> {
  return listAll<Template>(`/template/?facility=${facilityId}`);
}

export function createTemplate(fixture: TemplateFixture, facilityId: string): Promise<Template> {
  return api.post<Template>("/template/", { ...fixture, options: fixture.options ?? {}, facility: facilityId });
}

export async function loadStandardContent(
  facilityId: string,
  organizations: string[],
  onProgress: (title: string, progress: BatchProgress) => void,
): Promise<boolean> {
  if (!facilityId || organizations.length === 0) throw new Error("Clinic setup is missing required information. Please contact your administrator.");
  const [{ default: questionnaires }, { default: templates }] = await Promise.all([
    import("../../data_source/questionnaire_fixtures.json"),
    import("../../data_source/template_fixtures.json"),
  ]);
  const report = await runBatch(
    questionnaires,
    (q) => q.title,
    (q) => ensureQuestionnaire(q, organizations),
    (p) => onProgress("Standard forms", p),
    2,
  );
  if (report.failed) return false;
  const existing = await listTemplates(facilityId);
  const present = new Set(existing.map((t) => t.slug.replace(/^(f-[0-9a-f-]{36}-|i-)/, "")));
  const templateReport = await runBatch(templates, (t) => t.name, async (template) => {
    if (present.has(template.slug_value)) return "skipped";
    await createTemplate(template, facilityId);
    return "created";
  }, (p) => onProgress("Report template", p), 1);
  return templateReport.failed === 0;
}

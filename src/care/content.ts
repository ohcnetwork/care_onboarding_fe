import { api, listAll } from "@/lib/api";
import type { Outcome, BatchProgress } from "@/lib/batch";
import { runBatch } from "@/lib/batch";
import contentIndex from "../../data_source/content-index.json" with { type: "json" };

export const CONTENT_OPTIONS = contentIndex;
export type ContentKind = keyof typeof CONTENT_OPTIONS;

function checkSelection(kind: ContentKind, selected: string[]) {
  if (!selected.length || selected.some((slug) => !CONTENT_OPTIONS[kind].some((item) => item.slug === slug))) {
    throw new Error("Choose at least one of the listed items, or do this later.");
  }
}

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
  actions?: Record<string, unknown>[];
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
  const questionnaires = await listAll<Questionnaire>(
    `/questionnaire/?slug=${encodeURIComponent(slug)}&auth_context=instance`,
  );
  const matches = questionnaires.filter((q) => q.slug === slug);
  if (matches.length > 1) throw new Error("More than one clinical form has the same name. Ask your administrator to review it in CARE.");
  return matches[0] ?? null;
}

export async function createQuestionnaire(
  fixture: QuestionnaireFixture,
  organizations: string[],
): Promise<Questionnaire> {
  const { id: _id, ...body } = fixture;
  const created = await api.post<Questionnaire>("/questionnaire/", {
    ...body,
    auth_context: "instance",
    actions: fixture.actions ?? [],
    organizations,
  });
  return created;
}

export async function ensureQuestionnaire(fixture: QuestionnaireFixture, organizations: string[]): Promise<Outcome> {
  const found = await findQuestionnaire(fixture.slug);
  const questionnaire = found ?? await createQuestionnaire(fixture, organizations);
  const path = `/questionnaire/${encodeURIComponent(questionnaire.id)}`;
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

export async function loadQuestionnaires(
  selected: string[],
  organizations: string[],
  onProgress: (progress: BatchProgress) => void,
): Promise<BatchProgress> {
  checkSelection("questionnaires", selected);
  if (organizations.length === 0) throw new Error("Clinic setup is missing required information. Please contact your administrator.");
  const { default: questionnaires } = await import("../../data_source/questionnaire_fixtures.json");
  return runBatch(
    questionnaires.filter((q) => selected.includes(q.slug)),
    (q) => q.title,
    (q) => ensureQuestionnaire(q, organizations),
    onProgress,
    2,
  );
}

export async function loadTemplates(
  selected: string[],
  facilityId: string,
  onProgress: (progress: BatchProgress) => void,
): Promise<BatchProgress> {
  checkSelection("templates", selected);
  if (!facilityId) throw new Error("Clinic setup is missing required information. Please contact your administrator.");
  const { default: templates } = await import("../../data_source/template_fixtures.json");
  const existing = await listTemplates(facilityId);
  const present = new Set(existing.map((t) => t.slug.replace(/^(f-[0-9a-f-]{36}-|i-)/, "")));
  return runBatch(templates.filter((t) => selected.includes(t.slug_value)), (t) => t.name, async (template) => {
    if (present.has(template.slug_value)) return "skipped";
    await createTemplate(template, facilityId);
    present.add(template.slug_value);
    return "created";
  }, onProgress, 1);
}

import { readFile, writeFile } from "node:fs/promises";

const data = new URL("../data_source/", import.meta.url);
const form = JSON.parse(await readFile(new URL("content/treatment-form.json", data), "utf8"));
const questionnaires = [{ ...form, version: String(form.version) }];
const templates = [{
  name: "Treatment Summary",
  slug_value: "treatment-form-summary",
  template_type: "discharge_summary",
  context: "encounter_base",
  default_format: "pdf",
  status: "active",
  description: "Print patient details, Treatment Form answers and diagnostic reports.",
  template_data: await readFile(new URL("content/treatment-summary.html", data), "utf8"),
}];
const index = {
  questionnaires: questionnaires.map((q) => ({ slug: q.slug, title: q.title, description: "Record treatment, discharge medication and follow-up advice." })),
  templates: templates.map((t) => ({ slug: t.slug_value, title: t.name, description: t.description })),
};
for (const [file, contents] of [
  ["questionnaire_fixtures.json", questionnaires],
  ["template_fixtures.json", templates],
  ["content-index.json", index],
]) {
  await writeFile(new URL(file, data), JSON.stringify(contents, null, 2) + "\n");
}
console.log(`Generated ${questionnaires.length} treatment form and ${templates.length} treatment report template.`);

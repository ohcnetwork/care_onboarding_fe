import { readFile, writeFile } from "node:fs/promises";

const data = new URL("../data_source/", import.meta.url);
const forms = [
  ["treatment-form.json", "Record treatment, discharge medication and follow-up advice."],
  ["paediatricians-form.json", "Record a paediatric consultation: complaints, examination, diagnosis and medicines."],
  ["paediatric-ip-case-sheet.json", "Record a paediatric inpatient case sheet: history, examination, investigations and nutrition."],
];
const questionnaires = [];
const summaries = {};
for (const [file, summary] of forms) {
  const form = JSON.parse(await readFile(new URL(`content/${file}`, data), "utf8"));
  questionnaires.push({ ...form, version: String(form.version) });
  summaries[form.slug] = summary;
}
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
  questionnaires: questionnaires.map((q) => ({ slug: q.slug, title: q.title, description: summaries[q.slug] })),
  templates: templates.map((t) => ({ slug: t.slug_value, title: t.name, description: t.description })),
};
for (const [file, contents] of [
  ["questionnaire_fixtures.json", questionnaires],
  ["template_fixtures.json", templates],
  ["content-index.json", index],
]) {
  await writeFile(new URL(file, data), JSON.stringify(contents, null, 2) + "\n");
}
console.log(`Generated ${questionnaires.length} forms and ${templates.length} treatment report template.`);

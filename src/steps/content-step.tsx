import { useState } from "react";
import { CONTENT_OPTIONS, loadQuestionnaires, loadTemplates, type ContentKind } from "@/care/content";
import { listRoleOrganizations, ROLE_ORGANIZATIONS, sameName } from "@/care/organizations";
import { BatchPanel } from "@/components/batch-panel";
import { Screen, ScreenBody, ScreenHead } from "@/components/screen";
import { StepFoot } from "@/components/step-foot";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import type { BatchProgress } from "@/lib/batch";
import { errorText } from "@/lib/format";
import { useWizard } from "@/state/wizard";

export function ContentStep({ kind }: { kind: ContentKind }) {
  const { progress, complete, skip, update } = useWizard();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [report, setReport] = useState<BatchProgress | null>(null);
  const questionnaires = kind === "questionnaires";
  const title = questionnaires ? "Clinical forms" : "Report templates";
  const selected = progress.contentSelections[kind];
  const run = async () => {
    setBusy(true);
    setProblem("");
    try {
      let result: BatchProgress;
      if (questionnaires) {
        const roles = await listRoleOrganizations();
        const ids = ROLE_ORGANIZATIONS.map((name) => {
          const role = roles.find((r) => sameName(r.name, name));
          if (!role) throw new Error("A required role is missing. Ask your administrator for help.");
          return role.id;
        });
        result = await loadQuestionnaires(selected, [...new Set([...ids, progress.districtId].filter(Boolean))], setReport);
      } else {
        result = await loadTemplates(selected, progress.facilityId, setReport);
      }
      if (result.failed === 0 && result.done === result.total) complete(kind);
    } catch (error) { setProblem(errorText(error)); }
    finally { setBusy(false); }
  };
  return <Screen>
    <ScreenHead title={title} subtitle={questionnaires
      ? "Choose the forms your clinic needs."
      : "Choose the layouts you want for printed patient reports."} />
    <ScreenBody disabled={busy}>
      <div className="max-w-2xl space-y-4">
        <fieldset disabled={busy} className="space-y-3">
          <legend className="mb-3 text-sm font-semibold">{questionnaires ? "Choose forms" : "Choose report templates"}</legend>
          {CONTENT_OPTIONS[kind].map((item) => <label key={item.slug}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-4 has-[:disabled]:cursor-default">
            <Checkbox className="mt-1" checked={selected.includes(item.slug)} aria-label={item.title}
              onCheckedChange={(checked) => {
                try {
                  update({ contentSelections: { ...progress.contentSelections, [kind]: checked === true ? [...selected, item.slug] : selected.filter((slug) => slug !== item.slug) } });
                  setProblem("");
                  setReport(null);
                } catch (error) { setProblem(errorText(error)); }
              }} />
            <span className="min-w-0">
              <span className="block font-medium">{item.title}</span>
              <span className="mt-1 block text-sm text-gray-600">{item.description}</span>
            </span>
          </label>)}
        </fieldset>
        <p role="status" className="text-sm text-gray-600">{selected.length ? `${selected.length} ${selected.length === 1 ? "item" : "items"} selected` : "Select what you need, or do this later."}</p>
        <Alert>{questionnaires ? "Only checked forms will be added. Anything already added will be kept." : "Only checked templates will be added. Treatment Summary shows answers recorded in Treatment Form."}</Alert>
        {report && <BatchPanel title={title} progress={report} running={busy} />}
        {problem && <Alert variant="danger">{problem}</Alert>}
      </div>
    </ScreenBody>
    <StepFoot primary={report || problem ? "Try again" : questionnaires ? "Add selected forms" : "Add selected templates"}
      primaryDisabled={!selected.length}
      busy={busy} busyLabel={questionnaires ? "Adding forms..." : "Adding report templates..."}
      onPrimary={() => void run()} onSkip={() => skip(kind)} />
  </Screen>;
}

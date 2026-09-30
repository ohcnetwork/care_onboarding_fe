import { useState } from "react";
import { loadQuestionnaires, loadTemplates } from "@/care/content";
import { listRoleOrganizations, ROLE_ORGANIZATIONS, sameName } from "@/care/organizations";
import { BatchPanel } from "@/components/batch-panel";
import { Screen, ScreenBody, ScreenHead } from "@/components/screen";
import { StepFoot } from "@/components/step-foot";
import { Alert } from "@/components/ui/alert";
import type { BatchProgress } from "@/lib/batch";
import { errorText } from "@/lib/format";
import { useWizard } from "@/state/wizard";

export function ContentStep({ kind }: { kind: "questionnaires" | "templates" }) {
  const { progress, complete } = useWizard();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [report, setReport] = useState<BatchProgress | null>(null);
  const [finished, setFinished] = useState(false);
  const questionnaires = kind === "questionnaires";
  const title = questionnaires ? "Clinical questionnaires" : "Report templates";
  const run = async () => {
    setBusy(true);
    setProblem("");
    try {
      let result: BatchProgress;
      if (questionnaires) {
        const roles = await listRoleOrganizations();
        const ids = ROLE_ORGANIZATIONS.map((name) => {
          const role = roles.find((r) => sameName(r.name, name));
          if (!role) throw new Error("A required staff group is missing. Please contact your administrator.");
          return role.id;
        });
        result = await loadQuestionnaires([...new Set([...ids, progress.districtId])], setReport);
      } else {
        result = await loadTemplates(progress.facilityId, setReport);
      }
      setFinished(result.failed === 0 && result.done === result.total);
    } catch (error) { setProblem(errorText(error)); }
    finally { setBusy(false); }
  };
  return <Screen>
    <ScreenHead title={title} subtitle={questionnaires
      ? "Add the clinical questionnaires your staff will use to record patient information."
      : "Add the ready-to-use templates for printing clinical reports."} />
    <ScreenBody disabled={busy}>
      <div className="max-w-2xl space-y-4">
        <Alert>These are included with CARE Onboarding. There is nothing to upload or edit.</Alert>
        {report && <BatchPanel title={title} progress={report} running={busy} />}
        {problem && <Alert variant="danger">{problem}</Alert>}
        {finished && <Alert variant="success">{questionnaires ? "Your clinical questionnaires are ready." : "Your report templates are ready."}</Alert>}
      </div>
    </ScreenBody>
    <StepFoot primary={finished ? questionnaires ? "Continue" : "Finish setup" : report ? "Try again" : questionnaires ? "Load questionnaires" : "Load report templates"}
      busy={busy} onPrimary={finished ? () => complete(kind) : () => void run()} />
  </Screen>;
}

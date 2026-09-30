import { useState } from "react";
import { loadStandardContent } from "@/care/content";
import { listRoleOrganizations, ROLE_ORGANIZATIONS, sameName } from "@/care/organizations";
import { BatchPanel } from "@/components/batch-panel";
import { Screen, ScreenBody, ScreenHead } from "@/components/screen";
import { StepFoot } from "@/components/step-foot";
import { Alert } from "@/components/ui/alert";
import type { BatchProgress } from "@/lib/batch";
import { errorText } from "@/lib/format";
import { useWizard } from "@/state/wizard";

export function ContentStep() {
  const { progress, complete } = useWizard();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [reports, setReports] = useState<Record<string, BatchProgress>>({});
  const [active, setActive] = useState("");
  const [finished, setFinished] = useState(false);
  const run = async () => {
    setBusy(true);
    setProblem("");
    try {
      const roles = await listRoleOrganizations();
      const ids = ROLE_ORGANIZATIONS.map((name) => {
        const role = roles.find((r) => sameName(r.name, name));
        if (!role) throw new Error("A required staff group is missing. Please contact your administrator.");
        return role.id;
      });
      setFinished(await loadStandardContent(
        progress.facilityId, [...new Set([...ids, progress.districtId])],
        (title, report) => {
          setActive(title);
          setReports((p) => ({ ...p, [title]: report }));
        },
      ));
    } catch (error) { setProblem(errorText(error)); }
    finally { setBusy(false); }
  };
  return <Screen>
    <ScreenHead title="Add your standard forms" subtitle="We'll add the ready-to-use forms and report template and make the forms available to your staff." />
    <ScreenBody disabled={busy}>
      <div className="max-w-2xl space-y-4">
        <Alert>These are included with CARE Onboarding. There is nothing to upload or edit.</Alert>
        {Object.entries(reports).map(([title, report]) => <BatchPanel key={title} title={title} progress={report} running={busy && active === title} />)}
        {problem && <Alert variant="danger">{problem}</Alert>}
        {finished && <p role="status" className="text-brand-ink">Your forms and report template are ready.</p>}
      </div>
    </ScreenBody>
    <StepFoot primary={finished ? "Finish setup" : Object.keys(reports).length ? "Try again" : "Add standard forms"}
      busy={busy} onPrimary={finished ? () => complete("content") : () => void run()} />
  </Screen>;
}

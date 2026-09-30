import { useState } from "react";
import { prepareInstance } from "@/care/bootstrap";
import { BatchPanel } from "@/components/batch-panel";
import { Screen, ScreenBody, ScreenHead } from "@/components/screen";
import { StepFoot } from "@/components/step-foot";
import { Alert } from "@/components/ui/alert";
import type { BatchProgress } from "@/lib/batch";
import { errorText } from "@/lib/format";
import { useWizard } from "@/state/wizard";

export function StatesStep() {
  const { complete, update } = useWizard();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [reports, setReports] = useState<Record<string, BatchProgress>>({});
  const [active, setActive] = useState("");
  const [finished, setFinished] = useState(false);
  const run = async () => {
    setBusy(true);
    setProblem("");
    try {
      setFinished(await prepareInstance((title, progress) => {
        setActive(title);
        setReports((previous) => ({ ...previous, [title]: progress }));
      }, (roleOrganizations) => update({ roleOrganizations })));
    } catch (error) {
      setProblem(errorText(error));
    } finally { setBusy(false); }
  };
  return <Screen>
    <ScreenHead title="Let's prepare your clinic" subtitle="First, we'll add the standard states, districts and staff groups. You do not need to enter these yourself." />
    <ScreenBody disabled={busy}>
      <div className="max-w-2xl space-y-4">
        <Alert>Keep this page open while setup runs. Your progress is saved in this browser, and anything already added will be kept.</Alert>
        <p className="text-sm text-gray-600">Next, you'll enter your clinic details and staff, then we'll add standard forms and a report template.</p>
        <p className="text-sm text-gray-600">Tests, scans and procedures are not loaded by this version. Your administrator can configure them in CARE settings.</p>
        {Object.entries(reports).map(([title, progress]) => <BatchPanel key={title} title={title} progress={progress} running={busy && active === title} />)}
        {problem && <Alert variant="danger">{problem}</Alert>}
      </div>
    </ScreenBody>
    <StepFoot primary={finished ? "Continue" : Object.keys(reports).length ? "Try again" : "Get started"}
      busy={busy} onPrimary={finished ? () => complete("states") : () => void run()} />
  </Screen>;
}

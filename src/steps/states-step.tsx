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
    <ScreenHead title="Let's prepare your clinic" subtitle="Add standard roles, states and districts in one click." />
    <ScreenBody disabled={busy}>
      <div className="max-w-2xl space-y-4">
        <Alert>Keep this page open. Anything already added will be kept.</Alert>
        <p className="text-sm text-gray-600">Tests, scans and procedures need to be set up separately in CARE settings.</p>
        <div className="grid gap-3 md:grid-cols-3">
          {Object.entries(reports).map(([title, progress]) => <BatchPanel key={title} title={title} progress={progress} running={busy && active === title} />)}
        </div>
        {problem && <Alert variant="danger">{problem}</Alert>}
        {finished && <Alert variant="success">CARE is ready. Choose your clinic's location next.</Alert>}
      </div>
    </ScreenBody>
    <StepFoot primary={finished ? "Continue" : Object.keys(reports).length || problem ? "Try again" : "Get started"}
      busy={busy} busyLabel="Preparing CARE..." onPrimary={finished ? () => complete("states") : () => void run()} />
  </Screen>;
}

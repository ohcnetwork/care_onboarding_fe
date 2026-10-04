import { useState } from "react";
import { CLINICAL_CATEGORIES, loadClinicalData } from "@/care/clinical-data";
import { BatchPanel } from "@/components/batch-panel";
import { Screen, ScreenBody, ScreenHead } from "@/components/screen";
import { StepFoot } from "@/components/step-foot";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import type { BatchProgress } from "@/lib/batch";
import { errorText } from "@/lib/format";
import { useWizard } from "@/state/wizard";

export function ClinicalDataStep() {
  const { progress, update, complete, skip } = useWizard();
  const selected = progress.clinicalCategories;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [reports, setReports] = useState<Record<string, BatchProgress>>({});
  const [active, setActive] = useState("");
  const count = CLINICAL_CATEGORIES.filter((c) => selected.includes(c.key)).reduce((sum, c) => sum + c.count, 0);
  const run = async () => {
    setBusy(true);
    setProblem("");
    setReports({});
    try {
      const finished = await loadClinicalData(progress.facilityId, selected, (title, report) => {
        setActive(title);
        setReports((previous) => ({ ...previous, [title]: report }));
      });
      if (finished) complete("clinical-data");
    } catch (error) { setProblem(errorText(error)); }
    finally { setBusy(false); }
  };
  return <Screen>
    <ScreenHead title="Clinical data" subtitle="Choose the tests, scans and procedures your clinic needs." />
    <ScreenBody disabled={busy}>
      <div className="max-w-2xl space-y-4">
        <fieldset disabled={busy} className="space-y-3">
          <legend className="mb-3 text-sm font-semibold">Choose categories</legend>
          {CLINICAL_CATEGORIES.map((category) => <label key={category.key}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-line p-4 has-[:disabled]:cursor-default">
            <Checkbox checked={selected.includes(category.key)} onCheckedChange={(checked) => {
              try {
                update({ clinicalCategories: checked === true ? [...selected, category.key] : selected.filter((key) => key !== category.key) });
                setProblem("");
                setReports({});
              } catch (error) { setProblem(errorText(error)); }
            }} aria-label={category.name} />
            <span className="font-medium">{category.name}</span>
            <span className="ml-auto text-sm text-gray-600">{category.count.toLocaleString("en-IN")} items</span>
          </label>)}
        </fieldset>
        <p role="status" className="text-sm text-gray-600">{count ? `${count.toLocaleString("en-IN")} items selected` : "Select one or more categories, or do this later."}</p>
        <Alert>Adds names to your clinic's catalog. Prices, sample collection and result forms are not included. Anything already added will be kept.</Alert>
        {Object.entries(reports).map(([title, report]) => <BatchPanel key={title} title={title} progress={report} running={busy && active === title} />)}
        {problem && <Alert variant="danger">{problem}</Alert>}
      </div>
    </ScreenBody>
    <StepFoot primary={Object.keys(reports).length || problem ? "Try again" : "Add selected clinical data"}
      primaryDisabled={!selected.length} busy={busy} busyLabel="Adding clinical data..."
      onPrimary={() => void run()}
      onSkip={() => skip("clinical-data")} />
  </Screen>;
}

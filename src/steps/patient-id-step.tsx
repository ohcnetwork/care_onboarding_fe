import { useState } from "react";

import { createIdentifierConfig, listIdentifierConfigs, PATIENT_ID_SYSTEM } from "@/care/identifiers";
import { Field } from "@/components/field";
import { Screen, ScreenBody, ScreenHead } from "@/components/screen";
import { StepFoot } from "@/components/step-foot";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { cleanInitials, patientIdExpression, previewPatientId } from "@/lib/expressions";
import { errorText } from "@/lib/format";
import { useWizard } from "@/state/wizard";

export function PatientIdStep() {
  const { progress, complete, skip } = useWizard();
  const [initials, setInitials] = useState(progress.initials);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [touched, setTouched] = useState(false);
  const initialsError = initials.length < 2 ? "Enter at least 2 letters or digits." : undefined;

  const save = async () => {
    setTouched(true);
    if (initialsError) return;
    setBusy(true);
    setProblem("");
    try {
      const existing = await listIdentifierConfigs();
      const inactive = existing.find((c) => c.config.system === PATIENT_ID_SYSTEM && c.status === "inactive");
      if (inactive) throw new Error("A patient number format was previously disabled. Ask your administrator to review it in CARE settings.");
      const already = existing.find((c) => c.config.system === PATIENT_ID_SYSTEM && c.status === "active");
      if (!already) {
        await createIdentifierConfig({
          display: "Patient ID",
          default_value: patientIdExpression(initials),
        });
      }
      complete("patient-id", { initials });
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHead
        title="Patient numbers"
        subtitle="This is the patient's admission number, used on their cards and reports."
      />
      <ScreenBody disabled={busy}>
        <div className="flex max-w-[480px] flex-col gap-5">
          <Field label="Starting letters or numbers" htmlFor="pinitials" required hint="Use 2 to 6 letters or numbers, for example PHC." error={touched ? initialsError : undefined}>
            <Input
              id="pinitials"
              value={initials}
              className="max-w-[200px] font-mono uppercase"
              onChange={(e) => setInitials(cleanInitials(e.target.value))}
            />
          </Field>
          <div className="rounded-xl border border-line bg-white px-4 py-3.5">
            <div className="text-xs font-semibold text-faint">Example patient numbers</div>
            <div aria-live="polite" aria-atomic="true" className="mt-1 font-mono text-[15px] font-semibold text-brand-ink">
              {initials ? previewPatientId(initials, 0) : "—"}, {initials ? previewPatientId(initials, 1) : "—"}, …
            </div>
            <div className="mt-2 text-[12.5px] text-muted-foreground">
              CARE adds the next number automatically. All clinics using this CARE share the same numbering.
            </div>
          </div>
          {problem ? <Alert variant="danger">{problem}</Alert> : null}
        </div>
      </ScreenBody>
      <StepFoot
        primary="Save patient numbers"
        onPrimary={() => void save()}
        busy={busy}
        busyLabel="Saving patient numbers..."
        onSkip={() => skip("patient-id")}
      />
    </Screen>
  );
}

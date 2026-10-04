import { useState } from "react";

import { setInvoiceExpression } from "@/care/facility";
import { Field } from "@/components/field";
import { Screen, ScreenBody, ScreenHead } from "@/components/screen";
import { StepFoot } from "@/components/step-foot";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { cleanInitials, invoiceExpression, previewInvoice } from "@/lib/expressions";
import { errorText } from "@/lib/format";
import { useWizard } from "@/state/wizard";

export function InvoiceStep() {
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
      await setInvoiceExpression(progress.facilityId, invoiceExpression(initials));
      complete("invoice", { initials });
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHead
        title="Invoice numbers"
        subtitle="Choose how your clinic's invoice numbers will look."
      />
      <ScreenBody disabled={busy}>
        <div className="flex max-w-[480px] flex-col gap-5">
          <Field
            label="Clinic initials"
            htmlFor="initials"
            required
            error={touched ? initialsError : undefined}
            hint="Use 2 to 6 letters or numbers, for example PHC."
          >
            <Input
              id="initials"
              value={initials}
              className="max-w-[200px] font-mono uppercase"
              onChange={(e) => setInitials(cleanInitials(e.target.value))}
            />
          </Field>
          <div className="rounded-xl border border-line bg-white px-4 py-3.5">
            <div className="text-xs font-semibold text-faint">Example invoice numbers</div>
            <div aria-live="polite" aria-atomic="true" className="mt-1 font-mono text-[15px] font-semibold text-brand-ink">
              {initials ? previewInvoice(initials, 0) : "—"}, {initials ? previewInvoice(initials, 1) : "—"}, …
            </div>
            <div className="mt-2 text-[12.5px] text-muted-foreground">
              CARE adds the next number automatically.
            </div>
          </div>
          {problem ? <Alert variant="danger">{problem}</Alert> : null}
        </div>
      </ScreenBody>
      <StepFoot
        primary="Save invoice numbers"
        onPrimary={() => void save()}
        busy={busy}
        busyLabel="Saving invoice numbers..."
        onSkip={() => skip("invoice")}
      />
    </Screen>
  );
}

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
  const { progress, complete, skip, update } = useWizard();
  const [initials, setInitials] = useState(progress.initials);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [finished, setFinished] = useState(false);
  const [touched, setTouched] = useState(false);
  const initialsError = initials.length < 2 ? "Enter at least 2 letters or digits." : undefined;

  const save = async () => {
    setTouched(true);
    if (initialsError) return;
    setBusy(true);
    setProblem("");
    try {
      await setInvoiceExpression(progress.facilityId, invoiceExpression(initials));
      update({ initials });
      setFinished(true);
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
        subtitle="Every invoice gets the facility's initials followed by a running number."
      />
      <ScreenBody disabled={busy}>
        <div className="flex max-w-[480px] flex-col gap-5">
          <Field
            label="Facility initials"
            htmlFor="initials"
            required
            error={touched ? initialsError : undefined}
            hint={`Taken from "${progress.facilityName}". Letters and digits only.`}
          >
            <Input
              id="initials"
              value={initials}
              disabled={finished}
              className="max-w-[200px] font-mono uppercase"
              onChange={(e) => setInitials(cleanInitials(e.target.value))}
            />
          </Field>
          <div className="rounded-xl border border-line bg-white px-4 py-3.5">
            <div className="text-[11px] font-semibold tracking-[0.04em] text-faint uppercase">Preview</div>
            <div className="mt-1 font-mono text-[15px] font-semibold text-brand-ink">
              {initials ? previewInvoice(initials, 0) : "—"}, {initials ? previewInvoice(initials, 1) : "—"}, …
            </div>
            <div className="mt-2 text-[12.5px] text-muted-foreground">
              Numbers are assigned automatically. You can change the format later in CARE's billing settings.
            </div>
          </div>
          {problem ? <Alert variant="danger">{problem}</Alert> : null}
          {finished ? <Alert variant="success"><p className="font-semibold">Invoice numbering saved</p><p>New invoices will use {previewInvoice(initials, 0)} and continue automatically.</p></Alert> : null}
        </div>
      </ScreenBody>
      <StepFoot
        primary={finished ? "Continue" : "Save"}
        onPrimary={finished ? () => complete("invoice", { initials }) : () => void save()}
        busy={busy}
        onSkip={finished ? undefined : () => skip("invoice")}
      />
    </Screen>
  );
}

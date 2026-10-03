import { useState } from "react";

import { createFacility, listFacilities, FACILITY_TYPES } from "@/care/facility";
import { Field } from "@/components/field";
import { Screen, ScreenBody, ScreenHead } from "@/components/screen";
import { StepFoot } from "@/components/step-foot";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorText, initialsOf } from "@/lib/format";
import { phoneToInternational, validPhone, type PhoneNumber } from "@/lib/phone";
import { ApiError } from "@/lib/api";
import { useWizard } from "@/state/wizard";

type Form = {
  name: string;
  facility_type: string;
  phone: PhoneNumber;
  pincode: string;
  address: string;
  description: string;
};

const EMPTY: Form = { name: "", facility_type: "", phone: { country: "IN", number: "" }, pincode: "", address: "", description: "" };

function validate(f: Form): Partial<Record<keyof Form, string>> {
  const errors: Partial<Record<keyof Form, string>> = {};
  if (!f.name.trim()) errors.name = "Enter your clinic's name.";
  if (!f.facility_type) errors.facility_type = "Choose a clinic type.";
  if (!validPhone(f.phone)) errors.phone = "Enter exactly 10 digits for the phone number.";
  if (!/^\d{6}$/.test(f.pincode.trim())) errors.pincode = "Enter the 6-digit PIN code.";
  if (!f.address.trim()) errors.address = "Enter the address.";
  return errors;
}

export function FacilityStep() {
  const { progress, complete, goTo, update } = useWizard();
  const [form, setForm] = useState<Form>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [serverErrors, setServerErrors] = useState<Partial<Record<keyof Form, string>>>({});

  const errors = validate(form);
  const set = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setServerErrors((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => !(key in patch))));
  };
  const show = (k: keyof Form) => serverErrors[k] || (touched ? errors[k] : undefined);

  const create = async () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    setBusy(true);
    setProblem("");
    setServerErrors({});
    try {
      const facilities = await listFacilities();
      if (facilities.length) throw new Error("A clinic already exists. Reload this page to continue safely without creating another.");
      update({ facilityIntent: { name: form.name.trim(), districtId: progress.districtId } });
      const facility = await createFacility({
        name: form.name.trim(),
        facility_type: form.facility_type,
        phone_number: phoneToInternational(form.phone),
        pincode: Number(form.pincode.trim()),
        address: form.address.trim(),
        description: form.description.trim(),
        geo_organization: progress.districtId,
      });
      complete("facility", {
        facilityId: facility.id,
        facilityName: facility.name,
        initials: initialsOf(facility.name),
        facilityIntent: null,
      });
    } catch (e) {
      if (e instanceof ApiError) {
        const fields: Partial<Record<keyof Form, string>> = {};
        for (const key of ["name", "facility_type", "pincode", "address", "description"] as const) {
          if (e.fieldErrors[key]) fields[key] = e.fieldErrors[key];
        }
        if (e.fieldErrors.phone_number) fields.phone = e.fieldErrors.phone_number;
        setServerErrors(fields);
      }
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHead
        title="Clinic details"
        subtitle={`Add your clinic in ${progress.districtName}, ${progress.stateName}.`}
      />
      <ScreenBody disabled={busy}>
        <div className="grid max-w-[720px] grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Clinic type" htmlFor="ftype" required error={show("facility_type")}>
            <Select value={form.facility_type} onValueChange={(v) => set({ facility_type: v })}>
              <SelectTrigger id="ftype">
                <SelectValue placeholder="Choose a clinic type" />
              </SelectTrigger>
              <SelectContent>
                {FACILITY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Clinic name" htmlFor="fname" required error={show("name")}>
            <Input id="fname" value={form.name} placeholder="e.g. PHC Aluva" onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Phone number" htmlFor="fphone" required error={show("phone")}>
            <PhoneInput id="fphone" value={form.phone} onChange={(phone) => set({ phone })} />
          </Field>
          <Field label="PIN code" htmlFor="fpin" required error={show("pincode")}>
            <Input id="fpin" value={form.pincode} placeholder="683101" inputMode="numeric" maxLength={6}
              onChange={(e) => set({ pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
              onPaste={(e) => {
                e.preventDefault();
                const input = e.currentTarget;
                const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
                const start = input.selectionStart ?? form.pincode.length;
                const end = input.selectionEnd ?? start;
                set({ pincode: (form.pincode.slice(0, start) + pasted + form.pincode.slice(end)).slice(0, 6) });
              }}
            />
          </Field>
          <Field label="Address" htmlFor="faddress" required error={show("address")} className="md:col-span-2">
            <textarea
              id="faddress"
              rows={2}
              value={form.address}
              aria-required="true"
              aria-invalid={!!show("address")}
              aria-describedby={show("address") ? "faddress-description" : undefined}
              placeholder="Municipal Building Road, Aluva, Ernakulam"
              onChange={(e) => set({ address: e.target.value })}
              className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus-visible:border-brand aria-invalid:border-red-500!"
            />
          </Field>
          <Field label="About your clinic (optional)" htmlFor="fdesc" error={show("description")} className="md:col-span-2">
            <Input id="fdesc" value={form.description} placeholder="A short description" onChange={(e) => set({ description: e.target.value })} />
          </Field>
          {problem ? (
            <div className="md:col-span-2">
              <Alert variant="danger">{problem}</Alert>
            </div>
          ) : null}
        </div>
      </ScreenBody>
      <StepFoot
        primary="Create clinic"
        onPrimary={() => void create()}
        busy={busy}
        busyLabel="Creating clinic..."
        onBack={() => goTo("district")}
        note="Creates your clinic in CARE. You can edit these details later."
      />
    </Screen>
  );
}

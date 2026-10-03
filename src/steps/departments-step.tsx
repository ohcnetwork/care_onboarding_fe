import { Plus, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import {
  ADMINISTRATION,
  createDepartment,
  createDepartmentLocation,
  ensureLocationOrganization,
  listDepartments,
  listLocations,
} from "@/care/departments";
import { sameName } from "@/care/organizations";
import { BatchPanel } from "@/components/batch-panel";
import { Field } from "@/components/field";
import { Screen, ScreenBody, ScreenHead } from "@/components/screen";
import { StepFoot } from "@/components/step-foot";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runBatch, type BatchProgress } from "@/lib/batch";
import { errorText } from "@/lib/format";
import { useWizard, type Department } from "@/state/wizard";

const SUGGESTIONS = ["General Medicine", "Paediatrics", "Laboratory", "Pharmacy", "Radiology", "Nursing"];
const cleanName = (raw: string) => raw.trim().replace(/\s+/g, " ");

export function DepartmentsStep() {
  const { progress, complete, skip, update } = useWizard();
  const [names, setNames] = useState<string[]>(progress.departments.map((d) => d.name));
  const [draft, setDraft] = useState("");
  const [draftProblem, setDraftProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState<BatchProgress | null>(null);
  const [problem, setProblem] = useState("");
  const [created, setCreated] = useState<Department[] | null>(null);

  const add = (raw: string) => {
    const name = cleanName(raw);
    if (!name) { setDraftProblem("Enter a department name."); return; }
    if (names.some((n) => sameName(n, name))) { setDraftProblem("This department is already on your list."); return; }
    if (sameName(name, ADMINISTRATION)) { setDraftProblem("Administration is already included in CARE."); return; }
    setNames((list) => [...list, name]);
    setDraft("");
    setDraftProblem("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add(draft);
    }
  };

  const run = async () => {
    const pending = cleanName(draft);
    if (sameName(pending, ADMINISTRATION)) {
      setDraftProblem("Administration is already included in CARE.");
      return;
    }
    const selected = pending && !names.some((name) => sameName(name, pending)) ? [...names, pending] : names;
    setNames(selected);
    setDraft("");
    setDraftProblem("");
    setBusy(true);
    setProblem("");
    setCreated(null);
    try {
      const facilityId = progress.facilityId;
      const existing = await listDepartments(facilityId);
      const locations = await listLocations(facilityId);
      const administration = existing.find((o) => sameName(o.name, ADMINISTRATION));
      if (!administration) throw new Error("CARE has not prepared your clinic's administration team. Please try again or contact your administrator.");
      const result: Department[] = [];
      const report = await runBatch(
        selected,
        (n) => n,
        async (name) => {
          let org = existing.find((o) => sameName(o.name, name));
          let outcome: "created" | "skipped" = "skipped";
          if (!org) {
            org = await createDepartment(facilityId, name);
            outcome = "created";
          }
          let location = locations.find((l) => sameName(l.name, name));
          if (!location) {
            location = await createDepartmentLocation(facilityId, name, [org.id]);
            outcome = "created";
          }
          if (await ensureLocationOrganization(facilityId, location.id, org.id)) outcome = "created";
          if (await ensureLocationOrganization(facilityId, location.id, administration.id)) outcome = "created";
          result.push({ name, organizationId: org.id, locationId: location.id });
          return outcome;
        },
        setBatch,
        1,
      );
      result.sort((a, b) => selected.indexOf(a.name) - selected.indexOf(b.name));
      const merged = new Map(progress.departments.map((d) => [d.organizationId, d]));
      for (const department of result) merged.set(department.organizationId, department);
      update({ departments: [...merged.values()], administrationId: administration.id });
      if (report.failed === 0) setCreated(result);
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const finished = created !== null;

  return (
    <Screen>
      <ScreenHead
        title="Departments"
        subtitle="Choose your departments, or add your own. You'll assign staff to them next."
      />
      <ScreenBody disabled={busy}>
        <div className="flex max-w-[640px] flex-col gap-4">
          <div className="rounded-xl border border-line bg-white p-3.5">
            {names.length ? (
              <ul className="mb-3 flex flex-col gap-2">
                {names.map((n) => (
                  <li key={n} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
                    <span className="flex-1">{n}</span>
                    {!created ? (
                      <button
                        type="button"
                        aria-label={`Remove ${n}`}
                        className="text-faint hover:text-danger-ink"
                        onClick={() => { setNames((list) => list.filter((x) => x !== n)); setDraftProblem(""); }}
                      >
                        <X className="size-4" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mb-3 text-[13px] text-muted-foreground">No departments added yet.</div>
            )}
            {!created ? (
              <Field label="Department name" htmlFor="department-name" error={draftProblem}>
                <div className="flex flex-wrap gap-2">
                  <Input id="department-name" className="min-w-0 flex-1"
                    value={draft}
                    placeholder="e.g. ENT"
                    onChange={(e) => { setDraft(e.target.value); setDraftProblem(""); }}
                    onKeyDown={onKey}
                  />
                  <Button type="button" onClick={() => add(draft)} disabled={!draft.trim()}>
                    <Plus className="size-4" /> Add to list
                  </Button>
                </div>
              </Field>
            ) : null}
          </div>
          {!created ? (
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
              <span>Quick choices:</span>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={names.some((n) => sameName(n, s))}
                  className="rounded-full border border-line bg-white px-3 py-2 text-sm hover:border-brand hover:text-brand-ink aria-pressed:border-brand aria-pressed:bg-brand-bg aria-pressed:text-brand-ink"
                  onClick={() => {
                    setDraftProblem("");
                    if (names.some((n) => sameName(n, s))) setNames((list) => list.filter((n) => !sameName(n, s)));
                    else setNames((list) => [...list, s]);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          {batch ? <BatchPanel title="Departments" progress={batch} running={busy} /> : null}
          {problem ? <Alert variant="danger">{problem}</Alert> : null}
          {finished ? <Alert variant="success">Departments are ready. Add your staff next.</Alert> : null}
        </div>
      </ScreenBody>
      <StepFoot
        primary={finished ? "Continue" : batch || problem ? "Try again" : "Save departments"}
        primaryDisabled={!finished && names.length === 0 && !draft.trim()}
        onPrimary={finished ? () => complete("departments") : () => void run()}
        busy={busy}
        busyLabel="Saving departments..."
        onSkip={created ? undefined : () => skip("departments")}
      />
    </Screen>
  );
}

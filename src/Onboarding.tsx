import { Check, ClipboardList } from "lucide-react";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";

import { listFacilities, type Facility } from "@/care/facility";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { api, apiBase, openRequestScope } from "@/lib/api";
import { initialsOf } from "@/lib/format";
import { progressKey } from "@/lib/progress";
import { STEPS, WizardProvider, useWizard } from "@/state/wizard";
import { ContentStep } from "@/steps/content-step";
import { DepartmentsStep } from "@/steps/departments-step";
import { DistrictStep } from "@/steps/district-step";
import { FacilityStep } from "@/steps/facility-step";
import { InvoiceStep } from "@/steps/invoice-step";
import { PatientIdStep } from "@/steps/patient-id-step";
import { StatesStep } from "@/steps/states-step";
import { UsersStep, type StaffDraft } from "@/steps/users-step";
import "./style.css";

class SetupBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    return this.state.error ? (
      <div className="care-onboarding-fe p-6">
        <Alert variant="danger">Facility setup could not open. Reload CARE and try again. If this continues, contact your administrator.</Alert>
      </div>
    ) : this.props.children;
  }
}

function Done() {
  const { progress } = useWizard();
  const skipped = STEPS.filter((step) => progress.skipped[step.id]);
  return <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
    <Check className="mb-4 size-8 text-brand-ink" />
    <h1 className="text-2xl font-bold">Your clinic is set up</h1>
    <p className="mt-2 text-gray-600">{progress.facilityName} is ready with its standard forms and report template.</p>
    {skipped.length > 0 && <p className="mt-3 text-sm text-gray-600">You can add {skipped.map((s) => s.label.toLowerCase()).join(", ")} later in CARE.</p>}
    <p className="mt-3 text-sm text-gray-600">Tests, scans and procedures are not included in this release. They can be configured in CARE settings by your administrator.</p>
    <Button variant="primary" className="mt-6" asChild><a href={`/facility/${progress.facilityId}`}>Open clinic</a></Button>
  </div>;
}

const SCREENS = {
  states: StatesStep, district: DistrictStep, facility: FacilityStep,
  departments: DepartmentsStep, invoice: InvoiceStep,
  "patient-id": PatientIdStep,
  questionnaires: () => <ContentStep kind="questionnaires" />,
  templates: () => <ContentStep kind="templates" />,
  done: Done,
};

function Wizard() {
  const { progress, storageProblem, complete, reset } = useWizard();
  const [gate, setGate] = useState<"checking" | "ready" | "existing" | "recover" | "stale">("checking");
  const [confirmReset, setConfirmReset] = useState(false);
  const [existing, setExisting] = useState<Facility[]>([]);
  const [problem, setProblem] = useState("");
  const [attempt, setAttempt] = useState(0);
  const page = useRef<HTMLDivElement>(null);
  const staffDraft = useRef<StaffDraft | null>(null);

  useEffect(() => {
    if (storageProblem) return;
    let cancelled = false;
    setGate("checking");
    setConfirmReset(false);
    setProblem("");
    void (async () => {
      const user = await api.get<{ is_superuser: boolean }>("/users/getcurrentuser/");
      if (user?.is_superuser !== true) throw new Error("Only a CARE administrator can set up a clinic. Ask your administrator to sign in.");
      const facilities = await listFacilities();
      if (cancelled) return;
      setExisting(facilities);
      if (progress.facilityId && facilities.some((f) => f.id === progress.facilityId)) {
        setGate("ready");
      } else if (facilities.length > 0) {
        setGate(progress.facilityIntent ? "recover" : "existing");
      } else if (progress.facilityId) {
        setGate("stale");
      } else {
        setGate("ready");
      }
    })().catch((error: unknown) => {
      if (!cancelled) setProblem(error instanceof Error ? error.message : "CARE could not be reached.");
    });
    return () => { cancelled = true; };
    // Recheck only on entry/retry, not when the wizard creates its facility.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, storageProblem]);

  useEffect(() => {
    const title = page.current?.querySelector("h1");
    if (title) { title.tabIndex = -1; title.focus(); }
  }, [progress.step, gate]);

  if (storageProblem) return <Alert variant="danger">{storageProblem}</Alert>;
  if (problem) return <div className="space-y-4">
    <Alert variant="danger">{problem}</Alert>
    <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
    <Button asChild><a href="/">Back to CARE</a></Button>
  </div>;
  if (gate === "checking") return <p role="status" className="p-6 text-gray-600">Checking your clinic...</p>;
  if (gate === "stale") return <div ref={page} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
    <h1 className="text-2xl font-bold">{confirmReset ? "Start clinic setup again?" : "We couldn't find your clinic"}</h1>
    <p className="my-4 text-gray-600">{confirmReset
      ? "This will clear your saved setup progress in this browser so you can start from the beginning. No clinic records will be deleted, and you will stay signed in."
      : "You have saved progress from an earlier setup, but no clinic is set up in CARE now. If you expected to find your clinic here, ask your administrator for help before starting again."}</p>
    <div className="flex flex-wrap gap-2">
      {confirmReset ? <>
        <Button variant="destructive" onClick={() => {
          try {
            reset();
            setGate("checking");
            setAttempt((n) => n + 1);
          } catch (error) {
            setProblem(error instanceof Error ? error.message : "We couldn't restart your setup. Please try again.");
          }
        }}>Yes, start again</Button>
        <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
      </> : <>
        <Button onClick={() => setConfirmReset(true)}>Start setup again</Button>
        <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
      </>}
      <Button asChild><a href="/">Back to CARE</a></Button>
    </div>
  </div>;
  if (gate === "existing" || gate === "recover") {
    const matches = existing.filter((f) =>
      f.name.trim().toLowerCase() === progress.facilityIntent?.name.trim().toLowerCase() &&
      f.geo_organization?.id === progress.facilityIntent?.districtId,
    );
    const candidate = matches.length === 1 ? matches[0] : undefined;
    return <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold">{candidate ? "Continue your clinic setup" : "This CARE instance already has a clinic"}</h1>
      <p className="my-4 text-gray-600">{candidate
        ? `We found ${candidate.name}, matching the clinic you were creating. Confirm that this is your clinic to continue.`
        : "Use CARE settings to manage your existing clinic. This page is for first-time setup."}</p>
      {candidate && <Button variant="primary" onClick={() => {
        complete("facility", { facilityId: candidate.id, facilityName: candidate.name, initials: initialsOf(candidate.name), facilityIntent: null });
        setGate("ready");
      }}>Continue with {candidate.name}</Button>}
      <Button className="ml-2" asChild><a href="/">Back to CARE</a></Button>
    </div>;
  }
  const Screen = progress.step === "users" ? null : SCREENS[progress.step];
  return <div ref={page}>
    <header className="mb-6">
      <div className="flex items-center gap-2"><ClipboardList className="size-5 text-brand-ink" /><h2 className="text-2xl font-bold">Facility Setup</h2></div>
      <p className="mt-1 text-sm text-gray-500">A few steps to prepare CARE for your clinic.</p>
    </header>
    {progress.step !== "done" && <nav aria-label="Setup progress" className="mb-6">
      <ol className="flex flex-wrap gap-x-4 gap-y-2">
        {STEPS.map((step, index) => <li key={step.id} aria-current={progress.step === step.id ? "step" : undefined}
          className={`flex items-center gap-2 text-sm ${progress.step === step.id ? "font-semibold text-brand-ink" : "text-gray-500"}`}>
          <span className={`flex size-6 items-center justify-center rounded-full ${progress.done[step.id] ? "bg-brand-bg text-brand-ink" : "bg-gray-100"}`}>
            {progress.done[step.id] ? <Check className="size-4" aria-label="Completed" /> : index + 1}
          </span>
          <span>{step.label}{progress.skipped[step.id] ? " (later)" : ""}</span>
        </li>)}
      </ol>
    </nav>}
    {Screen ? <Screen key={progress.step} /> : <UsersStep draft={staffDraft} />}
    {progress.step === "states" && progress.facilityIntent && <Button className="mt-4" onClick={reset}>Start again before creating a clinic</Button>}
  </div>;
}

function ExclusiveWizard() {
  const [owner, setOwner] = useState(false);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    if (!navigator.locks) {
      setProblem("Open setup in a current version of Chrome, Edge, Firefox or Safari over a secure CARE connection.");
      return;
    }
    let released = false;
    let release: (() => void) | undefined;
    let closeRequests: (() => void) | undefined;
    const key = progressKey(apiBase());
    void (async () => {
      // Let a StrictMode probe clean up before attempting to own the lock.
      await Promise.resolve();
      if (released) return;
      await navigator.locks.request(key, { ifAvailable: true }, async (lock) => {
        if (released) return;
        if (!lock) {
          setProblem("Setup is already open in another tab. Close that tab, then reload this page.");
          return;
        }
        closeRequests = openRequestScope();
        setOwner(true);
        await new Promise<void>((resolve) => { release = resolve; });
      });
    })().catch(() => { if (!released) setProblem("Setup could not start safely. Reload CARE and try again."); });
    return () => { released = true; closeRequests?.(); release?.(); };
  }, []);
  return <div className="care-onboarding-fe"><div className="mx-auto max-w-5xl px-1 py-2 md:px-6">
    {problem ? <Alert variant="danger">{problem}</Alert>
      : owner ? <WizardProvider><Wizard /></WizardProvider>
        : <p role="status">Opening facility setup...</p>}
  </div></div>;
}

export default function Onboarding() {
  return <SetupBoundary><ExclusiveWizard /></SetupBoundary>;
}

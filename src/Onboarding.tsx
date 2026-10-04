import { Check, ClipboardList } from "lucide-react";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";

import { listFacilities, type Facility } from "@/care/facility";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { api, apiBase, openRequestScope } from "@/lib/api";
import { initialsOf } from "@/lib/format";
import { progressKey } from "@/lib/progress";
import { STEPS, WizardProvider, useWizard } from "@/state/wizard";
import { ContentStep } from "@/steps/content-step";
import { ClinicalDataStep } from "@/steps/clinical-data-step";
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
        <Alert variant="danger">Clinic setup could not open. Reload CARE and try again. If this continues, ask your administrator for help.</Alert>
      </div>
    ) : this.props.children;
  }
}

function Done() {
  const { progress, goTo } = useWizard();
  const skipped = STEPS.filter((step) => progress.skipped[step.id]);
  return <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
    <Check className="mb-4 size-8 text-brand-ink" />
    <h1 className="text-2xl font-bold">Your clinic is set up</h1>
    <p className="mt-2 text-gray-600">{progress.facilityName} is ready. You can add more clinical data, forms and report templates whenever you need them.</p>
    {skipped.length > 0 && <div className="mt-4 rounded-lg bg-gray-50 p-4">
      <h2 className="text-sm font-semibold">To do later in CARE settings</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {skipped.map((step) => <li key={step.id} className="rounded-full border border-line bg-white px-3 py-1 text-sm">{step.label}</li>)}
      </ul>
    </div>}
    <p className="mt-4 text-sm text-gray-600">Prices, sample collection and result forms can be configured in CARE settings.</p>
    <Button className="mt-4" onClick={() => goTo("clinical-data")}>Add clinical data</Button>
    <Button className="ml-2 mt-4" onClick={() => goTo("questionnaires")}>Add clinical forms</Button>
    <Button className="ml-2 mt-4" onClick={() => goTo("templates")}>Add report templates</Button>
    <Button variant="primary" className="mt-6" asChild><a href={`/facility/${progress.facilityId}`}>Open clinic</a></Button>
  </div>;
}

const SCREENS = {
  states: StatesStep, district: DistrictStep, facility: FacilityStep,
  departments: DepartmentsStep, invoice: InvoiceStep,
  "patient-id": PatientIdStep,
  "clinical-data": ClinicalDataStep,
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
    <h1 className="text-2xl font-bold">{confirmReset ? "Ready to set up a new clinic?" : "Set up a new clinic"}</h1>
    <p className="my-4 text-gray-600">{confirmReset
      ? "You'll start from the first step. Only your earlier setup progress saved in this browser will be cleared. No clinic records will be deleted, and you will stay signed in."
      : "Let's get your clinic ready to use CARE. We'll guide you through adding your clinic details, departments, staff and standard forms."}</p>
    <div className="flex flex-wrap gap-2">
      {confirmReset ? <>
        <Button variant="destructive" onClick={() => {
          try {
            reset();
            setGate("checking");
            setAttempt((n) => n + 1);
          } catch (error) {
            setProblem(error instanceof Error ? error.message : "We couldn't start your clinic setup. Please try again.");
          }
        }}>Start new setup</Button>
        <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
      </> : <>
        <Button variant="primary" onClick={() => setConfirmReset(true)}>Set up a new clinic</Button>
        <Button onClick={() => setAttempt((n) => n + 1)}>Check again</Button>
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
      <h1 className="text-2xl font-bold">{candidate ? "Continue your clinic setup" : "Your clinic is already in CARE"}</h1>
      <p className="my-4 text-gray-600">{candidate
        ? `We found ${candidate.name}, matching the clinic you were creating. Confirm that this is your clinic to continue.`
        : "Use CARE settings to make changes. You don't need to set up another clinic here."}</p>
      {candidate && <Button variant="primary" onClick={() => {
        complete("facility", { facilityId: candidate.id, facilityName: candidate.name, initials: initialsOf(candidate.name), facilityIntent: null });
        setGate("ready");
      }}>Continue with {candidate.name}</Button>}
      <Button className="ml-2" asChild><a href="/">Back to CARE</a></Button>
    </div>;
  }
  const Screen = progress.step === "users" ? null : SCREENS[progress.step];
  const stepIndex = STEPS.findIndex((step) => step.id === progress.step);
  const currentStep = STEPS[stepIndex];
  return <div ref={page}>
    <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><ClipboardList className="size-5 text-brand-ink" /><h2 className="text-lg font-bold">Clinic setup</h2></div>
      {progress.facilityName && <span className="text-sm text-gray-600">{progress.facilityName}</span>}
    </header>
    {currentStep && <nav aria-label="Setup progress" className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="font-semibold">Step {stepIndex + 1} of {STEPS.length} - {currentStep.label}</p>
        {currentStep.optional && <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">Optional</span>}
      </div>
      <Progress value={(stepIndex + 1) / STEPS.length * 100} aria-label="Setup steps"
        aria-valuetext={`Step ${stepIndex + 1} of ${STEPS.length}: ${currentStep.label}`} />
      <details key={progress.step} className="text-sm">
        <summary className="w-fit cursor-pointer text-gray-600">View all steps</summary>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, index) => <li key={step.id} aria-current={progress.step === step.id ? "step" : undefined}
            className={`flex items-center gap-2 rounded-md p-2 ${progress.step === step.id ? "bg-brand-bg font-semibold text-brand-ink" : "text-gray-600"}`}>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white">
              {progress.done[step.id] && step.id !== progress.step ? <Check className="size-4" aria-label="Completed" /> : index + 1}
            </span>
            <span>{step.label}{progress.skipped[step.id] ? " (later)" : ""}</span>
          </li>)}
        </ol>
      </details>
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
        : <p role="status">Opening clinic setup...</p>}
  </div></div>;
}

export default function Onboarding() {
  return <SetupBoundary><ExclusiveWizard /></SetupBoundary>;
}

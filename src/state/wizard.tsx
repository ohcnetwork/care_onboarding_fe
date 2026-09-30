import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

import { apiBase } from "@/lib/api";
import { emptyProgress, parseProgress, progressKey, STEP_IDS, type Progress, type StepId } from "@/lib/progress";

export type { Progress, StepId, Department } from "@/lib/progress";
export const STEPS: { id: StepId; label: string; optional: boolean }[] = [
  { id: "states", label: "Get started", optional: false },
  { id: "district", label: "Your district", optional: false },
  { id: "facility", label: "Your clinic", optional: false },
  { id: "departments", label: "Departments", optional: true },
  { id: "users", label: "Staff", optional: true },
  { id: "invoice", label: "Invoice numbers", optional: true },
  { id: "patient-id", label: "Patient numbers", optional: true },
  { id: "content", label: "Standard forms", optional: false },
];

export function nextStep(step: StepId): StepId {
  return STEP_IDS[Math.min(STEP_IDS.indexOf(step) + 1, STEP_IDS.length - 1)];
}

type Wizard = {
  progress: Progress;
  storageProblem: string;
  update: (patch: Partial<Progress>) => void;
  reset: () => void;
  goTo: (step: StepId) => void;
  complete: (step: StepId, patch?: Partial<Progress>) => void;
  skip: (step: StepId) => void;
};
const Context = createContext<Wizard | null>(null);

export function useWizard(): Wizard {
  const value = useContext(Context);
  if (!value) throw new Error("Wizard provider missing");
  return value;
}

export function WizardProvider({ children }: { children: ReactNode }) {
  const key = progressKey(apiBase());
  const [loaded] = useState(() => {
    try {
      const progress = parseProgress(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify(progress));
      return { progress, error: "" };
    } catch (error) {
      return { progress: emptyProgress(), error: error instanceof Error ? error.message : "This browser cannot save setup progress." };
    }
  });
  const [progress, setProgress] = useState(loaded.progress);
  const current = useRef(progress);
  const [storageProblem, setStorageProblem] = useState(loaded.error);
  const update = useCallback((patch: Partial<Progress>) => {
    const next = { ...current.current, ...patch };
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      const message = "This browser cannot save setup progress. Free some browser storage and reload this page before continuing.";
      setStorageProblem(message);
      throw new Error(message);
    }
    current.current = next;
    setProgress(next);
  }, [key]);
  const complete = (step: StepId, patch: Partial<Progress> = {}) => update({
    ...patch, step: nextStep(step),
    done: { ...current.current.done, [step]: true },
    skipped: { ...current.current.skipped, [step]: false },
  });
  const skip = (step: StepId) => {
    if (!STEPS.find((s) => s.id === step)?.optional) throw new Error("This step is required.");
    update({ step: nextStep(step), skipped: { ...current.current.skipped, [step]: true } });
  };
  return <Context.Provider value={{
    progress, storageProblem, update,
    reset: () => update(emptyProgress()),
    goTo: (step) => update({ step }), complete, skip,
  }}>{children}</Context.Provider>;
}

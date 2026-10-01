import { useEffect, useState, type ComponentType } from "react";

import { needsSetup } from "@/care/setup";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PLUGIN_SLUG } from "@/lib/api";
import "./style.css";

export default function DashboardOnboarding({ __base: Dashboard }: { __base: ComponentType }) {
  const [state, setState] = useState<"checking" | "dashboard" | "error">("checking");
  const [problem, setProblem] = useState("");
  const [attempt, setAttempt] = useState(0);
  const enabled = window.__CARE_PLUGIN_RUNTIME__?.meta[PLUGIN_SLUG]?.config?.redirect_after_login !== false;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState("checking");
    void needsSetup(controller.signal).then((required) => {
      if (controller.signal.aborted) return;
      if (required) window.location.replace("/admin/onboarding");
      else setState("dashboard");
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setProblem(error instanceof Error ? error.message : "CARE could not be reached.");
      setState("error");
    });
    return () => controller.abort();
  }, [attempt, enabled]);

  if (!enabled || state === "dashboard") return <Dashboard />;
  return <div className="care-onboarding-fe p-6">
    {state === "checking" ? <p role="status">Checking whether your clinic needs setup...</p> :
      <div className="space-y-4">
        <Alert variant="danger">Could not check whether your clinic needs setup. {problem}</Alert>
        <Button onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
      </div>}
  </div>;
}

import { useEffect, useState } from "react";

import { listDistricts, listStates, type Organization } from "@/care/organizations";
import { Field } from "@/components/field";
import { Screen, ScreenBody, ScreenHead } from "@/components/screen";
import { StepFoot } from "@/components/step-foot";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorText } from "@/lib/format";
import { useWizard } from "@/state/wizard";

export function DistrictStep() {
  const { progress, complete, goTo } = useWizard();
  const [states, setStates] = useState<Organization[]>([]);
  const [districts, setDistricts] = useState<Organization[]>([]);
  const [stateId, setStateId] = useState(progress.stateId);
  const [districtId, setDistrictId] = useState(progress.districtId);
  const [loading, setLoading] = useState(true);
  const [districtLoading, setDistrictLoading] = useState(false);
  const [statesProblem, setStatesProblem] = useState("");
  const [districtsProblem, setDistrictsProblem] = useState("");
  const [attempt, setAttempt] = useState(0);
  const problem = statesProblem || districtsProblem;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStatesProblem("");
    setStates([]);
    listStates()
      .then((list) => {
        if (cancelled) return;
        setStates([...list].sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch((e) => !cancelled && setStatesProblem(errorText(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    setDistrictsProblem("");
    if (!stateId) {
      setDistricts([]);
      setDistrictLoading(false);
      return;
    }
    let cancelled = false;
    setDistricts([]);
    setDistrictLoading(true);
    listDistricts(stateId)
      .then((list) => {
        if (cancelled) return;
        setDistricts([...list].sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch((e) => !cancelled && setDistrictsProblem(errorText(e)))
      .finally(() => !cancelled && setDistrictLoading(false));
    return () => {
      cancelled = true;
    };
  }, [stateId, attempt]);

  const onState = (id: string) => {
    setStateId(id);
    setDistrictId("");
  };

  const state = states.find((s) => s.id === stateId);
  const district = districts.find((d) => d.id === districtId);

  return (
    <Screen>
      <ScreenHead
        title="Where is your clinic?"
        subtitle="Choose the state and district where your clinic is located."
      />
      <ScreenBody>
        <div className="flex max-w-[480px] flex-col gap-5">
          <Field label="State" htmlFor="state" required>
            <Select value={stateId} onValueChange={onState} disabled={loading}>
              <SelectTrigger id="state">
                <SelectValue placeholder={loading ? "Loading states..." : "Choose a state"} />
              </SelectTrigger>
              <SelectContent>
                {states.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="District" htmlFor="district" required>
            <Select value={districtId} onValueChange={setDistrictId} disabled={!stateId || districtLoading}>
              <SelectTrigger id="district">
                <SelectValue placeholder={districtLoading ? "Loading districts..." : stateId ? "Choose a district" : "Choose a state first"} />
              </SelectTrigger>
              <SelectContent>
                {districts.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {!loading && !problem && states.length === 0 ? (
            <Alert variant="danger">No states are available yet. Go back and prepare CARE first.</Alert>
          ) : null}
          {problem ? <div className="space-y-2">
            <Alert variant="danger">{problem}</Alert>
            <Button onClick={() => setAttempt((n) => n + 1)} disabled={loading || districtLoading}>Try again</Button>
          </div> : null}
        </div>
      </ScreenBody>
      <StepFoot
        primary="Continue"
        primaryDisabled={!state || !district || loading || districtLoading || !!problem}
        onPrimary={() =>
          complete("district", {
            stateId,
            stateName: state?.name ?? "",
            districtId,
            districtName: district?.name ?? "",
          })
        }
        onBack={() => goTo("states")}
      />
    </Screen>
  );
}

import { Plus } from "lucide-react";
import { useEffect, useMemo, useState, type RefObject } from "react";

import { ROLE_ORGANIZATIONS, sameName } from "@/care/organizations";
import { ADMINISTRATION, listDepartments } from "@/care/departments";
import {
  ensureMembership,
  createUser,
  findUser,
  GENDERS,
  listRoles,
  type Gender,
  type Role,
} from "@/care/users";
import { BatchPanel } from "@/components/batch-panel";
import { Field } from "@/components/field";
import { Screen, ScreenBody, ScreenHead } from "@/components/screen";
import { StepFoot } from "@/components/step-foot";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { runBatch, type BatchProgress } from "@/lib/batch";
import { ApiError } from "@/lib/api";
import { errorText } from "@/lib/format";
import { phoneToInternational, validPhone, type PhoneNumber } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { useWizard } from "@/state/wizard";

type Row = {
  key: number;
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  phone: PhoneNumber;
  gender: Gender | "";
  role: string;
  departments: string[];
  facilityAdmin: boolean;
};

const FACILITY_ADMIN = "Facility Admin";
const USERNAME = /^[a-zA-Z0-9_-]{3,}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let nextKey = 1;
const blankRow = (): Row => ({
  key: nextKey++,
  first_name: "",
  last_name: "",
  username: "",
  email: "",
  phone: { country: "IN", number: "" },
  gender: "",
  role: "",
  departments: [],
  facilityAdmin: false,
});

type RowErrors = Partial<Record<keyof Row, string>>;

export type StaffDraft = { rows: Row[]; password: string; touched: boolean };

function rowErrors(r: Row, all: Row[]): RowErrors {
  const errors: RowErrors = {};
  if (!r.first_name.trim()) errors.first_name = "Enter a first name.";
  if (!r.last_name.trim()) errors.last_name = "Enter a last name.";
  if (!USERNAME.test(r.username.trim())) errors.username = "Use at least 3 letters, digits, hyphens or underscores.";
  else if (all.some((o) => o !== r && sameName(o.username, r.username))) errors.username = "Each staff member needs a different username.";
  if (!EMAIL.test(r.email.trim())) errors.email = "Enter a valid email address.";
  else if (all.some((o) => o !== r && sameName(o.email, r.email))) errors.email = "This email is already entered for another staff member.";
  if (!validPhone(r.phone)) errors.phone = "Enter exactly 10 digits for the phone number.";
  else if (all.some((o) => o !== r && validPhone(o.phone) && phoneToInternational(o.phone) === phoneToInternational(r.phone))) errors.phone = "This phone number is already entered for another staff member.";
  if (!r.gender) errors.gender = "Choose a gender.";
  if (!r.role) errors.role = "Choose a staff role.";
  if (!r.departments.length) errors.departments = "Choose at least one department for this staff member.";
  return errors;
}

function passwordProblem(pw: string): string {
  if (pw.length < 8) return "At least 8 characters.";
  if (/^\d+$/.test(pw)) return "Not only digits.";
  return "";
}

export function UsersStep({ draft }: { draft: RefObject<StaffDraft | null> }) {
  const { progress, complete, skip, update, goTo } = useWizard();
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesProblem, setRolesProblem] = useState("");
  const [password, setPassword] = useState(draft.current?.password ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => draft.current?.rows ?? [blankRow()]);
  const [touched, setTouched] = useState(draft.current?.touched ?? false);
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState<BatchProgress | null>(null);
  const [problem, setProblem] = useState("");
  const [finished, setFinished] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<number, RowErrors>>({});
  const [passwordError, setPasswordError] = useState("");

  const backToDepartments = () => {
    draft.current = { rows, password, touched };
    goTo("departments");
  };

  useEffect(() => {
    let cancelled = false;
    listRoles()
      .then((list) => {
        if (cancelled) return;
        const known = list.filter((r) => ROLE_ORGANIZATIONS.some((n) => sameName(n, r.name ?? "")));
        const offered = known.length ? known : list;
        offered.sort(
          (a, b) => ROLE_ORGANIZATIONS.findIndex((n) => sameName(n, a.name)) - ROLE_ORGANIZATIONS.findIndex((n) => sameName(n, b.name)),
        );
        setRoles(offered);
      })
      .catch((e) => !cancelled && setRolesProblem(errorText(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const facilityAdminRole = useMemo(() => roles.find((r) => sameName(r.name, FACILITY_ADMIN)), [roles]);
  const staffRoles = roles.filter((role) => ![FACILITY_ADMIN, "Administrator", "Volunteer"].some((name) => sameName(role.name, name)));
  const pwProblem = passwordProblem(password);
  const allErrors = rows.map((r) => rowErrors(r, rows));
  const valid = !pwProblem && allErrors.every((e) => Object.keys(e).length === 0);

  const patch = (key: number, p: Partial<Row>) => {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...p } : r)));
    setServerErrors((errors) => ({
      ...errors, [key]: Object.fromEntries(Object.entries(errors[key] ?? {}).filter(([field]) => !(field in p))),
    }));
  };

  const toggleDept = (key: number, name: string) =>
    setRows((list) =>
      list.map((r) =>
        r.key === key
          ? { ...r, departments: r.departments.includes(name) ? r.departments.filter((d) => d !== name) : [...r.departments, name] }
          : r,
      ),
    );

  const run = async () => {
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    setProblem("");
    setServerErrors({});
    setPasswordError("");
    try {
      const facilityId = progress.facilityId;
      const administration = (await listDepartments(facilityId)).find((org) => sameName(org.name, ADMINISTRATION));
      if (rows.some((row) => row.facilityAdmin) && (!administration || !facilityAdminRole)) {
        throw new Error("CARE has not prepared the clinic administrator role. Please contact your administrator.");
      }
      const created: string[] = [];
      const report = await runBatch(
        rows,
        (r) => r.username,
        async (r) => {
          const role = staffRoles.find((x) => x.id === r.role);
          if (!role) throw new Error("role not found");
          const roleOrg = progress.roleOrganizations[role.name] ?? Object.entries(progress.roleOrganizations).find(([n]) => sameName(n, role.name))?.[1];
          if (!roleOrg) throw new Error("A required staff group is missing. Please contact your administrator.");
          let user = await findUser(r.username.trim());
          let outcome: "created" | "skipped" | "repaired" = "skipped";
          if (!user) {
            try {
              user = await createUser({
              username: r.username.trim(),
              first_name: r.first_name.trim(),
              last_name: r.last_name.trim(),
              email: r.email.trim(),
              phone_number: phoneToInternational(r.phone),
              gender: r.gender as Gender,
              password,
              geo_organization: progress.districtId,
              role_orgs: [{ organization: roleOrg, role: role.id }],
              });
            } catch (error) {
              if (error instanceof ApiError) {
                const fields = error.fieldErrors;
                const row: RowErrors = {};
                for (const key of ["first_name", "last_name", "username", "email", "gender"] as const) {
                  if (fields[key]) row[key] = fields[key];
                }
                if (fields.phone_number) row.phone = fields.phone_number;
                if (fields.role_orgs) row.role = fields.role_orgs;
                setServerErrors((errors) => ({ ...errors, [r.key]: row }));
                if (fields.password) setPasswordError(fields.password);
              }
              throw error;
            }
            outcome = "created";
          }
          for (const name of r.departments) {
            const dept = progress.departments.find((d) => d.name === name);
            if (!dept) throw new Error("A selected department could not be found. Please contact your administrator.");
            const added = await ensureMembership(facilityId, dept.organizationId, user.id, role.id);
            if (added && outcome === "skipped") outcome = "repaired";
          }
          if (r.facilityAdmin && administration && facilityAdminRole) {
            const added = await ensureMembership(facilityId, administration.id, user.id, facilityAdminRole.id);
            if (added && outcome === "skipped") outcome = "repaired";
          }
          created.push(user.id);
          return outcome;
        },
        setBatch,
        2,
      );
      update({ users: [...new Set([...progress.users, ...created])] });
      if (report.failed === 0) {
        draft.current = null;
        setFinished(true);
      }
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHead
        title="Staff accounts"
        subtitle="Add the people who will use CARE. New staff receive the starting password below and should change it after signing in."
      />
      <ScreenBody disabled={busy}>
        <div className="flex max-w-[760px] flex-col gap-5">
          {rolesProblem ? <Alert variant="danger">{rolesProblem}</Alert> : null}
          {!progress.departments.length ? (
            <Alert>
              <p>Add a department before adding staff, or skip staff accounts for now.</p>
              <Button type="button" className="mt-3" onClick={backToDepartments}>
                Go back to departments
              </Button>
              <p className="mt-2 text-xs">Your staff details will stay here while you add departments. Keep this page open.</p>
            </Alert>
          ) : null}

          {rows.map((r, i) => {
            const errors: RowErrors = { ...(touched ? allErrors[i] : {}), ...serverErrors[r.key] };
            return (
              <div key={r.key} className="rounded-xl border border-line bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[11.5px] font-bold tracking-[0.03em] text-faint uppercase">User {i + 1}</span>
                  {rows.length > 1 && !finished ? (
                    <button type="button" className="text-[12.5px] font-semibold text-danger-ink" onClick={() => setRows((l) => l.filter((x) => x.key !== r.key))}>
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="First name" required error={errors.first_name}>
                    <Input value={r.first_name} disabled={finished} onChange={(e) => patch(r.key, { first_name: e.target.value })} />
                  </Field>
                  <Field label="Last name" required error={errors.last_name}>
                    <Input value={r.last_name} disabled={finished} onChange={(e) => patch(r.key, { last_name: e.target.value })} />
                  </Field>
                  <Field label="Username" required error={errors.username}>
                    <Input value={r.username} autoCapitalize="none" spellCheck={false} disabled={finished} onChange={(e) => patch(r.key, { username: e.target.value })} />
                  </Field>
                  <Field label="Role" required error={errors.role}>
                    <Select value={r.role} disabled={finished} onValueChange={(v) => patch(r.key, { role: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {staffRoles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Email" required error={errors.email}>
                    <Input type="email" value={r.email} disabled={finished} onChange={(e) => patch(r.key, { email: e.target.value })} />
                  </Field>
                  <Field label="Phone" required error={errors.phone}>
                    <PhoneInput value={r.phone} disabled={finished} onChange={(phone) => patch(r.key, { phone })} />
                  </Field>
                  <Field label="Gender" required error={errors.gender}>
                    <Select value={r.gender} disabled={finished} onValueChange={(v) => patch(r.key, { gender: v as Gender })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {GENDERS.map((g) => (
                          <SelectItem key={g.value} value={g.value}>
                            {g.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="flex flex-col justify-end gap-1 pb-1">
                    <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                      <Checkbox checked={r.facilityAdmin} disabled={finished || !facilityAdminRole} onCheckedChange={(v) => patch(r.key, { facilityAdmin: v === true })} />
                      Add as Facility Admin in Administration
                    </label>
                    <span className="pl-6 text-xs text-faint">Adds this person to the Administration department with the Facility Admin role. Their selected staff role stays unchanged.</span>
                  </div>
                </div>
                <fieldset
                  className="mt-4"
                  aria-invalid={!!errors.departments}
                  aria-describedby={errors.departments ? `departments-${r.key}-error` : undefined}
                >
                  <legend className="mb-2 text-sm font-medium">
                    Departments <span aria-hidden="true" className="text-danger-ink">*</span>{" "}
                    <span className="font-normal text-faint">(choose at least one)</span>
                  </legend>
                  {progress.departments.length ? (
                    <div className="flex flex-wrap gap-2">
                      {progress.departments.map((d) => {
                        const on = r.departments.includes(d.name);
                        return (
                          <button
                            key={d.name}
                            type="button"
                            disabled={finished}
                            aria-pressed={on}
                            aria-describedby={errors.departments ? `departments-${r.key}-error` : undefined}
                            onClick={() => toggleDept(r.key, d.name)}
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-[12.5px] font-medium",
                              on ? "border-brand bg-brand-bg text-brand-ink" : "border-line bg-white text-muted-foreground hover:border-brand",
                              errors.departments && "border-red-500",
                            )}
                          >
                            {on ? "✓ " : ""}
                            {d.name}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[12.5px] text-muted-foreground">No departments were created in the previous step.</div>
                  )}
                  {errors.departments ? (
                    <div id={`departments-${r.key}-error`} role="alert" className="mt-2 text-sm text-red-500">
                      {errors.departments}
                    </div>
                  ) : null}
                </fieldset>
              </div>
            );
          })}

          {!finished ? (
            <Button type="button" className="justify-center" onClick={() => setRows((l) => [...l, blankRow()])}>
              <Plus className="size-4" /> Add another staff member
            </Button>
          ) : null}

          <Field
            label="Starting password for all users"
            htmlFor="pw"
            required
            error={passwordError || (touched ? pwProblem : undefined)}
            hint="At least 8 characters, not only digits, and not too common."
          >
            <div className="flex gap-2">
              <Input
                id="pw"
                type={showPassword ? "text" : "password"}
                value={password}
                autoComplete="new-password"
                disabled={finished}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
                className="max-w-[320px] font-mono"
              />
              <Button type="button" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? "Hide" : "Show"}
              </Button>
            </div>
          </Field>

          {batch ? <BatchPanel title="Staff accounts" progress={batch} running={busy} /> : null}
          {problem ? <Alert variant="danger">{problem}</Alert> : null}
          {finished ? <Alert variant="success">Staff accounts are ready. Share the starting password with each person privately.</Alert> : null}
        </div>
      </ScreenBody>
      <StepFoot
        primary={finished ? "Continue" : "Add staff"}
        primaryDisabled={!finished && (rows.length === 0 || staffRoles.length === 0)}
        onPrimary={finished ? () => complete("users") : () => void run()}
        busy={busy}
        onSkip={finished ? undefined : () => { draft.current = null; skip("users"); }}
      />
    </Screen>
  );
}

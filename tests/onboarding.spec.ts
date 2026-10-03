import { expect, test, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { emptyProgress, type StepId } from "../src/lib/progress";

const statesData: { state: string; districts: string }[] = JSON.parse(
  readFileSync(new URL("../data_source/states-and-districts.json", import.meta.url), "utf8"),
);

const states = statesData.map((s, i) => ({ id: `state-${i}`, name: s.state }));
const districts = statesData.flatMap((s, i) =>
  s.districts.split(",").filter((d) => d.trim()).map((name, j) => ({ id: `district-${i}-${j}`, name: name.trim(), parent: { id: `state-${i}` } })),
);
const roles = ["Administrator", "Facility Admin", "Doctor", "Nurse", "Staff", "Pharmacist", "Volunteer"]
  .map((name, i) => ({ name, id: `role-${i}` }));

async function fillStaffRow(page: import("@playwright/test").Page, index = 0) {
  await page.getByLabel("First name").nth(index).fill(`Example ${index + 1}`);
  await page.getByLabel("Last name").nth(index).fill("Doctor");
  await page.getByLabel("Username").nth(index).fill(`example_doctor_${index + 1}`);
  await page.getByRole("textbox", { name: "Email", exact: true }).nth(index).fill(`example${index + 1}@clinic.test`);
  await page.getByRole("textbox", { name: "Phone", exact: true }).nth(index).fill(`900000000${index}`);
  await page.getByRole("combobox", { name: "Role", exact: true }).nth(index).click();
  await page.getByRole("option", { name: "Doctor", exact: true }).click();
  await page.getByRole("combobox", { name: "Gender", exact: true }).nth(index).click();
  await page.getByRole("option", { name: "Female", exact: true }).click();
}

async function backend(context: BrowserContext, superuser = true) {
  const writes: string[] = [];
  const phonePayloads: string[] = [];
  const membershipPayloads: { path: string; user: string; role: string }[] = [];
  let facility: Record<string, unknown> | undefined;
  const questionnaires = new Map<string, Record<string, unknown>>();
  let template: Record<string, unknown> | undefined;
  const departments = [{ id: "administration", name: "Administration", org_type: "root" }];
  const locations: { id: string; name: string }[] = [];
  const users = new Map<string, { id: string; username: string }>();
  const memberships = new Map<string, { user: { id: string }; role: { id: string } }[]>();
  const locationOrganizations = new Map<string, { id: string }[]>();
  const identifiers: Record<string, unknown>[] = [];
  let rejectUser = false;
  let rejectQuestionnaire = false;
  await context.addInitScript(() => localStorage.setItem("care_access_token", "test-token"));
  await context.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    const method = request.method();
    const body = request.postDataJSON();
    const send = (json: unknown, status = 200) => route.fulfill({ json, status });
    const page = (rows: unknown[]) => {
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 100);
      return send({ count: rows.length, results: rows.slice(offset, offset + limit) });
    };
    if (method === "POST") writes.push(path);
    if (path === "/users/getcurrentuser/") return send({ is_superuser: superuser });
    if (path === "/facility/" && method === "GET") return page(facility ? [facility] : []);
    if (path === "/facility/" && method === "POST") {
      phonePayloads.push(body.phone_number);
      facility = { ...body, id: "clinic-1", geo_organization: { id: body.geo_organization } };
      return send(facility);
    }
    if (path === "/organization/") {
      if (url.searchParams.get("org_type") === "role") return page(roles);
      if (url.searchParams.get("parent")) return page(districts.filter((d) => d.parent.id === url.searchParams.get("parent")));
      return page(url.searchParams.get("level_cache") === "0" ? states : districts);
    }
    if (path === "/role/") return page(roles);
    if (path === "/facility/clinic-1/organizations/") {
      if (method === "GET") return page(departments);
      const department = { ...body, id: `dept-${departments.length}` };
      departments.push(department);
      return send(department);
    }
    if (path === "/facility/clinic-1/location/") {
      if (method === "GET") return page(locations);
      const location = { ...body, id: `location-${locations.length}` };
      locations.push(location);
      return send(location);
    }
    if (/\/location\/[^/]+\/organizations\/$/.test(path)) return send(locationOrganizations.get(path) ?? []);
    if (path.endsWith("/organizations_add/")) {
      const listPath = path.replace("/organizations_add/", "/organizations/");
      locationOrganizations.set(listPath, [...(locationOrganizations.get(listPath) ?? []), { id: body.organization }]);
      return send({});
    }
    if (/\/organizations\/[^/]+\/users\/$/.test(path)) {
      if (method === "GET") return page(memberships.get(path) ?? []);
      membershipPayloads.push({ path, ...body });
      memberships.set(path, [...(memberships.get(path) ?? []), { user: { id: body.user }, role: { id: body.role } }]);
      return send({});
    }
    if (path === "/users/" && method === "POST") {
      if (rejectUser) {
        rejectUser = false;
        return send({ email: ["This email is already in use."], password: ["This password is too common."] }, 400);
      }
      phonePayloads.push(body.phone_number);
      const user = { ...body, id: `user-${users.size}` };
      users.set(body.username, user);
      return send(user);
    }
    if (path.startsWith("/users/")) return users.has(path.split("/")[2]) ? send(users.get(path.split("/")[2])) : send({}, 404);
    if (path.endsWith("/set_invoice_expression/")) return send({});
    if (path === "/patient_identifier_config/") {
      if (method === "GET") return page(identifiers);
      const config = { ...body, id: "identifier-1" };
      identifiers.push(config);
      return send(config);
    }
    if (path === "/template/") {
      if (method === "GET") return page(template ? [template] : []);
      template = { ...body, id: "template-1", slug: `i-${body.slug_value}` };
      return send(template);
    }
    if (path === "/questionnaire/" && method === "POST") {
      if (rejectQuestionnaire) {
        rejectQuestionnaire = false;
        return send({ detail: "Questionnaire could not be saved" }, 500);
      }
      if (!Array.isArray(body.actions)) return send({ detail: "Actions must be explicit" }, 500);
      questionnaires.set(body.slug, { ...body, id: `questionnaire-${questionnaires.size}`, organizations: [] });
      return send(questionnaires.get(body.slug));
    }
    if (path === "/questionnaire/" && method === "GET") {
      return page([...questionnaires.values()].filter((q) => q.slug === url.searchParams.get("slug")));
    }
    if (path.startsWith("/questionnaire/")) {
      const id = path.split("/")[2];
      const item = [...questionnaires.values()].find((q) => q.id === id);
      if (!item) return send({}, 404);
      if (path.endsWith("/get_organizations/")) return page((item.organizations as string[]).map((id) => ({ id })));
      if (path.endsWith("/set_organizations/")) {
        item.organizations = body.organizations;
        return send({});
      }
      return send(item);
    }
    return send({ detail: `Unexpected test request: ${method} ${path}` }, 500);
  });
  return { writes, phonePayloads, membershipPayloads,
    rejectNextUser: () => { rejectUser = true; },
    rejectNextQuestionnaire: () => { rejectQuestionnaire = true; },
    setFacility: (value: Record<string, unknown>) => { facility = value; } };
}

async function resumeAt(context: BrowserContext, step: StepId) {
  const progress = {
    ...emptyProgress(), step, facilityId: "clinic-1", facilityName: "Example Clinic",
    districtId: "district-0-0", roleOrganizations: Object.fromEntries(roles.map((r) => [r.name, r.id])),
  };
  await context.addInitScript((progress) => {
    localStorage.setItem(`care_onboarding_fe:${location.origin}:progress`, JSON.stringify(progress));
  }, progress);
}

test("loads as a federated remote and completes simple onboarding without editing static data", async ({ page, context }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { writes } = await backend(context);
  await page.goto("/admin/onboarding");
  await expect(page.getByRole("heading", { name: "Let's prepare your clinic" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Get started" })).toHaveCSS("background-color", "rgb(4, 108, 78)");
  await page.screenshot({ path: testInfo.outputPath("onboarding-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("combobox", { name: "State", exact: true }).click();
  await page.getByRole("option", { name: states[0].name, exact: true }).click();
  await page.getByRole("combobox", { name: "District", exact: true }).click();
  const district = districts.find((d) => d.parent.id === states[0].id)!;
  await page.getByRole("option", { name: district.name, exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("combobox", { name: "Clinic type" }).click();
  await page.getByRole("option", { name: "Private Hospital", exact: true }).click();
  await page.getByLabel("Clinic name").fill("Example Clinic");
  await page.getByLabel("Phone number").fill("9000000000");
  await page.getByLabel("PIN code").fill("683101");
  await page.getByLabel("Address").fill("Example road");
  await page.getByRole("button", { name: "Create clinic" }).click();
  for (const heading of ["Departments", "Staff accounts", "Invoice numbers", "Patient numbers"]) {
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Do this later" }).click();
  }
  await expect(page.getByRole("heading", { name: "Clinical forms" })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Add clinical forms" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  expect(writes.filter((path) => path === "/template/")).toHaveLength(0);
  await expect(page.getByRole("heading", { name: "Report templates", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Report templates", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add report templates" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: "Your clinic is set up" })).toBeVisible();
  expect(writes.filter((path) => path === "/facility/")).toHaveLength(1);
  expect(writes.filter((path) => path === "/questionnaire/")).toHaveLength(8);
  expect(writes.filter((path) => path === "/template/")).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your clinic is set up" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("superuser landing redirects to setup using only authenticated existing APIs", async ({ page, context }) => {
  const { writes } = await backend(context);
  const paths: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/")) paths.push(new URL(request.url()).pathname);
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/admin\/onboarding$/);
  await expect(page.getByRole("heading", { name: "Let's prepare your clinic" })).toBeVisible();
  expect(paths).toContain("/api/v1/facility/");
  expect(paths).not.toContain("/api/v1/plug_config/setup_status/");
  expect(writes).toEqual([]);
  await page.reload();
  await expect(page).toHaveURL(/\/admin\/onboarding$/);
});

test("existing private clinic keeps normal dashboard even with no assigned facilities", async ({ page, context }) => {
  const { setFacility, writes } = await backend(context);
  setFacility({ id: "private-clinic", name: "Private Clinic", is_public: false });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "CARE dashboard" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  expect(writes).toEqual([]);
});

test("ordinary users keep their dashboard without a facility check", async ({ page, context }) => {
  await backend(context, false);
  const facilities: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/facility/") facilities.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "CARE dashboard" })).toBeVisible();
  expect(facilities).toEqual([]);
});

test("post-login opt-out leaves the dashboard and manual setup available", async ({ page, context }) => {
  await backend(context);
  await context.addInitScript(() => {
    window.__CARE_PLUGIN_RUNTIME__ = { meta: { care_onboarding_fe: { config: { redirect_after_login: false } } } };
  });
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/")) calls.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "CARE dashboard" })).toBeVisible();
  expect(calls).toEqual([]);
  await page.goto("/admin/onboarding");
  await expect(page.getByRole("heading", { name: "Let's prepare your clinic" })).toBeVisible();
});

test("failed dashboard check reports an error and retry can detect an existing clinic", async ({ page, context }) => {
  const { setFacility } = await backend(context);
  setFacility({ id: "clinic", name: "Existing Clinic" });
  let failed = true;
  await context.route("**/api/v1/facility/**", (route) =>
    failed ? route.fulfill({ json: { detail: "Unavailable" }, status: 503 }) : route.fallback(),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Could not check whether your clinic needs setup");
  await expect(page).toHaveURL(/\/$/);
  failed = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "CARE dashboard" })).toBeVisible();
});

test("malformed facility response never triggers automatic setup", async ({ page, context }) => {
  await backend(context);
  await context.route("**/api/v1/facility/**", (route) =>
    route.fulfill({ json: { count: 1, results: [] } }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("unexpected clinic list");
  await expect(page).toHaveURL(/\/$/);
});

test("blocks ordinary users and never writes", async ({ page, context }) => {
  const { writes } = await backend(context, false);
  await page.goto("/admin/onboarding");
  await expect(page.getByRole("alert")).toContainText("Only a CARE administrator");
  expect(writes).toEqual([]);
});

test("stale setup resets only its checkpoint after confirmation and stays reset on reload", async ({ page, context }) => {
  const { writes } = await backend(context);
  const saved = {
    ...emptyProgress(), step: "done", facilityId: "old-clinic", facilityName: "Old Clinic",
    done: { facility: true }, users: ["old-user"], roleOrganizations: { Doctor: "old-role" },
  };
  await context.addInitScript((saved) => {
    const key = `care_onboarding_fe:${location.origin}:progress`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(saved));
    localStorage.setItem("care_onboarding_fe:https://other.example:progress", "other-checkpoint");
    localStorage.setItem("unrelated-preference", "keep");
  }, saved);
  await page.goto("/admin/onboarding");
  await expect(page.getByRole("heading", { name: "Set up a new clinic", exact: true })).toBeVisible();
  await expect(page.getByText("Let's get your clinic ready to use CARE.", { exact: false })).toBeVisible();
  const before = await page.evaluate(() => ({ ...localStorage }));
  await page.getByRole("button", { name: "Set up a new clinic", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ready to set up a new clinic?" })).toBeVisible();
  await expect(page.getByText("No clinic records will be deleted, and you will stay signed in.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
  await page.getByRole("button", { name: "Set up a new clinic", exact: true }).click();
  await page.getByRole("button", { name: "Start new setup", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Let's prepare your clinic" })).toBeVisible();
  const expected = {
    ...before,
    [`care_onboarding_fe:${new URL(page.url()).origin}:progress`]: JSON.stringify(emptyProgress()),
  };
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(expected);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Let's prepare your clinic" })).toBeVisible();
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(expected);
  expect(writes).toEqual([]);
});

for (const scenario of [
  { name: "matching clinic", id: "clinic-1", heading: "Departments" },
  { name: "different clinic", id: "other-clinic", heading: "Your clinic is already in CARE" },
]) {
  test(`stale setup reset is unavailable with a ${scenario.name}`, async ({ page, context }) => {
    const { setFacility, writes } = await backend(context);
    setFacility({ id: scenario.id, name: "Existing Clinic" });
    await resumeAt(context, "departments");
    await page.goto("/admin/onboarding");
    await expect(page.getByRole("heading", { name: scenario.heading, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Set up a new clinic", exact: true })).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}

for (const failure of ["connection", "401", "403", "503", "malformed", "ordinary user"]) {
  test(`stale setup reset is unavailable after ${failure}`, async ({ page, context }) => {
    const { writes } = await backend(context, failure !== "ordinary user");
    await resumeAt(context, "departments");
    if (failure !== "ordinary user") {
      await context.route("**/api/v1/facility/**", (route) => {
        if (failure === "connection") return route.abort();
        if (failure === "malformed") return route.fulfill({ json: { count: 1, results: [] } });
        return route.fulfill({ status: Number(failure), json: { detail: "Unavailable" } });
      });
    }
    await page.goto("/admin/onboarding");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "Set up a new clinic", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() =>
      JSON.parse(localStorage.getItem(`care_onboarding_fe:${location.origin}:progress`)!).facilityId,
    )).toBe("clinic-1");
    expect(writes).toEqual([]);
  });
}

test("stale setup rechecks CARE before restarting after reset", async ({ page, context }) => {
  const { setFacility, writes } = await backend(context);
  await resumeAt(context, "departments");
  await page.goto("/admin/onboarding");
  await page.getByRole("button", { name: "Set up a new clinic", exact: true }).click();
  setFacility({ id: "new-clinic", name: "Another Clinic" });
  await page.getByRole("button", { name: "Start new setup", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your clinic is already in CARE" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Get started", exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("stale setup storage failure blocks restart and preserves the checkpoint", async ({ page, context }) => {
  const { writes } = await backend(context);
  await resumeAt(context, "departments");
  await page.goto("/admin/onboarding");
  await page.getByRole("button", { name: "Set up a new clinic", exact: true }).click();
  const before = await page.evaluate(() => ({ ...localStorage }));
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException("Storage full", "QuotaExceededError"); };
  });
  await page.getByRole("button", { name: "Start new setup", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("This browser cannot save setup progress");
  await expect(page.getByRole("button", { name: "Get started", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
  expect(writes).toEqual([]);
});

test("fits a phone viewport and prevents concurrent setup tabs", async ({ page, context }, testInfo) => {
  await backend(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/onboarding");
  await expect(page.getByRole("heading", { name: "Let's prepare your clinic" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("onboarding-mobile.png"), fullPage: true });
  const other = await context.newPage();
  await other.goto("/admin/onboarding");
  await expect(other.getByRole("alert")).toContainText("already open in another tab");
  await page.close();
  await other.reload();
  await expect(other.getByRole("heading", { name: "Let's prepare your clinic" })).toBeVisible();
});

for (const volunteerName of ["Volunteer", "  vOlUnTeEr  "]) {
  test(`staff role dropdown excludes ${JSON.stringify(volunteerName)} while allowing Doctor`, async ({ page, context }) => {
    const { setFacility } = await backend(context);
    setFacility({ id: "clinic-1", name: "Example Clinic" });
    await context.route("**/api/v1/role/**", (route) => {
      const results = roles.map((role) => role.name === "Volunteer" ? { ...role, name: volunteerName } : role);
      return route.fulfill({ json: { count: results.length, results } });
    });
    await resumeAt(context, "users");
    await page.goto("/admin/onboarding");
    const role = page.getByRole("combobox", { name: "Role", exact: true });
    await role.click();
    await expect(page.getByRole("option", { name: /volunteer/i })).toHaveCount(0);
    await expect(page.getByRole("option", { name: "Administrator", exact: true })).toHaveCount(0);
    await expect(page.getByRole("option", { name: "Facility Admin", exact: true })).toHaveCount(0);
    await page.getByRole("option", { name: "Doctor", exact: true }).click();
    await expect(role).toHaveText("Doctor");
    const facilityAdmin = page.getByRole("checkbox", { name: "Can manage the clinic" });
    await facilityAdmin.check();
    await expect(facilityAdmin).toBeChecked();
    await expect(role).toHaveText("Doctor");
  });
}

test("creates department links, staff access and numbering before loading standard forms", async ({ page, context }, testInfo) => {
  const { writes, phonePayloads, membershipPayloads, rejectNextUser, setFacility } = await backend(context);
  setFacility({ id: "clinic-1", name: "Example Clinic" });
  await context.addInitScript(({ roleOrganizations }) => {
    localStorage.setItem(`care_onboarding_fe:${location.origin}:progress`, JSON.stringify({
      version: 2, dataset: "2026-09-30", step: "departments",
      done: { states: true, district: true, facility: true }, skipped: {},
      stateId: "state-0", stateName: "State", districtId: "district-0-0", districtName: "District",
      facilityId: "clinic-1", facilityName: "Example Clinic", initials: "EC",
      administrationId: "", roleOrganizations, departments: [], users: [], facilityIntent: null,
    }));
  }, { roleOrganizations: Object.fromEntries(roles.map((r) => [r.name, r.id])) });
  await page.goto("/admin/onboarding");
  await page.getByRole("button", { name: "Laboratory", exact: true }).click();
  await page.getByRole("button", { name: "Save departments" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  for (const label of ["Starting password for all staff", "First name", "Last name", "Username", "Email", "Phone"]) {
    const input = page.getByRole("textbox", { name: label, exact: true });
    const control = label === "Starting password for all staff" ? page.getByLabel(label) : input;
    await expect(control).toHaveAttribute("aria-invalid", "true");
    await expect(control).toHaveCSS("border-top-color", /rgb\(239, 68, 68\)|oklch\(0.637 0.237 25.331\)/);
    await expect(control).toHaveAccessibleDescription(/.+/);
  }
  for (const label of ["Role", "Gender"]) {
    await expect(page.getByRole("combobox", { name: label, exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("combobox", { name: label, exact: true })).toHaveCSS("border-top-color", /rgb\(239, 68, 68\)|oklch\(0.637 0.237 25.331\)/);
  }
  await page.screenshot({ path: testInfo.outputPath("staff-inline-errors.png"), fullPage: true });
  await page.getByLabel("Starting password for all staff").fill("Starting-password-42");
  await page.getByLabel("First name").fill("Example");
  await page.getByLabel("Last name").fill("Doctor");
  await page.getByLabel("Username").fill("example_doctor");
  await page.getByRole("combobox", { name: "Role", exact: true }).click();
  await expect(page.getByRole("option", { name: "Facility Admin", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Administrator", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Volunteer", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Doctor", exact: true }).click();
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("example@clinic.test");
  await expect(page.getByRole("combobox", { name: "Country calling code" })).toHaveText("IN +91");
  await page.getByRole("combobox", { name: "Country calling code" }).click();
  await page.getByRole("option", { name: "United Kingdom (+44)", exact: true }).click();
  await page.getByRole("textbox", { name: "Phone", exact: true }).fill("7700900123");
  await page.getByRole("combobox", { name: "Gender", exact: true }).click();
  await page.getByRole("option", { name: "Female", exact: true }).click();
  await page.getByRole("checkbox", { name: "Can manage the clinic" }).check();
  await page.getByRole("button", { name: "Laboratory", exact: true }).click();
  rejectNextUser();
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveAccessibleDescription("This email is already in use.");
  await expect(page.getByLabel("Starting password for all staff")).toHaveAccessibleDescription("This password is too common.");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("updated@clinic.test");
  await page.getByLabel("Starting password for all staff").fill("Updated-password-42");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  for (const heading of ["Invoice numbers", "Patient numbers"]) {
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    const prefix = page.getByRole("textbox");
    await prefix.fill("");
    await page.getByRole("button", { name: `Save ${heading.toLowerCase()}`, exact: true }).click();
    await expect(prefix).toHaveAttribute("aria-invalid", "true");
    await expect(prefix).toBeFocused();
    await expect(prefix).toHaveAccessibleDescription("Enter at least 2 letters or digits.");
    await prefix.fill("EC");
    await page.getByRole("button", { name: `Save ${heading.toLowerCase()}`, exact: true }).click();
    await expect(page.locator('[data-slot="alert"][role="status"]')).toHaveCSS("background-color", /rgb\(240, 253, 244\)|oklch\(0.982 0.018 155.826\)/);
    await page.screenshot({ path: testInfo.outputPath(`${heading.replace(" ", "-")}-saved.png`), fullPage: true });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await page.getByRole("button", { name: "Add clinical forms" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Add report templates" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: "Your clinic is set up" })).toBeVisible();
  expect(writes.filter((path) => path.endsWith("/organizations_add/"))).toHaveLength(2);
  expect(writes.filter((path) => /\/organizations\/[^/]+\/users\/$/.test(path))).toHaveLength(2);
  expect(writes).toContain("/facility/clinic-1/set_invoice_expression/");
  expect(writes).toContain("/patient_identifier_config/");
  expect(phonePayloads).toEqual(["+447700900123"]);
  expect(membershipPayloads).toContainEqual({
    path: "/facility/clinic-1/organizations/administration/users/",
    user: "user-0", role: roles.find((role) => role.name === "Facility Admin")!.id,
  });
  const saved = await page.evaluate(() => localStorage.getItem(`care_onboarding_fe:${location.origin}:progress`));
  expect(saved).not.toContain("Starting-password-42");
  expect(saved).not.toContain("example@clinic.test");
});

test("clinic phone defaults to India, sanitizes typing and paste, and rejects short numbers", async ({ page, context }) => {
  const { writes, phonePayloads } = await backend(context);
  await context.addInitScript(() => {
    localStorage.setItem(`care_onboarding_fe:${location.origin}:progress`, JSON.stringify({
      version: 2, dataset: "2026-09-30", step: "facility",
      done: { states: true, district: true }, skipped: {},
      stateId: "state-0", stateName: "State", districtId: "district-0-0", districtName: "District",
      facilityId: "", facilityName: "", initials: "", administrationId: "",
      roleOrganizations: {}, departments: [], users: [], facilityIntent: null,
    }));
  });
  await page.goto("/admin/onboarding");
  const country = page.getByRole("combobox", { name: "Country calling code" });
  const phone = page.getByRole("textbox", { name: "Phone number", exact: true });
  await expect(country).toHaveText("IN +91");
  await country.click();
  expect(await page.getByRole("option").count()).toBeGreaterThan(200);
  await expect(page.getByRole("listbox")).toHaveCSS("max-height", "280px");
  await page.keyboard.press("Escape");
  await phone.pressSequentially("abc90000xyz");
  await expect(phone).toHaveValue("90000");
  await page.getByRole("button", { name: "Create clinic" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "exactly 10 digits" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Address", exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("textbox", { name: "Address", exact: true })).toHaveAccessibleDescription("Enter the address.");
  expect(writes).toEqual([]);
  await phone.fill("");
  await phone.evaluate((element) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text", "90abc 000-00000 123");
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect(phone).toHaveValue("9000000000");
  await phone.press("End");
  await phone.pressSequentially("123");
  await expect(phone).toHaveValue("9000000000");
  await page.getByRole("combobox", { name: "Clinic type" }).click();
  await page.getByRole("option", { name: "Private Hospital", exact: true }).click();
  await page.getByLabel("Clinic name").fill("Phone Test Clinic");
  await page.getByLabel("PIN code").fill("683101");
  await page.getByLabel("Address").fill("Example road");
  await page.getByRole("button", { name: "Create clinic" }).click();
  await expect(page.getByRole("heading", { name: "Departments", exact: true })).toBeVisible();
  expect(phonePayloads).toEqual(["+919000000000"]);
});

test("clinic PIN code limits typing and paste to six digits and requires all six on submission", async ({ page, context }) => {
  const { writes } = await backend(context);
  await context.addInitScript((progress) => {
    localStorage.setItem(`care_onboarding_fe:${location.origin}:progress`, JSON.stringify(progress));
  }, {
    ...emptyProgress(), step: "facility", done: { states: true, district: true },
    stateId: "state-0", stateName: "State", districtId: "district-0-0", districtName: "District",
  });
  await page.goto("/admin/onboarding");
  await page.getByRole("combobox", { name: "Clinic type" }).click();
  await page.getByRole("option", { name: "Private Hospital", exact: true }).click();
  await page.getByLabel("Clinic name").fill("PIN Test Clinic");
  await page.getByLabel("Phone number").fill("9000000000");
  await page.getByLabel("Address").fill("Example road");
  const pin = page.getByRole("textbox", { name: "PIN code", exact: true });
  await expect(pin).toHaveAttribute("maxlength", "6");
  for (const value of ["", "01234"]) {
    await pin.fill(value);
    await page.getByRole("button", { name: "Create clinic" }).click();
    await expect(pin).toHaveAttribute("aria-invalid", "true");
    await expect(pin).toHaveAccessibleDescription("Enter the 6-digit PIN code.");
    expect(writes).toEqual([]);
  }
  await pin.fill("");
  await pin.pressSequentially("abc01xyz23456789");
  await expect(pin).toHaveValue("012345");
  await expect(pin).toHaveAttribute("aria-invalid", "false");
  await pin.fill("");
  await pin.evaluate((element) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text", "01abc 23-456789");
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect(pin).toHaveValue("012345");
  await pin.evaluate((element: HTMLInputElement) => {
    element.setSelectionRange(2, 4);
    const clipboardData = new DataTransfer();
    clipboardData.setData("text", "9x8");
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect(pin).toHaveValue("019845");
  const created = page.waitForRequest((request) =>
    new URL(request.url()).pathname === "/api/v1/facility/" && request.method() === "POST",
  );
  await page.getByRole("button", { name: "Create clinic" }).click();
  expect((await created).postDataJSON().pincode).toBe(19845);
  await expect(page.getByRole("heading", { name: "Departments", exact: true })).toBeVisible();
  expect(writes.filter((path) => path === "/facility/")).toHaveLength(1);
});

test("duplicate staff identifiers show errors at each affected input without writes", async ({ page, context }) => {
  const { writes, setFacility } = await backend(context);
  setFacility({ id: "clinic-1", name: "Example Clinic" });
  await resumeAt(context, "users");
  await page.goto("/admin/onboarding");
  await page.getByRole("button", { name: "Add another staff member" }).click();
  for (const field of [
    { name: "Username", value: "same_user" },
    { name: "Email", value: "same@clinic.test" },
    { name: "Phone", value: "9000000000" },
  ]) {
    for (const control of await page.getByRole("textbox", { name: field.name, exact: true }).all()) {
      await control.fill(field.value);
    }
  }
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  for (const name of ["Username", "Email", "Phone"]) {
    for (const control of await page.getByRole("textbox", { name, exact: true }).all()) {
      await expect(control).toHaveAttribute("aria-invalid", "true");
      await expect(control).toHaveAccessibleDescription(/different username|already entered/);
    }
  }
  expect(writes).toEqual([]);
});

test("a failed questionnaire blocks continuation and retries only the missing import", async ({ page, context }) => {
  const { writes, setFacility, rejectNextQuestionnaire } = await backend(context);
  setFacility({ id: "clinic-1", name: "Example Clinic" });
  await resumeAt(context, "questionnaires");
  rejectNextQuestionnaire();
  await page.goto("/admin/onboarding");
  await page.getByRole("button", { name: "Add clinical forms" }).click();
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toHaveCount(0);
  await expect(page.getByRole("progressbar", { name: "Clinical forms progress" })).toHaveAttribute("aria-valuenow", "88");
  await expect(page.getByText("7 of 8 ready", { exact: true })).toBeVisible();
  await expect(page.getByText("Choose Try again below.", { exact: false })).toBeVisible();
  expect(writes.filter((path) => path === "/template/")).toHaveLength(0);
  expect(writes.filter((path) => path === "/questionnaire/")).toHaveLength(8);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("progressbar", { name: "Clinical forms progress" })).toHaveAttribute("aria-valuenow", "100");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Report templates", exact: true })).toBeVisible();
  expect(writes.filter((path) => path === "/questionnaire/")).toHaveLength(9);
});

test("every staff row requires a department before any user or membership writes", async ({ page, context }) => {
  const { writes, membershipPayloads, setFacility } = await backend(context);
  setFacility({ id: "clinic-1", name: "Example Clinic" });
  await resumeAt(context, "departments");
  await page.goto("/admin/onboarding");
  await page.getByRole("button", { name: "Laboratory", exact: true }).click();
  await page.getByRole("button", { name: "Save departments" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Starting password for all staff").fill("Starting-password-42");
  await fillStaffRow(page);
  await page.getByRole("button", { name: "Add another staff member" }).click();
  await expect(page.getByRole("textbox", { name: "First name", exact: true }).nth(1)).toBeFocused();
  await fillStaffRow(page, 1);
  const groups = page.getByRole("group", { name: "Departments (choose at least one)" });
  const startingPassword = page.getByLabel("Starting password for all staff");
  await expect(startingPassword).toHaveCount(1);
  await expect(startingPassword).toBeVisible();
  for (const beforePassword of [groups.last(), page.getByRole("button", { name: "Add another staff member" })]) {
    expect(await beforePassword.evaluate((element) =>
      !!(element.compareDocumentPosition(document.getElementById("pw")!) & Node.DOCUMENT_POSITION_FOLLOWING),
    )).toBe(true);
  }
  expect(await page.getByRole("button", { name: "Add staff", exact: true }).evaluate((element) =>
    !!(element.compareDocumentPosition(document.getElementById("pw")!) & Node.DOCUMENT_POSITION_PRECEDING),
  )).toBe(true);
  await groups.nth(0).getByRole("button", { name: "Laboratory", exact: true }).click();
  await page.getByRole("checkbox", { name: "Can manage the clinic" }).nth(1).check();
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  await expect(groups.nth(0)).toHaveAttribute("aria-invalid", "false");
  await expect(groups.nth(1)).toHaveAttribute("aria-invalid", "true");
  await expect(groups.nth(1)).toHaveAccessibleDescription("Choose at least one department for this staff member.");
  await expect(groups.nth(1).getByRole("alert")).toBeVisible();
  expect(writes.filter((path) => path === "/users/")).toEqual([]);
  expect(membershipPayloads).toEqual([]);
  const department = groups.nth(1).getByRole("button", { name: /Laboratory/ });
  await department.click();
  await expect(department).toHaveAttribute("aria-pressed", "true");
  await expect(groups.nth(1).getByRole("alert")).toHaveCount(0);
  await department.click();
  await expect(department).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  await expect(groups.nth(1).getByRole("alert")).toBeVisible();
  expect(writes.filter((path) => path === "/users/")).toEqual([]);
  expect(membershipPayloads).toEqual([]);
  await department.click();
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  await expect(page.getByText("Staff accounts are ready.", { exact: false })).toBeVisible();
  expect(writes.filter((path) => path === "/users/")).toHaveLength(2);
  expect(membershipPayloads.filter((payload) => payload.path.includes("/dept-1/"))).toHaveLength(2);
  expect(membershipPayloads.filter((payload) => payload.path.includes("/administration/"))).toHaveLength(1);
});

test("setup uses clear progress, Roles, and an expandable step list", async ({ page, context }, testInfo) => {
  const { writes } = await backend(context);
  let releaseRoles = () => {};
  const waitForRoles = new Promise<void>((resolve) => { releaseRoles = resolve; });
  await context.route("**/api/v1/organization/**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("org_type") === "role") await waitForRoles;
    return route.fallback();
  });
  await page.goto("/admin/onboarding");
  const navigation = page.getByRole("navigation", { name: "Setup progress" });
  await expect(navigation).toContainText("Step 1 of 9 - Get started");
  await expect(navigation.getByRole("list")).toBeHidden();
  await navigation.getByText("View all steps", { exact: true }).click();
  await expect(navigation.getByRole("listitem")).toHaveCount(9);
  await expect(navigation.locator('[aria-current="step"]')).toHaveText("1Get started");
  await expect(navigation.getByRole("button")).toHaveCount(0);
  await navigation.getByText("View all steps", { exact: true }).click();
  try {
    await page.getByRole("button", { name: "Get started", exact: true }).click();
    await expect(page.getByRole("button", { name: "Preparing CARE...", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toHaveCount(0);
  } finally {
    releaseRoles();
  }
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Roles", exact: true })).toBeVisible();
  await expect(page.getByText("Staff groups", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("progressbar", { name: "Roles progress" })).toHaveAttribute("aria-valuetext", "7 of 7 ready");
  await expect(page.getByText("0 failed", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("preparation-ready.png"), fullPage: true });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(navigation).toContainText("Step 2 of 9 - Clinic location");
  await expect(navigation.getByRole("list")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Where is your clinic?" })).toBeFocused();
  expect(writes).toEqual([]);
});

test("department quick choices can be toggled and duplicate names explain what to do", async ({ page, context }, testInfo) => {
  const { setFacility, writes } = await backend(context);
  setFacility({ id: "clinic-1", name: "Example Clinic" });
  await resumeAt(context, "departments");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/onboarding");
  await expect(page.getByRole("navigation", { name: "Setup progress" })).toContainText("Optional");
  const laboratory = page.getByRole("button", { name: "Laboratory", exact: true });
  const save = page.getByRole("button", { name: "Save departments", exact: true });
  await expect(save).toBeDisabled();
  await laboratory.click();
  await expect(laboratory).toHaveAttribute("aria-pressed", "true");
  await expect(laboratory).toHaveCSS("border-top-width", "1px");
  await laboratory.click();
  await expect(laboratory).toHaveAttribute("aria-pressed", "false");
  await expect(save).toBeDisabled();
  await laboratory.click();
  await page.getByLabel("Department name", { exact: true }).fill("laboratory");
  await page.getByRole("button", { name: "Add to list", exact: true }).click();
  await expect(page.getByLabel("Department name", { exact: true })).toHaveAccessibleDescription("This department is already on your list.");
  await page.getByLabel("Department name", { exact: true }).fill("");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("departments-mobile.png"), fullPage: true });
  await page.getByLabel("Department name", { exact: true }).fill("ENT");
  await save.click();
  await expect(page.getByText("Departments are ready.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Do this later" })).toHaveCount(0);
  expect(writes.filter((path) => path === "/facility/clinic-1/organizations/")).toHaveLength(2);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem(`care_onboarding_fe:${location.origin}:progress`)!).departments,
  );
  expect(saved.map((department: { name: string }) => department.name)).toEqual(["Laboratory", "ENT"]);
});

test("staff roles can be reloaded without losing entered details", async ({ page, context }, testInfo) => {
  const { setFacility, writes } = await backend(context);
  setFacility({ id: "clinic-1", name: "Example Clinic" });
  let fail = true;
  await context.route("**/api/v1/role/**", (route) =>
    fail ? route.fulfill({ status: 503, json: { detail: "Unavailable" } }) : route.fallback(),
  );
  await resumeAt(context, "users");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/onboarding");
  await expect(page.getByRole("button", { name: "Reload roles" })).toBeVisible();
  await page.getByRole("textbox", { name: "First name", exact: true }).fill("Example");
  fail = false;
  await page.getByRole("button", { name: "Reload roles" }).click();
  await expect(page.getByRole("button", { name: "Reload roles" })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Role", exact: true }).click();
  await page.getByRole("option", { name: "Doctor", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "First name", exact: true })).toHaveValue("Example");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("staff-mobile.png"), fullPage: true });
  expect(writes).toEqual([]);
});

test("clinic location retries recover both lists and keep errors until the failed list recovers", async ({ page, context }) => {
  const { writes } = await backend(context);
  await context.addInitScript((progress) => {
    localStorage.setItem(`care_onboarding_fe:${location.origin}:progress`, JSON.stringify(progress));
  }, { ...emptyProgress(), step: "district", stateId: "state-0", districtId: "district-0-0" });
  let failStates = true;
  let failDistricts = true;
  await context.route("**/api/v1/organization/**", async (route) => {
    const districtRequest = new URL(route.request().url()).searchParams.has("parent");
    if (districtRequest ? failDistricts : failStates) return route.fulfill({ status: 503, json: { detail: "Unavailable" } });
    return route.fallback();
  });
  await page.goto("/admin/onboarding");
  const retry = page.getByRole("button", { name: "Try again", exact: true });
  await expect(retry).toBeEnabled();
  failStates = false;
  await retry.click();
  await expect(retry).toBeEnabled();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  failDistricts = false;
  await retry.click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();
  expect(writes).toEqual([]);
});

test("staff can return to skipped departments without losing drafts or saving them to browser storage", async ({ page, context }) => {
  const { writes, membershipPayloads, setFacility } = await backend(context);
  setFacility({ id: "clinic-1", name: "Example Clinic" });
  await resumeAt(context, "departments");
  await page.goto("/admin/onboarding");
  await page.getByRole("button", { name: "Do this later" }).click();
  await page.getByLabel("Starting password for all staff").fill("Starting-password-42");
  await fillStaffRow(page);
  await page.getByRole("checkbox", { name: "Can manage the clinic" }).check();
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Choose at least one department for this staff member.");
  expect(writes).toEqual([]);
  expect(membershipPayloads).toEqual([]);
  await page.getByRole("button", { name: "Go back to departments" }).click();
  await expect(page.getByRole("heading", { name: "Departments", exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(saved).not.toContain("Starting-password-42");
  expect(saved).not.toContain("example1@clinic.test");
  expect(saved).not.toContain("example_doctor_1");
  await page.getByRole("button", { name: "Laboratory", exact: true }).click();
  await page.getByRole("button", { name: "Save departments" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Starting password for all staff")).toHaveValue("Starting-password-42");
  await expect(page.getByLabel("Username")).toHaveValue("example_doctor_1");
  await expect(page.getByRole("checkbox", { name: "Can manage the clinic" })).toBeChecked();
  await expect(page.getByRole("button", { name: "Go back to departments" })).toHaveCount(0);
  await page.getByRole("button", { name: "Laboratory", exact: true }).click();
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Invoice numbers", exact: true })).toBeVisible();
  expect(writes.filter((path) => path === "/users/")).toHaveLength(1);
  expect(membershipPayloads).toHaveLength(2);
});

test("staff remains optional when no departments were created", async ({ page, context }) => {
  const { writes, setFacility } = await backend(context);
  setFacility({ id: "clinic-1", name: "Example Clinic" });
  await resumeAt(context, "users");
  await page.goto("/admin/onboarding");
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  await expect(page.getByText("Choose at least one department for this staff member.")).toBeVisible();
  await page.getByRole("button", { name: "Do this later" }).click();
  await expect(page.getByRole("heading", { name: "Invoice numbers", exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});

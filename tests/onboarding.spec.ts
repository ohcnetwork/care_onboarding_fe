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
  await page.getByRole("combobox", { name: "Facility type" }).click();
  await page.getByRole("option", { name: "Private Hospital", exact: true }).click();
  await page.getByLabel("Facility name").fill("Example Clinic");
  await page.getByLabel("Phone number").fill("9000000000");
  await page.getByLabel("PIN code").fill("683101");
  await page.getByLabel("Address").fill("Example road");
  await page.getByRole("button", { name: "Create clinic" }).click();
  for (const heading of ["Departments", "Staff accounts", "Invoice numbers", "Patient numbers"]) {
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Skip for now" }).click();
  }
  await expect(page.getByRole("heading", { name: "Clinical questionnaires" })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Load questionnaires" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  expect(writes.filter((path) => path === "/template/")).toHaveLength(0);
  await expect(page.getByRole("heading", { name: "Report templates", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Report templates", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load report templates" }).click();
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
  await page.getByRole("button", { name: "Create departments" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  for (const label of ["Starting password for all users", "First name", "Last name", "Username", "Email", "Phone"]) {
    const input = page.getByRole("textbox", { name: label, exact: true });
    const control = label === "Starting password for all users" ? page.getByLabel(label) : input;
    await expect(control).toHaveAttribute("aria-invalid", "true");
    await expect(control).toHaveCSS("border-top-color", /rgb\(239, 68, 68\)|oklch\(0.637 0.237 25.331\)/);
    await expect(control).toHaveAccessibleDescription(/.+/);
  }
  for (const label of ["Role", "Gender"]) {
    await expect(page.getByRole("combobox", { name: label, exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("combobox", { name: label, exact: true })).toHaveCSS("border-top-color", /rgb\(239, 68, 68\)|oklch\(0.637 0.237 25.331\)/);
  }
  await page.screenshot({ path: testInfo.outputPath("staff-inline-errors.png"), fullPage: true });
  await page.getByLabel("Starting password for all users").fill("Starting-password-42");
  await page.getByLabel("First name").fill("Example");
  await page.getByLabel("Last name").fill("Doctor");
  await page.getByLabel("Username").fill("example_doctor");
  await page.getByRole("combobox", { name: "Role", exact: true }).click();
  await expect(page.getByRole("option", { name: "Facility Admin", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Administrator", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Doctor", exact: true }).click();
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("example@clinic.test");
  await expect(page.getByRole("combobox", { name: "Country calling code" })).toHaveText("IN +91");
  await page.getByRole("combobox", { name: "Country calling code" }).click();
  await page.getByRole("option", { name: "United Kingdom (+44)", exact: true }).click();
  await page.getByRole("textbox", { name: "Phone", exact: true }).fill("7700900123");
  await page.getByRole("combobox", { name: "Gender", exact: true }).click();
  await page.getByRole("option", { name: "Female", exact: true }).click();
  await page.getByRole("checkbox", { name: "Add as Facility Admin in Administration" }).check();
  await page.getByRole("button", { name: "Laboratory", exact: true }).click();
  rejectNextUser();
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveAccessibleDescription("This email is already in use.");
  await expect(page.getByLabel("Starting password for all users")).toHaveAccessibleDescription("This password is too common.");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("updated@clinic.test");
  await page.getByLabel("Starting password for all users").fill("Updated-password-42");
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  for (const heading of ["Invoice numbers", "Patient numbers"]) {
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    const prefix = page.getByRole("textbox");
    await prefix.fill("");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(prefix).toHaveAttribute("aria-invalid", "true");
    await expect(prefix).toHaveAccessibleDescription("Enter at least 2 letters or digits.");
    await prefix.fill("EC");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator('[data-slot="alert"][role="status"]')).toHaveCSS("background-color", /rgb\(240, 253, 244\)|oklch\(0.982 0.018 155.826\)/);
    await page.screenshot({ path: testInfo.outputPath(`${heading.replace(" ", "-")}-saved.png`), fullPage: true });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await page.getByRole("button", { name: "Load questionnaires" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Load report templates" }).click();
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
  await page.getByRole("combobox", { name: "Facility type" }).click();
  await page.getByRole("option", { name: "Private Hospital", exact: true }).click();
  await page.getByLabel("Facility name").fill("Phone Test Clinic");
  await page.getByLabel("PIN code").fill("683101");
  await page.getByLabel("Address").fill("Example road");
  await page.getByRole("button", { name: "Create clinic" }).click();
  await expect(page.getByRole("heading", { name: "Departments", exact: true })).toBeVisible();
  expect(phonePayloads).toEqual(["+919000000000"]);
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
  await page.getByRole("button", { name: "Load questionnaires" }).click();
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toHaveCount(0);
  expect(writes.filter((path) => path === "/template/")).toHaveLength(0);
  expect(writes.filter((path) => path === "/questionnaire/")).toHaveLength(8);
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Report templates", exact: true })).toBeVisible();
  expect(writes.filter((path) => path === "/questionnaire/")).toHaveLength(9);
});

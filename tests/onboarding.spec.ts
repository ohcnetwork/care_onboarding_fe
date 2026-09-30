import { expect, test, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";

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
  let facility: Record<string, unknown> | undefined;
  const questionnaires = new Map<string, Record<string, unknown>>();
  let template: Record<string, unknown> | undefined;
  const departments = [{ id: "administration", name: "Administration", org_type: "root" }];
  const locations: { id: string; name: string }[] = [];
  const users = new Map<string, { id: string; username: string }>();
  const memberships = new Map<string, { user: { id: string }; role: { id: string } }[]>();
  const locationOrganizations = new Map<string, { id: string }[]>();
  const identifiers: Record<string, unknown>[] = [];
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
      memberships.set(path, [...(memberships.get(path) ?? []), { user: { id: body.user }, role: { id: body.role } }]);
      return send({});
    }
    if (path === "/users/" && method === "POST") {
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
      questionnaires.set(body.slug, { ...body, id: body.slug });
      return send(questionnaires.get(body.slug));
    }
    if (path.startsWith("/questionnaire/")) {
      const slug = path.split("/")[2];
      const item = questionnaires.get(slug);
      if (!item) return send({}, 404);
      if (path.endsWith("/get_organizations/")) return page((item.organizations as string[]).map((id) => ({ id })));
      return send(item);
    }
    return send({ detail: `Unexpected test request: ${method} ${path}` }, 500);
  });
  return { writes, setFacility: (value: Record<string, unknown>) => { facility = value; } };
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
  await expect(page.getByRole("heading", { name: "Add your standard forms" })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Add standard forms" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: "Your clinic is set up" })).toBeVisible();
  expect(writes.filter((path) => path === "/facility/")).toHaveLength(1);
  expect(writes.filter((path) => path === "/questionnaire/")).toHaveLength(8);
  expect(writes.filter((path) => path === "/template/")).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your clinic is set up" })).toBeVisible();
  expect(errors).toEqual([]);
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

test("creates department links, staff access and numbering before loading standard forms", async ({ page, context }) => {
  const { writes, setFacility } = await backend(context);
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
  await page.getByLabel("Starting password for all users").fill("Starting-password-42");
  await page.getByLabel("First name").fill("Example");
  await page.getByLabel("Last name").fill("Doctor");
  await page.getByLabel("Username").fill("example_doctor");
  await page.getByRole("combobox", { name: "Role", exact: true }).click();
  await page.getByRole("option", { name: "Doctor", exact: true }).click();
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("example@clinic.test");
  await page.getByRole("textbox", { name: "Phone", exact: true }).fill("9000000001");
  await page.getByRole("combobox", { name: "Gender", exact: true }).click();
  await page.getByRole("option", { name: "Female", exact: true }).click();
  await page.getByRole("checkbox", { name: "Allow this person to manage the clinic" }).check();
  await page.getByRole("button", { name: "Laboratory", exact: true }).click();
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  for (const heading of ["Invoice numbers", "Patient numbers"]) {
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await page.getByRole("button", { name: "Add standard forms" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: "Your clinic is set up" })).toBeVisible();
  expect(writes.filter((path) => path.endsWith("/organizations_add/"))).toHaveLength(2);
  expect(writes.filter((path) => /\/organizations\/[^/]+\/users\/$/.test(path))).toHaveLength(2);
  expect(writes).toContain("/facility/clinic-1/set_invoice_expression/");
  expect(writes).toContain("/patient_identifier_config/");
  const saved = await page.evaluate(() => localStorage.getItem(`care_onboarding_fe:${location.origin}:progress`));
  expect(saved).not.toContain("Starting-password-42");
  expect(saved).not.toContain("example@clinic.test");
});

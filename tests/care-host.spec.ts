import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const hostURL = process.env.ONBOARDING_CARE_HOST_URL;
test.skip(!hostURL, "Set ONBOARDING_CARE_HOST_URL to a built, unmodified CARE frontend with UserDashboard registered.");
test.use({ serviceWorkers: "block" });

async function backend(context: BrowserContext, options: {
  existing?: boolean;
  superuser?: boolean;
  enabled?: boolean;
  failed?: boolean;
  mfa?: boolean;
} = {}) {
  const calls: { path: string; authenticated: boolean; method: string }[] = [];
  let failed = options.failed ?? false;
  await context.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    calls.push({ path, authenticated: !!request.headers().authorization, method: request.method() });
    const send = (json: unknown, status = 200) => route.fulfill({ json, status });
    if (path === "/api/v1/plug_config/") return send({ configs: [{
      slug: "care_onboarding_fe",
      meta: {
        url: process.env.ONBOARDING_REMOTE_URL ?? "http://127.0.0.1:4178/assets/remoteEntry.js",
        config: { redirect_after_login: options.enabled ?? true },
      },
    }] });
    if (path === "/api/v1/auth/login/") return send(options.mfa
      ? { temp_token: "test-mfa" } : { access: "test-access", refresh: "test-refresh" });
    if (path === "/api/v1/auth/token/refresh/") return send({ access: "test-access", refresh: "test-refresh" });
    if (path === "/api/v1/users/getcurrentuser/") {
      if (!request.headers().authorization) return send({}, 401);
      return send({
        id: "test-admin", username: "test-admin", first_name: "Setup", last_name: "Admin",
        is_superuser: options.superuser ?? true, user_type: "Doctor",
        permissions: [], organizations: [], facilities: [],
      });
    }
    if (path === "/api/v1/facility/") return failed ? send({}, 503) : send({
      count: options.existing ? 1 : 0,
      results: options.existing ? [{ id: "private-clinic", name: "Private Clinic", is_public: false }] : [],
    });
    if (path === "/api/v1/plug_config/setup_status/") return send({ detail: "Endpoint not installed" }, 404);
    return send({ count: 0, results: [] });
  });
  return { calls, recover: () => { failed = false; } };
}

async function login(page: Page) {
  await page.goto(`${hostURL}/login`);
  await expect(page.getByText("Welcome back!", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Username", { exact: true }).fill("test-admin");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
}

test("unmodified CARE login leads to plugin setup for an empty instance", async ({ page, context }) => {
  const { calls } = await backend(context);
  await login(page);
  await expect(page).toHaveURL(/\/admin\/onboarding$/);
  await expect(page.getByRole("heading", { name: "Let's prepare your clinic" })).toBeVisible();
  expect(calls.some((call) => call.path === "/api/v1/facility/")).toBe(true);
  expect(calls.filter((call) => call.path === "/api/v1/facility/").every((call) => call.authenticated)).toBe(true);
  expect(calls.some((call) => call.path.endsWith("/setup_status/"))).toBe(false);
  expect(calls.filter((call) => call.method === "POST" && !call.path.startsWith("/api/v1/auth/"))).toEqual([]);
});

for (const scenario of [
  { name: "private clinic exists without assigned memberships", existing: true },
  { name: "ordinary staff login", superuser: false },
  { name: "runtime opt-out", enabled: false },
]) {
  test(`unmodified CARE retains its original dashboard: ${scenario.name}`, async ({ page, context }) => {
    await backend(context, scenario);
    await login(page);
    await expect(page.getByRole("heading", { name: /Hey Setup/ })).toBeVisible();
    await expect(page).toHaveURL(`${hostURL}/`);
    await expect(page.getByText("Checking whether your clinic needs setup...")).toHaveCount(0);
  });
}

test("unmodified CARE shows a failed check and retries without a backend extension", async ({ page, context }) => {
  const { recover } = await backend(context, { failed: true });
  await login(page);
  await expect(page.getByRole("alert")).toContainText("Could not check whether your clinic needs setup");
  await expect(page).toHaveURL(`${hostURL}/`);
  recover();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/onboarding$/);
});

test("unmodified CARE retains its MFA flow before the plugin can check facilities", async ({ page, context }) => {
  const { calls } = await backend(context, { mfa: true });
  await login(page);
  await expect(page).toHaveURL(/\/2fa$/);
  expect(calls.some((call) => call.path === "/api/v1/facility/")).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem("care_access_token"))).toBeNull();
});

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { apiBase, ApiError, listAll, openRequestScope, request, requestScope } from "./api";

const originalFetch = globalThis.fetch;
beforeEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://clinic.local" } } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => "care-session-token" } });
});
afterEach(() => { globalThis.fetch = originalFetch; });

test("leaving setup does not leave an aborted scope for later dashboard checks", () => {
  const closeFirst = openRequestScope();
  const first = requestScope();
  const closeSecond = openRequestScope();
  const second = requestScope();
  assert.equal(first?.aborted, true);
  closeFirst();
  assert.equal(requestScope(), second);
  closeSecond();
  assert.equal(second?.aborted, true);
  assert.equal(requestScope(), undefined);
});

test("uses CARE's origin, not the remote's URL, by default", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://clinic.local/api/v1/facility/");
    assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer care-session-token");
    return Response.json({ id: "facility" });
  };
  assert.deepEqual(await request("GET", "/facility/"), { id: "facility" });
});

test("runtime API configuration is read dynamically", () => {
  window.__CARE_PLUGIN_RUNTIME__ = { meta: { care_onboarding_fe: { config: { api_url: "https://api.example.org/" } } } };
  assert.equal(apiBase(), "https://api.example.org");
});

test("missing session never makes an unauthenticated write", async () => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null } });
  globalThis.fetch = async () => { throw new Error("must not fetch"); };
  await assert.rejects(request("POST", "/facility/", {}), (error: unknown) => error instanceof ApiError && error.status === 401);
});

test("does not retry ambiguous POST failures", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError("connection lost"); };
  await assert.rejects(request("POST", "/facility/", { name: "Clinic" }), ApiError);
  assert.equal(calls, 1);
});

test("separates plain language errors from technical validation details", async () => {
  globalThis.fetch = async () => Response.json({ errors: [{ loc: ["body", "code"], msg: "Invalid code", input: "private input" }] }, { status: 400 });
  await assert.rejects(request("POST", "/questionnaire/", {}), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.match(error.message, /CARE could not save/);
    assert.equal(error.detail, "body.code: Invalid code");
    assert.deepEqual(error.fieldErrors, { code: "Invalid code" });
    return true;
  });

});

test("exposes backend field validation messages without copying rejected inputs", async () => {
  for (const body of [
    { email: ["This email is already in use."] },
    [{ loc: ["email"], msg: "This email is already in use.", input: "private@example.test" }],
  ]) {
    globalThis.fetch = async () => Response.json(body, { status: 400 });
    await assert.rejects(request("POST", "/users/", {}), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.deepEqual(error.fieldErrors, { email: "This email is already in use." });
      return true;
    });
  }
});

test("pagination reads all results and rejects truncated responses", async () => {
  const paths: string[] = [];
  globalThis.fetch = async (url) => {
    paths.push(String(url));
    return Response.json(paths.length === 1 ? { count: 2, results: [{ id: 1 }] } : { count: 2, results: [{ id: 2 }] });
  };
  assert.deepEqual(await listAll("/facility/?name=clinic", 1), [{ id: 1 }, { id: 2 }]);
  assert.match(paths[1], /name=clinic&limit=1&offset=1$/);
  globalThis.fetch = async () => Response.json({ count: 1, results: [] });
  await assert.rejects(listAll("/facility/"), /incomplete list/);
});

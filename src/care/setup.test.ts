import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { needsSetup } from "./setup";
import { ApiError } from "../lib/api";

const originalFetch = globalThis.fetch;
beforeEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://clinic.local" } } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => "test-token" } });
});
afterEach(() => { globalThis.fetch = originalFetch; });

test("only checks instance facilities for a confirmed superuser", async () => {
  for (const is_superuser of [true, false]) {
    const paths: string[] = [];
    globalThis.fetch = async (url, options) => {
      assert.equal(options?.method, "GET");
      assert.ok(new Headers(options?.headers).has("Authorization"));
      paths.push(String(url));
      return Response.json(paths.length === 1 ? { is_superuser, facilities: [] } : { count: 0, results: [] });
    };
    assert.equal(await needsSetup(new AbortController().signal), is_superuser);
    assert.deepEqual(paths, [
      "https://clinic.local/api/v1/users/getcurrentuser/",
      ...(is_superuser ? ["https://clinic.local/api/v1/facility/?limit=1&offset=0"] : []),
    ]);
  }
});

test("private facilities count even without user facility memberships", async () => {
  globalThis.fetch = async (url) => Response.json(String(url).includes("getcurrentuser")
    ? { is_superuser: true, facilities: [] }
    : { count: 5, results: [{ id: "private-clinic", is_public: false }] });
  assert.equal(await needsSetup(new AbortController().signal), false);
});

test("failed and malformed checks never mean setup is required", async () => {
  for (const body of [null, {}, { is_superuser: "true" }]) {
    globalThis.fetch = async () => Response.json(body);
    await assert.rejects(needsSetup(new AbortController().signal), /unexpected account/);
  }
  for (const body of [null, {}, { count: 0 }, { count: -1, results: [] },
    { count: 1, results: [] }, { count: 0, results: [{ id: "clinic" }] },
    { count: 1, results: [null] }, { count: 1, results: [{}] }]) {
    globalThis.fetch = async (url) => Response.json(String(url).includes("getcurrentuser") ? { is_superuser: true } : body);
    await assert.rejects(needsSetup(new AbortController().signal), /unexpected clinic list/);
  }
  for (const status of [401, 403, 500]) {
    globalThis.fetch = async (url) => String(url).includes("getcurrentuser")
      ? Response.json({ is_superuser: true })
      : Response.json({}, { status });
    await assert.rejects(needsSetup(new AbortController().signal), (error: unknown) => error instanceof ApiError && error.status === status);
  }
});

test("dashboard checks receive their own cancellation signal", async () => {
  const controller = new AbortController();
  globalThis.fetch = async (_url, options) => {
    assert.ok(options?.signal);
    controller.abort();
    assert.equal(options.signal.aborted, true);
    options.signal.throwIfAborted();
    throw new Error("unreachable");
  };
  await assert.rejects(needsSetup(controller.signal), ApiError);
});

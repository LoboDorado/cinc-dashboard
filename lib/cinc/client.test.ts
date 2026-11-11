// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";

const key = readFileSync(
  new URL("./__fixtures__/test_key.pem", import.meta.url),
  "utf8",
);

vi.mock("../config", () => ({
  getConfig: () => ({ chefVersion: "16.0.0" }),
}));

const audit = vi.fn();
vi.mock("../db/audit", () => ({ recordAudit: (...a: unknown[]) => audit(...a) }));

// client.ts calls undici's own fetch, not the global one (see its comment on
// why), so the mock has to replace undici's export rather than stub a global.
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("undici", async (importOriginal) => ({
  ...(await importOriginal<typeof import("undici")>()),
  fetch: fetchMock,
}));

import { cincRequest } from "./client";
import { cincPath, type CincPath } from "./path";
import type { AuthorizedActionContext } from "../admin/access";

function fakeCtx(overrides: Partial<AuthorizedActionContext> = {}): AuthorizedActionContext {
  return {
    serverId: "server-1",
    serverUrl: "https://s",
    webuiKey: key,
    sslNoVerify: false,
    impersonationUsername: "pivotal",
    accountId: "account-1",
    onBehalfOf: "alice",
    org: "acme",
    ...overrides,
  } as AuthorizedActionContext;
}

afterEach(() => {
  fetchMock.mockReset();
  audit.mockClear();
});

test("signs as the context's impersonation identity, with web source", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ ok: 1 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  const out = await cincRequest<{ ok: number }>(fakeCtx(), {
    method: "GET",
    path: cincPath`/nodes`,
  });
  expect(out.ok).toBe(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("https://s/organizations/acme/nodes");
  const headers = init.headers as Record<string, string>;
  expect(headers["X-Ops-UserId"]).toBe("pivotal");
  expect(headers["X-Ops-Request-Source"]).toBe("web");
  expect(headers["X-Ops-Authorization-1"]).toBeTruthy();
});

test("records a success audit entry attributed to the real dashboard account", async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
  await cincRequest(fakeCtx(), { method: "GET", path: cincPath`/nodes` });
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({
      actorAccountId: "account-1",
      actorUsername: "alice",
      serverId: "server-1",
      org: "acme",
      action: "GET",
      outcome: "success",
      statusCode: 200,
    }),
  );
});

test("throws CincError with status on non-2xx, and audits it as an error", async () => {
  fetchMock.mockResolvedValueOnce(new Response("denied", { status: 403 }));
  await expect(
    cincRequest(fakeCtx(), { method: "GET", path: cincPath`/nodes` }),
  ).rejects.toMatchObject({ status: 403, forbidden: true });
  expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: "error", statusCode: 403 }));
});

function failedRequestLog(spy: { mock: { calls: unknown[][] } }) {
  const lines = spy.mock.calls.map((c) => JSON.parse(String(c[0])));
  return lines.find((l) => l.event === "cinc.request_failed");
}

test("a failed request logs the shared identity as actor and the real account as user", async () => {
  fetchMock.mockResolvedValueOnce(new Response("denied", { status: 403 }));
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  await expect(
    cincRequest(fakeCtx({ impersonationUsername: "pivotal", onBehalfOf: "alice" }), {
      method: "GET",
      path: cincPath`/nodes`,
    }),
  ).rejects.toMatchObject({ status: 403 });
  expect(failedRequestLog(spy)).toMatchObject({
    actor: "pivotal",
    user: "alice",
    path: "/organizations/acme/nodes",
    status: 403,
  });
  spy.mockRestore();
});

test("refuses to sign a path a name has broken out of", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

  // `/orgs/acme/nodes/web01%2F_acl` reaches an action as the name "web01/_acl".
  // Concatenated it is indistinguishable from the ACL endpoint acl.ts builds, so
  // cincPath has to reject it while it is still a name.
  const badName = "web01/_acl";
  expect(() => cincPath`/nodes/${badName}`).toThrow(/unsafe request path/);

  // A hostile org slug is the same problem one level up, and it is spliced in by
  // cincRequest itself rather than by the tag.
  await expect(
    cincRequest(fakeCtx({ org: "acme/../other" }), { method: "GET", path: cincPath`/nodes` }),
  ).rejects.toMatchObject({ name: "UnsafePathError" });

  // The impersonated user id is a request header as well as a path segment.
  const crlf = String.fromCharCode(13, 10);
  await expect(
    cincRequest(fakeCtx({ impersonationUsername: `u${crlf}X-Ops-UserId: pivotal` }), {
      method: "GET",
      path: cincPath`/nodes`,
    }),
  ).rejects.toMatchObject({ name: "UnsafePathError" });

  // Belt and braces: even if the brand were cast away, the assembled path is
  // re-checked before anything is signed.
  await expect(
    cincRequest(fakeCtx(), {
      method: "GET",
      path: "/nodes/%2e%2e%2fusers" as unknown as CincPath,
    }),
  ).rejects.toMatchObject({ name: "UnsafePathError" });

  expect(fetchMock).not.toHaveBeenCalled();
});

test("omits the org prefix for top-level paths", async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
  await cincRequest(fakeCtx({ org: undefined }), {
    method: "POST",
    path: cincPath`/authenticate_user`,
    body: { username: "u" },
  });
  const [url] = fetchMock.mock.calls[0] as [string];
  expect(url).toBe("https://s/authenticate_user");
});

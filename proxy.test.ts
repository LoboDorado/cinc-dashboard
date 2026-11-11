// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { isSetupNeeded } = vi.hoisted(() => ({ isSetupNeeded: vi.fn() }));
vi.mock("./lib/dashboard/setup", () => ({ isSetupNeeded }));

import { proxy } from "./proxy";

function req(path: string, opts: { session?: boolean } = {}) {
  const r = new NextRequest(new URL(`https://dashboard.test${path}`));
  if (opts.session) r.cookies.set("cinc_dashboard", "x");
  return r;
}

const location = (res: Response) => res.headers.get("location");

beforeEach(() => {
  isSetupNeeded.mockReset();
  isSetupNeeded.mockResolvedValue(false); // the common case: setup already done
});

test("every request bounces to /setup while no dashboard account exists", async () => {
  isSetupNeeded.mockResolvedValue(true);
  const res = await proxy(req("/servers/s1/orgs/acme/nodes/web01", { session: true }));
  expect(new URL(location(res)!).pathname).toBe("/setup");
});

test("/setup itself is not redirected to itself", async () => {
  isSetupNeeded.mockResolvedValue(true);
  const res = await proxy(req("/setup"));
  expect(location(res)).toBeNull();
});

test("/setup passes through once accounts exist too (its own page redirects to /login)", async () => {
  isSetupNeeded.mockResolvedValue(false);
  const res = await proxy(req("/setup"));
  expect(location(res)).toBeNull();
});

test("unauthenticated request redirects to /login with a from param", async () => {
  const res = await proxy(req("/servers/s1/orgs/acme/nodes/web01"));
  const url = new URL(location(res)!);
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("from")).toBe("/servers/s1/orgs/acme/nodes/web01");
});

test("does not add a from param for the root", async () => {
  const url = new URL(location(await proxy(req("/")))!);
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.has("from")).toBe(false);
});

test("authenticated user on /login is sent to a safe from target", async () => {
  const res = await proxy(req("/login?from=/servers/s1/orgs/acme/roles", { session: true }));
  expect(new URL(location(res)!).pathname).toBe("/servers/s1/orgs/acme/roles");
});

test("an off-site from is ignored (no open redirect)", async () => {
  const res = await proxy(req("/login?from=//evil.com", { session: true }));
  expect(new URL(location(res)!).pathname).toBe("/servers");
});

test("a backslash-prefixed from is ignored (browsers treat /\\ as //)", async () => {
  const res = await proxy(req("/login?from=/%5Cevil.com", { session: true }));
  expect(new URL(location(res)!).host).toBe("dashboard.test");
  expect(new URL(location(res)!).pathname).toBe("/servers");
});

test("an authenticated request passes through", async () => {
  const res = await proxy(req("/servers/s1/orgs/acme/nodes", { session: true }));
  expect(location(res)).toBeNull();
});

test("a passed-through response carries a nonce CSP that locks the page down", async () => {
  const res = await proxy(req("/servers/s1/orgs/acme/nodes", { session: true }));
  const csp = res.headers.get("content-security-policy")!;
  expect(csp).toMatch(/script-src [^;]*'nonce-[^']+' 'strict-dynamic'/);
  // No framing, no <base> hijack, no plugin content, no off-site form posts.
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("form-action 'self'");
  // Production must not need eval; that's a dev-only React affordance.
  expect(csp).not.toContain("unsafe-eval");
});

test("each request gets its own nonce", async () => {
  const nonceOf = (res: Response) =>
    res.headers.get("content-security-policy")!.match(/'nonce-([^']+)'/)![1];
  const a = nonceOf(await proxy(req("/servers/s1/orgs/acme/nodes", { session: true })));
  const b = nonceOf(await proxy(req("/servers/s1/orgs/acme/nodes", { session: true })));
  expect(a).not.toBe(b);
});

// @vitest-environment node
import { expect, test, vi, beforeEach } from "vitest";
import pkg from "@/package.json";

vi.mock("@/lib/guard", () => ({
  currentAccount: async () => ({ id: "acct-1", username: "alice", displayName: "Alice", authSource: "local" }),
}));

const { requireScopeAccess, listReachableOrgs, listReachableServers, isPlatformMemberAccount } =
  vi.hoisted(() => ({
    requireScopeAccess: vi.fn(),
    listReachableOrgs: vi.fn(),
    listReachableServers: vi.fn(),
    isPlatformMemberAccount: vi.fn(),
  }));
vi.mock("@/lib/admin/access", () => ({
  requireScopeAccess,
  listReachableOrgs,
  listReachableServers,
  isPlatformMemberAccount,
}));

// notFound() throws in Next; mirror that with a recognizable sentinel.
const NOT_FOUND = new Error("NEXT_NOT_FOUND");
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
}));

// Mock the shell so importing the layout doesn't pull a client component into
// the node env; we assert on the element the layout builds, not its render.
vi.mock("@/components/app-shell", () => ({ AppShell: () => null }));

import OrgLayout from "./layout";

const render = (server: string, org: string) =>
  OrgLayout({ children: null, params: Promise.resolve({ server, org }) });

beforeEach(() => {
  requireScopeAccess.mockReset();
  listReachableOrgs.mockReset();
  listReachableServers.mockReset();
  listReachableServers.mockResolvedValue([{ id: "s1", name: "Primary" }]);
  isPlatformMemberAccount.mockReset().mockResolvedValue(false);
});

test("renders the shell for an org the account can reach", async () => {
  requireScopeAccess.mockResolvedValueOnce(true);
  listReachableOrgs.mockResolvedValueOnce([{ name: "acme" }, { name: "beta" }]);
  const el = await render("s1", "acme");
  expect(el.props.server).toBe("s1");
  expect(el.props.org).toBe("acme");
  expect(el.props.orgs).toEqual([{ name: "acme" }, { name: "beta" }]);
  // The signed-in footer shows the dashboard version from package.json.
  expect(el.props.version).toBe(pkg.version);
});

test("404s a bogus org the account has no grant for", async () => {
  requireScopeAccess.mockResolvedValueOnce(false);
  await expect(render("s1", "fsdfdfsd")).rejects.toBe(NOT_FOUND);
  expect(listReachableOrgs).not.toHaveBeenCalled();
});

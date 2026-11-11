// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const req = vi.fn();
vi.mock("./client", () => ({ cincRequest: (...a: unknown[]) => req(...a) }));

import { CincError } from "./errors";
import {
  deletePolicy,
  deletePolicyRevision,
  listPolicyRevisions,
  parsePolicyRevisions,
} from "./policies";
import { cincPath } from "./path";
import type { AuthorizedActionContext } from "../admin/access";

const ctx = { org: "acme" } as AuthorizedActionContext;

beforeEach(() => req.mockReset());

describe("parsePolicyRevisions", () => {
  it("returns the revision ids", () => {
    expect(
      parsePolicyRevisions({ revisions: { "1.0.0": {}, abc123: {} } }),
    ).toEqual(["1.0.0", "abc123"]);
  });

  it("returns [] for malformed payloads", () => {
    expect(parsePolicyRevisions(null)).toEqual([]);
    expect(parsePolicyRevisions([])).toEqual([]);
    expect(parsePolicyRevisions({})).toEqual([]);
    expect(parsePolicyRevisions({ revisions: ["1.0.0"] })).toEqual([]);
  });
});

describe("listPolicyRevisions", () => {
  it("GETs /policies/<name> and parses the revisions", async () => {
    req.mockResolvedValueOnce({ revisions: { r1: {}, r2: {} } });
    await expect(listPolicyRevisions(ctx, "web")).resolves.toEqual(["r1", "r2"]);
    expect(req).toHaveBeenCalledWith(ctx, {
      method: "GET",
      path: cincPath`/policies/web`,
    });
  });
});

describe("deletePolicyRevision", () => {
  it("DELETEs /policies/<name>/revisions/<rev>", async () => {
    req.mockResolvedValueOnce({});
    await deletePolicyRevision(ctx, "web", "r1");
    expect(req).toHaveBeenCalledWith(ctx, {
      method: "DELETE",
      path: cincPath`/policies/web/revisions/r1`,
    });
  });

  it("rejects a revision that would retarget the signed path", async () => {
    await expect(deletePolicyRevision(ctx, "web", "../../nodes/x")).rejects.toThrow();
    expect(req).not.toHaveBeenCalled();
  });
});

describe("deletePolicy", () => {
  it("deletes every revision in order", async () => {
    req.mockResolvedValueOnce({ revisions: { r1: {}, r2: {}, r3: {} } });
    req.mockResolvedValue({});
    await deletePolicy(ctx, "web");
    const deleted = req.mock.calls
      .slice(1)
      .map(([, opts]) => [opts.method, String(opts.path)]);
    expect(deleted).toEqual([
      ["DELETE", String(cincPath`/policies/web/revisions/r1`)],
      ["DELETE", String(cincPath`/policies/web/revisions/r2`)],
      ["DELETE", String(cincPath`/policies/web/revisions/r3`)],
    ]);
  });

  it("stops at the first failed revision and surfaces the error", async () => {
    req.mockResolvedValueOnce({ revisions: { r1: {}, r2: {}, r3: {} } });
    req.mockResolvedValueOnce({});
    req.mockRejectedValueOnce(new CincError(403, {}));
    await expect(deletePolicy(ctx, "web")).rejects.toMatchObject({
      status: 403,
    });
    // list + r1 + r2 (failed); r3 is never attempted.
    expect(req).toHaveBeenCalledTimes(3);
  });

  it("makes no DELETE when the policy has no revisions", async () => {
    req.mockResolvedValueOnce({ revisions: {} });
    await deletePolicy(ctx, "web");
    expect(req).toHaveBeenCalledTimes(1);
  });
});

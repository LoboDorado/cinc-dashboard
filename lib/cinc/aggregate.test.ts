import { expect, test } from "vitest";
import { partitionScoped, type ScopedOutcome } from "./aggregate";

test("partitionScoped splits a mixed ok/error array", () => {
  const outcomes: ScopedOutcome<number>[] = [
    { serverId: "s1", serverName: "Server One", org: "acme", ok: true, data: 1 },
    { serverId: "s1", serverName: "Server One", org: "widgets", ok: false, error: "unreachable" },
    { serverId: "s2", serverName: "Server Two", org: "acme", ok: true, data: 2 },
  ];

  const { succeeded, failed } = partitionScoped(outcomes);

  expect(succeeded).toEqual([
    { serverId: "s1", serverName: "Server One", org: "acme", ok: true, data: 1 },
    { serverId: "s2", serverName: "Server Two", org: "acme", ok: true, data: 2 },
  ]);
  expect(failed).toEqual([
    { serverId: "s1", serverName: "Server One", org: "widgets", ok: false, error: "unreachable" },
  ]);
});

test("partitionScoped handles an all-succeeded or all-failed array", () => {
  const allOk: ScopedOutcome<string>[] = [
    { serverId: "s1", serverName: "Server One", org: "acme", ok: true, data: "x" },
  ];
  expect(partitionScoped(allOk)).toEqual({ succeeded: allOk, failed: [] });

  const allFailed: ScopedOutcome<string>[] = [
    { serverId: "s1", serverName: "Server One", org: "acme", ok: false, error: "timed out" },
  ];
  expect(partitionScoped(allFailed)).toEqual({ succeeded: [], failed: allFailed });
});

test("partitionScoped on an empty array", () => {
  expect(partitionScoped([])).toEqual({ succeeded: [], failed: [] });
});

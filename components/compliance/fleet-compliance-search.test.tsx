import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FleetComplianceSearch, matchesRefinement } from "./fleet-compliance-search";
import type { FleetComplianceResult, FleetComplianceSearchOutcome } from "@/lib/collector/compliance-search";
import type { FleetComplianceOverview } from "@/lib/collector/compliance-overview";

const fetchMock = vi.fn();
let clickedAnchors: HTMLAnchorElement[];
let createdBlobs: Blob[];

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  clickedAnchors = [];
  createdBlobs = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob | MediaSource) => {
    createdBlobs.push(blob as Blob);
    return "blob:mock-url";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clickedAnchors.push(this);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown) {
  return Promise.resolve({ json: () => Promise.resolve(body) } as Response);
}

function fakeResult(overrides: Partial<FleetComplianceResult> = {}): FleetComplianceResult {
  return {
    reportId: "r1",
    org: "acme",
    nodeName: "web01",
    environment: "prod",
    status: "failed",
    controlsPassed: 3,
    controlsFailed: 1,
    controlsSkipped: 0,
    startTime: "2026-01-01T00:00:00Z",
    endTime: "2026-01-01T00:01:00Z",
    relevance: 1.5,
    profiles: [{ name: "linux-baseline", controls: [{ id: "c1", impact: 1, tags: { nist: ["AC-6"] }, results: [] }] }],
    serverId: "s1",
    serverName: "default",
    href: "/servers/s1/orgs/acme/nodes/web01/compliance/r1",
    ...overrides,
  };
}

function resultsOutcome(results: FleetComplianceResult[]): Extract<FleetComplianceSearchOutcome, { state: "results" }> {
  return { state: "results", results, queriedCollectors: 1, limitPerCollector: 100, failedScopes: [] };
}

function fakeOverview(results: FleetComplianceResult[], overrides: Partial<FleetComplianceOverview> = {}): FleetComplianceOverview {
  return {
    results,
    nodesConsidered: results.length,
    totalReachableNodes: results.length,
    truncated: false,
    failedScopes: [],
    ...overrides,
  };
}

describe("matchesRefinement", () => {
  const result = fakeResult();

  it("matches everything when both refinements are blank", () => {
    expect(matchesRefinement(result, { tagContains: "", attributeContains: "" }, null)).toBe(true);
  });

  it("scans the already-present profiles JSON for tag-contains, case-insensitively", () => {
    expect(matchesRefinement(result, { tagContains: "ac-6", attributeContains: "" }, null)).toBe(true);
    expect(matchesRefinement(result, { tagContains: "nope", attributeContains: "" }, null)).toBe(false);
  });

  it("scans the fetched attributes map for attribute-contains, keyed by server/org/node", () => {
    const byKey = new Map<string, unknown>([["s1::acme::web01", { platform: "ubuntu" }]]);
    expect(matchesRefinement(result, { tagContains: "", attributeContains: "ubuntu" }, byKey)).toBe(true);
    expect(matchesRefinement(result, { tagContains: "", attributeContains: "windows" }, byKey)).toBe(false);
  });

  it("treats a missing attributes map as no match for a non-blank attribute filter", () => {
    expect(matchesRefinement(result, { tagContains: "", attributeContains: "ubuntu" }, null)).toBe(false);
  });
});

describe("FleetComplianceSearch", () => {
  it("shows the no-collector CTA and never fetches when hasCollector is false", () => {
    render(<FleetComplianceSearch hasCollector={false} initialOverview={null} />);
    expect(screen.getByRole("link", { name: "Register a collector" })).toHaveAttribute(
      "href",
      "/admin/collectors/new",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders populated tabs immediately from initialOverview, with no search required", () => {
    render(<FleetComplianceSearch hasCollector initialOverview={fakeOverview([fakeResult()])} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Current compliance posture across 1 node/)).toBeInTheDocument();
    // Overview tab is active by default -- "Controls passed" is a stat tile
    // label, distinct from the "Nodes" tab button's own text.
    expect(screen.getByText("Controls passed")).toBeInTheDocument();
  });

  it("renders all four tabs' content correctly wired, with zero fetches", () => {
    // Tabs/TabPanel's own click-switching and useTabParam's own URL read/write
    // are already covered by components/ui/tabs.test.tsx -- the global
    // next/navigation mock (vitest.setup.ts) is stateless, so it can't
    // reflect a real tab switch here (same reasoning as
    // node-detail-tabs.test.tsx). This proves each tab's content is wired to
    // the right aggregation, via the one thing a static mock CAN observe:
    // Overview visible by default, the rest mounted-but-hidden.
    render(<FleetComplianceSearch hasCollector initialOverview={fakeOverview([fakeResult()])} />);

    expect(screen.getByRole("tab", { name: "Overview", selected: true })).toBeInTheDocument();
    expect(screen.getByText("Controls passed")).toBeVisible();

    const nodeLink = screen.getByRole("link", { name: /web01/, hidden: true });
    expect(nodeLink).not.toBeVisible();
    // "linux-baseline" legitimately appears twice: once as the Profiles tab's
    // own row, once as a Chip in the Controls tab's "which profiles" column --
    // scope each query to its own (mounted-but-hidden) tabpanel by id, per
    // the Tabs/TabPanel id scheme (components/ui/tabs.tsx).
    const profilesPanel = document.getElementById("compliance-tabs-panel-profiles");
    expect(profilesPanel && within(profilesPanel).getByText("linux-baseline")).toBeInTheDocument();
    const controlsPanel = document.getElementById("compliance-tabs-panel-controls");
    expect(controlsPanel && within(controlsPanel).getByText("c1")).toBeInTheDocument();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not submit a blank query", async () => {
    const user = userEvent.setup();
    render(<FleetComplianceSearch hasCollector initialOverview={fakeOverview([])} />);
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("searching replaces the working set and the header copy, clearing reverts with no new fetch", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(jsonResponse(resultsOutcome([fakeResult({ nodeName: "search-hit" })])));
    render(<FleetComplianceSearch hasCollector initialOverview={fakeOverview([fakeResult({ nodeName: "default-node" })])} />);

    expect(screen.getByRole("link", { name: /default-node/, hidden: true })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search"), "baseline");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(fetchMock).toHaveBeenCalledWith("/compliance/search?q=baseline");
    expect(await screen.findByRole("link", { name: /search-hit/, hidden: true })).toBeInTheDocument();
    expect(screen.getByText(/Showing up to 100 results across 1 collector/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /default-node/, hidden: true })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("link", { name: /default-node/, hidden: true })).toBeInTheDocument();
    expect(screen.getByText(/Current compliance posture/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // Clear made no new request
  });

  it("narrows the visible list by tag with zero additional fetches", async () => {
    const user = userEvent.setup();
    const overview = fakeOverview([
      fakeResult({ nodeName: "web01" }),
      fakeResult({ nodeName: "web02", profiles: [] }),
    ]);
    render(<FleetComplianceSearch hasCollector initialOverview={overview} />);
    expect(screen.getByRole("link", { name: /web01/, hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /web02/, hidden: true })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Filter by tag"), "AC-6");
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /web02/, hidden: true })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: /web01/, hidden: true })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches node attributes exactly once, on the first attribute-filter keystroke", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValueOnce(jsonResponse({ attributes: { "s1::acme::web01": { platform: "ubuntu" } } }));
    render(<FleetComplianceSearch hasCollector initialOverview={fakeOverview([fakeResult()])} />);

    const attrInput = screen.getByLabelText("Filter by node attributes");
    await user.type(attrInput, "ubuntu");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toContain("/compliance/attributes?scopes=");

    // Further keystrokes narrow/widen the already-fetched map, no new fetch.
    await user.type(attrInput, "x");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("exports the currently visible rows as CSV and JSON regardless of active tab", async () => {
    const user = userEvent.setup();
    render(<FleetComplianceSearch hasCollector initialOverview={fakeOverview([fakeResult()])} />);

    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    await user.click(screen.getByRole("button", { name: "Export JSON" }));

    expect(clickedAnchors).toHaveLength(2);
    expect(clickedAnchors[0].download).toBe("compliance-export.csv");
    expect(clickedAnchors[1].download).toBe("compliance-export.json");
    const csvText = await createdBlobs[0].text();
    expect(csvText).toContain("web01");
    const jsonText = await createdBlobs[1].text();
    expect(JSON.parse(jsonText)[0].nodeName).toBe("web01");
  });
});

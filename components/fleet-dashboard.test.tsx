import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test/axe";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/servers/s1/orgs/acme",
  useSearchParams: () => new URLSearchParams(),
}));

import { FleetDashboard, type DashboardNode, type DashboardSnapshot } from "./fleet-dashboard";
import { buildSnapshot, type FleetNode } from "@/lib/cinc/fleet";

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

function node(over: Partial<FleetNode>): FleetNode {
  return {
    name: "n",
    ohaiTime: NOW / 1000,
    runList: ["recipe[base]"],
    policyName: null,
    policyGroup: null,
    chefVersion: "19.3.15",
    environment: "production",
    platform: "ubuntu",
    platformVersion: "24.04",
    ...over,
  };
}

const LIFECYCLE = { latestMajor: 19, latestVersion: "19.3.15", eolMajors: [17] };

/** Mirrors the one-line change OrgDashboard/FullDashboard now makes: attach a
 *  concrete href to every node before handing the snapshot to FleetDashboard. */
function withHrefs(nodes: FleetNode[], server: string, org: string): DashboardSnapshot {
  const raw = buildSnapshot(nodes, NOW, LIFECYCLE);
  const rows: DashboardNode[] = raw.nodes.map((n) => ({
    ...n,
    href: `/servers/${server}/orgs/${org}/nodes/${encodeURIComponent(n.name)}`,
  }));
  return { ...raw, nodes: rows };
}

const snapshot = withHrefs(
  [
    node({ name: "web01" }),
    node({ name: "k8s-2", environment: "_default" }),
    node({
      name: "nas01",
      ohaiTime: (NOW - 72 * HOUR) / 1000,
      chefVersion: "17.10.0",
    }),
    node({
      name: "pi-garage",
      ohaiTime: null,
      runList: [],
      environment: "_default",
      chefVersion: null,
      platform: null,
      platformVersion: null,
    }),
  ],
  "s1",
  "acme",
);

function renderDashboard() {
  return render(
    <FleetDashboard pollUrl="/servers/s1/orgs/acme/fleet" initial={snapshot} initialError={null} />,
  );
}

// Each node renders twice — a phone card list and the sm+ table — with CSS
// showing one (jsdom applies no CSS), so scope queries to one layout. Matched
// by its caption's accessible name since the aggregated "By organization"
// breakdown renders a second, distinctly-captioned table.
const table = () => within(screen.getByRole("table", { name: /Fleet nodes/ }));
const cards = () => within(screen.getByRole("list", { name: "Fleet nodes" }));
const rowFor = (name: string) =>
  table().getByRole("link", { name }).closest("tr") as HTMLElement;

describe("FleetDashboard", () => {
  it("shows four tiles with their breakdowns", () => {
    renderDashboard();
    const recent = screen.getByRole("button", { name: /Checked in · last hour/ });
    expect(recent).toHaveTextContent("2"); // web01 + k8s-2
    expect(recent).toHaveTextContent("of 4 nodes");
    expect(screen.getByRole("button", { name: /Missing/ })).toHaveTextContent(
      "1 never",
    );
    expect(
      screen.getByRole("button", { name: /Unconfigured/ }),
    ).toHaveTextContent("1 empty run list · 2 in _default");
  });

  it("lists every problem a node has as a Status chip", () => {
    renderDashboard();
    expect(within(rowFor("pi-garage")).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Never checked in",
      "Empty run list",
      "_default env",
    ]);
    expect(within(rowFor("nas01")).getByText("EOL client")).toBeInTheDocument();
    expect(within(rowFor("web01")).getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Status/ })).toBeInTheDocument();
  });

  it("links each row to its own href", () => {
    renderDashboard();
    expect(table().getByRole("link", { name: "web01" })).toHaveAttribute(
      "href",
      "/servers/s1/orgs/acme/nodes/web01",
    );
  });

  it("filters the list by the recent tile", async () => {
    renderDashboard();
    await userEvent.click(
      screen.getByRole("button", { name: /Checked in · last hour/ }),
    );
    expect(screen.getByText("Checked in within the hour")).toBeInTheDocument();
    expect(table().queryByRole("link", { name: "nas01" })).not.toBeInTheDocument();
    expect(table().getByRole("link", { name: "k8s-2" })).toBeInTheDocument();
    // The phone card list filters identically.
    expect(cards().queryByRole("link", { name: "nas01" })).not.toBeInTheDocument();
    expect(cards().getByRole("link", { name: "k8s-2" })).toBeInTheDocument();
  });

  it("describes the histogram buckets for screen readers", () => {
    renderDashboard();
    expect(
      screen.getByText("2 nodes last checked in under 30 minutes ago"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 node never checked in")).toBeInTheDocument();
    expect(screen.getByText("Missing · over 12h")).toBeInTheDocument();
  });

  it("renders a phone card per node with chips and details", () => {
    renderDashboard();
    const card = cards().getByRole("link", { name: "nas01" }).closest("li") as HTMLElement;
    expect(card).toHaveTextContent("3d ago");
    expect(within(card).getByText("Missing")).toBeInTheDocument();
    expect(within(card).getByText("EOL client")).toBeInTheDocument();
    expect(card).toHaveTextContent("production · ubuntu 24.04 · 17.10.0");
  });

  it("offers a Sort by picker for the phone layout", () => {
    renderDashboard();
    const picker = screen.getByRole("combobox", { name: "Sort by" });
    expect(picker).toHaveDisplayValue("Last check-in, newest");
  });

  it("has no axe violations", async () => {
    const { container } = renderDashboard();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("FleetDashboard, aggregated across servers/orgs", () => {
  const aggregatedNodes: FleetNode[] = [
    node({ name: "web01", tag: { serverId: "s1", serverName: "Server One", org: "acme" } }),
    node({
      name: "db01",
      ohaiTime: (NOW - 72 * HOUR) / 1000,
      chefVersion: "17.10.0",
      tag: { serverId: "s2", serverName: "Server Two", org: "widgets" },
    }),
  ];

  function aggregatedSnapshot(): DashboardSnapshot {
    const raw = buildSnapshot(aggregatedNodes, NOW, LIFECYCLE);
    const rows: DashboardNode[] = raw.nodes.map((n) => {
      const origin = n.tag as { serverId: string; serverName: string; org: string };
      return {
        ...n,
        serverId: origin.serverId,
        server: origin.serverName,
        org: origin.org,
        href: `/servers/${origin.serverId}/orgs/${origin.org}/nodes/${encodeURIComponent(n.name)}`,
      };
    });
    return { ...raw, nodes: rows };
  }

  function renderAggregated(failedScopes: { serverName: string; org: string; reason: string }[] = []) {
    return render(
      <FleetDashboard
        pollUrl="/fleet"
        initial={aggregatedSnapshot()}
        initialError={null}
        failedScopes={failedScopes}
        showScopeColumns
      />,
    );
  }

  it("renders Server and Org columns and links each row to its own scope", () => {
    renderAggregated();
    expect(screen.getByRole("columnheader", { name: "Server" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Org" })).toBeInTheDocument();
    expect(table().getByRole("link", { name: "web01" })).toHaveAttribute(
      "href",
      "/servers/s1/orgs/acme/nodes/web01",
    );
    expect(table().getByRole("link", { name: "db01" })).toHaveAttribute(
      "href",
      "/servers/s2/orgs/widgets/nodes/db01",
    );
    expect(within(rowFor("web01")).getByText("Server One")).toBeInTheDocument();
    expect(within(rowFor("web01")).getByText("acme")).toBeInTheDocument();
  });

  it("renders a failedScopes banner without blanking the rest of the dashboard", () => {
    renderAggregated([{ serverName: "Server Three", org: "*", reason: "unreachable" }]);
    expect(screen.getByRole("alert")).toHaveTextContent("Server Three (unreachable)");
    // The rest of the dashboard still renders normally.
    expect(table().getByRole("link", { name: "web01" })).toBeInTheDocument();
  });

  it("still filters correctly by stat tile with rows from mixed scopes", async () => {
    renderAggregated();
    await userEvent.click(screen.getByRole("button", { name: /Missing/ }));
    expect(table().getByRole("link", { name: "db01" })).toBeInTheDocument();
    expect(table().queryByRole("link", { name: "web01" })).not.toBeInTheDocument();
  });

  it("shows a By organization breakdown linking to each org's own dashboard", () => {
    renderAggregated();
    expect(screen.getByRole("heading", { name: "By organization" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Server One / acme" })).toHaveAttribute(
      "href",
      "/servers/s1/orgs/acme",
    );
    expect(screen.getByRole("link", { name: "Server Two / widgets" })).toHaveAttribute(
      "href",
      "/servers/s2/orgs/widgets",
    );
  });

  it("has no axe violations in aggregated mode", async () => {
    const { container } = renderAggregated([
      { serverName: "Server Three", org: "*", reason: "unreachable" },
    ]);
    expect(await axe(container)).toHaveNoViolations();
  });
});

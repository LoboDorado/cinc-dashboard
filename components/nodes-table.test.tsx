import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { axe } from "@/test/axe";
import userEvent from "@testing-library/user-event";
import { NodesTable, type NodeRow } from "./nodes-table";
import type { NodeSummary } from "@/lib/cinc/fleet";

function node(over: Partial<NodeRow>): NodeRow {
  const name = over.name ?? "n";
  const summary: NodeSummary = {
    name,
    status: "ok",
    missing: false,
    unconfigured: false,
    lastCheckIn: 1_700_000_000,
    chefVersion: "19.3.15",
    clientStatus: "current",
    emptyRunList: false,
    defaultEnv: false,
    recent: true,
    environment: "production",
    platform: "ubuntu",
    platformVersion: "24.04",
    policyGroup: null,
  };
  return { ...summary, href: `/orgs/acme/nodes/${name}`, ...over };
}

const many = (n: number): NodeRow[] =>
  Array.from({ length: n }, (_, i) => node({ name: `node${String(i).padStart(3, "0")}` }));

const base = {
  createHref: "/orgs/acme/nodes/new",
  generatedAt: 1_700_000_000_000,
};

describe("NodesTable", () => {
  it("shows each node's name, last check-in, and client version with its chip", () => {
    render(
      <NodesTable
        {...base}
        nodes={[
          node({ name: "web1", chefVersion: "15.1.0", clientStatus: "eol" }),
          node({ name: "db1", lastCheckIn: null, chefVersion: null, clientStatus: "unknown" }),
        ]}
      />,
    );

    const web = screen.getByRole("row", { name: /web1/ });
    expect(within(web).getByRole("link", { name: "web1" })).toHaveAttribute(
      "href",
      "/orgs/acme/nodes/web1",
    );
    expect(within(web).getByText("15.1.0")).toBeInTheDocument();
    expect(within(web).getByText(/EOL/)).toBeInTheDocument();

    // A node that has never checked in reads "never" and shows a dash for version.
    const db = screen.getByRole("row", { name: /db1/ });
    expect(within(db).getByText("never")).toBeInTheDocument();
    expect(within(db).getByText("—")).toBeInTheDocument();
  });

  it("defaults to sorting by name ascending", () => {
    render(
      <NodesTable
        {...base}
        nodes={[node({ name: "web" }), node({ name: "app" }), node({ name: "db" })]}
      />,
    );
    // Scope to the table so the header's "New" link doesn't count.
    const table = screen.getByRole("table");
    const names = within(table)
      .getAllByRole("link")
      .map((a) => a.textContent);
    expect(names).toEqual(["app", "db", "web"]);
  });

  it("filters by name and updates the count", async () => {
    const user = userEvent.setup();
    render(<NodesTable {...base} nodes={many(120)} />);

    await user.type(screen.getByPlaceholderText(/filter nodes/i), "node01");
    expect(screen.getByText("1–10 of 10 (120 total)")).toBeInTheDocument();
  });

  it("paginates large lists to 50 rows per page", async () => {
    const user = userEvent.setup();
    render(<NodesTable {...base} nodes={many(120)} />);

    expect(screen.getByText("1–50 of 120")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("51–100 of 120")).toBeInTheDocument();
  });

  it("shows a bootstrap call to action when the org has no nodes", () => {
    render(<NodesTable {...base} nodes={[]} />);
    expect(screen.getByRole("heading", { name: "No nodes yet" })).toBeInTheDocument();
    expect(screen.getByText(/cinc node bootstrap/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Or create a node record by hand" }),
    ).toHaveAttribute("href", "/orgs/acme/nodes/new");
  });

  it("has no axe violations when empty", async () => {
    const { container } = render(<NodesTable {...base} nodes={[]} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

it("has no axe violations", async () => {
  const { container } = render(
    <NodesTable
      {...base}
      nodes={[
        node({ name: "web1", chefVersion: "15.1.0", clientStatus: "eol" }),
        node({ name: "db1", lastCheckIn: null, chefVersion: null, clientStatus: "unknown" }),
        node({ name: "app1", status: "missing", missing: true }),
      ]}
    />,
  );
  expect(await axe(container)).toHaveNoViolations();
});

describe("aggregated rows (server/org columns)", () => {
  const aggregatedNodes: NodeRow[] = [
    node({ name: "web", server: "Server Two", org: "widgets", href: "/servers/s2/orgs/widgets/nodes/web" }),
    node({ name: "web", server: "Server One", org: "acme", href: "/servers/s1/orgs/acme/nodes/web" }),
  ];

  it("renders Server and Org columns only when rows carry them", () => {
    render(<NodesTable {...base} nodes={aggregatedNodes} />);
    expect(screen.getByRole("columnheader", { name: /server/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /org/i })).toBeInTheDocument();
    expect(screen.getByText("Server One")).toBeInTheDocument();
    expect(screen.getByText("widgets")).toBeInTheDocument();
  });

  it("does not render Server/Org columns for single-scope rows", () => {
    render(<NodesTable {...base} nodes={many(3)} />);
    expect(screen.queryByRole("columnheader", { name: /server/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /^org$/i })).not.toBeInTheDocument();
  });

  it("filter text matches server and org, not just name", async () => {
    const user = userEvent.setup();
    render(<NodesTable {...base} nodes={aggregatedNodes} />);
    await user.type(screen.getByPlaceholderText(/filter nodes/i), "widgets");
    expect(screen.getByText("1–1 of 1 (2 total)")).toBeInTheDocument();
  });

  it("each row links to its own href, not a shared basePath", () => {
    render(<NodesTable {...base} nodes={aggregatedNodes} />);
    const links = screen.getAllByRole("link", { name: "web" });
    expect(links.map((l) => l.getAttribute("href"))).toEqual(
      expect.arrayContaining([
        "/servers/s2/orgs/widgets/nodes/web",
        "/servers/s1/orgs/acme/nodes/web",
      ]),
    );
  });

  it("has no axe violations with the extra columns", async () => {
    const { container } = render(<NodesTable {...base} nodes={aggregatedNodes} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("facet filters", () => {
  const mixed: NodeRow[] = [
    node({ name: "web1", platform: "ubuntu", environment: "prod", policyGroup: "canary", lastCCRStatus: "success" }),
    node({ name: "web2", platform: "rhel", environment: "staging", policyGroup: "stable", lastCCRStatus: "failure" }),
    // No collector covers this one at all -- lastCCRStatus left undefined.
    node({ name: "web3", platform: "ubuntu", environment: "prod", policyGroup: null }),
  ];

  it("offers only the distinct values actually present in the loaded rows", () => {
    render(<NodesTable {...base} nodes={mixed} />);
    const platform = screen.getByLabelText("Platform") as HTMLSelectElement;
    const optionValues = Array.from(platform.options).map((o) => o.value);
    expect(optionValues).toEqual(["", "rhel", "ubuntu"]);
  });

  it("does not offer facet options for values not present in this node set", () => {
    render(<NodesTable {...base} nodes={mixed} />);
    const platform = screen.getByLabelText("Platform") as HTMLSelectElement;
    expect(Array.from(platform.options).map((o) => o.value)).not.toContain("windows");
  });

  it("filtering by a facet narrows the list, independent of the other facets", async () => {
    const user = userEvent.setup();
    render(<NodesTable {...base} nodes={mixed} />);
    await user.selectOptions(screen.getByLabelText("Platform"), "rhel");
    expect(screen.getByText("1–1 of 1 (3 total)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "web2" })).toBeInTheDocument();
  });

  it("a facet AND-composes with the free-text search, not OR", async () => {
    const user = userEvent.setup();
    render(<NodesTable {...base} nodes={mixed} />);
    await user.selectOptions(screen.getByLabelText("Platform"), "ubuntu");
    await user.type(screen.getByPlaceholderText(/filter nodes/i), "web3");
    expect(screen.getByText("1–1 of 1 (3 total)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "web3" })).toBeInTheDocument();
  });

  it("offers Converge status options only for statuses present, plus (unknown) when a row lacks one", () => {
    render(<NodesTable {...base} nodes={mixed} />);
    const status = screen.getByLabelText("Converge status") as HTMLSelectElement;
    const labels = Array.from(status.options).map((o) => o.textContent);
    expect(labels).toEqual(["All Converge status", "Succeeded", "Failed", "(unknown)"]);
  });

  it("omits the (unknown) option entirely when every row has a real converge status", () => {
    const allKnown = mixed.map((n) => ({ ...n, lastCCRStatus: "success" as const }));
    render(<NodesTable {...base} nodes={allKnown} />);
    const status = screen.getByLabelText("Converge status") as HTMLSelectElement;
    expect(Array.from(status.options).map((o) => o.textContent)).not.toContain("(unknown)");
  });

  it("selecting (unknown) isolates nodes with no usable converge status, including ones no collector covers at all", async () => {
    const user = userEvent.setup();
    render(<NodesTable {...base} nodes={mixed} />);
    await user.selectOptions(screen.getByLabelText("Converge status"), "(unknown)");
    expect(screen.getByText("1–1 of 1 (3 total)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "web3" })).toBeInTheDocument();
  });

  it("has no axe violations with the facet selects present", async () => {
    const { container } = render(<NodesTable {...base} nodes={mixed} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

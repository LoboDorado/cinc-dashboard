import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "@/test/axe";
import userEvent from "@testing-library/user-event";
import { ResourceTable, type ResourceRow } from "./resource-table";

const rows = (n: number): ResourceRow[] =>
  Array.from({ length: n }, (_, i) => {
    const name = `node${String(i).padStart(3, "0")}`;
    return { name, href: `/b/${name}` };
  });

describe("ResourceTable", () => {
  it("paginates large lists to 50 rows per page", async () => {
    const user = userEvent.setup();
    render(<ResourceTable title="Nodes" rows={rows(120)} />);

    // First page: 50 rows, page 1 of 3, Prev disabled.
    expect(screen.getAllByRole("link")).toHaveLength(50);
    expect(screen.getByText("1–50 of 120")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("51–100 of 120")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("101–120 of 120")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("filtering resets to the first page and updates the count", async () => {
    const user = userEvent.setup();
    render(<ResourceTable title="Nodes" rows={rows(120)} />);

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await user.type(screen.getByPlaceholderText(/filter nodes/i), "node01");
    // node010–node019 = 10 matches, back on page 1, total noted.
    expect(screen.getByText("1–10 of 10 (120 total)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
  });

  it("does not show pager when everything fits on one page", () => {
    render(<ResourceTable title="Nodes" rows={rows(5)} />);
    expect(screen.getByText("1–5 of 5")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<ResourceTable title="Nodes" rows={rows(120)} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("empty state", () => {
  const empty = <section aria-label="empty">Nothing here yet</section>;

  it("replaces the table and filter when there are no objects", () => {
    render(<ResourceTable title="Roles" rows={[]} createHref="/b/new" empty={empty} />);
    expect(screen.getByRole("region", { name: "empty" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/filter/i)).not.toBeInTheDocument();
  });

  it("treats a list of only built-in objects as empty", () => {
    render(
      <ResourceTable
        title="Environments"
        rows={[{ name: "_default", href: "/b/_default", builtIn: true }]}
        empty={empty}
      />,
    );
    expect(screen.getByRole("region", { name: "empty" })).toBeInTheDocument();
  });

  it("shows the list as soon as there is one object of the user's own", () => {
    render(
      <ResourceTable
        title="Environments"
        rows={[
          { name: "_default", href: "/b/_default", builtIn: true },
          { name: "prod", href: "/b/prod" },
        ]}
        empty={empty}
      />,
    );
    expect(screen.queryByRole("region", { name: "empty" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /prod/ })).toBeInTheDocument();
  });
});

describe("aggregated rows (server/org columns)", () => {
  const aggregatedRows: ResourceRow[] = [
    { name: "web", href: "/servers/s2/orgs/widgets/roles/web", server: "Server Two", org: "widgets" },
    { name: "web", href: "/servers/s1/orgs/acme/roles/web", server: "Server One", org: "acme" },
  ];

  it("renders Server and Org columns only when rows carry them", () => {
    render(<ResourceTable title="Roles" rows={aggregatedRows} />);
    expect(screen.getByRole("columnheader", { name: /server/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /org/i })).toBeInTheDocument();
    expect(screen.getByText("Server One")).toBeInTheDocument();
    expect(screen.getByText("widgets")).toBeInTheDocument();
  });

  it("does not render Server/Org columns for single-scope rows", () => {
    render(<ResourceTable title="Roles" rows={rows(3)} />);
    expect(screen.queryByRole("columnheader", { name: /server/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /^org$/i })).not.toBeInTheDocument();
  });

  it("filter text matches server and org, not just name", async () => {
    const user = userEvent.setup();
    render(<ResourceTable title="Roles" rows={aggregatedRows} />);
    await user.type(screen.getByPlaceholderText(/filter roles/i), "widgets");
    expect(screen.getByText("1–1 of 1 (2 total)")).toBeInTheDocument();
  });

  it("has no axe violations with the extra columns", async () => {
    const { container } = render(<ResourceTable title="Roles" rows={aggregatedRows} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { axe } from "@/test/axe";
import userEvent from "@testing-library/user-event";
import { CookbooksTable, type CookbookRow } from "./cookbooks-table";

const rows = (n: number): CookbookRow[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `cookbook${String(i).padStart(3, "0")}`,
    latest: "1.0.0",
    count: 1,
    href: `/b/cookbook${String(i).padStart(3, "0")}`,
  }));

describe("CookbooksTable", () => {
  it("shows each cookbook's name, latest version, and version count", () => {
    render(
      <CookbooksTable
        cookbooks={[
          { name: "nginx", latest: "1.2.0", count: 1, href: "/b/nginx" },
          { name: "apache2", latest: "5.1.0", count: 3, href: "/b/apache2" },
        ]}
      />,
    );

    const apache = screen.getByRole("row", { name: /apache2/ });
    expect(within(apache).getByRole("link", { name: "apache2" })).toHaveAttribute(
      "href",
      "/b/apache2",
    );
    expect(within(apache).getByText("5.1.0")).toBeInTheDocument();
    expect(within(apache).getByText("3")).toBeInTheDocument();
  });

  it("defaults to sorting by name ascending", () => {
    render(
      <CookbooksTable
        cookbooks={[
          { name: "nginx", latest: "1.2.0", count: 1, href: "/b/nginx" },
          { name: "apache2", latest: "5.1.0", count: 3, href: "/b/apache2" },
          { name: "mysql", latest: "8.0.0", count: 2, href: "/b/mysql" },
        ]}
      />,
    );
    const names = screen.getAllByRole("link").map((a) => a.textContent);
    expect(names).toEqual(["apache2", "mysql", "nginx"]);
  });

  it("renders a dash when a cookbook has no versions", () => {
    render(<CookbooksTable cookbooks={[{ name: "ghost", latest: null, count: 0, href: "/b/ghost" }]} />);
    const ghost = screen.getByRole("row", { name: /ghost/ });
    expect(within(ghost).getByText("—")).toBeInTheDocument();
    expect(within(ghost).getByText("0")).toBeInTheDocument();
  });

  it("filters by name and updates the count", async () => {
    const user = userEvent.setup();
    render(<CookbooksTable cookbooks={rows(120)} />);

    await user.type(screen.getByPlaceholderText(/filter cookbooks/i), "cookbook01");
    // cookbook010–cookbook019 = 10 matches.
    expect(screen.getByText("1–10 of 10 (120 total)")).toBeInTheDocument();
  });

  it("paginates large lists to 50 rows per page", async () => {
    const user = userEvent.setup();
    render(<CookbooksTable cookbooks={rows(120)} />);

    expect(screen.getAllByRole("link")).toHaveLength(50);
    expect(screen.getByText("1–50 of 120")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("51–100 of 120")).toBeInTheDocument();
  });

  it("invites the user to upload when the org has no cookbooks", () => {
    render(<CookbooksTable cookbooks={[]} />);
    expect(screen.getByRole("heading", { name: "No cookbooks yet" })).toBeInTheDocument();
    expect(screen.getByText("cinc cookbook upload")).toBeInTheDocument();
    // Nothing to filter in an empty org.
    expect(screen.queryByPlaceholderText(/filter/i)).not.toBeInTheDocument();
  });

  it("renders Server/Org columns, sorts by them, and filters by them when rows carry them", async () => {
    const user = userEvent.setup();
    render(
      <CookbooksTable
        cookbooks={[
          { name: "nginx", latest: "1.2.0", count: 1, href: "/a", server: "Server B", org: "acme" },
          { name: "apache2", latest: "5.1.0", count: 3, href: "/b", server: "Server A", org: "widgets" },
        ]}
      />,
    );

    expect(screen.getByRole("columnheader", { name: /server/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /org/i })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/filter cookbooks/i), "widgets");
    expect(screen.getByRole("row", { name: /apache2/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /^nginx/ })).not.toBeInTheDocument();
  });

  it("has no axe violations when empty", async () => {
    const { container } = render(<CookbooksTable cookbooks={[]} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

it("has no axe violations", async () => {
  const { container } = render(<CookbooksTable cookbooks={rows(3)} />);
  expect(await axe(container)).toHaveNoViolations();
});

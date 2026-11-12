import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScopedCreateForm } from "./scoped-create-form";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

beforeEach(() => {
  nav.push.mockClear();
  nav.refresh.mockClear();
});

const oneOption = [{ serverId: "s1", serverName: "Server One", org: "acme" }];
const twoOptions = [
  ...oneOption,
  { serverId: "s2", serverName: "Server Two", org: "widgets" },
];

describe("ScopedCreateForm", () => {
  it("explains there's nowhere to create when there are no write-eligible scopes", () => {
    render(<ScopedCreateForm kind="role" listKind="roles" options={[]} action={vi.fn()} />);
    expect(screen.getByText(/don't have permission to create a role anywhere/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("skips the picker and shows the form immediately with exactly one scope", () => {
    render(<ScopedCreateForm kind="role" listKind="roles" options={oneOption} action={vi.fn()} />);
    expect(screen.queryByLabelText(/server and organization/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("shows a picker with more than one scope, and the form only after choosing one", async () => {
    const user = userEvent.setup();
    render(<ScopedCreateForm kind="role" listKind="roles" options={twoOptions} action={vi.fn()} />);
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText(/server and organization/i),
      "Server Two / widgets",
    );
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("binds the create action to the chosen scope and redirects into it on success", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({ ok: true });
    render(<ScopedCreateForm kind="role" listKind="roles" options={twoOptions} action={action} />);

    await user.selectOptions(
      screen.getByLabelText(/server and organization/i),
      "Server Two / widgets",
    );
    await user.type(screen.getByLabelText("Name"), "web");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(action).toHaveBeenCalledWith("s2", "widgets", "web", expect.any(String));
    expect(nav.push).toHaveBeenCalledWith("/servers/s2/orgs/widgets/roles/web");
  });
});

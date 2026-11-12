import { expect, test, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "@/test/axe";
import userEvent from "@testing-library/user-event";
import { NewObjectForm } from "./new-object-form";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

const onCreate = vi.fn(async () => ({ ok: true as const }));
beforeEach(() => {
  onCreate.mockClear();
  nav.push.mockClear();
  nav.refresh.mockClear();
});

const setup = () =>
  render(
    <NewObjectForm
      title="New role"
      backHref="/orgs/acme/roles"
      onCreate={onCreate}
      initialJson="{}"
      nameKind="role"
    />,
  );

const createButton = () => screen.getByRole("button", { name: /create/i });

test("blocks an invalid name with an inline error and a disabled Create", async () => {
  setup();
  await userEvent.type(screen.getByLabelText("Name"), "web.server"); // dot is invalid for roles
  expect(screen.getByRole("alert")).toHaveTextContent(/no dots/i);
  expect(createButton()).toBeDisabled();
  expect(onCreate).not.toHaveBeenCalled();
});

test("accepts a valid name and enables Create", async () => {
  setup();
  await userEvent.type(screen.getByLabelText("Name"), "web-server");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(createButton()).toBeEnabled();
});

test("has no axe violations, including the invalid-name state", async () => {
  const { container } = setup();
  expect(await axe(container)).toHaveNoViolations();
  await userEvent.type(screen.getByLabelText("Name"), "web.server");
  expect(await axe(container)).toHaveNoViolations();
});

test("calls onCreated instead of the default redirect when given one", async () => {
  const onCreated = vi.fn();
  render(
    <NewObjectForm
      title="New node"
      backHref="/nodes"
      onCreate={onCreate}
      onCreated={onCreated}
      initialJson="{}"
      nameKind="node"
    />,
  );
  await userEvent.type(screen.getByLabelText("Name"), "web1");
  await userEvent.click(createButton());

  expect(onCreated).toHaveBeenCalledWith("web1");
  expect(nav.push).not.toHaveBeenCalled();
  expect(nav.refresh).toHaveBeenCalled();
});

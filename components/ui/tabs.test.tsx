import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test/axe";
import { useState } from "react";

const { nav, searchParams } = vi.hoisted(() => ({
  nav: { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() },
  searchParams: { current: "" },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  usePathname: () => "/servers/s1/orgs/acme/nodes/web01",
  useSearchParams: () => new URLSearchParams(searchParams.current),
}));

import { Tabs, TabPanel, useTabParam, type TabItem } from "./tabs";

const TAB_ITEMS: TabItem[] = [
  { id: "details", label: "Details" },
  { id: "compliance", label: "Compliance" },
];

function Demo({ initial = "details" }: { initial?: string }) {
  const [active, setActive] = useState(initial);
  return (
    <div>
      <Tabs id="demo" tabs={TAB_ITEMS} activeId={active} onChange={setActive} label="Node sections" />
      <TabPanel id="demo" tabId="details" activeId={active}>
        Details content
      </TabPanel>
      <TabPanel id="demo" tabId="compliance" activeId={active}>
        Compliance content
      </TabPanel>
    </div>
  );
}

describe("Tabs/TabPanel", () => {
  it("shows only the active panel's content, with the right roles and selection state", () => {
    render(<Demo />);
    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Compliance" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("Details content")).toBeVisible();
    expect(screen.getByText("Compliance content")).not.toBeVisible();
  });

  it("switches on click", async () => {
    render(<Demo />);
    await userEvent.click(screen.getByRole("tab", { name: "Compliance" }));
    expect(screen.getByRole("tab", { name: "Compliance" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Compliance content")).toBeVisible();
    expect(screen.getByText("Details content")).not.toBeVisible();
  });

  it("keeps a hidden panel's content mounted rather than unmounting it", async () => {
    render(<Demo />);
    const compliance = screen.getByText("Compliance content");
    await userEvent.click(screen.getByRole("tab", { name: "Compliance" }));
    await userEvent.click(screen.getByRole("tab", { name: "Details" }));
    // Same DOM node survived the round trip -- it was hidden, not unmounted.
    expect(compliance).toBe(screen.getByText("Compliance content"));
  });

  it("follows the tabs keyboard pattern: roving tabindex, arrow keys move and select, wraps at the ends", async () => {
    render(<Demo />);
    const details = screen.getByRole("tab", { name: "Details" });
    const compliance = screen.getByRole("tab", { name: "Compliance" });
    expect(compliance).toHaveAttribute("tabindex", "-1");
    expect(details).toHaveAttribute("tabindex", "0");

    details.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(compliance).toHaveFocus();
    expect(compliance).toHaveAttribute("aria-selected", "true");
    expect(details).toHaveAttribute("tabindex", "-1");

    await userEvent.keyboard("{ArrowRight}"); // wraps back to the first tab
    expect(details).toHaveFocus();

    await userEvent.keyboard("{End}");
    expect(compliance).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(details).toHaveFocus();
  });

  it("has no axe violations", async () => {
    const { container } = render(<Demo />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("useTabParam", () => {
  beforeEach(() => {
    searchParams.current = "";
    nav.replace.mockClear();
  });

  function Reader({ def = "details" }: { def?: string }) {
    const [active, setActive] = useTabParam("tab", def, ["details", "compliance"]);
    return <button onClick={() => setActive("compliance")} aria-label={`active:${active}`} />;
  }

  it("falls back to the default when the param is absent", () => {
    render(<Reader />);
    expect(screen.getByRole("button", { name: "active:details" })).toBeInTheDocument();
  });

  it("falls back to the default when the param names an unknown tab", () => {
    searchParams.current = "tab=nonexistent";
    render(<Reader />);
    expect(screen.getByRole("button", { name: "active:details" })).toBeInTheDocument();
  });

  it("reads a valid non-default tab from the param", () => {
    searchParams.current = "tab=compliance";
    render(<Reader />);
    expect(screen.getByRole("button", { name: "active:compliance" })).toBeInTheDocument();
  });

  it("writes a non-default tab into the URL via router.replace", async () => {
    render(<Reader />);
    await userEvent.click(screen.getByRole("button"));
    expect(nav.replace).toHaveBeenCalledWith(
      "/servers/s1/orgs/acme/nodes/web01?tab=compliance",
      { scroll: false },
    );
  });

  it("drops the param when switching back to the default", async () => {
    searchParams.current = "tab=compliance";
    function BackToDefault() {
      const [active, setActive] = useTabParam("tab", "details", ["details", "compliance"]);
      return <button onClick={() => setActive("details")} aria-label={`active:${active}`} />;
    }
    render(<BackToDefault />);
    await userEvent.click(screen.getByRole("button"));
    expect(nav.replace).toHaveBeenCalledWith("/servers/s1/orgs/acme/nodes/web01", { scroll: false });
  });
});

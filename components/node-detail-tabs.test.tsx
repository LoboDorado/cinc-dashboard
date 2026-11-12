import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Tabs/TabPanel's own click-switching and useTabParam's own URL read/write
// are already covered by components/ui/tabs.test.tsx -- this just proves
// NodeDetailTabs wires them together correctly (matching ids, and the right
// props reaching NodeComplianceTab), via the one thing a static
// next/navigation mock can observe: the default render.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/servers/s1/orgs/acme/nodes/web01",
  useSearchParams: () => new URLSearchParams(""),
}));

import { NodeDetailTabs } from "./node-detail-tabs";

describe("NodeDetailTabs", () => {
  it("shows Details by default, with Compliance present but hidden, correctly wired", () => {
    render(
      <NodeDetailTabs
        detailsPanel={<p>Details content</p>}
        hasCollector={false}
        server="s1"
        org="acme"
        nodeName="web01"
      />,
    );

    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Compliance" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("Details content")).toBeVisible();

    // The Compliance panel's content (the no-collector CTA, since
    // hasCollector={false}) is mounted but hidden -- getByRole excludes
    // hidden elements unless asked not to.
    const complianceLink = screen.getByRole("link", {
      name: "Register a collector",
      hidden: true,
    });
    expect(complianceLink).not.toBeVisible();
    expect(complianceLink).toHaveAttribute("href", "/admin/collectors/new");
  });
});

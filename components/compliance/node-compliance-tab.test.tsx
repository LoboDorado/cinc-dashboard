import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NodeComplianceTab } from "./node-compliance-tab";
import type { NodeComplianceResult } from "@/lib/collector/compliance";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown) {
  return Promise.resolve({ json: () => Promise.resolve(body) } as Response);
}

describe("NodeComplianceTab", () => {
  it("shows the no-collector CTA and never fetches when hasCollector is false", () => {
    render(
      <NodeComplianceTab active hasCollector={false} server="s1" org="acme" nodeName="web01" />,
    );
    expect(
      screen.getByRole("link", { name: "Register a collector" }),
    ).toHaveAttribute("href", "/admin/collectors/new");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fetch while inactive", () => {
    render(
      <NodeComplianceTab active={false} hasCollector server="s1" org="acme" nodeName="web01" />,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches once on becoming active and shows the empty state for zero reports", async () => {
    const result: NodeComplianceResult = { state: "empty" };
    fetchMock.mockReturnValueOnce(jsonResponse(result));
    render(<NodeComplianceTab active hasCollector server="s1" org="acme" nodeName="web01" />);
    expect(fetchMock).toHaveBeenCalledWith("/servers/s1/orgs/acme/nodes/web01/compliance");
    expect(
      await screen.findByText("No compliance scans reported for this node yet."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders each report as a link to its report-detail route", async () => {
    const result: NodeComplianceResult = {
      state: "reports",
      reports: [
        {
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
        },
      ],
    };
    fetchMock.mockReturnValueOnce(jsonResponse(result));
    render(<NodeComplianceTab active hasCollector server="s1" org="acme" nodeName="web01" />);
    const link = await screen.findByRole("link", { name: /Failed/ });
    expect(link).toHaveAttribute("href", "/servers/s1/orgs/acme/nodes/web01/compliance/r1");
    expect(screen.getByText(/3 passed/)).toBeInTheDocument();
  });

  it("shows a collector-error message distinct from the empty state", async () => {
    const result: NodeComplianceResult = { state: "error", reason: "collector error (500)" };
    fetchMock.mockReturnValueOnce(jsonResponse(result));
    render(<NodeComplianceTab active hasCollector server="s1" org="acme" nodeName="web01" />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("collector error (500)");
  });

  it("shows a fetch-error message when the request itself fails", async () => {
    fetchMock.mockReturnValueOnce(Promise.reject(new Error("network down")));
    render(<NodeComplianceTab active hasCollector server="s1" org="acme" nodeName="web01" />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("treats a forbidden response the same as a fetch error", async () => {
    fetchMock.mockReturnValueOnce(jsonResponse({ state: "forbidden" }));
    render(<NodeComplianceTab active hasCollector server="s1" org="acme" nodeName="web01" />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});

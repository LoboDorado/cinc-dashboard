"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DetailSection, EmptyState, Badge } from "@/components/details/primitives";
import { buttonClass } from "@/components/ui/button";
import { nodeCompliancePath, complianceReportPath } from "@/lib/urls";
import type { ComplianceReportSummary, NodeComplianceResult } from "@/lib/collector/compliance";

type FetchState =
  | { kind: "loading" }
  | { kind: "result"; result: NodeComplianceResult }
  | { kind: "fetch_error" };

function StatusBadge({ status }: { status: string }) {
  if (status === "passed") return <Badge tone="success">Passed</Badge>;
  if (status === "failed") return <Badge tone="warn">Failed</Badge>;
  if (status === "skipped") return <Badge tone="muted">Skipped</Badge>;
  return <Badge tone="muted">{status}</Badge>;
}

function ReportRow({
  report,
  href,
}: {
  report: ComplianceReportSummary;
  href: string;
}) {
  return (
    <li className="border-b border-border last:border-0">
      <Link
        href={href}
        className="flex flex-wrap items-center justify-between gap-2 px-1 py-2.5 text-sm transition-colors hover:text-link"
      >
        <span className="flex items-center gap-2">
          <StatusBadge status={report.status} />
          <span className="text-muted">
            {report.controlsPassed ?? 0} passed · {report.controlsFailed ?? 0} failed ·{" "}
            {report.controlsSkipped ?? 0} skipped
          </span>
        </span>
        <span className="whitespace-nowrap text-xs text-muted">
          {new Date(report.startTime).toLocaleString()}
        </span>
      </Link>
    </li>
  );
}

/**
 * The node detail page's Compliance tab. Fetched lazily, once, the first
 * time this panel becomes active -- `hasCollector` is already known
 * server-side, so a server with none linked skips the fetch entirely and
 * shows the CTA immediately, with no loading flash for an answer that was
 * never in question.
 */
export function NodeComplianceTab({
  active,
  hasCollector,
  server,
  org,
  nodeName,
}: {
  active: boolean;
  hasCollector: boolean;
  server: string;
  org: string;
  nodeName: string;
}) {
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  // A ref, not state: starting the fetch is bookkeeping for this effect, not
  // a value the render needs to react to, so setting it synchronously in the
  // effect body (as state would require) would just trigger a pointless
  // extra render.
  const startedRef = useRef(false);

  useEffect(() => {
    if (!active || startedRef.current || !hasCollector) return;
    startedRef.current = true;
    let cancelled = false;
    fetch(nodeCompliancePath(server, org, nodeName))
      .then((res) => res.json())
      .then((result: NodeComplianceResult | { state: "forbidden" }) => {
        if (cancelled) return;
        if (result.state === "forbidden") {
          setState({ kind: "fetch_error" });
        } else {
          setState({ kind: "result", result });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "fetch_error" });
      });
    return () => {
      cancelled = true;
    };
  }, [active, hasCollector, server, org, nodeName]);

  if (!hasCollector) {
    return (
      <DetailSection title="Compliance">
        <p className="text-sm text-muted">
          No collector is registered for this server yet. InSpec compliance
          scans are stored by a Cinc Collector, not the Cinc Server itself.
        </p>
        <Link href="/admin/collectors/new" className={buttonClass("secondary")}>
          Register a collector
        </Link>
      </DetailSection>
    );
  }

  if (state.kind === "loading") {
    return (
      <DetailSection title="Compliance">
        <p aria-live="polite" className="text-sm text-muted">
          Loading compliance history…
        </p>
      </DetailSection>
    );
  }

  if (state.kind === "fetch_error") {
    return (
      <DetailSection title="Compliance">
        <p role="alert" className="text-sm text-danger">
          Couldn&apos;t load compliance history for this node. Try again.
        </p>
      </DetailSection>
    );
  }

  const { result } = state;

  if (result.state === "error") {
    return (
      <DetailSection title="Compliance">
        <p role="alert" className="text-sm text-danger">
          Couldn&apos;t reach the collector ({result.reason}). Try again later.
        </p>
      </DetailSection>
    );
  }

  // "no_collector" shouldn't normally reach here -- hasCollector already
  // gates the fetch -- but the type is shared with loadNodeCompliance's own
  // check, so handle it the same as "empty" rather than assuming it away.
  if (result.state === "empty" || result.state === "no_collector") {
    return (
      <DetailSection title="Compliance">
        <EmptyState>No compliance scans reported for this node yet.</EmptyState>
      </DetailSection>
    );
  }

  return (
    <DetailSection title="Compliance">
      <ul>
        {result.reports.map((r) => (
          <ReportRow
            key={r.reportId}
            report={r}
            href={complianceReportPath(server, org, nodeName, r.reportId)}
          />
        ))}
      </ul>
    </DetailSection>
  );
}

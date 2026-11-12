"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { DetailSection, FieldGrid, Field, Badge, EmptyState } from "./primitives";
import type {
  ComplianceReportDetail,
  ComplianceControl,
  ComplianceProfile,
} from "@/lib/collector/compliance";

function StatusBadge({ status }: { status: string }) {
  if (status === "passed") return <Badge tone="success">Passed</Badge>;
  if (status === "failed") return <Badge tone="warn">Failed</Badge>;
  if (status === "skipped") return <Badge tone="muted">Skipped</Badge>;
  return <Badge tone="muted">{status}</Badge>;
}

function ControlRow({ control }: { control: ComplianceControl }) {
  const [open, setOpen] = useState(false);
  const worst = control.results.some((r) => r.status === "failed")
    ? "failed"
    : control.results.every((r) => r.status === "skipped")
      ? "skipped"
      : "passed";

  return (
    <li className="py-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-2 text-left text-sm hover:text-link"
      >
        <span aria-hidden="true" className="w-3 shrink-0 text-muted">
          {open ? "▾" : "▸"}
        </span>
        <StatusBadge status={worst} />
        <span className="flex-1">
          <span className="font-mono text-xs text-muted">{control.id}</span>{" "}
          {control.title}
        </span>
      </button>
      {open && (
        <div className="ml-5 mt-1.5 space-y-2 border-l border-border pl-3">
          {control.desc && <p className="text-xs text-muted">{control.desc}</p>}
          <ul className="space-y-1">
            {control.results.map((r, i) => (
              <li key={i} className="text-xs">
                <StatusBadge status={r.status} />{" "}
                <span className="text-text">{r.codeDesc}</span>
                {r.message && <p className="mt-0.5 text-danger">{r.message}</p>}
                {r.skipMessage && <p className="mt-0.5 text-muted">{r.skipMessage}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function ProfileSection({ profile }: { profile: ComplianceProfile }) {
  return (
    <DetailSection
      title={profile.title || profile.name}
      action={profile.version && <span className="text-xs text-muted">v{profile.version}</span>}
    >
      {profile.summary && <p className="mb-2 text-sm text-muted">{profile.summary}</p>}
      {profile.controls.length === 0 ? (
        <EmptyState>No controls in this profile.</EmptyState>
      ) : (
        <ul className={cn("divide-y divide-border")}>
          {profile.controls.map((c) => (
            <ControlRow key={c.id} control={c} />
          ))}
        </ul>
      )}
    </DetailSection>
  );
}

/** Full read-only view of one compliance report: summary, then a profile -> control -> result breakdown. */
export function ComplianceReportDetails({ report }: { report: ComplianceReportDetail }) {
  return (
    <div className="space-y-4">
      <DetailSection title="Summary">
        <FieldGrid>
          <Field label="Status">
            <StatusBadge status={report.status} />
          </Field>
          <Field label="Environment">{report.environment || "—"}</Field>
          <Field label="Controls">
            {report.controlsPassed ?? 0} passed · {report.controlsFailed ?? 0} failed ·{" "}
            {report.controlsSkipped ?? 0} skipped
          </Field>
          <Field label="Started">{new Date(report.startTime).toLocaleString()}</Field>
          <Field label="Ended">
            {report.endTime ? new Date(report.endTime).toLocaleString() : "—"}
          </Field>
        </FieldGrid>
      </DetailSection>

      {report.profiles.length === 0 ? (
        <DetailSection title="Profiles">
          <EmptyState>No profile data in this report.</EmptyState>
        </DetailSection>
      ) : (
        report.profiles.map((p) => <ProfileSection key={p.name} profile={p} />)
      )}
    </div>
  );
}

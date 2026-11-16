import { EmptyState, Chips } from "@/components/details/primitives";
import type { ComplianceControlRow } from "@/lib/collector/compliance-aggregate";

export function ControlsTab({ rows }: { rows: ComplianceControlRow[] }) {
  if (rows.length === 0) return <EmptyState>No controls match the current view.</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">Controls, aggregated across every profile and node they appear in</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th scope="col" className="px-4 py-2.5 font-medium">Control</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Impact</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Profiles</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Results</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-2">
              <td className="px-4 py-2.5 text-text">
                <span className="block">{c.title ?? c.id}</span>
                {c.title && <span className="block font-mono text-xs text-muted">{c.id}</span>}
              </td>
              <td className="px-4 py-2.5 text-muted">{c.impact}</td>
              <td className="px-4 py-2.5">
                <Chips items={c.profileNames} empty="—" />
              </td>
              <td className="px-4 py-2.5 text-muted">
                {c.passCount} passed · {c.failCount} failed · {c.skipCount} skipped
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

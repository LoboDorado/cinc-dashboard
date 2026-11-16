import { EmptyState } from "@/components/details/primitives";
import type { ComplianceProfileRow } from "@/lib/collector/compliance-aggregate";

export function ProfilesTab({ rows }: { rows: ComplianceProfileRow[] }) {
  if (rows.length === 0) return <EmptyState>No profiles match the current view.</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">Profiles, aggregated across every node they appear on</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th scope="col" className="px-4 py-2.5 font-medium">Profile</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Nodes</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Controls</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.name} className="border-b border-border last:border-0 hover:bg-surface-2">
              <td className="px-4 py-2.5 text-text">
                <span className="block">{p.title ?? p.name}</span>
                {p.title && <span className="block font-mono text-xs text-muted">{p.name}</span>}
              </td>
              <td className="px-4 py-2.5 text-muted">{p.nodeCount}</td>
              <td className="px-4 py-2.5 text-muted">
                {p.controlsPassed} passed · {p.controlsFailed} failed · {p.controlsSkipped} skipped
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

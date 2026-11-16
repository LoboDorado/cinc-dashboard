import Link from "next/link";
import { EmptyState } from "@/components/details/primitives";
import { StatusBadge } from "@/components/compliance/status-badge";
import type { ComplianceNodeRow } from "@/lib/collector/compliance-aggregate";

export function NodesTab({ rows }: { rows: ComplianceNodeRow[] }) {
  if (rows.length === 0) return <EmptyState>No nodes match the current view.</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">Nodes, with their latest compliance report</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th scope="col" className="px-4 py-2.5 font-medium">Node</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Server / org</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Controls</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Last scan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={`${r.serverId}::${r.org}::${r.nodeName}`}
              className="border-b border-border last:border-0 hover:bg-surface-2"
            >
              <td className="p-0">
                <Link
                  href={r.href}
                  className="block px-4 py-2.5 font-mono text-text transition-colors hover:text-link"
                >
                  {r.nodeName}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-muted">
                {r.serverName} / {r.org}
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-4 py-2.5 text-muted">
                {r.controlsPassed} passed · {r.controlsFailed} failed · {r.controlsSkipped} skipped
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-muted">
                {new Date(r.startTime).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

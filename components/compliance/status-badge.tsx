import { Badge } from "@/components/details/primitives";

/** Shared across the Compliance page's results list and the Nodes tab --
 *  text + tone, never color alone, per this app's accessibility rules. */
export function StatusBadge({ status }: { status: string }) {
  if (status === "passed") return <Badge tone="success">Passed</Badge>;
  if (status === "failed") return <Badge tone="warn">Failed</Badge>;
  if (status === "skipped") return <Badge tone="muted">Skipped</Badge>;
  return <Badge tone="muted">{status}</Badge>;
}

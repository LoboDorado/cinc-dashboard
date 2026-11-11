import { IconCheck, IconClose } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/** Pairs an icon with text -- never color alone -- for an audit entry's allow/deny result. */
export function AuditOutcome({
  outcome,
  statusCode,
}: {
  outcome: string;
  statusCode: number | null;
}) {
  const denied = outcome === "denied";
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", denied ? "text-danger" : "text-success")}>
      {denied ? <IconClose /> : <IconCheck />}
      <span>
        {denied ? "Denied" : "Allowed"}
        {statusCode ? ` (${statusCode})` : ""}
      </span>
    </span>
  );
}

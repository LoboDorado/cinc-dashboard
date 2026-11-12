import Link from "next/link";
import { currentAccountId } from "@/lib/guard";
import { loadComplianceReportById } from "@/lib/collector/compliance";
import { safeGet, explainRead } from "@/lib/cinc/safe-get";
import { ComplianceReportDetails } from "@/components/details/compliance-report-details";
import { objectPath } from "@/lib/urls";

export default async function ComplianceReportDetail({
  params,
}: {
  params: Promise<{ server: string; org: string; name: string; reportId: string }>;
}) {
  const { server, org, name: raw, reportId: rawReportId } = await params;
  const name = decodeURIComponent(raw);
  const reportId = decodeURIComponent(rawReportId);
  const accountId = await currentAccountId();

  const res = await safeGet(() => loadComplianceReportById(accountId, server, org, name, reportId));
  if ("error" in res) {
    return <p className="text-sm text-danger">{explainRead(res.error)}</p>;
  }

  // The node detail page itself, back on its Compliance tab -- there's no
  // standalone page at the .../compliance path, only the lazy-fetch API
  // route (see .../compliance/route.ts), so that's not a valid link target.
  const backHref = `${objectPath(server, org, "nodes", name)}?tab=compliance`;

  if (res.data.state === "not_found" || res.data.state === "no_collector") {
    return (
      <div className="space-y-3">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted hover:text-link">
          <span aria-hidden="true">←</span> Back
        </Link>
        <p className="text-sm text-danger">
          This no longer exists, or you don&apos;t have access to it.
        </p>
      </div>
    );
  }
  if (res.data.state === "error") {
    return (
      <div className="space-y-3">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted hover:text-link">
          <span aria-hidden="true">←</span> Back
        </Link>
        <p role="alert" className="text-sm text-danger">
          Couldn&apos;t reach the collector ({res.data.reason}). Try again later.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted hover:text-link">
          <span aria-hidden="true">←</span> Back
        </Link>
        <h1 className="mt-1 font-mono text-xl font-semibold tracking-tight">{name}</h1>
      </div>
      <ComplianceReportDetails report={res.data.report} />
    </div>
  );
}

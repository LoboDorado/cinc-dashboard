import { PageHeader } from "@/components/ui/page-header";
import { AuditLogView, type AuditLogFilters } from "@/components/admin/audit-log-view";

export default async function OrgAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ server: string; org: string }>;
  searchParams: Promise<AuditLogFilters>;
}) {
  const { server, org } = await params;
  const filters = await searchParams;

  return (
    <div className="space-y-4">
      <PageHeader title="Audit log" description={`Every dashboard-mediated action in ${org}.`} />
      <AuditLogView
        scope={{ kind: "org", serverId: server, org }}
        basePath={`/servers/${server}/orgs/${org}/admin/audit`}
        filters={filters}
      />
    </div>
  );
}

import { PageHeader } from "@/components/ui/page-header";
import { AuditLogView, type AuditLogFilters } from "@/components/admin/audit-log-view";

export default async function ServerAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ server: string }>;
  searchParams: Promise<AuditLogFilters>;
}) {
  const { server } = await params;
  const filters = await searchParams;

  return (
    <div className="space-y-4">
      <PageHeader title="Audit log" description="Every dashboard-mediated action on this server, across every org." />
      <AuditLogView
        scope={{ kind: "server", serverId: server }}
        basePath={`/servers/${server}/admin/audit`}
        filters={filters}
      />
    </div>
  );
}

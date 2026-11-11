import { PageHeader } from "@/components/ui/page-header";
import { AuditLogView, type AuditLogFilters } from "@/components/admin/audit-log-view";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<AuditLogFilters>;
}) {
  const filters = await searchParams;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit log"
        description="Every dashboard-mediated action, role grant, and collector linkage change, platform-wide."
      />
      <AuditLogView scope={{ kind: "platform" }} basePath="/admin/audit" filters={filters} />
    </div>
  );
}

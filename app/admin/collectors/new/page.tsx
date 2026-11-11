import { PageHeader } from "@/components/ui/page-header";
import { CollectorForm } from "@/components/admin/collector-form";
import { listRegisteredServers } from "@/lib/admin/servers";
import { createCollectorAction } from "../actions";

export default async function NewCollectorPage() {
  const servers = await listRegisteredServers();
  return (
    <div className="space-y-4">
      <PageHeader title="New collector" />
      <CollectorForm allServers={servers} onSubmit={createCollectorAction} submitLabel="Register collector" />
    </div>
  );
}

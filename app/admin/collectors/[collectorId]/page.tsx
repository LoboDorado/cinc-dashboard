import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { CollectorForm } from "@/components/admin/collector-form";
import { DeleteCollectorButton } from "./delete-collector-button";
import { getRegisteredCollector } from "@/lib/admin/collectors";
import { listRegisteredServers } from "@/lib/admin/servers";
import { updateCollectorAction, deleteCollectorAction } from "../actions";

export default async function EditCollectorPage({
  params,
}: {
  params: Promise<{ collectorId: string }>;
}) {
  const { collectorId } = await params;
  const [collector, servers] = await Promise.all([
    getRegisteredCollector(collectorId),
    listRegisteredServers(),
  ]);
  if (!collector) notFound();

  return (
    <div className="space-y-4">
      <PageHeader
        title={collector.name}
        actions={
          <DeleteCollectorButton onDelete={deleteCollectorAction.bind(null, collectorId)} />
        }
      />
      <CollectorForm
        initial={collector}
        allServers={servers}
        onSubmit={(values) => updateCollectorAction(collectorId, values)}
        submitLabel="Save"
      />
    </div>
  );
}

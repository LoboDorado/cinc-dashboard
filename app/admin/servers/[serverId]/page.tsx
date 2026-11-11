import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { ServerForm } from "@/components/admin/server-form";
import { DeleteServerButton } from "./delete-server-button";
import { getRegisteredServer } from "@/lib/admin/servers";
import { updateServerAction, deleteServerAction } from "../actions";

export default async function EditServerPage({
  params,
}: {
  params: Promise<{ serverId: string }>;
}) {
  const { serverId } = await params;
  const server = await getRegisteredServer(serverId);
  if (!server) notFound();

  return (
    <div className="space-y-4">
      <PageHeader
        title={server.name}
        actions={<DeleteServerButton onDelete={deleteServerAction.bind(null, serverId)} />}
      />
      <ServerForm
        initial={server}
        onSubmit={updateServerAction.bind(null, serverId)}
        submitLabel="Save"
      />
    </div>
  );
}

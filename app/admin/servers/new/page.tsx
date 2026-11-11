import { PageHeader } from "@/components/ui/page-header";
import { ServerForm } from "@/components/admin/server-form";
import { createServerAction } from "../actions";

export default function NewServerPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="New server" />
      <ServerForm onSubmit={createServerAction} submitLabel="Register server" />
    </div>
  );
}

import { CreateObjectForm } from "@/components/create-object-form";
import { createRole } from "../actions";

export default async function NewRole({
  params,
}: {
  params: Promise<{ server: string; org: string }>;
}) {
  const { server, org } = await params;
  const base = `/servers/${server}/orgs/${org}/roles`;
  return (
    <CreateObjectForm
      kind="role"
      backHref={base}
      onCreate={createRole.bind(null, server, org)}
    />
  );
}

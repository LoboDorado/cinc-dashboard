import { CreateObjectForm } from "@/components/create-object-form";
import { createEnvironment } from "../actions";

export default async function NewEnvironment({
  params,
}: {
  params: Promise<{ server: string; org: string }>;
}) {
  const { server, org } = await params;
  const base = `/servers/${server}/orgs/${org}/environments`;
  return (
    <CreateObjectForm
      kind="environment"
      backHref={base}
      onCreate={createEnvironment.bind(null, server, org)}
    />
  );
}

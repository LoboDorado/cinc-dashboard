import { NewObjectForm } from "@/components/new-object-form";
import { createNode } from "../actions";

export default async function NewNode({
  params,
}: {
  params: Promise<{ server: string; org: string }>;
}) {
  const { server, org } = await params;
  const base = `/servers/${server}/orgs/${org}/nodes`;
  const initialJson = JSON.stringify(
    { name: "", chef_environment: "_default", run_list: [], normal: {} },
    null,
    2,
  );
  return (
    <NewObjectForm
      title="New node"
      backHref={base}
      onCreate={createNode.bind(null, server, org)}
      initialJson={initialJson}
      nameKind="node"
    />
  );
}

import { NewClientForm } from "./new-client-form";
import { createClientAction } from "../actions";

export default async function NewClientPage({
  params,
}: {
  params: Promise<{ server: string; org: string }>;
}) {
  const { server, org } = await params;
  return (
    <NewClientForm
      server={server}
      org={org}
      onCreate={createClientAction.bind(null, server, org)}
    />
  );
}

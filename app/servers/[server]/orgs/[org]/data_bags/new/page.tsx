import { createBag } from "../actions";
import { NewBagForm } from "./new-bag-form";

export default async function NewDataBag({
  params,
}: {
  params: Promise<{ server: string; org: string }>;
}) {
  const { server, org } = await params;
  return <NewBagForm server={server} org={org} onCreate={createBag.bind(null, server, org)} />;
}

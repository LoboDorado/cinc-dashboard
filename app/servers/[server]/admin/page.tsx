import { redirect } from "next/navigation";

/** This tree has no index of its own -- land on the role grants list, its natural default. */
export default async function ServerAdminIndexPage({
  params,
}: {
  params: Promise<{ server: string }>;
}) {
  const { server } = await params;
  redirect(`/servers/${server}/admin/roles`);
}

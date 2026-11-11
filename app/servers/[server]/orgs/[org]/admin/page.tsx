import { redirect } from "next/navigation";

/**
 * This tree has no index of its own -- land on the role grants list, its
 * natural default. Also what makes the Breadcrumbs "admin" crumb (a real
 * link, not structural text) resolve to something instead of a 404.
 */
export default async function OrgAdminIndexPage({
  params,
}: {
  params: Promise<{ server: string; org: string }>;
}) {
  const { server, org } = await params;
  redirect(`/servers/${server}/orgs/${org}/admin/roles`);
}

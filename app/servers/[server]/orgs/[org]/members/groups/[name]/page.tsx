import { currentAccountId } from "@/lib/guard";
import { requireOrgAccess } from "@/lib/admin/access";
import { members } from "@/lib/cinc/members";
import { safeGet, explainRead } from "@/lib/cinc/safe-get";
import { ObjectEditor } from "@/components/object-editor";
import { GroupDetails } from "@/components/details/group-details";
import { saveGroup, deleteGroup } from "../../actions";

export default async function GroupDetail({
  params,
}: {
  params: Promise<{ server: string; org: string; name: string }>;
}) {
  const { server, org, name: raw } = await params;
  const name = decodeURIComponent(raw);
  const accountId = await currentAccountId();
  const base = `/servers/${server}/orgs/${org}/members`;
  const res = await safeGet(async () => {
    const ctx = await requireOrgAccess(accountId, server, org);
    return members.getGroup(ctx, name);
  });
  if ("error" in res) {
    return <p className="text-sm text-danger">{explainRead(res.error)}</p>;
  }
  return (
    <ObjectEditor
      name={name}
      initialJson={JSON.stringify(res.data, null, 2)}
      details={
        <GroupDetails
          data={res.data}
          onSaveMembers={saveGroup.bind(null, server, org, name)}
        />
      }
      backHref={base}
      onSave={saveGroup.bind(null, server, org, name)}
      onDelete={deleteGroup.bind(null, server, org, name)}
    />
  );
}

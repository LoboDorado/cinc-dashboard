import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess } from "@/lib/admin/access";
import { policies } from "@/lib/cinc/readonly";
import { parsePolicyRevisions } from "@/lib/cinc/policies";
import { safeGet, explainRead } from "@/lib/cinc/safe-get";
import { ObjectEditor } from "@/components/object-editor";
import { PolicyRevisions } from "@/components/details/policy-revisions";
import { DetailSection } from "@/components/details/primitives";
import { AttributeTree } from "@/components/details/attribute-tree";
import { deletePolicyAction, deletePolicyRevisionAction } from "../actions";

export default async function PolicyDetail({
  params,
}: {
  params: Promise<{ server: string; org: string; name: string }>;
}) {
  const { server, org, name: raw } = await params;
  const name = decodeURIComponent(raw);
  const accountId = await currentAccountId();
  const res = await safeGet(async () => {
    const ctx = await requireObjectAccess(accountId, server, org, "policies", "read");
    return policies.get(ctx, name);
  });
  if ("error" in res) {
    return <p className="text-sm text-danger">{explainRead(res.error)}</p>;
  }
  const revisions = parsePolicyRevisions(res.data);
  const base = `/servers/${server}/orgs/${org}/policies`;
  return (
    <ObjectEditor
      name={name}
      initialJson={JSON.stringify(res.data, null, 2)}
      details={
        <div className="space-y-4">
          <PolicyRevisions
            listHref={base}
            name={name}
            revisions={revisions}
            onDeleteRevision={deletePolicyRevisionAction.bind(null, server, org, name)}
            onDeletePolicy={deletePolicyAction.bind(null, server, org, name)}
          />
          <DetailSection title="Details">
            <AttributeTree data={res.data} defaultOpen={false} />
          </DetailSection>
        </div>
      }
      backHref={base}
      readOnly={true}
    />
  );
}

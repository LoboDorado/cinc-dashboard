import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess } from "@/lib/admin/access";
import { cookbooks } from "@/lib/cinc/readonly";
import { parseCookbookVersions } from "@/lib/cinc/cookbooks";
import { safeGet, explainRead } from "@/lib/cinc/safe-get";
import { ObjectEditor } from "@/components/object-editor";
import { CookbookVersions } from "@/components/details/cookbook-versions";
import { DetailSection } from "@/components/details/primitives";
import { AttributeTree } from "@/components/details/attribute-tree";
import { deleteCookbookAction, deleteCookbookVersionAction } from "../actions";

export default async function CookbookDetail({
  params,
}: {
  params: Promise<{ server: string; org: string; name: string }>;
}) {
  const { server, org, name: raw } = await params;
  const name = decodeURIComponent(raw);
  const accountId = await currentAccountId();
  const res = await safeGet(async () => {
    const ctx = await requireObjectAccess(accountId, server, org, "cookbooks", "read");
    return cookbooks.get(ctx, name);
  });
  if ("error" in res) {
    return <p className="text-sm text-danger">{explainRead(res.error)}</p>;
  }
  const versions = parseCookbookVersions(res.data);
  const base = `/servers/${server}/orgs/${org}/cookbooks`;
  return (
    <ObjectEditor
      name={name}
      initialJson={JSON.stringify(res.data, null, 2)}
      details={
        <div className="space-y-4">
          <CookbookVersions
            listHref={base}
            name={name}
            versions={versions}
            onDeleteVersion={deleteCookbookVersionAction.bind(null, server, org, name)}
            onDeleteCookbook={deleteCookbookAction.bind(null, server, org, name)}
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

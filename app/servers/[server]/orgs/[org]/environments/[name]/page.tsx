import { currentAccountId } from "@/lib/guard";
import { requireObjectAccess } from "@/lib/admin/access";
import { makeResource } from "@/lib/cinc/resource";
import { safeGet, explainRead } from "@/lib/cinc/safe-get";
import { ObjectEditor } from "@/components/object-editor";
import { EnvironmentDetails } from "@/components/details/environment-details";
import {
  saveEnvironment,
  deleteEnvironment,
  createEnvironment,
} from "../actions";

const environments = makeResource("environments");

export default async function EnvironmentDetail({
  params,
}: {
  params: Promise<{ server: string; org: string; name: string }>;
}) {
  const { server, org, name: raw } = await params;
  const name = decodeURIComponent(raw);
  const accountId = await currentAccountId();
  const base = `/servers/${server}/orgs/${org}/environments`;
  const res = await safeGet(async () => {
    const ctx = await requireObjectAccess(accountId, server, org, "environments", "read");
    return environments.get(ctx, name);
  });
  if ("error" in res) {
    return <p className="text-sm text-danger">{explainRead(res.error)}</p>;
  }
  if (name === "_default") {
    return (
      <ObjectEditor
        name={name}
        initialJson={JSON.stringify(res.data, null, 2)}
        details={<EnvironmentDetails data={res.data} />}
        backHref={base}
        onDuplicate={createEnvironment.bind(null, server, org)}
        nameKind="environment"
        readOnly={true}
      />
    );
  }
  return (
    <ObjectEditor
      name={name}
      initialJson={JSON.stringify(res.data, null, 2)}
      details={
        <EnvironmentDetails
          data={res.data}
          onSaveOverview={saveEnvironment.bind(null, server, org, name)}
          onSaveConstraints={saveEnvironment.bind(null, server, org, name)}
        />
      }
      backHref={base}
      onSave={saveEnvironment.bind(null, server, org, name)}
      onDelete={deleteEnvironment.bind(null, server, org, name)}
      onDuplicate={createEnvironment.bind(null, server, org)}
      nameKind="environment"
    />
  );
}

"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/cinc/action";
import { OBJECT_TYPES, type GrantScope, type ObjectType, type Role } from "@/lib/admin/policy";

export const ROLE_LABELS: Record<Role, string> = {
  platform_admin: "Platform Admin",
  platform_read_only: "Platform Read-Only",
  server_admin: "Server Admin",
  server_object_manager: "Server Object Manager",
  server_viewer: "Server Viewer",
  org_admin: "Org Admin",
  org_object_manager: "Org Object Manager",
  org_viewer: "Org Viewer",
};

const OBJECT_TYPE_LABELS: Record<ObjectType, string> = {
  nodes: "Nodes",
  cookbooks: "Cookbooks",
  cookbook_artifacts: "Cookbook Artifacts",
  roles: "Roles",
  environments: "Environments",
  data_bags: "Data Bags",
  clients: "Clients",
  policies: "Policies",
  policy_groups: "Policy Groups",
};

type ScopeKind = GrantScope["kind"];

function explain(error: string): string {
  if (error === "forbidden") {
    return "You're not allowed to grant that role at that scope.";
  }
  return error;
}

function isObjectManagerRole(role: Role | ""): boolean {
  return role === "server_object_manager" || role === "org_object_manager";
}

/**
 * Grant a role to an account at a scope the caller picks (platform, a
 * specific server, or an org on a server) -- or, when a surface's own scope
 * is already fixed (the future server/org-scoped delegated admin pages),
 * pass a single-entry `scopeKinds` and this collapses to just a role (plus
 * object types) picker.
 */
export function RoleGrantForm({
  allServers,
  rolesForScope,
  scopeKinds = ["platform", "server", "org"],
  fixedServerId,
  onListOrgs,
  onSubmit,
  cancelHref,
}: {
  allServers: { id: string; name: string }[];
  rolesForScope: Record<ScopeKind, Role[]>;
  scopeKinds?: ScopeKind[];
  /** When set, the server picker is hidden and every server/org scope uses this id. */
  fixedServerId?: string;
  onListOrgs: (serverId: string) => Promise<string[]>;
  onSubmit: (input: { role: Role; scope: GrantScope; objectTypes: ObjectType[] }) => Promise<ActionResult>;
  cancelHref: string;
}) {
  const router = useRouter();
  const [scopeKind, setScopeKind] = useState<ScopeKind>(scopeKinds[0]);
  const [serverId, setServerId] = useState(fixedServerId ?? allServers[0]?.id ?? "");
  const [org, setOrg] = useState("");
  const [orgOptions, setOrgOptions] = useState<string[]>([]);
  const [role, setRole] = useState<Role | "">("");
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const datalistId = useId();
  const roleOptions = rolesForScope[scopeKind] ?? [];

  function changeScopeKind(kind: ScopeKind) {
    setScopeKind(kind);
    setRole("");
    setObjectTypes([]);
    setOrgOptions([]);
  }

  function changeRole(value: string) {
    const nextRole = value as Role | "";
    setRole(nextRole);
    if (!isObjectManagerRole(nextRole)) setObjectTypes([]);
  }

  function toggleObjectType(type: ObjectType, checked: boolean) {
    setObjectTypes((types) => (checked ? [...types, type] : types.filter((t) => t !== type)));
  }

  useEffect(() => {
    if (scopeKind !== "org" || !serverId) return;
    let cancelled = false;
    onListOrgs(serverId).then((orgs) => {
      if (!cancelled) setOrgOptions(orgs);
    });
    return () => {
      cancelled = true;
    };
  }, [scopeKind, serverId, onListOrgs]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!role) return;
    setError(null);

    const scope: GrantScope =
      scopeKind === "platform"
        ? { kind: "platform" }
        : scopeKind === "server"
          ? { kind: "server", serverId }
          : { kind: "org", serverId, org };

    startTransition(async () => {
      const res = await onSubmit({
        role,
        scope,
        objectTypes: isObjectManagerRole(role) ? objectTypes : [],
      });
      if ("ok" in res) {
        router.push(cancelHref);
        router.refresh();
      } else {
        setError(explain(res.error));
      }
    });
  }

  const needsServer = scopeKind !== "platform" && !fixedServerId;
  const needsOrg = scopeKind === "org";
  const canSubmit = role !== "" && (!needsServer || serverId !== "") && (!needsOrg || org.trim() !== "");

  return (
    <Card>
      <form onSubmit={submit} className="max-w-xl space-y-4">
        {scopeKinds.length > 1 && (
          <fieldset className="space-y-2">
            <legend className="text-sm text-muted">Scope</legend>
            <div className="space-y-1.5">
              {scopeKinds.map((kind) => (
                <div key={kind} className="flex items-center gap-2">
                  <input
                    id={`scope-${kind}`}
                    type="radio"
                    name="scope-kind"
                    checked={scopeKind === kind}
                    onChange={() => changeScopeKind(kind)}
                    className="h-4 w-4 border-border"
                  />
                  <label htmlFor={`scope-${kind}`} className="text-sm text-text">
                    {kind === "platform" && "Platform-wide"}
                    {kind === "server" && "A specific server (all its orgs)"}
                    {kind === "org" && "One org on a server"}
                  </label>
                </div>
              ))}
            </div>
          </fieldset>
        )}

        {needsServer && (
          <div className="space-y-1">
            <label htmlFor="grant-server" className="block text-sm text-muted">
              Server
            </label>
            <select
              id="grant-server"
              value={serverId}
              onChange={(e) => {
                setServerId(e.target.value);
                setOrg("");
                setOrgOptions([]);
              }}
              required
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="" disabled>
                Choose a server…
              </option>
              {allServers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {needsOrg && (
          <div className="space-y-1">
            <label htmlFor="grant-org" className="block text-sm text-muted">
              Org
            </label>
            <Input
              id="grant-org"
              list={datalistId}
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              required
              aria-describedby="grant-org-help"
            />
            <datalist id={datalistId}>
              {orgOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <p id="grant-org-help" className="text-xs text-muted">
              Type the org&apos;s name as it exists on that server.
            </p>
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="grant-role" className="block text-sm text-muted">
            Role
          </label>
          <select
            id="grant-role"
            value={role}
            onChange={(e) => changeRole(e.target.value)}
            required
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="" disabled>
              Choose a role…
            </option>
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          {roleOptions.length === 0 && (
            <p className="text-xs text-muted">You aren&apos;t allowed to grant any role at this scope.</p>
          )}
        </div>

        {isObjectManagerRole(role) && (
          <fieldset className="space-y-2">
            <legend className="text-sm text-muted">Cinc object types</legend>
            <p className="text-xs text-muted">
              Grants write access (read is always included) to these object kinds. Groups and
              Sandboxes aren&apos;t delegable this way -- see the docs.
            </p>
            <div className="space-y-1.5">
              {OBJECT_TYPES.map((type) => (
                <div key={type} className="flex items-center gap-2">
                  <input
                    id={`grant-object-type-${type}`}
                    type="checkbox"
                    checked={objectTypes.includes(type)}
                    onChange={(e) => toggleObjectType(type, e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <label htmlFor={`grant-object-type-${type}`} className="text-sm text-text">
                    {OBJECT_TYPE_LABELS[type]}
                  </label>
                </div>
              ))}
            </div>
          </fieldset>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pending || !canSubmit}>
            {pending ? "Granting…" : "Grant role"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push(cancelHref)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

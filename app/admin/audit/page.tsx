import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button, buttonClass } from "@/components/ui/button";
import { AuditOutcome } from "@/components/admin/audit-outcome";
import { listAuditEntries } from "@/lib/admin/audit";

function buildQuery(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) sp.set(key, value);
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; from?: string; to?: string; cursor?: string }>;
}) {
  const { account, from, to, cursor } = await searchParams;
  const { entries, nextCursor } = await listAuditEntries(
    { kind: "platform" },
    { account, from, to },
    cursor,
  );
  const hasFilters = Boolean(account || from || to);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit log"
        description="Every dashboard-mediated action, role grant, and collector linkage change, platform-wide."
      />

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="audit-account" className="block text-sm text-muted">
              Account
            </label>
            <Input id="audit-account" name="account" defaultValue={account} placeholder="username" />
          </div>
          <div className="space-y-1">
            <label htmlFor="audit-from" className="block text-sm text-muted">
              From
            </label>
            <Input id="audit-from" name="from" type="datetime-local" defaultValue={from} />
          </div>
          <div className="space-y-1">
            <label htmlFor="audit-to" className="block text-sm text-muted">
              To
            </label>
            <Input id="audit-to" name="to" type="datetime-local" defaultValue={to} />
          </div>
          <Button type="submit">Filter</Button>
          {hasFilters && (
            <Link href="/admin/audit" className={buttonClass("secondary")}>
              Clear
            </Link>
          )}
        </form>
      </Card>

      {entries.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No audit entries match these filters.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Audit log entries</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th scope="col" className="px-4 py-2 font-medium">When</th>
                <th scope="col" className="px-4 py-2 font-medium">Account</th>
                <th scope="col" className="px-4 py-2 font-medium">Server</th>
                <th scope="col" className="px-4 py-2 font-medium">Org</th>
                <th scope="col" className="px-4 py-2 font-medium">Action</th>
                <th scope="col" className="px-4 py-2 font-medium">Resource</th>
                <th scope="col" className="px-4 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 text-muted">
                    {new Date(e.at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 font-medium text-text">{e.actorUsername}</td>
                  <td className="px-4 py-2 text-muted">{e.serverName ?? "—"}</td>
                  <td className="px-4 py-2 text-muted">{e.org ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">{e.action}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">{e.resourcePath ?? "—"}</td>
                  <td className="px-4 py-2">
                    <AuditOutcome outcome={e.outcome} statusCode={e.statusCode} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor && (
        <div className="flex justify-center">
          <Link
            href={`/admin/audit${buildQuery({ account, from, to, cursor: nextCursor })}`}
            className={buttonClass("secondary")}
          >
            Load more
          </Link>
        </div>
      )}
    </div>
  );
}

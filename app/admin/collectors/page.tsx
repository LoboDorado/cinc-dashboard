import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listRegisteredCollectors } from "@/lib/admin/collectors";
import { listRegisteredServers } from "@/lib/admin/servers";

export default async function AdminCollectorsPage() {
  const [collectors, servers] = await Promise.all([
    listRegisteredCollectors(),
    listRegisteredServers(),
  ]);
  const serverName = (id: string) => servers.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Collectors"
        description="Registered Cinc Collectors and which servers they cover."
        actions={
          <Link href="/admin/collectors/new" className={buttonClass()}>
            New collector
          </Link>
        }
      />

      {collectors.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No collectors registered yet.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Registered collectors</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th scope="col" className="px-4 py-2 font-medium">Name</th>
                <th scope="col" className="px-4 py-2 font-medium">Base URL</th>
                <th scope="col" className="px-4 py-2 font-medium">Covers</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {collectors.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium text-text">{c.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">{c.baseUrl}</td>
                  <td className="px-4 py-2 text-muted">
                    {c.linkedServerIds.length === 0
                      ? "— none —"
                      : c.linkedServerIds.map(serverName).join(", ")}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end">
                      <Link href={`/admin/collectors/${c.id}`}>
                        <Button variant="secondary">Edit</Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

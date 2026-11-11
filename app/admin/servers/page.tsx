import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listRegisteredServers } from "@/lib/admin/servers";

export default async function AdminServersPage() {
  const servers = await listRegisteredServers();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Servers"
        description="Registered Cinc Servers and their shared impersonation identity."
        actions={
          <Link href="/admin/servers/new" className={buttonClass()}>
            New server
          </Link>
        }
      />

      {servers.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No servers registered yet.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Registered servers</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th scope="col" className="px-4 py-2 font-medium">Name</th>
                <th scope="col" className="px-4 py-2 font-medium">Base URL</th>
                <th scope="col" className="px-4 py-2 font-medium">Impersonates</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium text-text">{s.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">{s.baseUrl}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">{s.impersonationUsername}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end">
                      <Link href={`/admin/servers/${s.id}`}>
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

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listDashboardAccounts } from "@/lib/admin/accounts";

export default async function AdminAccountsPage() {
  const accounts = await listDashboardAccounts();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Accounts"
        description="Dashboard accounts, local or LDAP-linked. Role grants are managed per account."
        actions={
          <Link href="/admin/accounts/new" className={buttonClass()}>
            New account
          </Link>
        }
      />

      {accounts.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No accounts yet.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Dashboard accounts</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th scope="col" className="px-4 py-2 font-medium">Username</th>
                <th scope="col" className="px-4 py-2 font-medium">Display name</th>
                <th scope="col" className="px-4 py-2 font-medium">Auth source</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium text-text">{a.username}</td>
                  <td className="px-4 py-2 text-muted">{a.displayName}</td>
                  <td className="px-4 py-2 text-muted">{a.authSource === "ldap" ? "LDAP" : "Local"}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end">
                      <Link href={`/admin/accounts/${a.id}`}>
                        <Button variant="secondary">Manage</Button>
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

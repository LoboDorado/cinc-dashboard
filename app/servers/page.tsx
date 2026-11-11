import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { currentAccount } from "@/lib/guard";
import { listReachableServers } from "@/lib/admin/access";
import { Card } from "@/components/ui/card";
import { UserMenu } from "@/components/user-menu";
import { SiteFooter } from "@/components/site-footer";
import { APP_VERSION } from "@/lib/version";

export default async function ServersPage() {
  const account = await currentAccount();
  const servers = await listReachableServers(account.id);

  // With a single server there's nothing to pick — go straight to its orgs.
  if (servers.length === 1) {
    redirect(`/servers/${servers[0].id}/orgs`);
  }

  return (
    <div className="flex min-h-screen flex-col">
    <main className="flex-1">
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Image
            src="/cinc/logo-icon.png"
            alt="Cinc"
            width={22}
            height={22}
            priority
            unoptimized
          />
          <span className="text-text">dashboard</span>
        </div>
        <UserMenu name={account.displayName} />
      </header>

      <div className="mx-auto max-w-3xl p-6">
        <h2 className="mb-4 text-sm uppercase tracking-wide text-muted">
          Cinc Servers
        </h2>

        {servers.length === 0 ? (
          <p className="text-muted">
            You don&apos;t have access to any registered Cinc Servers yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {servers.map((s) => (
              <Link key={s.id} href={`/servers/${s.id}/orgs`}>
                <Card className="transition-colors hover:border-primary">
                  <div className="font-medium">{s.name}</div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
    <SiteFooter version={APP_VERSION} />
    </div>
  );
}

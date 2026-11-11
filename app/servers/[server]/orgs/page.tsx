import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { currentAccount } from "@/lib/guard";
import { requireScopeAccess, listReachableOrgs } from "@/lib/admin/access";
import { Card } from "@/components/ui/card";
import { UserMenu } from "@/components/user-menu";
import { SiteFooter } from "@/components/site-footer";
import { APP_VERSION } from "@/lib/version";

export default async function ServerOrgsPage({
  params,
}: {
  params: Promise<{ server: string }>;
}) {
  const account = await currentAccount();
  const { server } = await params;

  if (!(await requireScopeAccess(account.id, server))) {
    notFound();
  }

  const orgs = await listReachableOrgs(account.id, server);

  // With a single org there's nothing to pick — go straight in.
  if (orgs.length === 1) {
    redirect(`/servers/${server}/orgs/${orgs[0].name}`);
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
          Organizations
        </h2>

        {orgs.length === 0 ? (
          <p className="text-muted">
            You don&apos;t belong to any organizations on this server.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {orgs.map((o) => (
              <Link key={o.name} href={`/servers/${server}/orgs/${o.name}`}>
                <Card className="transition-colors hover:border-primary">
                  <div className="font-medium">{o.full_name ?? o.name}</div>
                  <div className="text-sm text-muted">{o.name}</div>
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

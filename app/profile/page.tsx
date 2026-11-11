import Link from "next/link";
import Image from "next/image";
import { currentAccount } from "@/lib/guard";
import { UserMenu } from "@/components/user-menu";
import { SiteFooter } from "@/components/site-footer";
import { APP_VERSION } from "@/lib/version";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const account = await currentAccount();

  return (
    <div className="flex min-h-screen flex-col">
    <main className="flex-1">
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <Link
          href="/servers"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <Image
            src="/cinc/logo-icon.png"
            alt="Cinc"
            width={22}
            height={22}
            priority
            unoptimized
          />
          <span className="text-text">dashboard</span>
        </Link>
        <UserMenu name={account.displayName} />
      </header>

      <div className="mx-auto max-w-xl p-6">
        <h1 className="mb-1 text-xl font-semibold tracking-tight">
          Your profile
        </h1>
        <p className="mb-6 font-mono text-sm text-muted">{account.username}</p>
        <ProfileForm initial={account} />
      </div>
    </main>
    <SiteFooter version={APP_VERSION} />
    </div>
  );
}

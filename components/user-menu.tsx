"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function UserMenu({
  name,
  isPlatformMember = false,
}: {
  name: string;
  /** Shown only when the account actually has a platform_admin/platform_read_only
   *  grant -- a per-request DB check (lib/admin/access.ts), never a client-side guess. */
  isPlatformMember?: boolean;
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      {isPlatformMember && (
        <Link href="/admin" className="text-sm text-muted hover:text-link">
          Admin
        </Link>
      )}
      <Link
        href="/profile"
        title="Your profile"
        className="text-sm text-muted hover:text-link"
      >
        {name}
      </Link>
      <Button variant="ghost" onClick={logout} className="text-sm">
        Sign out
      </Button>
    </div>
  );
}

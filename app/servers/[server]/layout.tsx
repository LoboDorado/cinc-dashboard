import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { currentAccountId } from "@/lib/guard";
import { requireScopeAccess } from "@/lib/admin/access";

/**
 * Gates every route under one registered server to accounts with at least
 * one grant on it -- a bogus or unreachable server id 404s here, before any
 * child page (including the org picker, which has no org segment yet to
 * check against) renders.
 */
export default async function ServerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ server: string }>;
}) {
  const accountId = await currentAccountId();
  const { server } = await params;
  if (!(await requireScopeAccess(accountId, server))) {
    notFound();
  }
  return children;
}

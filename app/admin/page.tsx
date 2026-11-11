import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";

const SECTIONS = [
  {
    href: "/admin/servers",
    title: "Servers",
    description: "Register Cinc Servers and their shared impersonation identity.",
  },
  {
    href: "/admin/collectors",
    title: "Collectors",
    description: "Register Cinc Collectors and which servers they cover.",
  },
  {
    href: "/admin/accounts",
    title: "Accounts",
    description: "Create dashboard accounts and grant platform-wide roles.",
  },
  {
    href: "/admin/audit",
    title: "Audit Log",
    description: "Every dashboard-mediated action and role grant, platform-wide.",
  },
];

export default function AdminHome() {
  return (
    <div className="space-y-6">
      <PageHeader title="Platform admin" description="Manage registered servers, collectors, accounts, and role grants." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full transition-colors hover:border-primary">
              <div className="font-medium">{s.title}</div>
              <div className="mt-1 text-sm text-muted">{s.description}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

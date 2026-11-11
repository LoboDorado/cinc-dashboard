import { PageHeader } from "@/components/ui/page-header";
import { AccountForm } from "@/components/admin/account-form";
import { createLocalAccountAction, createLdapAccountAction } from "../actions";

export default function NewAccountPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="New account" />
      <AccountForm onCreateLocal={createLocalAccountAction} onCreateLdap={createLdapAccountAction} />
    </div>
  );
}

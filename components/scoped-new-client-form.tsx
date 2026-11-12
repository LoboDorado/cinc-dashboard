"use client";

import { useState } from "react";
import { NewClientForm } from "@/components/new-client-form";
import { ScopePicker, type ScopeOption } from "@/components/scope-picker";
import { listPath } from "@/lib/urls";
import type { CreateClientResult } from "@/app/servers/[server]/orgs/[org]/clients/actions";

/**
 * Wraps {@link NewClientForm} for the aggregated, scope-free "New client" page
 * (`app/(browse)/clients/new`), which has no ambient server/org to create in.
 * A thin sibling of `ScopedCreateForm`/`ScopedNewObjectForm` rather than a
 * generalization of either: `createClientAction` returns a one-time private
 * key (`CreateClientResult`), not the generic `ActionResult` those two expect,
 * so the action signature and success handling genuinely differ. Same
 * auto-skip behavior: with exactly one reachable scope the picker never
 * renders and the form appears immediately.
 */
export function ScopedNewClientForm({
  options,
  action,
}: {
  options: ScopeOption[];
  action: (serverId: string, org: string, name: string) => Promise<CreateClientResult>;
}) {
  const [choice, setChoice] = useState<ScopeOption | null>(options.length === 1 ? options[0] : null);

  if (options.length === 0) {
    return (
      <p className="text-sm text-danger">
        You don&apos;t have permission to create a client anywhere.
      </p>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      {options.length > 1 && <ScopePicker options={options} value={choice} onChange={setChoice} />}
      {choice && (
        <NewClientForm
          listHref={listPath("clients")}
          onCreate={action.bind(null, choice.serverId, choice.org)}
        />
      )}
    </div>
  );
}

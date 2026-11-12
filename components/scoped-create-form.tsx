"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreateObjectForm, type Kind } from "@/components/create-object-form";
import { ScopePicker, type ScopeOption } from "@/components/scope-picker";
import { objectPath, listPath } from "@/lib/urls";
import type { ActionResult } from "@/lib/cinc/action";

/**
 * Wraps {@link CreateObjectForm} for an aggregated, scope-free "New ..." page
 * (`app/(browse)/<kind>/new`), which has no ambient server/org to create in.
 * Mirrors today's single-scope auto-skip: with exactly one reachable scope
 * the picker never renders and the form appears immediately.
 */
export function ScopedCreateForm({
  kind,
  listKind,
  options,
  action,
}: {
  kind: Kind;
  /** The object type's URL slug, e.g. "roles" -- not always `${kind}s` (kept explicit rather than pluralized). */
  listKind: string;
  options: ScopeOption[];
  action: (serverId: string, org: string, name: string, json: string) => Promise<ActionResult>;
}) {
  const [choice, setChoice] = useState<ScopeOption | null>(options.length === 1 ? options[0] : null);
  const router = useRouter();

  if (options.length === 0) {
    return (
      <p className="text-sm text-danger">
        You don&apos;t have permission to create a {kind} anywhere.
      </p>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      {options.length > 1 && <ScopePicker options={options} value={choice} onChange={setChoice} />}
      {choice && (
        <CreateObjectForm
          kind={kind}
          backHref={listPath(listKind)}
          onCreate={action.bind(null, choice.serverId, choice.org)}
          onCreated={(name) => router.push(objectPath(choice.serverId, choice.org, listKind, name))}
        />
      )}
    </div>
  );
}

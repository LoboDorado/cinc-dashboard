"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NewObjectForm } from "@/components/new-object-form";
import { ScopePicker, type ScopeOption } from "@/components/scope-picker";
import { objectPath, listPath } from "@/lib/urls";
import type { ActionResult } from "@/lib/cinc/action";
import type { NameKind } from "@/lib/cinc/names";

/**
 * Wraps {@link NewObjectForm} for an aggregated, scope-free "New ..." page
 * (`app/(browse)/<kind>/new`), which has no ambient server/org to create in.
 * Sibling of {@link ScopedCreateForm} (components/scoped-create-form.tsx) for
 * kinds that use the generic skeleton-less form instead of the rich,
 * kind-specific one — same auto-skip behavior: with exactly one reachable
 * scope the picker never renders and the form appears immediately.
 */
export function ScopedNewObjectForm({
  title,
  kindLabel,
  listKind,
  initialJson,
  nameKind,
  options,
  action,
}: {
  title: string;
  /** Used only in the "nowhere to create this" message, e.g. "node". */
  kindLabel: string;
  /** The object type's URL slug, e.g. "nodes". */
  listKind: string;
  initialJson: string;
  nameKind?: NameKind;
  options: ScopeOption[];
  action: (serverId: string, org: string, name: string, json: string) => Promise<ActionResult>;
}) {
  const [choice, setChoice] = useState<ScopeOption | null>(options.length === 1 ? options[0] : null);
  const router = useRouter();

  if (options.length === 0) {
    return (
      <p className="text-sm text-danger">
        You don&apos;t have permission to create a {kindLabel} anywhere.
      </p>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      {options.length > 1 && <ScopePicker options={options} value={choice} onChange={setChoice} />}
      {choice && (
        <NewObjectForm
          title={title}
          backHref={listPath(listKind)}
          initialJson={initialJson}
          nameKind={nameKind}
          onCreate={action.bind(null, choice.serverId, choice.org)}
          onCreated={(name) => router.push(objectPath(choice.serverId, choice.org, listKind, name))}
        />
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NewBagForm } from "@/components/new-bag-form";
import { ScopePicker, type ScopeOption } from "@/components/scope-picker";
import { objectPath, listPath } from "@/lib/urls";
import type { ActionResult } from "@/lib/cinc/action";

/**
 * Wraps {@link NewBagForm} for the aggregated, scope-free "New data bag" page
 * (`app/(browse)/data_bags/new`), which has no ambient server/org to create
 * in. Same auto-skip behavior as the other Scoped*Form siblings: with exactly
 * one reachable scope the picker never renders and the form appears
 * immediately.
 */
export function ScopedNewBagForm({
  options,
  action,
}: {
  options: ScopeOption[];
  action: (serverId: string, org: string, name: string) => Promise<ActionResult>;
}) {
  const [choice, setChoice] = useState<ScopeOption | null>(options.length === 1 ? options[0] : null);
  const router = useRouter();

  if (options.length === 0) {
    return (
      <p className="text-sm text-danger">
        You don&apos;t have permission to create a data bag anywhere.
      </p>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      {options.length > 1 && <ScopePicker options={options} value={choice} onChange={setChoice} />}
      {choice && (
        <NewBagForm
          backHref={listPath("data_bags")}
          onCreate={action.bind(null, choice.serverId, choice.org)}
          onCreated={(name) => router.push(objectPath(choice.serverId, choice.org, "data_bags", name))}
        />
      )}
    </div>
  );
}

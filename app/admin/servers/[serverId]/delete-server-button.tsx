"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ActionResult } from "@/lib/cinc/action";

function explain(error: string): string {
  if (error === "forbidden") return "You don't have permission to delete this.";
  return error;
}

/**
 * Deregisters a server. Everything scoped to it -- role grants, collector
 * links -- goes with it (ON DELETE CASCADE); audit log entries keep their
 * denormalized server_name snapshot instead.
 */
export function DeleteServerButton({
  onDelete,
}: {
  onDelete: () => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setConfirming(false);
    setError(null);
    startTransition(async () => {
      const res = await onDelete();
      if ("ok" in res) {
        router.push("/admin/servers");
        router.refresh();
      } else {
        setError(explain(res.error));
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {error && (
        <span role="alert" className="text-sm text-danger">
          {error}
        </span>
      )}
      <Button variant="danger" onClick={() => setConfirming(true)} disabled={pending}>
        {pending ? "Removing…" : "Remove server"}
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Remove this server?"
        confirmLabel="Remove server"
        confirmVariant="danger"
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      >
        This deregisters the server and removes every role grant scoped to it
        (server-level and org-level). It does not change anything on the
        actual Cinc Server itself. This cannot be undone.
      </ConfirmDialog>
    </div>
  );
}

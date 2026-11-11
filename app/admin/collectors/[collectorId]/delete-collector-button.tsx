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

export function DeleteCollectorButton({ onDelete }: { onDelete: () => Promise<ActionResult> }) {
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
        router.push("/admin/collectors");
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
        {pending ? "Removing…" : "Remove collector"}
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Remove this collector?"
        confirmLabel="Remove collector"
        confirmVariant="danger"
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      >
        This deregisters the collector and its server links. It does not
        change anything on the actual Cinc Collector itself. This cannot be
        undone.
      </ConfirmDialog>
    </div>
  );
}

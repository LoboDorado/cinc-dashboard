"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ActionResult } from "@/lib/cinc/action";

function explain(error: string): string {
  if (error === "forbidden") return "You don't have permission to revoke this.";
  return error;
}

export function RevokeGrantButton({ onRevoke }: { onRevoke: () => Promise<ActionResult> }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function revoke() {
    setConfirming(false);
    setError(null);
    startTransition(async () => {
      const res = await onRevoke();
      if ("ok" in res) {
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
        {pending ? "Revoking…" : "Revoke"}
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Revoke this role grant?"
        confirmLabel="Revoke"
        confirmVariant="danger"
        onConfirm={revoke}
        onCancel={() => setConfirming(false)}
      >
        This account immediately loses the access this grant provided. This cannot be undone.
      </ConfirmDialog>
    </div>
  );
}

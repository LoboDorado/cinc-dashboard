"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ActionResult } from "@/lib/cinc/action";
import type { RegisteredServerSummary } from "@/lib/admin/servers";

function explain(error: string): string {
  if (error === "forbidden") return "You don't have permission to do this.";
  return error;
}

export type ServerFormValues = {
  name: string;
  baseUrl: string;
  caCert: string;
  webuiKey: string;
  impersonationUsername: string;
  tlsNoVerify: boolean;
};

/**
 * Create or edit a registered Cinc Server. The webui key is write-only: an
 * existing server shows no value for it, and leaving it blank on save keeps
 * the stored key unchanged (lib/admin/servers.ts's updateRegisteredServer).
 */
export function ServerForm({
  initial,
  onSubmit,
  submitLabel,
}: {
  initial?: RegisteredServerSummary;
  onSubmit: (values: ServerFormValues) => Promise<ActionResult>;
  submitLabel: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ServerFormValues>({
    name: initial?.name ?? "",
    baseUrl: initial?.baseUrl ?? "",
    caCert: "",
    webuiKey: "",
    impersonationUsername: initial?.impersonationUsername ?? "",
    tlsNoVerify: initial?.tlsNoVerify ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof ServerFormValues>(key: K, value: ServerFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await onSubmit(values);
      if ("ok" in res) {
        router.push("/admin/servers");
        router.refresh();
      } else {
        setError(explain(res.error));
      }
    });
  }

  const isNew = !initial;

  return (
    <Card>
      <form onSubmit={submit} className="max-w-xl space-y-4">
        <div className="space-y-1">
          <label htmlFor="server-name" className="block text-sm text-muted">
            Name
          </label>
          <Input
            id="server-name"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="server-url" className="block text-sm text-muted">
            Base URL
          </label>
          <Input
            id="server-url"
            type="url"
            placeholder="https://chef.example.com"
            value={values.baseUrl}
            onChange={(e) => set("baseUrl", e.target.value)}
            required
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="server-impersonation" className="block text-sm text-muted">
            Shared impersonation username
          </label>
          <Input
            id="server-impersonation"
            value={values.impersonationUsername}
            onChange={(e) => set("impersonationUsername", e.target.value)}
            required
            aria-describedby="server-impersonation-help"
          />
          <p id="server-impersonation-help" className="text-xs text-muted">
            Every dashboard-mediated request to this server signs as this one
            existing Chef/Cinc username, regardless of which dashboard account
            triggered it. It must already have the real permissions this
            server should ever grant.
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="server-webui-key" className="block text-sm text-muted">
            Webui key {isNew ? "" : "(leave blank to keep the current key)"}
          </label>
          <textarea
            id="server-webui-key"
            rows={6}
            value={values.webuiKey}
            onChange={(e) => set("webuiKey", e.target.value)}
            spellCheck={false}
            required={isNew}
            className="w-full rounded-md border border-border bg-bg p-3 font-mono text-xs text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="server-ca-cert" className="block text-sm text-muted">
            CA certificate (optional, for a self-signed server)
          </label>
          <textarea
            id="server-ca-cert"
            rows={4}
            value={values.caCert}
            onChange={(e) => set("caCert", e.target.value)}
            spellCheck={false}
            placeholder={initial?.hasCaCert ? "Leave blank to keep the current CA cert" : ""}
            className="w-full rounded-md border border-border bg-bg p-3 font-mono text-xs text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="server-tls-no-verify"
            type="checkbox"
            checked={values.tlsNoVerify}
            onChange={(e) => set("tlsNoVerify", e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          <label htmlFor="server-tls-no-verify" className="text-sm text-text">
            Skip TLS verification (dev only)
          </label>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Card>
  );
}

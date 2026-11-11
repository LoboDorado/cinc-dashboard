"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ActionResult } from "@/lib/cinc/action";
import type { RegisteredCollectorSummary } from "@/lib/admin/collectors";
import type { RegisteredServerSummary } from "@/lib/admin/servers";

function explain(error: string): string {
  if (error === "forbidden") return "You don't have permission to do this.";
  return error;
}

export type CollectorFormValues = {
  name: string;
  baseUrl: string;
  caCert: string;
  bearerToken: string;
  tlsNoVerify: boolean;
  serverIds: string[];
};

/**
 * Create or edit a registered Cinc Collector, including which servers it
 * covers. Storage/linkage only -- no requests are made to a Collector yet.
 */
export function CollectorForm({
  initial,
  allServers,
  onSubmit,
  submitLabel,
}: {
  initial?: RegisteredCollectorSummary;
  allServers: RegisteredServerSummary[];
  onSubmit: (values: CollectorFormValues) => Promise<ActionResult>;
  submitLabel: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<CollectorFormValues>({
    name: initial?.name ?? "",
    baseUrl: initial?.baseUrl ?? "",
    caCert: "",
    bearerToken: "",
    tlsNoVerify: initial?.tlsNoVerify ?? false,
    serverIds: initial?.linkedServerIds ?? [],
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof CollectorFormValues>(key: K, value: CollectorFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function toggleServer(serverId: string, checked: boolean) {
    set(
      "serverIds",
      checked ? [...values.serverIds, serverId] : values.serverIds.filter((id) => id !== serverId),
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await onSubmit(values);
      if ("ok" in res) {
        router.push("/admin/collectors");
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
          <label htmlFor="collector-name" className="block text-sm text-muted">
            Name
          </label>
          <Input
            id="collector-name"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="collector-url" className="block text-sm text-muted">
            Base URL
          </label>
          <Input
            id="collector-url"
            type="url"
            placeholder="https://collector.example.com"
            value={values.baseUrl}
            onChange={(e) => set("baseUrl", e.target.value)}
            required
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="collector-token" className="block text-sm text-muted">
            Bearer token {isNew ? "" : "(leave blank to keep the current token)"}
          </label>
          <Input
            id="collector-token"
            type="password"
            value={values.bearerToken}
            onChange={(e) => set("bearerToken", e.target.value)}
            required={isNew}
            autoComplete="off"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="collector-ca-cert" className="block text-sm text-muted">
            CA certificate (optional)
          </label>
          <textarea
            id="collector-ca-cert"
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
            id="collector-tls-no-verify"
            type="checkbox"
            checked={values.tlsNoVerify}
            onChange={(e) => set("tlsNoVerify", e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          <label htmlFor="collector-tls-no-verify" className="text-sm text-text">
            Skip TLS verification (dev only)
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm text-muted">Covers these servers</legend>
          {allServers.length === 0 ? (
            <p className="text-sm text-muted">No servers are registered yet.</p>
          ) : (
            <div className="space-y-1.5">
              {allServers.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <input
                    id={`collector-server-${s.id}`}
                    type="checkbox"
                    checked={values.serverIds.includes(s.id)}
                    onChange={(e) => toggleServer(s.id, e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <label htmlFor={`collector-server-${s.id}`} className="text-sm text-text">
                    {s.name}
                  </label>
                </div>
              ))}
            </div>
          )}
        </fieldset>

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

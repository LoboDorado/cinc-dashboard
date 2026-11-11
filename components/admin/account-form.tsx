"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ActionResult } from "@/lib/cinc/action";

function explain(error: string): string {
  if (error === "forbidden") return "You don't have permission to do this.";
  return error;
}

type AuthSource = "local" | "ldap";

/** Create a new dashboard account, local (password) or LDAP-linked (DN). No role grant here -- that's a separate step on the account's own page. */
export function AccountForm({
  onCreateLocal,
  onCreateLdap,
}: {
  onCreateLocal: (username: string, password: string, displayName: string) => Promise<ActionResult>;
  onCreateLdap: (username: string, ldapDn: string, displayName: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [authSource, setAuthSource] = useState<AuthSource>("local");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [ldapDn, setLdapDn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res =
        authSource === "local"
          ? await onCreateLocal(username, password, displayName)
          : await onCreateLdap(username, ldapDn, displayName);
      if ("ok" in res) {
        router.push("/admin/accounts");
        router.refresh();
      } else {
        setError(explain(res.error));
      }
    });
  }

  return (
    <Card>
      <form onSubmit={submit} className="max-w-xl space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm text-muted">Authentication</legend>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                id="auth-source-local"
                type="radio"
                name="auth-source"
                checked={authSource === "local"}
                onChange={() => setAuthSource("local")}
                className="h-4 w-4 border-border"
              />
              <label htmlFor="auth-source-local" className="text-sm text-text">
                Local password
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="auth-source-ldap"
                type="radio"
                name="auth-source"
                checked={authSource === "ldap"}
                onChange={() => setAuthSource("ldap")}
                className="h-4 w-4 border-border"
              />
              <label htmlFor="auth-source-ldap" className="text-sm text-text">
                LDAP-linked
              </label>
            </div>
          </div>
        </fieldset>

        <div className="space-y-1">
          <label htmlFor="account-username" className="block text-sm text-muted">
            Username
          </label>
          <Input
            id="account-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="account-display-name" className="block text-sm text-muted">
            Display name (optional, defaults to username)
          </label>
          <Input
            id="account-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>

        {authSource === "local" ? (
          <div className="space-y-1">
            <label htmlFor="account-password" className="block text-sm text-muted">
              Initial password
            </label>
            <Input
              id="account-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
        ) : (
          <div className="space-y-1">
            <label htmlFor="account-ldap-dn" className="block text-sm text-muted">
              Directory DN
            </label>
            <Input
              id="account-ldap-dn"
              placeholder="uid=alice,ou=people,dc=example,dc=com"
              value={ldapDn}
              onChange={(e) => setLdapDn(e.target.value)}
              required
              aria-describedby="account-ldap-dn-help"
            />
            <p id="account-ldap-dn-help" className="text-xs text-muted">
              A successful directory bind only logs this account in if it proves this exact DN.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </Button>
      </form>
    </Card>
  );
}

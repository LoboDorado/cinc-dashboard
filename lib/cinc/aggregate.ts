// Shared "don't let one dead scope kill the page" helper for every aggregated
// (cross-server/org) view. A single-scope page can use safe-get.ts's one-shot
// {data}|{error}; an aggregated page fans a call out across many (server,org)
// pairs via Promise.all (each wrapped to catch its own error), then needs to
// split the results into what rendered and what didn't -- that's this.

export type ScopedOutcome<T> = { serverId: string; serverName: string; org: string } & (
  | { ok: true; data: T }
  | { ok: false; error: string }
);

export function partitionScoped<T>(outcomes: ScopedOutcome<T>[]): {
  succeeded: Extract<ScopedOutcome<T>, { ok: true }>[];
  failed: Extract<ScopedOutcome<T>, { ok: false }>[];
} {
  const succeeded: Extract<ScopedOutcome<T>, { ok: true }>[] = [];
  const failed: Extract<ScopedOutcome<T>, { ok: false }>[] = [];
  for (const o of outcomes) {
    if (o.ok) succeeded.push(o);
    else failed.push(o);
  }
  return { succeeded, failed };
}

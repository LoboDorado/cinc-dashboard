"use client";

import { useRouter, useParams } from "next/navigation";

export type ReachableServer = { id: string; name: string };

/**
 * Switch which registered Cinc Server the dashboard is pointed at. Renders
 * even with a single reachable server, same as OrgSwitcher with one org —
 * the "skip the picker" shortcut lives in the server/org index pages, not
 * in the switcher itself.
 */
export function ServerSwitcher({ servers }: { servers: ReachableServer[] }) {
  const router = useRouter();
  const params = useParams<{ server?: string }>();
  const current = params?.server ?? "";

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    // Client-side navigation to an internal route; the server id is one of
    // the server-provided <option> values, URL-encoded into the path.
    router.push(`/servers/${e.target.value}/orgs`); // nosemgrep: js-express-xss
  }

  return (
    <select
      aria-label="Cinc Server"
      value={current}
      onChange={onChange}
      className="max-w-[9rem] rounded-md border border-border bg-bg px-2 py-1 text-sm sm:max-w-xs text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {servers.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

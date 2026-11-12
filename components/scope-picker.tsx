"use client";

export type ScopeOption = { serverId: string; serverName: string; org: string };

function key(o: ScopeOption): string {
  return `${o.serverId}::${o.org}`;
}

/**
 * Picks one (server, org) to create an object in, shown only when an account
 * can reach more than one — mirrors ServerSwitcher/OrgSwitcher's plain,
 * native-select style, but as a single combined control since "create in"
 * needs one atomic (server, org) choice, not two independently-changing ones.
 */
export function ScopePicker({
  options,
  value,
  onChange,
}: {
  options: ScopeOption[];
  value: ScopeOption | null;
  onChange: (option: ScopeOption) => void;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor="scope-picker" className="block text-sm text-muted">
        Create in
      </label>
      <select
        id="scope-picker"
        aria-label="Server and organization to create in"
        value={value ? key(value) : ""}
        onChange={(e) => {
          const match = options.find((o) => key(o) === e.target.value);
          if (match) onChange(match);
        }}
        className="max-w-xs rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <option value="" disabled>
          Choose a server and organization…
        </option>
        {options.map((o) => (
          <option key={key(o)} value={key(o)}>
            {o.serverName} / {o.org}
          </option>
        ))}
      </select>
    </div>
  );
}

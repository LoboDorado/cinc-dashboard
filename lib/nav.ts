/**
 * The object sections, shared by the sidebar nav and the ⌘K palette.
 * `standalone` marks a section that has already moved to an aggregated,
 * scope-free list (e.g. `/roles`) — the rest still live under
 * `/servers/<server>/orgs/<org>/<slug>` until they're migrated too.
 */
export const NAV: { label: string; slug: string; standalone?: boolean }[] = [
  { label: "Nodes", slug: "nodes", standalone: true },
  { label: "Roles", slug: "roles", standalone: true },
  { label: "Environments", slug: "environments", standalone: true },
  { label: "Data Bags", slug: "data_bags", standalone: true },
  { label: "Members", slug: "members", standalone: true },
  { label: "Cookbooks", slug: "cookbooks", standalone: true },
  { label: "Policies", slug: "policies", standalone: true },
  { label: "Clients", slug: "clients", standalone: true },
  { label: "Compliance", slug: "compliance", standalone: true },
];

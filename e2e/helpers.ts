import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Dashboard accounts seeded by scripts/e2e.sh (e2e/fixtures/seed-accounts.mjs,
 * which exports the same two constants -- duplicated here rather than
 * imported, since Playwright's test loader doesn't treat a .mjs file as real
 * ESM when it's imported from a .ts file). Not Cinc Server users -- login no
 * longer touches the Cinc Server at all. ADMIN holds platform_admin; VIEWER
 * holds org_viewer on just ORG, so it can read objects there but not write
 * them.
 */
export const ADMIN = { username: "e2e-admin", password: "e2e-admin-password-1" };
export const VIEWER = { username: "e2e-viewer", password: "e2e-viewer-password-1" };

/**
 * The one registered Cinc Server's id, auto-registered from CINC_SERVER_URL
 * at boot and exported by scripts/e2e.sh once it's known. Every object-level
 * route is scoped under it: /servers/<id>/orgs/<org>/...
 */
export const SERVER = process.env.E2E_SERVER_ID;
if (!SERVER) {
  throw new Error(
    "E2E_SERVER_ID is not set -- run the suite via `make e2e` / scripts/e2e.sh, not `playwright test` directly",
  );
}

/** Seeded by e2e/fixtures/state; see scripts/e2e.sh. */
export const ORG = "acme";

/** A path under this server/org, e.g. orgPath("nodes", "seed-web01") -> /servers/<id>/orgs/acme/nodes/seed-web01. */
export function orgPath(...segments: string[]): string {
  return [`/servers/${SERVER}/orgs/${ORG}`, ...segments].join("/");
}

/** Sign in through the real form; waits until the app has left /login. */
export async function login(
  page: Page,
  user: { username: string; password: string },
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/**
 * The app's alert carrying `text`. Next.js keeps its own empty role="alert"
 * route announcer on every page, so a bare getByRole("alert") is ambiguous.
 */
export function alert(page: Page, text: string): Locator {
  return page.getByRole("alert").filter({ hasText: text });
}

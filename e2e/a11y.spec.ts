import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ADMIN, SERVER, login, orgPath } from "./helpers";

// WCAG 2.2 AA is a hard requirement (CLAUDE.md). axe can only judge rendered
// pages with real computed styles, so color-contrast is checked here rather
// than in jsdom.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Violations on the current page, each tagged with `label` so a failure across many pages says which one. */
async function violations(page: Page, label: string): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return results.violations.map(
    (v) => `${label}: ${v.id} (${v.impact}) -> ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
}

// The dashboard ships a single (dark) theme, so one pass covers it.
test("login page has no WCAG AA violations", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(await violations(page, "/login")).toEqual([]);
});

test("the aggregated nodes list has no WCAG AA violations", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/nodes");
  await expect(page.getByRole("link", { name: "seed-web01" })).toBeVisible();
  expect(await violations(page, "/nodes")).toEqual([]);
});

test("the aggregated Fleet dashboard has no WCAG AA violations", async ({ page }) => {
  await login(page, ADMIN);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "seed-web01" })).toBeVisible();
  expect(await violations(page, "/")).toEqual([]);
});

test("the fleet Compliance page has no WCAG AA violations", async ({ page }) => {
  // No collector is registered against the e2e fixture, so this exercises
  // the real degrade path -- the same CTA state the per-node Compliance tab
  // already lives under with no bespoke e2e coverage beyond this sweep.
  await login(page, ADMIN);
  await page.goto("/compliance");
  await expect(page.getByRole("link", { name: "Register a collector" })).toBeVisible();
  expect(await violations(page, "/compliance")).toEqual([]);
});

test("the create-form scope picker has no WCAG AA violations", async ({ page }) => {
  // e2e-admin reaches more than one org, so this is the only fixture path
  // that renders the ScopePicker's <select> -- the single-scope auto-skip
  // path never shows it.
  await login(page, ADMIN);
  await page.goto("/roles/new");
  await expect(page.getByLabel("Server and organization to create in")).toBeVisible();
  expect(await violations(page, "/roles/new (picker)")).toEqual([]);

  await page
    .getByLabel("Server and organization to create in")
    .selectOption({ label: "default / acme" });
  await expect(page.getByRole("heading", { name: "New role" })).toBeVisible();
  expect(await violations(page, "/roles/new (form shown)")).toEqual([]);
});

test("platform admin pages have no WCAG AA violations", async ({ page }) => {
  await login(page, ADMIN);
  const pages = [
    "/admin",
    "/admin/servers",
    "/admin/servers/new",
    "/admin/collectors",
    "/admin/collectors/new",
    "/admin/accounts",
    "/admin/accounts/new",
    "/admin/audit",
  ];
  const problems: string[] = [];
  for (const path of pages) {
    await page.goto(path);
    problems.push(...(await violations(page, path)));
  }
  expect(problems).toEqual([]);
});

test("delegated server/org admin pages have no WCAG AA violations", async ({ page }) => {
  await login(page, ADMIN);
  const pages = [
    `/servers/${SERVER}/admin/roles`,
    `/servers/${SERVER}/admin/roles/new`,
    `/servers/${SERVER}/admin/audit`,
    orgPath("admin", "roles"),
    orgPath("admin", "roles", "new"),
    orgPath("admin", "audit"),
  ];
  const problems: string[] = [];
  for (const path of pages) {
    await page.goto(path);
    problems.push(...(await violations(page, path)));
  }
  expect(problems).toEqual([]);
});

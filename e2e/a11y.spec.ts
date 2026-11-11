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

test("nodes list has no WCAG AA violations", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto(orgPath("nodes"));
  await expect(page.getByRole("link", { name: "seed-web01" })).toBeVisible();
  expect(await violations(page, orgPath("nodes"))).toEqual([]);
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

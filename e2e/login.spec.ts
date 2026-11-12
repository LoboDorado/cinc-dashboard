import { expect, test } from "@playwright/test";
import { ADMIN, alert, login, orgPath } from "./helpers";

test("an admin signs in and lands on the aggregated dashboard", async ({ page }) => {
  await login(page, ADMIN);

  // There's no picker to skip or land on any more -- every account, no matter
  // how many servers/orgs it can reach, lands on the aggregated Fleet
  // dashboard at `/`.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Fleet" })).toBeVisible();
  // e2e-admin holds platform_admin, which reaches every org on the one
  // registered server, so acme's nodes show up in the merged view.
  await expect(page.getByRole("link", { name: "seed-web01" })).toBeVisible();

  // The session is a real cookie: a fresh navigation stays signed in. The
  // per-org dashboard is still a live secondary surface.
  await page.goto(orgPath());
  await expect(page).toHaveURL(new RegExp(`${orgPath()}$`));
});

test("a wrong password shows an alert and stays on /login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill(ADMIN.username);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(alert(page, "invalid username or password")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("signing out clears the session", async ({ page }) => {
  await login(page, ADMIN);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

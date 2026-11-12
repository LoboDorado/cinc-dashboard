import { expect, test } from "@playwright/test";
import { ADMIN, ORG, ORG2, login, orgPath, scopedPath } from "./helpers";

// e2e-admin (platform_admin) reaches both acme and beta on the one
// registered server. These tests exist to prove the aggregation actually
// merges two distinct (server, org) scopes end to end through the real
// server -- not just that the aggregated routes render -- which is the one
// thing unit/component tests (mocked Cinc Server calls) can't prove.
test("the aggregated roles list shows Server/Org columns and acme's seeded role", async ({
  page,
}) => {
  await login(page, ADMIN);
  await page.goto("/roles");

  await expect(page.getByRole("columnheader", { name: "Server" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Org" })).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: "base" });
  await expect(row).toContainText("default");
  await expect(row).toContainText(ORG);
});

test("creating a role in a non-default org through the scope picker merges it into the aggregated list", async ({
  page,
}) => {
  const name = `e2e-role-${Date.now()}`;
  await login(page, ADMIN);

  await page.goto("/roles");
  await page.getByRole("link", { name: "New" }).click();
  await page
    .getByLabel("Server and organization to create in")
    .selectOption({ label: `default / ${ORG2}` });
  await expect(page.getByRole("heading", { name: "New role" })).toBeVisible();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();

  // Created in the chosen org, not the first/default one -- the per-org
  // detail route is where it lands.
  await expect(page).toHaveURL(new RegExp(`${scopedPath(ORG2, "roles", name)}$`));
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // And it shows up in the aggregated view next to acme's pre-existing
  // "base" role, each tagged with the org it actually lives in.
  await page.goto("/roles");
  const acmeRow = page.getByRole("row").filter({ hasText: "base" });
  await expect(acmeRow).toContainText(ORG);
  const newRow = page.getByRole("row").filter({ hasText: name });
  await expect(newRow).toContainText(ORG2);

  // Clean up through the per-org detail route reached via the aggregated
  // row's link -- proves the aggregated row's href actually resolves there.
  await newRow.getByRole("link", { name }).click();
  await expect(page).toHaveURL(new RegExp(`${scopedPath(ORG2, "roles", name)}$`));
  await page.getByRole("button", { name: "Delete" }).click();
  await page
    .getByRole("dialog", { name: `Delete ${name}?` })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page).toHaveURL(/\/roles$/);
  await expect(page.getByRole("link", { name })).toHaveCount(0);
});

test("the Fleet dashboard at / merges nodes across every reachable org", async ({ page }) => {
  await login(page, ADMIN);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Fleet" })).toBeVisible();

  // acme's seeded node shows up in the merged view with no server/org picker
  // required to reach it.
  await expect(page.getByRole("link", { name: "seed-web01" })).toBeVisible();

  // The still-live per-org dashboard is reachable as a drill-in, unchanged.
  await page.goto(orgPath());
  await expect(page.getByRole("link", { name: "seed-web01" })).toBeVisible();
});

test("a client created through the aggregated form shows up in the aggregated list, tagged with its real org", async ({
  page,
}) => {
  const name = `e2e-client-${Date.now()}`;
  await login(page, ADMIN);

  await page.goto("/clients");
  await page.getByRole("link", { name: "New" }).click();
  await page
    .getByLabel("Server and organization to create in")
    .selectOption({ label: `default / ${ORG}` });
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create client" }).click();

  // The client form shows a one-time private key instead of redirecting --
  // "Done" is what returns to the aggregated list.
  await expect(page.getByLabel(`Private key for ${name}`)).toBeVisible();
  await page.getByRole("link", { name: "Done" }).click();
  await expect(page).toHaveURL(/\/clients$/);

  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText(ORG);

  // The aggregated row's link resolves to the real per-org detail route.
  await row.getByRole("link", { name }).click();
  await expect(page).toHaveURL(new RegExp(`${orgPath("clients", name)}$`));

  await page.getByRole("button", { name: "Delete" }).click();
  await page
    .getByRole("dialog", { name: `Delete ${name}?` })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page).toHaveURL(/\/clients$/);
  await expect(page.getByRole("link", { name: `${ORG}-validator` })).toBeVisible();
  await expect(page.getByRole("link", { name })).toHaveCount(0);
});

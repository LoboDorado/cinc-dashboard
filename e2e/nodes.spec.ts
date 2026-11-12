import { expect, test } from "@playwright/test";
import { ADMIN, alert, login, orgPath } from "./helpers";

// Every step is a request signed as the registered server's shared
// impersonation identity (an admin-level actor on cinc-server-ng), gated
// only by e2e-admin's platform_admin role grant in the dashboard's own
// database -- verified end to end: create (POST), edit (PUT), delete
// (DELETE), each round-tripped through the real server.
test("an admin creates, edits, and deletes a node", async ({ page }) => {
  const name = `e2e-node-${Date.now()}`;
  await login(page, ADMIN);

  // Create
  await page.goto("/nodes");
  await page.getByRole("link", { name: "New" }).click();
  // e2e-admin (platform_admin) reaches more than one org, so the aggregated
  // create form shows a scope picker before the form itself appears.
  await page
    .getByLabel("Server and organization to create in")
    .selectOption({ label: "default / acme" });
  await expect(page.getByRole("heading", { name: "New node" })).toBeVisible();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(new RegExp(`${orgPath("nodes", name)}$`));
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // Edit: change the node's normal attributes through the JSON editor.
  await page.getByRole("button", { name: "Edit JSON" }).click();
  const editor = page.getByRole("textbox", { name: "JSON editor" });
  const current = JSON.parse(await editor.inputValue());
  current.normal = { e2e: { marker: "edited" } };
  await editor.fill(JSON.stringify(current, null, 2));
  await page.getByRole("button", { name: "Save" }).click();
  const confirm = page.getByRole("dialog", { name: "Apply changes?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Apply" }).click();
  await expect(alert(page, "Saved.")).toBeVisible();

  // The edit round-tripped through the server, not just local state.
  await page.reload();
  await page.getByRole("button", { name: "Edit JSON" }).click();
  const saved = JSON.parse(
    await page.getByRole("textbox", { name: "JSON editor" }).inputValue(),
  );
  expect(saved.normal).toEqual({ e2e: { marker: "edited" } });

  // Delete
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: `Delete ${name}?` });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete" }).click();
  // Deleting redirects to the aggregated list, not the (now-removed) per-org
  // one -- see listPath("nodes") in the node detail page's backHref.
  await expect(page).toHaveURL(/\/nodes$/);
  await expect(page.getByRole("link", { name: "seed-web01" })).toBeVisible();
  await expect(page.getByRole("link", { name })).toHaveCount(0);

  // And the server agrees it is gone.
  await page.goto(orgPath("nodes", name));
  await expect(
    page.getByText("This no longer exists, or you don't have access to it."),
  ).toBeVisible();
});

// No collector is registered against the e2e fixture server, so this
// exercises the real degrade path: the facets sourced straight from the Cinc
// Server (Environment) still work with zero collector involvement, while the
// collector-sourced one (Converge status) still renders -- as "All" plus
// "(unknown)", not a blank/disabled control -- since every node is `undefined`
// (no collector covers it at all), which the table deliberately folds into
// the same "(unknown)" bucket a collector-covered-but-unreported node would
// also land in.
test("the Nodes list facets filter correctly and degrade without a collector", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/nodes");

  await expect(page.getByLabel("Platform")).toHaveText("All Platform");
  await expect(page.getByLabel("Policy group")).toHaveText("All Policy group");

  await page.getByLabel("Environment").selectOption({ label: "_default" });
  await expect(page.getByRole("link", { name: "seed-web01" })).toBeVisible();

  const ccrStatus = page.getByLabel("Converge status");
  await expect(ccrStatus.locator("option")).toHaveText(["All Converge status", "(unknown)"]);
  await ccrStatus.selectOption({ label: "(unknown)" });
  await expect(page.getByRole("link", { name: "seed-web01" })).toBeVisible();
});

test("the node detail page's Compliance tab is keyboard-reachable and shows the no-collector CTA", async ({
  page,
}) => {
  await login(page, ADMIN);
  await page.goto(orgPath("nodes", "seed-web01"));

  const detailsTab = page.getByRole("tab", { name: "Details" });
  await detailsTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Compliance", selected: true })).toBeVisible();

  await expect(
    page.getByText("No collector is registered for this server yet."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Register a collector" })).toHaveAttribute(
    "href",
    "/admin/collectors/new",
  );
});

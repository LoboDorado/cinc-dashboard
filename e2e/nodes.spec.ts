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
  await page.goto(orgPath("nodes"));
  await page.getByRole("link", { name: "New" }).click();
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
  await expect(page).toHaveURL(new RegExp(`${orgPath("nodes")}$`));
  await expect(page.getByRole("link", { name: "seed-web01" })).toBeVisible();
  await expect(page.getByRole("link", { name })).toHaveCount(0);

  // And the server agrees it is gone.
  await page.goto(orgPath("nodes", name));
  await expect(
    page.getByText("This no longer exists, or you don't have access to it."),
  ).toBeVisible();
});

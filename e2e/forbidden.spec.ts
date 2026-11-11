import { expect, test } from "@playwright/test";
import { ORG, SERVER, VIEWER, alert, login, orgPath } from "./helpers";

// e2e-viewer holds org_viewer on just this org: read allowed, write denied.
// Unlike the pre-RBAC model, this denial is the dashboard's own role-grant
// check (lib/admin/access.ts), not a 403 from the Cinc server -- every
// dashboard-mediated request signs as the registered server's one shared
// identity, which has full admin rights on the underlying Cinc server
// regardless of which dashboard account is signed in.
test("a viewer without write access sees the forbidden message", async ({ page }) => {
  await login(page, VIEWER);
  // e2e-viewer has a grant on a single org, so login skips the picker.
  await expect(page).toHaveURL(new RegExp(`/servers/${SERVER}/orgs/${ORG}$`));

  // Reads are allowed...
  await page.goto(orgPath("clients"));
  await expect(page.getByRole("link", { name: `${ORG}-validator` })).toBeVisible();

  // ...the create is not.
  await page.goto(orgPath("clients", "new"));
  await page.getByLabel("Name").fill(`e2e-denied-${Date.now()}`);
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(
    alert(page, "You don't have permission to create clients in this organization."),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${orgPath("clients", "new")}$`));
});

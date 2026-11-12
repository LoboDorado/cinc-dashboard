import { expect, test } from "@playwright/test";
import { ORG, VIEWER, login } from "./helpers";

// e2e-viewer holds org_viewer on just this org: read allowed, write denied.
// Unlike the pre-RBAC model, this denial is the dashboard's own role-grant
// check (lib/admin/access.ts), not a 403 from the Cinc server -- every
// dashboard-mediated request signs as the registered server's one shared
// identity, which has full admin rights on the underlying Cinc server
// regardless of which dashboard account is signed in.
test("a viewer without write access sees the forbidden message", async ({ page }) => {
  await login(page, VIEWER);
  // Everyone lands on the aggregated dashboard now, regardless of how many
  // servers/orgs they can reach -- there's no picker to skip any more.
  await expect(page).toHaveURL(/\/$/);

  // Reads are allowed...
  await page.goto("/clients");
  await expect(page.getByRole("link", { name: `${ORG}-validator` })).toBeVisible();

  // ...the create is not. With zero write-eligible scopes,
  // requireObjectAccessMany(..., "write") filters this account out before a
  // create form ever renders, rather than letting it reach a form that would
  // only fail on submit.
  await page.goto("/clients/new");
  await expect(
    page.getByText("You don't have permission to create a client anywhere."),
  ).toBeVisible();
});

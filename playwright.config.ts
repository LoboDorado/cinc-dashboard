import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against a real cinc-server-ng. Run them with `make e2e`
// (scripts/e2e.sh), which boots cinc-server-ng and a throwaway Postgres,
// applies migrations, seeds the dashboard accounts the suite logs in as, and
// only then builds and starts the dashboard itself -- unlike a typical
// Playwright setup, the server isn't started here via `webServer`, since
// account seeding has to happen between "the app has booted once and
// auto-registered the server" and "tests start running," which `webServer`
// has no hook for. This file alone does not start anything.
const port = Number(process.env.E2E_PORT ?? 3100);
// localhost, not 127.0.0.1: Chromium treats it as a secure context, so the
// production session cookie (Secure by default) is stored over plain HTTP.
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  // Specs share one server's state (they create and delete objects), so run
  // them in one worker rather than interleaving writes.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

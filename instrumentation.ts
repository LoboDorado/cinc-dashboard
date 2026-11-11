/**
 * Runs once per server instance at boot, before any request is handled --
 * the standard Next.js hook for exactly this kind of startup bootstrap.
 * Guarded to the Node.js runtime: the edge runtime (which also calls
 * `register()`) can't use `pg`/`node:crypto`, and bootstrap is meaningless
 * there anyway.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runStartupBootstrap } = await import("./lib/db/bootstrap");
    await runStartupBootstrap();
  }
}

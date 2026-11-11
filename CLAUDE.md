# CLAUDE.md

Guidance for Claude Code when working in cinc-dashboard.

cinc-dashboard is a Next.js multi-server control plane for **Cinc** Infra
Servers. It has its own database and its own accounts (local password or
LDAP-linked) — **not** the Chef/Cinc user objects on any particular server.
An account's access comes from role grants (`lib/admin/`: Platform/Server/Org
Admin, Object Manager, Viewer — see `lib/admin/policy.ts`) stored in the
dashboard's own Postgres. When a signed-in account acts against a *registered*
Cinc Server, the dashboard always signs the request as that server's one
pre-configured shared identity (`X-Ops-Request-Source: web`), never as the
real account — so **the dashboard's own role grants are the authorization
boundary** for a registered server, not that server's ACLs. See "Security
invariants" below; this is a deliberate, documented departure from a simpler
"the server decides" model, and it's why every such request is audited
(`lib/db/audit.ts`).

> In user-facing copy say **Cinc**, never "Chef Server". Keep Chef API schema
> tokens (`chef_environment`, `Chef::Role`, `json_class`) as-is — those are the
> wire format.

## Commands

- `make help` — list targets. `pnpm` is the package manager.
- `make dev` / `pnpm dev` — dev server at http://localhost:3000.
- `make test` / `pnpm test` — Vitest (run once). `pnpm test <name>` filters.
- `make build` / `pnpm build` — production build (also the type check).
- `make lint` — eslint. `make check` — test + lint + build (CI parity).
- `make e2e` — Playwright (`e2e/`) against a throwaway cinc-server-ng (pinned in `scripts/e2e.sh`, seeded from `e2e/fixtures/state`).
- `make smoke` — build the image and verify `/api/healthz` (needs Docker).
- `make helm-lint` / `make helm-template` — validate the chart.
- `make release-pr VERSION=0.5.0` — open the release PR. See `RELEASING.md`.

Run `make check` before committing.

## Releasing

Never hand-edit a version. `scripts/set-version.mjs` is the only thing that knows
where the version lives (`package.json`, `Chart.yaml` `version` + `appVersion`);
adding a fourth place means adding a target there plus a test. `values.yaml` keeps
`image.tag: ""` on purpose so it defers to `.Chart.AppVersion`.

`make release-pr VERSION=x.y.z` opens a PR with the bump and a generated
CHANGELOG section; merging it tags, publishes the Release, and builds the image
from the tagged commit. Two `set-version.mjs --check` guards refuse to tag or
build a tree whose versions disagree with the tag. Full flow in `RELEASING.md`.

## This is Next.js 16 — not the one in your training data

Read `node_modules/next/dist/docs/` before using an unfamiliar API. Key changes
this project relies on:

- **`proxy.ts`, not `middleware.ts`.** The root `proxy.ts` exports `proxy()` and
  gates unauthenticated users to `/login`.
- **Async request APIs.** `cookies()`, `headers()`, and route/page `params` are
  Promises — always `await` them (`const { server, org } = await params`).
- Turbopack is the default bundler; `output: "standalone"` for the container.

## Architecture

The webui key(s), the Postgres pool, and all signing are **server-only**.

```
app/                        UI (RSC + client components) + route handlers + server actions
  api/healthz                liveness/readiness (Dockerfile + Helm probes depend on it)
  api/auth/*                 login / logout (dashboard accounts, lib/dashboard/auth.ts)
  login/                     username+password form
  setup/                     first-run: consumes the one-time setup token, creates
                              the first dashboard account (platform_admin)
  servers/                   server picker (skips straight through if there's only one)
  servers/[server]/orgs/     org picker within that server
  servers/[server]/orgs/[org]/<kind>/
                              list / [name] detail / new — one dir per object type,
                              unchanged in shape from before the multi-server move
lib/cinc/                   server-only Cinc Server client (NEVER import into a client component)
  signing.ts                 v1.3 SHA-256 signing — faithful port of cinc-api; conformance-tested
  client.ts                  signed transport; takes an AuthorizedActionContext (not a
                              bare username) -- per-server TLS/CA dispatcher; CincError
  resource.ts                makeResource(kind) -> list/get/create/update/remove, all ctx-based
  action.ts                  runAction() maps CincError/AccessDeniedError -> { ok } | { error }
  safe-get.ts                safeGet() for reads; explainRead() for messages
  orgs.ts databags.ts members.ts readonly.ts acl.ts clients.ts cookbooks.ts policies.ts search.ts
    (all take an AuthorizedActionContext as their first argument; see lib/admin/access.ts)
lib/ldap/client.ts          server-only LDAP client: search-then-bind (AUTH_MODE=ldap),
                             now proving a *dashboard account's* linked DN, not a Cinc user
lib/dashboard/               dashboard-account identity (decoupled from any Cinc Server)
  password.ts                 scrypt hash/verify for local accounts
  auth.ts                     authenticate(): local hash check, or ldapBind() + DN match
  accounts.ts                 lookups + self-service profile/password updates
  setup.ts                    completeSetup() consumes the setup token, creates account #1
lib/admin/                  the authorization chokepoint -- every Cinc Server call must
                             obtain an AuthorizedActionContext from here first
  policy.ts                   pure role-grant decision logic (no I/O; fully unit-tested):
                               canAccessObject/canAccessScope/isScopeAdmin
  access.ts                   requireObjectAccess/requireScopeAccess/requireScopeAdmin/
                               requireServerAccess/requireOrgAccess load grants + the
                               target server row, decrypt its webui key, and brand the
                               result as AuthorizedActionContext (mirrors lib/cinc/path.ts's
                               CincPath brand -- can't be fabricated outside this file)
lib/db/                      dashboard's own Postgres (accounts, registered
                             servers/collectors, role grants, audit log) -- NOT
                             cinc-collector's SereneDB
  migrations/                 forward-only SQL, run by scripts/migrate.mjs
  client.ts                   getPool() -- lazy pg.Pool from CINC_DASHBOARD_DATABASE_URL
  secretbox.ts                 AES-256-GCM at rest, keyed by CINC_DASHBOARD_ENCRYPTION_KEY
  audit.ts                     recordAudit() -- awaited, not fire-and-forget (see below)
  bootstrap.ts                 ensureDefaultServerRegistered()/ensureSetupToken(), run once
                               at boot from instrumentation.ts under a Postgres advisory lock
lib/config.ts                fail-fast zod env validation (getConfig)
lib/session.ts                stateless encrypted iron-session cookie (accountId only)
lib/guard.ts                  currentAccountId()/currentAccount() -- redirect to /login
                               in a Server Component; requireAccountId() (lib/session.ts)
                               for route handlers, which can't call redirect()
components/                  AppShell, ResourceTable, ObjectEditor, JsonEditor, NewObjectForm, ui/*
scripts/migrate.mjs          applies lib/db/migrations/ in order
scripts/break-glass.mjs      emergency account recovery, bypassing the role-grant chain
                               entirely (audited under its own distinct action)
deploy/helm/                 chart; Dockerfile + scripts/smoke.sh at root
deploy/compose/              Docker Compose equivalent of the chart (keep in step)
```

Request path: client → route handler / server action → `requireObjectAccess`
(or a sibling in `lib/admin/access.ts`) loads the account's role grants, denies
(and audits the denial) or returns a branded `AuthorizedActionContext` → that
context flows into `lib/cinc/*`, which signs as the target server's
configured shared identity and audits the outcome → Cinc Server. The UI
reacts to 200/403/404 exactly as before; a role-grant denial produces the
same `{ error: "forbidden" }` shape as a real 403 from the server.

**This is a foundational layer, not the finished product.** Landed so far:
the rename, the database/auth/RBAC/audit core, the routing move to
`/servers/[server]/orgs/[org]/`, the admin UI for managing registered
servers/collectors/accounts/role grants at all three scopes (`app/admin/**`,
`app/servers/[server]/admin/**`, `app/servers/[server]/orgs/[org]/admin/**`),
the audit log viewers at those same three scopes, and an e2e suite covering
all of it. Not yet built: the Collector integration (Nodes attribute
filtering, Compliance) that originally motivated this work -- tracked as a
follow-up plan, not done yet.

## Conventions

- **`lib/cinc/*`, `lib/admin/*`, `lib/db/*`, `lib/dashboard/*` and `lib/session.ts`
  import `"server-only"`.** Never import them into a client component; go
  through a route handler or server action.
- **Object types follow the `nodes` reference**
  (`app/servers/[server]/orgs/[org]/nodes/`): a per-kind `actions.ts`
  (`"use server"`) that resolves `currentAccountId()`, calls
  `requireObjectAccess(accountId, server, org, "<kind>", "read"|"write")` to
  get a context, then delegates to `makeResource` + `runAction`/
  `parseJsonObject`. List/detail/new pages follow the same shape for reads
  (via `safeGet`). Server actions are bound with `.bind(null, server, org,
  name)` and passed to `ObjectEditor`/`NewObjectForm`.
- **Mutations return `{ ok: true } | { error: string }`** via `runAction`
  (`lib/cinc/action.ts`), which maps both a `CincError` 403 and a role-grant
  `AccessDeniedError` to `{ error: "forbidden" }` — the UI doesn't need to
  know which one fired.
- v1 scope: nodes/roles/environments/data bags/members & groups = CRUD;
  clients = create + delete (no edit); cookbooks/policies = view + delete
  (a version/revision or the whole object). Editing cookbook/policy content
  and cookbook uploads are out of scope. `_default` environment is read-only.

## Dependency overrides

`pnpm-workspace.yaml`'s `overrides` forces patched versions of transitive
packages whose parent pins a vulnerable range — currently `undici` 7.x, which
`jsdom` (dev only) already resolves to; the override keeps it at the patched
`^7.29.1` and leaves our direct `undici` 8.x alone. (The old `postcss` and
`sharp` overrides were dropped once `next` 16.4.4 pinned `postcss 8.5.23` and
`sharp ^0.35.5` itself.) `minimatch` 10.x (eslint, typescript-eslint;
dev only) is lifted to `^11.0.1`, which has the same exports and only drops
Node 18. The 3.x copies inside eslint 9 (`@eslint/config-array`,
`@eslint/eslintrc`) are deliberately **not** overridden: 3.x's CommonJS export
is the callable `minimatch()` function and 11.x's is not, and the fix needs
eslint 10, which `eslint-config-next`'s react/import/jsx-a11y plugins don't
support yet. That leaves one moderate `pnpm audit` finding (GHSA-g3hv-75wg-m249,
a DoS from crafted glob patterns, which only come from our own lint config).

`vite` is a direct devDependency only so its version can be patched: it's a
peer of `vitest` and `@vitejs/plugin-react`, so `pnpm update` never moves it on
its own. Each override is scoped to the vulnerable range
(`"postcss@<8.5.18": ">=8.5.18"`), so it stops applying once upstream catches
up. Drop an entry when `next` bumps its own pin past the advisory; check with
`pnpm why <pkg>` and `pnpm audit`.

Note: pnpm 10 moved `overrides` (and other package-manager settings) out of
`package.json`'s `pnpm` key into `pnpm-workspace.yaml` — an override left in
`package.json` is silently ignored (`pnpm install` warns "no longer read")
rather than erroring, so it's easy to edit the wrong file without noticing.

## Accessibility

**We comply with [WCAG 2.2 level AA](https://www.w3.org/TR/WCAG22/) — treat it
as a hard requirement in everything we build, not a later polish pass.** A
feature is not done until it works with a keyboard and a screen reader. Concretely:

- Prefer semantic HTML and native controls (`<button>`, `<a>`, `<label htmlFor>`,
  `<dialog>`) before reaching for ARIA. Every interactive element must be
  keyboard-operable and have an accessible name.
- Never signal state by **color alone** — pair it with text or an icon (e.g.
  errors get an icon + `role="alert"`, not just red text).
- Keep focus **visible** and managed: trap focus in modals, restore it on close,
  and provide a skip-to-content link.
- Announce async status/errors via `role="alert"` or an `aria-live` region.
- Meet AA **contrast** (4.5:1 text, 3:1 UI/large text) and respect
  `prefers-reduced-motion`.
- New or changed UI should be checked against these before `make check` passes.

## Testing

- Vitest. Server-side tests (signing, client, actions, lib) need the **node
  environment** — add `// @vitest-environment node` at the top of the file.
- The signing **conformance test** pins byte-for-byte parity with `cinc-api`
  using `lib/cinc/__fixtures__/test_key.pem` (copied from `cinc-api/testdata`).
  Don't weaken it.
- Mock modules a `"use server"` file imports at load time with **`vi.hoisted`**
  (a bare `const` in a `vi.mock` factory hits a TDZ error).
- `server-only` is aliased to a stub in `vitest.config.ts` so server modules
  import under test.

## Configuration

Required env (validated at boot, fail-fast): `CINC_SERVER_URL`,
`CINC_WEBUI_KEY` (PEM), `SESSION_SECRET` (32+ chars), `CINC_DASHBOARD_DATABASE_URL`
(Postgres connection string for the dashboard's own admin-plane data),
`CINC_DASHBOARD_ENCRYPTION_KEY` (32+ chars; encrypts secrets at rest in that
database — kept separate from `SESSION_SECRET` so rotating one doesn't force
re-encrypting the other). `CINC_WEBUI_KEY`, `SESSION_SECRET`, and
`CINC_DASHBOARD_ENCRYPTION_KEY` each also take a `_FILE` variant
(`CINC_WEBUI_KEY_FILE`, `SESSION_SECRET_FILE`, `CINC_DASHBOARD_ENCRYPTION_KEY_FILE`);
the inline value wins if both are set, and `SESSION_SECRET_FILE`/
`CINC_DASHBOARD_ENCRYPTION_KEY_FILE` have one trailing newline stripped
(`echo secret > file`). Optional: `CINC_CA_CERT`, `CINC_SSL_NO_VERIFY`,
`SESSION_TTL_SECONDS`, `SESSION_COOKIE_SECURE`. See `.env.example`.

## Security invariants

These are load-bearing — a change that breaks one is a vulnerability, not a bug.

- **Build every request path with `` cincPath`…` `` (`lib/cinc/path.ts`).** Names
  come from route params (Next decodes `%2F` into a real `/`) and from form
  fields, and the path is what we *sign* — an unchecked name aims a webui-signed
  request at an endpoint the UI never exposes, e.g. `/nodes/<name>/_acl`.
  `CincRequestOptions.path` is a branded type, so a plain string won't compile;
  `cincRequest` vets `ctx.org` and `ctx.impersonationUsername` itself.
- **`lib/admin/access.ts` is the only place that can mint an
  `AuthorizedActionContext`**, branded with a module-private `Symbol` the same
  way `CincPath` is branded in `lib/cinc/path.ts` — a plain object literal
  doesn't structurally match the type, so `cincRequest` can't be called
  without first passing a role-grant check. If you add a new way to reach a
  Cinc Server, it goes through `requireObjectAccess`/`requireScopeAccess`/
  `requireScopeAdmin`/`requireServerAccess`/`requireOrgAccess` — never read
  `getConfig()` or a server row directly.
- **Every registered server is signed to as one shared, pre-configured
  identity (`registered_servers.impersonation_username`), never as the real
  dashboard account.** This means the target Cinc Server's own ACLs cannot
  tell real people apart for a server managed this way — the dashboard's role
  grants (`lib/admin/policy.ts`) are the *actual* authorization boundary, a
  deliberate, confirmed departure from a simpler "the server decides" model.
  Because of that, `lib/db/audit.ts`'s `recordAudit()` is awaited and
  fail-closed (a failed audit write fails the request) at the same
  chokepoint, both on denial (`lib/admin/access.ts`) and after the Cinc
  Server responds (`lib/cinc/client.ts`) — it's the only record of who
  really did what.
- **A Server Action is a public endpoint and its parameter types are erased.**
  Validate/allowlist what you write (see `pickProfileFields` in
  `app/profile/actions.ts`) — never spread a caller's object onto a server record.
  Only `.bind(null, …)` arguments are protected (Next encrypts that closure).
- **Route handlers that mint or destroy a session call `isCrossSite`**
  (`lib/same-origin.ts`) and require `application/json`. SameSite=Lax stops a
  cross-site POST from *sending* the cookie but not from *obtaining* one, and
  `Request.json()` ignores Content-Type — that pair is login CSRF.
- **The session cookie's Secure flag comes from config, never from a request
  header.** `X-Forwarded-Proto`/`Referer` are attacker-supplied.
- **The CSP nonce lives in `proxy.ts` and needs dynamic rendering**, pinned by
  `export const dynamic = "force-dynamic"` in `app/layout.tsx`. A prerendered
  page ships scripts with no nonce and the browser refuses to run them.

Optional LDAP bind auth, opt-in via `AUTH_MODE=ldap` (default `local`):
`LDAP_URL`, `LDAP_BASE_DN`, `LDAP_BIND_DN`/`LDAP_BIND_PASSWORD[_FILE]`
(anonymous search bind if both are unset), `LDAP_USER_FILTER` (default
`(uid={{username}})`), `LDAP_SEARCH_TIMEOUT_MS`, `LDAP_TLS_NO_VERIFY`,
`LDAP_CA_CERT[_FILE]`. LDAP only replaces the password check for a *dashboard*
account — it never provisions one. The submitted username must already exist
as a dashboard account with `auth_source = 'ldap'` and a matching `ldap_dn`;
a bind that succeeds against a DN that doesn't match the linked account fails
the login with a distinct `auth.ldap_dn_mismatch` log line, not "bad
password" (`lib/dashboard/auth.ts`).

## Local testing against cinc-server-ng

[`cinc-server-ng`](https://github.com/cinc-project/cinc-server-ng) (formerly
`cinc-zero`; checked out at `../cinc-server-ng`) speaks the Cinc API, supports
webui impersonation, and **enforces ACLs by default**. Get the binary from a
release (`scripts/e2e.sh` pins one) or `go build ./cmd/cinc-server-ng` in its
repo. Run it from that repo so `--state` finds its seeded fixture:

```bash
cinc-server-ng --state dev/test-repo --key-out /tmp/webui.pem   # admin key doubles as the webui key
```

Don't use its `make run-dev`: that passes `--no-auth`, which skips signature
verification and ACLs, so it proves nothing about the dashboard's signing.

The dashboard also needs its own Postgres now. Point `CINC_DASHBOARD_DATABASE_URL`
at one and apply the schema once: `node scripts/migrate.mjs`.

Start the app with `CINC_SERVER_URL=http://127.0.0.1:8889` (the default
`--addr`), `CINC_WEBUI_KEY=$(cat /tmp/webui.pem)`,
`CINC_DASHBOARD_DATABASE_URL`, and `CINC_DASHBOARD_ENCRYPTION_KEY` set. On
first boot with an empty database it auto-registers that server (named
`default`, impersonating `CINC_AUTH_ACTOR` if set, else `pivotal` — review
that in the admin UI's Servers section before relying on it for anything real)
and prints a one-time setup token to the console. Visit `/setup` with that
token to create the first dashboard account, granted `platform_admin` — that
account already has full access to the auto-registered server, no separate
grant needed.

**This no longer uses `cinc-server-ng`'s own users (`tim`/`jack`/etc.) for
dashboard login** — dashboard accounts are a separate identity, and every
request to a registered server signs as that server's one configured shared
identity regardless of which dashboard account triggered it. To exercise a
narrower role (Org Viewer, Server Object Manager, …), create a second
dashboard account and grant it from `/admin/accounts` (or a server/org's own
delegated `admin/roles` surface) and confirm the UI's "forbidden" handling —
that's now a dashboard-side decision (`lib/admin/access.ts`), not a 403 from
the Cinc Server's own ACLs.

`make e2e` doesn't use `dev/test-repo`; it starts its own cinc-server-ng from
`e2e/fixtures/state`, plus a throwaway Postgres (`scripts/e2e.sh` manages
both, and seeds the dashboard accounts the suite logs in as directly via
`e2e/fixtures/seed-accounts.mjs` — there's no standing bootstrap admin to log
in with otherwise).

Design spec and implementation plan live in `docs/superpowers/`. The plan for
this multi-server/RBAC foundation itself isn't there yet — ask for it if you
need the full context beyond what's summarized here.

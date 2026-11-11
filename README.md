# cinc-dashboard

A multi-server control plane for [Cinc](https://cinc.sh/) / Chef Infra
Servers. Register one or more Cinc Servers, browse and edit the objects in
their organizations — nodes, roles, environments, data bags, members — from
the browser, with the dashboard's own accounts and role-based access control
deciding who can do what.

## How it works

cinc-dashboard has its own Postgres database, its own accounts (local
password or LDAP-linked), and its own role-based access control — **not**
the Chef/Cinc user objects on any particular server. An account's access
comes from role grants (Platform/Server/Org Admin, Object Manager, Viewer)
stored in the dashboard's own database, managed from the admin UI.

When a signed-in account acts against a registered Cinc Server, the
dashboard always signs the request as that server's **one pre-configured
shared identity** (`X-Ops-Request-Source: web`) — never as the real account.
That means the target Cinc Server's own ACLs can't tell real people apart
for a server managed this way: **the dashboard's own role grants are the
authorization boundary**, a deliberate departure from the classic
webui-impersonation model where the server decides. Because of that, every
dashboard-mediated request and every role grant/revoke is written to an
audit log, attributing the real account behind each shared-identity request.

- **Single Next.js app.** The webui key(s) and all request signing run
  server-side only; the browser never sees a key or talks to a Cinc Server
  directly.
- **v1.3 signing.** The signing module is a faithful port of the Go
  [`cinc-api`](https://github.com/cinc-project/cinc-api) implementation, pinned by a
  byte-for-byte conformance test.
- **Pluggable authentication.** Local accounts check a scrypt password hash
  by default; optionally bind against an external directory instead
  (`AUTH_MODE=ldap`). Either way, authentication only unlocks a *dashboard*
  account — it's decoupled from any particular Cinc Server's own users.
- **No standing bootstrap admin.** A brand-new install has no accounts and no
  env-seeded admin. On first boot it prints a one-time setup token to the
  logs; visit `/setup` with that token to create the first account, granted
  Platform Admin. See "Deploy to Kubernetes" / "Deploy with Docker Compose"
  below.

## Object scope

| Objects | Capability |
| --- | --- |
| Nodes, Roles, Environments, Data bags (+ items), Members & groups | View + create / edit / delete (role-gated) |
| Clients | View + create + delete (role-gated) |
| Cookbooks, Policies | View + delete a single version/revision or the whole object (role-gated) |

Editing cookbook or policy content, and uploading cookbooks, remain out of scope
for this version. Clients can be created and deleted but not edited (a client's
private key is shown once at creation and is never retrievable again).

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `CINC_SERVER_URL` | yes | Root URL of the Cinc/Chef server to auto-register on first boot, e.g. `https://chef.example.com`. No `/organizations/<org>` path. Only seeds that one server's row in the registry — add more servers afterward from the admin UI. |
| `CINC_WEBUI_KEY` | conditional | Inline contents of that server's `webui_priv.pem` (PEM) — the shared identity every dashboard-mediated request to it signs as. Required when `CINC_WEBUI_KEY_FILE` is not set. |
| `CINC_WEBUI_KEY_FILE` | conditional | Path to `webui_priv.pem`. Required when `CINC_WEBUI_KEY` is not set. |
| `SESSION_SECRET` | conditional | 32+ char secret used to encrypt the session cookie. Required when `SESSION_SECRET_FILE` is not set. |
| `SESSION_SECRET_FILE` | conditional | Path to a file holding the session secret (Docker/Compose secrets, Kubernetes secret volumes). One trailing newline is stripped, so `echo secret > file` works; the rest must be 32+ chars. Required when `SESSION_SECRET` is not set; `SESSION_SECRET` wins if both are set. |
| `CINC_CA_CERT` | no | Inline CA bundle (PEM) to trust a self-signed server |
| `CINC_CA_CERT_FILE` | no | Path to a CA bundle (PEM) to trust a self-signed server |
| `CINC_SSL_NO_VERIFY` | no | `true` to skip TLS verification (dev only) |
| `SESSION_TTL_SECONDS` | no | Session lifetime, default `28800` (8h) |
| `SESSION_COOKIE_SECURE` | no | `Secure` flag on the session cookie. Unset follows `NODE_ENV` (on in production); set to `false` only for a deliberate plain-HTTP deployment |
| `CHEF_VERSION` | no | API version header sent to the server, default `16.0.0` |
| `CINC_AUTH_ACTOR` | no | Shared impersonation username for the auto-registered default server (for example `pivotal`). Defaults to `pivotal` if unset — review it in the admin UI's Servers section before relying on it for anything real. |
| `CINC_DASHBOARD_DATABASE_URL` | yes | Postgres connection string for the dashboard's own admin-plane data (accounts, registered servers/collectors, role grants, audit log) — unrelated to cinc-collector's own database |
| `CINC_DASHBOARD_ENCRYPTION_KEY` | conditional | 32+ char key that encrypts secrets at rest in that database. Required when `CINC_DASHBOARD_ENCRYPTION_KEY_FILE` is not set. Kept separate from `SESSION_SECRET` so rotating one doesn't force re-encrypting the other |
| `CINC_DASHBOARD_ENCRYPTION_KEY_FILE` | conditional | Path to a file holding the encryption key. Required when `CINC_DASHBOARD_ENCRYPTION_KEY` is not set |
| `AUTH_MODE` | no | How a *dashboard* account's password is checked: `local` (default, scrypt) or `ldap` (bind against a directory). Either way the submitted username must already exist as a dashboard account — LDAP only replaces the password check, it never creates one. See `LDAP_URL`/`LDAP_BASE_DN`/etc. in `.env.example` for the full set of directory-bind options |

The app validates these at boot and exits with a clear message if a required
value is missing. For local development, copy `.env.example` to `.env.local`
and fill in your environment-specific values.

## Deploy to Kubernetes

```bash
helm install cinc-dashboard ./deploy/helm/cinc-dashboard \
  --set cincServerUrl=https://chef.example.com \
  --set-file webuiKey=/etc/opscode/webui_priv.pem \
  --set dashboardDatabaseUrl=postgres://user:password@postgres.example.com:5432/cinc_dashboard
```

Apply the schema once against that database with
`CINC_DASHBOARD_DATABASE_URL=… node scripts/migrate.mjs` (run from a checkout,
or `kubectl exec` into a running pod — the image includes the script).

On first boot, with an empty `dashboard_accounts` table, the pod prints a
one-time setup token to its logs:

```bash
kubectl logs deploy/cinc-dashboard | grep -A2 "no accounts exist yet"
```

Visit `/setup` with that token to create the first account, granted Platform
Admin — there is no default login, and the token stops working the moment
the pod restarts if it isn't used first. From there, add more servers,
collectors, accounts, and role grants from the admin UI.

`SESSION_SECRET` and `CINC_DASHBOARD_ENCRYPTION_KEY` are generated
automatically and preserved across upgrades. See
`deploy/helm/cinc-dashboard/values.yaml` for all options (ingress, resources,
`existingSecret`, etc.) and `values-example.yaml` for a minimal config.

For developer-specific overrides, use a local values file layered last:

```bash
cp deploy/helm/cinc-dashboard/values-local.example.yaml \
  deploy/helm/cinc-dashboard/values-local.yaml

helm upgrade --install cinc-dashboard deploy/helm/cinc-dashboard \
  -f deploy/helm/cinc-dashboard/values-local.yaml \
  --set cincServerUrl=https://chef.example.com \
  --set-file webuiKey=/etc/opscode/webui_priv.pem \
  --set dashboardDatabaseUrl=postgres://user:password@postgres.example.com:5432/cinc_dashboard
```

`values-local.yaml` is gitignored so you can keep local dev settings (for
example `imagePullSecrets` or `nodeEnv`) without changing shared defaults.

## Deploy with Docker Compose

For a single host, `deploy/compose/` mirrors the chart with Docker Compose:
same hardening, secrets mounted as files, and an optional Caddy service for TLS.

```bash
cd deploy/compose
cp cinc-dashboard.env.example cinc-dashboard.env   # set CINC_SERVER_URL
# add secrets/webui_priv.pem and secrets/session_secret, see the README there
docker compose up -d                           # runs the published image
docker compose logs cinc-dashboard | grep -A2 "no accounts exist yet"
```

This also starts a bundled Postgres and applies the schema automatically —
see the README below to point at your own instead. Visit `/setup` with the
printed token to create the first account, granted Platform Admin.

See [deploy/compose/README.md](deploy/compose/README.md) for secrets, TLS,
LDAP, building from the checkout, and the differences from the chart.

## Using cinc-server-ng

[cinc-server-ng](https://github.com/cinc-project/cinc-server-ng) has no
`webui_priv.pem` to copy. By default it trusts its bootstrap admin (`pivotal`)
key for webui impersonation, so the dashboard would have to hold the admin key.
Give it a dedicated webui keypair instead. The server only needs the public
half, and the two keys can then be rotated separately:

```bash
openssl genrsa -traditional -out webui_priv.pem 2048
openssl rsa -in webui_priv.pem -pubout -out webui_pub.pem

# Server: trust the public key for X-Ops-Request-Source: web
cinc-server-ng --storage sqlite --db /data/cinc.db --webui-key webui_pub.pem
```

Give the dashboard `webui_priv.pem` (`CINC_WEBUI_KEY_FILE`, the Helm chart's
`webuiKey`, or `secrets/webui_priv.pem` for Compose) and keep `webui_pub.pem`
with the server.

cinc-server-ng's own users (`pivotal` and so on) have nothing to do with
*dashboard* login: accounts are entirely the dashboard's own, created once at
`/setup` using the one-time token printed to the logs on first boot, then
from the admin UI after that. `CINC_AUTH_ACTOR` only sets the shared identity
the auto-registered server impersonates (default `pivotal`) — not who can log
in to the dashboard.

For a local dev loop against cinc-server-ng, including the exact command to
boot it with webui impersonation enabled (not `--no-auth`, which skips
signature verification and ACLs entirely), see `CLAUDE.md`'s "Local testing
against cinc-server-ng" section.

## Building images

Official images are published to GitHub Container Registry as
`ghcr.io/cinc-project/cinc-dashboard` via the project's automated build/release
workflows. In most cases, use those images directly.

Build your own image when you need environment-specific behavior, such as:

- private npm registry access during build (`.npmrc` + token auth)
- custom code changes or local testing before release
- internal compliance requirements (for example org-specific scanning/signing)
- a specific platform strategy not covered by your current deployment flow

For standard builds with access to the public npm registry:

```bash
docker build -t cinc-dashboard:local .
```

If your environment must use a private npm registry, create a local `.npmrc`
from `.npmrc.template` and set your registry/token before running `docker build`.
This repository's Dockerfile reads npm registry settings from `.npmrc` during
the dependency stage.

For complete build instructions (public vs private registry, token auth, and
cross-platform `buildx` examples), see [BUILD.md](BUILD.md).

To cut a release, see [RELEASING.md](RELEASING.md) — `make release-pr VERSION=0.5.0`
opens a PR that bumps every version reference, and merging it tags the release and
publishes the signed multi-arch image.

## Development

```bash
pnpm install
cp .env.example .env.local   # fill in the variables above
pnpm dev                     # http://localhost:3000
pnpm test                    # unit tests (vitest)
pnpm build                   # production build
```

## Security

- A registered server's webui key is a powerful credential — every
  dashboard-mediated request to it signs as that server's one shared identity.
  Keep keys in a Kubernetes Secret (or `existingSecret`), never in the image
  or client bundle; they're encrypted at rest in the dashboard's own database.
- Serve the dashboard over TLS; the session cookie is `HttpOnly` + `Secure` in
  production (config-driven via `SESSION_COOKIE_SECURE`, never inferred from a
  request header).
- **Authorization is the dashboard's own**, not the Cinc Server's, for a
  registered server managed this way — a deliberate departure from the
  classic webui-impersonation model, since the shared identity means the
  target server's own ACLs can't tell real people apart. Every
  dashboard-mediated request and every role grant/revoke is written to an
  audit log for exactly that reason.
- Login and logout are CSRF-guarded (reject cross-site requests, require
  `application/json`), every signed request path is built through a branded
  helper that rejects unsanitized names, and a Content-Security-Policy plus a
  standard set of security response headers apply to every route.

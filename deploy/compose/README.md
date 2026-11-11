# Deploy with Docker Compose

A single-host alternative to the Helm chart in [`../helm/cinc-dashboard`](../helm/cinc-dashboard),
with the same defaults and hardening:

| Helm chart | Compose |
| --- | --- |
| Deployment + Service | `cinc-dashboard` service (non-root uid 1000, read-only root filesystem, all capabilities dropped, same CPU/memory limits) |
| ConfigMap | `cinc-dashboard.env` |
| Secret | `./secrets/*`, mounted as Compose secrets |
| Ingress | optional `caddy` service (`proxy` profile) terminating TLS |
| *(not bundled — see below)* | `postgres` service, plus a one-shot `migrate` service that applies the schema |

Requires Docker Engine with the Compose v2 plugin. All commands below run from
this directory.

## 1. Configure

```bash
cp cinc-dashboard.env.example cinc-dashboard.env   # set CINC_SERVER_URL and CINC_DASHBOARD_DATABASE_URL at least
cp .env.example .env                            # optional: bind address, Caddy hostname
```

`CINC_DASHBOARD_DATABASE_URL` points at a Postgres instance for the
dashboard's own admin-plane data (accounts, registered servers/collectors,
role grants, audit log). `cinc-dashboard.env.example`'s default points at the
bundled `postgres` service below, which `compose.yaml` starts and migrates
automatically — fine for a single host or local dev. Point it at your own
managed Postgres instead for anything you care about keeping (same choice
the Helm chart makes by not bundling one), and remove the `postgres` and
`migrate` service blocks from `compose.yaml`; either way the schema is
applied once by the `migrate` service, or manually with
`CINC_DASHBOARD_DATABASE_URL=… node scripts/migrate.mjs` from the repo root
if you're not using it.

Comment out a setting you don't need instead of leaving it empty: the app
validates its configuration at boot, and an empty value is not the same as an
unset one (`SESSION_COOKIE_SECURE=` prevents startup).

## 2. Provide the secrets

```bash
mkdir -p secrets

# webui key from the Cinc server
scp root@cinc-server:/etc/opscode/webui_priv.pem secrets/webui_priv.pem
# cinc-server-ng has no webui_priv.pem: generate a dedicated pair instead and
# start the server with --webui-key webui_pub.pem (see "Using cinc-server-ng"
# in the top-level README)
#   openssl genrsa -traditional -out secrets/webui_priv.pem 2048
#   openssl rsa -in secrets/webui_priv.pem -pubout -out webui_pub.pem

# Session cookie encryption secret: 32+ characters. Keep it stable —
# regenerating it signs everyone out.
openssl rand -base64 48 | tr -d '\n' > secrets/session_secret

# Encrypts secrets at rest in the dashboard's own database (registered
# servers' webui keys, registered collectors' bearer tokens): 32+ characters,
# separate from session_secret above so rotating one doesn't force
# re-encrypting the other. Keep it stable — regenerating it makes every
# already-stored secret undecryptable.
openssl rand -base64 48 | tr -d '\n' > secrets/dashboard_encryption_key

# The container runs as uid 1000, like the chart's securityContext
sudo chown 1000:1000 secrets/*
sudo chmod 400 secrets/*
```

The Helm chart generates `SESSION_SECRET` for you; here you create it once.
The dashboard reads it through `SESSION_SECRET_FILE`, which strips one trailing
newline, so `echo secret > secrets/session_secret` works too (same for
`dashboard_encryption_key`).
`secrets/`, `certs/` and `cinc-dashboard.env` are gitignored.

The webui key lets the dashboard act as any user on the Cinc server, so keep the
dashboard off untrusted networks: by default it is published on `127.0.0.1:3000`
only.

## 3. Start

```bash
docker compose up -d
docker compose ps        # wait for "healthy"
```

This starts `postgres`, waits for it to be healthy, runs `migrate` to apply
the schema, then starts `cinc-dashboard`. It runs the published image for
this checkout's release, `ghcr.io/cinc-project/cinc-dashboard:<version>`. To
pin another tag or a digest, set `CINC_DASHBOARD_IMAGE` in `.env`. To build
the image from this checkout instead (local changes, a private npm
registry), add `compose.build.yaml` (which also builds `migrate` from the
same checkout):

```bash
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

There is no standing bootstrap admin: a brand-new install has no accounts,
so first boot prints a one-time setup token to the logs instead.

```bash
docker compose logs cinc-dashboard | grep -A2 "no accounts exist yet"
```

Visit `/setup` with that token to create the first account, granted
Platform Admin — the token stops working the moment the container restarts
if it isn't used first. From there, add more servers, collectors, accounts,
and role grants from the admin UI (`/admin`).

## TLS

The session cookie carries the `Secure` flag in production, so browsers must
reach the dashboard over HTTPS. For a quick test, an SSH tunnel to
`http://localhost:3000` works too, since browsers treat `localhost` as secure.

**With the bundled Caddy:** put your certificate in `certs/fullchain.pem` and
`certs/privkey.pem` (or edit `Caddyfile` to use ACME), set `CINC_DASHBOARD_HOST`
in `.env`, then:

```bash
# Caddy runs as root with every capability dropped, so it can only read
# files root owns. The dashboard (uid 1000) also reads any CA you put here.
sudo chown -R root:root certs
sudo chmod 755 certs && sudo chmod 644 certs/*.pem
sudo chmod 600 certs/privkey.pem

docker compose --profile proxy up -d
```

**With your own reverse proxy:** pass the public hostname through in `Host`
or `X-Forwarded-Host`. When a browser sends no `Sec-Fetch-Site` header, the
login CSRF check compares its `Origin` with those two headers. With nginx:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
```

Traefik needs no header settings: it passes `Host` through and sets
`X-Forwarded-Host` and `X-Forwarded-Proto` by default. A file-provider route
(Traefik v3):

```yaml
http:
  routers:
    cinc-dashboard:
      rule: Host(`cinc-dashboard.example.com`)
      entryPoints: [websecure]
      service: cinc-dashboard
      tls: {}
  services:
    cinc-dashboard:
      loadBalancer:
        servers:
          - url: "http://10.0.0.20:3000"
```

The dashboard is published on `127.0.0.1:3000` by default, which a Traefik
running in another container can't reach. Set `CINC_DASHBOARD_BIND` in `.env`
to an address Traefik can reach (for example `10.0.0.20:3000`, the host's
LAN address above), or attach both containers to a shared Docker network and
point the route at `http://cinc-dashboard:3000`.

## Private CA and LDAP

- **Cinc server with a self-signed or private-CA certificate:** put the CA in
  `certs/cinc-ca.pem` (readable by uid 1000, for example mode 644) and
  uncomment `CINC_CA_CERT_FILE` and the matching `volumes` entry in
  `compose.yaml`.
- **`AUTH_MODE=ldap`:** set the `LDAP_*` values in `cinc-dashboard.env`. For a
  service-account bind, create the password file without a trailing newline
  (it is read verbatim), then uncomment `LDAP_BIND_PASSWORD_FILE` and the
  `ldap_bind_password` secret in `compose.yaml`:

  ```bash
  printf '%s' 'the-password' > secrets/ldap_bind_password
  ```

## Differences from the chart

- Bundles a `postgres` service and a one-shot `migrate` service. The chart
  deliberately doesn't bundle a database (simpler chart, avoids accidental
  data loss from a bundled stateful pod) and expects an operator-provided
  Postgres with the schema already applied; Compose is single-host already,
  so bundling one here is a convenience.
- One instance instead of two replicas. The app is stateless, so more
  instances work as long as they share the same `session_secret`.
- Docker never restarts an unhealthy container on its own. To match the
  chart's livenessProbe, the healthcheck kills the server after three
  consecutive failures, and the restart policy starts a fresh container.
- No NetworkPolicy equivalent. To restrict egress to the Cinc server and the
  directory, use firewall rules (for example the `DOCKER-USER` iptables chain).
- The session secret is read from the Compose secret through
  `SESSION_SECRET_FILE` rather than set as `SESSION_SECRET`, which keeps it out
  of `docker inspect`.

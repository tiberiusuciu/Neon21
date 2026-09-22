# Neon21

Multiplayer blackjack — pnpm monorepo (`apps/server`, `apps/web`, `packages/shared`).

## Local development

```bash
cp .env.example .env
# edit secrets in .env
pnpm install
pnpm start          # Postgres + API (Docker) + Vite web
# stop: pnpm stop
```

Web alone: `pnpm web:dev` (API must already be on `VITE_API_URL`, default `http://localhost:4000`).

Android APK notes: see [`apps/web/README.md`](apps/web/README.md).

## Deploy on a VPS (e.g. Hetzner)

Compose runs **Postgres + the API**. The web app is a static Vite build you serve with a reverse proxy (Caddy or nginx). Plan on two public URLs, for example:

- `https://neon21.example.com` — frontend
- `https://api.neon21.example.com` — API + Socket.IO

Same-origin (`/` → static, `/api` → backend) also works if you adjust `VITE_API_URL` and proxy paths. The steps below use subdomains.

### 1. Server basics

1. Create a Hetzner Cloud VPS (Ubuntu 24.04 LTS is fine; 2 GB RAM is enough to start).
2. Point DNS A records for your domains at the VPS public IP; wait for propagation.
3. SSH in and install Docker + Compose plugin:

```bash
sudo apt update && sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# log out and back in so docker works without sudo
docker compose version
```

4. Open firewall ports **22**, **80**, and **443** only (do not expose Postgres or the API publicly):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 2. Clone and configure

```bash
git clone <your-repo-url> neon21
cd neon21
cp .env.example .env
```

Edit `.env` for production (do not commit it):

```env
POSTGRES_USER=neon21
POSTGRES_PASSWORD=<long-random-password>
POSTGRES_DB=neon21
DATABASE_URL=postgresql://neon21:<long-random-password>@db:5432/neon21
JWT_SECRET=<long-random-secret>
PORT=4000
HOST=0.0.0.0
# Public web origin (single URL preferred — also used as Google OAuth return base)
CORS_ORIGIN=https://neon21.example.com
# Optional Google sign-in
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=https://api.neon21.example.com/auth/google/callback
```

Generate secrets, for example:

```bash
openssl rand -base64 32   # POSTGRES_PASSWORD
openssl rand -base64 48   # JWT_SECRET
```

If you enable Google OAuth, add the same callback URL in the Google Cloud Console.

### 3. Lock down Compose ports

Out of the box, `docker-compose.yml` publishes `5432` and `4000` on all interfaces. On a VPS, bind them to localhost so only the reverse proxy can reach the API:

```yaml
# db
ports:
  - "127.0.0.1:5432:5432"
# server
ports:
  - "127.0.0.1:4000:4000"
```

### 4. Start the API stack

```bash
docker compose up --build -d
docker compose ps
curl -s http://127.0.0.1:4000/health   # expect {"status":"ok"}
```

The server image runs `prisma migrate deploy` on start, then listens on port 4000 (HTTP + Socket.IO).

Useful commands:

```bash
docker compose logs -f server
docker compose up --build -d   # after git pull / code changes
docker compose down            # stop (keeps DB volume)
```

Postgres data lives in the Docker volume `postgres_data`.

### 5. Build the web app

On the VPS (or in CI, then copy `dist/` up). Needs Node 20+ and pnpm 9:

```bash
corepack enable && corepack prepare pnpm@9.15.0 --activate
pnpm install
pnpm --filter @neon21/shared build

mkdir -p apps/web
printf 'VITE_API_URL=https://api.neon21.example.com\n' > apps/web/.env
pnpm --filter @neon21/web build
```

`VITE_API_URL` is baked in at build time — rebuild the web app whenever the API URL changes.

Static output: `apps/web/dist/`.

### 6. Reverse proxy + TLS (Caddy)

Install Caddy, then use a Caddyfile like:

```caddy
neon21.example.com {
	root * /home/<user>/neon21/apps/web/dist
	encode gzip
	try_files {path} /index.html
	file_server
}

api.neon21.example.com {
	encode gzip
	reverse_proxy 127.0.0.1:4000
}
```

Socket.IO shares the API host; Caddy upgrades WebSockets automatically with `reverse_proxy`.

```bash
sudo apt install -y caddy
# put the Caddyfile at /etc/caddy/Caddyfile (adjust the root path)
sudo systemctl reload caddy
```

Caddy obtains and renews Let's Encrypt certificates as long as DNS points at the VPS and ports 80/443 are open.

#### nginx alternative (sketch)

Terminate TLS (Certbot), serve `apps/web/dist` with `try_files $uri /index.html`, and proxy the API with WebSocket headers:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_pass http://127.0.0.1:4000;
```

### 7. Smoke-check

1. Open `https://neon21.example.com` — UI loads.
2. Sign in (or Google OAuth if configured).
3. Join a table — cards and turns update over the socket (no console CORS/WS errors).
4. `curl -s https://api.neon21.example.com/health`.

### 8. GitHub Actions deploy

On every push to `main` (and via **Actions → Deploy → Run workflow**), [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) SSHs into the VPS, resets the repo to `origin/main`, and runs [`scripts/deploy.sh`](scripts/deploy.sh):

1. `pnpm install` + build `@neon21/shared`
2. `docker compose up --build -d` — API container entrypoint runs **`prisma migrate deploy`**, then starts the server
3. Wait for `http://127.0.0.1:4000/health`
4. Build the web app into `apps/web/dist/` (uses `apps/web/.env` → `VITE_API_URL`)

#### One-time VPS prep

```bash
# clone once, configure .env + apps/web/.env as above
git clone <your-repo-url> ~/neon21
cd ~/neon21
cp .env.example .env
# edit .env; create apps/web/.env with VITE_API_URL=https://api.neon21.example.com

# let the deploy user pull without a password (deploy key or HTTPS credential)
# Node 20+ (for corepack/pnpm) and Docker must already be available
```

Generate an SSH key used only by Actions (on your laptop or the VPS):

```bash
ssh-keygen -t ed25519 -f neon21-deploy -N "" -C "github-actions-deploy"
# append neon21-deploy.pub to the VPS user's ~/.ssh/authorized_keys
```

#### GitHub repo secrets / variables

Settings → Secrets and variables → Actions:

| Name | Type | Example |
|------|------|---------|
| `DEPLOY_HOST` | secret | `203.0.113.10` or `neon21.example.com` |
| `DEPLOY_USER` | secret | `deploy` |
| `DEPLOY_SSH_KEY` | secret | full private key (`neon21-deploy`) |
| `DEPLOY_PATH` | secret (optional) | `/home/deploy/neon21` (default `$HOME/neon21`) |
| `DEPLOY_PORT` | variable (optional) | `22` |

The VPS clone must be able to `git fetch origin main` (deploy key with read access, or a machine user).

Manual deploy on the box:

```bash
cd ~/neon21
git pull
bash ./scripts/deploy.sh
```

### Production checklist

- [ ] Strong `POSTGRES_PASSWORD` and `JWT_SECRET`
- [ ] Compose ports bound to `127.0.0.1`
- [ ] UFW: 22/80/443 only
- [ ] `CORS_ORIGIN` = public web HTTPS origin
- [ ] Web built with production `VITE_API_URL`
- [ ] `GOOGLE_CALLBACK_URL` matches Google Console (if used)
- [ ] Backups: VPS snapshot and/or dump the `postgres_data` volume

### Env reference

| Variable | Where | Notes |
|----------|--------|--------|
| `DATABASE_URL` | server / Compose | Host `db` inside Compose; use `localhost` for host-side Prisma scripts |
| `JWT_SECRET` | server | Required |
| `CORS_ORIGIN` | server | Browser origin allowlist (comma-separated OK). Prefer one URL for Google redirect |
| `GOOGLE_*` | server | Optional; callback must be public HTTPS API URL |
| `VITE_API_URL` | `apps/web/.env` | Public API base; compile-time |

Auth is JWT in `localStorage` (Bearer header / Socket.IO `auth.token`), not cookies.

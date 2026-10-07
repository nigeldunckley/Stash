# Deploying Stash to your VPS

This folder runs the whole app on one server, with HTTPS handled for you.
It needs about 4 GB of RAM (the installer adds swap on smaller servers)
and Ubuntu 22.04+ or Debian 12+.

## 1. Point a subdomain at the server

In the Fasthosts control panel open **Domains → nigeldunckley.com → DNS**
and add an **A record**:

| Name   | Type | Value                  |
|--------|------|------------------------|
| `stash` | A    | your VPS's IP address  |

Wait until `ping stash.nigeldunckley.com` answers with that IP.

## 2. Install

SSH into the VPS, then:

```bash
git clone https://github.com/<you>/<repo>.git stash
cd stash/deploy
sudo ./install.sh stash.nigeldunckley.com
```

The first start takes a few minutes while images download and the
database is created. Caddy fetches the HTTPS certificate on its own.

## 3. Create your account, then close sign-ups

Open https://stash.nigeldunckley.com, sign up with your email, then:

```bash
sudo ./install.sh lock
```

## Letting the server pull the Stash web image

GitHub builds the Stash web app into `ghcr.io/nigeldunckley/stash-web`.
New packages start private, so either make it public (GitHub → your
profile → Packages → stash-web → Package settings → Change visibility)
or log the server in once with a token that has `read:packages`:

```bash
echo <token> | sudo docker login ghcr.io -u nigeldunckley --password-stdin
```

## Updating

```bash
sudo ./install.sh update
```

## Useful commands

```bash
docker compose ps            # what is running
docker compose logs -f api   # follow the API log
docker compose restart web   # restart one service
```

Secrets live in `deploy/.env`, which the installer generates and which
is never committed. Back up the `pgdata` Docker volume to keep your
library safe.

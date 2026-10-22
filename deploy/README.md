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

## Letting the server pull the Stash images

GitHub builds the Stash web app into `ghcr.io/nigeldunckley/stash-web` and
the API (which also runs the queue processor) into
`ghcr.io/nigeldunckley/stash-api`. New packages start private, so either
make each one public (GitHub → your profile → Packages → the package →
Package settings → Change visibility)
or log the server in once with a token that has `read:packages`:

```bash
echo <token> | sudo docker login ghcr.io -u nigeldunckley --password-stdin
```

## Updating

```bash
sudo ./install.sh update
```

### Updating by itself

Run this once and the server keeps itself up to date. Every five minutes
it checks GitHub for new commits on main and new Stash images. When it
finds either, it applies them. A merge usually goes live a few minutes
after GitHub finishes building the image.

```bash
sudo ./install.sh autoupdate
```

See what it has done with `journalctl -u stash-update`, and turn it off
with `sudo ./install.sh autoupdate off`.

## Backups

Every night at about 03:30 the server saves a copy of Stash to
`/var/backups/stash`. Each dated folder holds the database (articles,
highlights, notes, feeds), the `.env` secrets, and, for the newest three,
the stored files such as PDFs. Database copies are kept for two weeks.

This turns on by itself the next time the server updates. To check or
control it:

```bash
journalctl -u stash-backup      # what the last backup did
sudo ./install.sh backup now    # take a backup right away
sudo ./install.sh backup off    # stop nightly backups
sudo ./install.sh backup        # start them again
```

The backups live on the same server, so they protect against mistakes
and broken updates, not against losing the server itself. To keep a second
copy of every backup somewhere else, name a folder. On a Mac mini running
Stash in an OrbStack machine, a folder in iCloud Drive works (the backups
include the `.env` secrets, so pick somewhere only you can read):

```bash
sudo ./install.sh backup copy-to "/Users/nigel/Library/Mobile Documents/com~apple~CloudDocs/Stash backups"
sudo ./install.sh backup copy-to off   # stop copying
```

The copy keeps the same number of backups as the server.

To restore a database backup, stop the app, load the dump, and start it
again (replace the folder name):

```bash
docker compose stop api queue-processor web
docker exec -i reader-postgres pg_restore -U postgres -d omnivore --clean --if-exists \
  < /var/backups/stash/2026-10-09-033000/database.dump
docker compose up -d
```

## Forgotten password

Stash doesn't send email, so reset a password on the server instead:

```bash
cd /opt/stash/deploy && sudo ./install.sh reset-password
```

It lists the accounts, asks which email to reset, then asks for the new
password twice (nothing shows as you type).

## Useful commands

```bash
docker compose ps            # what is running
docker compose logs -f api   # follow the API log
docker compose restart web   # restart one service
```

Secrets live in `deploy/.env`, which the installer generates and which
is never committed. Back up the `pgdata` Docker volume to keep your
library safe.

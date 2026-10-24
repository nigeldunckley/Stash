# Connect YouTube to Stash Watch

Watch can import your YouTube subscriptions and keep them up to date across the
website, Mac, iPhone and iPad. Google credentials are required once for your Stash
server. Each Stash user authorizes their own YouTube connection separately.

## Create the Google project

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a
   project for your private Stash installation. Enable **YouTube Data API v3**.
2. In **Google Auth Platform**, configure Branding, Audience and Data Access.
   Request only `https://www.googleapis.com/auth/youtube.readonly`. Set the app
   name to Stash and use your own support/contact email.
3. Add your domain to the authorized domains. Use your installation’s home page,
   `https://stash.nigeldunckley.com/settings/youtube-privacy` for the YouTube data
   disclosure, and Google's required policy links. The disclosure must be
   accessible from the consent screen; make a publicly accessible copy if your
   reverse proxy protects all routes.
4. Create an OAuth client of type **Web application**, with this exact authorized
   redirect URI:

   ```text
   https://stash.nigeldunckley.com/api/youtube/callback
   ```

   Substitute your installation’s public origin if different. The same server
   flow is used by native apps, so separate iOS OAuth clients are unnecessary.
5. Create an API key. Restrict it to **YouTube Data API v3** and, where stable,
   your server’s outbound IP address. This key retrieves public metadata;
   account subscriptions use the user’s OAuth grant instead.
6. While developing, add your Google account as a test user. Before relying on
   background sync, change OAuth Audience publishing status from **Testing** to
   **In production**. Testing refresh tokens with YouTube access expire after
   seven days. Private personal use may qualify for Google's verification
   exception, with an unverified-app warning. Publishing status does not itself
   make Stash public or remove that warning. Public distribution needs a separate
   verification review.

## Configure your server

The live Stash installation runs in the Mac Mini's OrbStack machine named
`stash`, at `/opt/stash`. The public VPS forwards requests to that machine;
its stopped Stash containers are a retired installation. Apply credentials,
migrations and service restarts inside the OrbStack machine. For example:

```sh
ssh nigel@Nigels-Mac-mini.local
/opt/homebrew/bin/orb -m stash -u root sh
cd /opt/stash/deploy
```

If you restrict the API key by IP address, use this live machine's outbound
public IP, rather than the forwarding VPS's IP. Update that restriction if the
outbound address changes.

Add these values to `deploy/.env`, which is ignored by Git:

```dotenv
YOUTUBE_API_KEY=your_restricted_api_key
YOUTUBE_CLIENT_ID=your_web_client_id
YOUTUBE_CLIENT_SECRET=your_web_client_secret
YOUTUBE_CREDENTIAL_KEY=your_dedicated_base64_key
YOUTUBE_PUBLIC_URL=https://stash.nigeldunckley.com
YOUTUBE_DATA_DAILY_LIMIT=10000
YOUTUBE_SEARCH_DAILY_LIMIT=100
```

Generate the dedicated encryption key with `openssl rand -base64 32`. Keep it
stable: replacing it makes stored connections unreadable and requires
reconnection. Credentials are encrypted using AES-256-GCM and bound to their
Stash account. Keep the encryption key outside database exports; protect
configuration backups as credentials. Never add these values to `NEXT_PUBLIC_*`,
the native app, a commit, a screenshot or a chat message.

The API and queue processor already load `deploy/.env`. Run migration **0195**
before starting the updated API and worker, then recreate both services so they
receive the environment changes. For the standard installation:

```sh
cd /opt/stash/deploy
docker compose run --rm migrate
docker compose up -d --force-recreate api queue-processor web
```

Use images built from this change. Do not run only the migration against an old
image and assume the integration has deployed. The standard updater runs
migrations before starting the new API.

The public HTTPS origin must route `/api/youtube/*` to the API; the existing
Caddy configuration does this. Google's push service must reach this origin.
No API keys or user authorization headers are required for the callback or push
verification endpoints; their expiring state/secret callback URLs secure those
operations. Other YouTube endpoints require an authenticated Stash session.

## Connect and verify

1. Open **Settings → YouTube** in the native app, or **Settings → Integrations →
   YouTube** on the website. Watch also exposes the connection in channel
   management. Choose **Connect YouTube**, authorize the intended YouTube channel
   in your system browser, then return to Stash.
2. Confirm the connected channel identity and imported channel count. The first
   import includes the last seven days of uploads; it may take several minutes
   for all channels to appear. Sync runs on the server even with all apps closed.
3. Confirm an existing manually followed channel keeps its collection and saved
   videos. A repeated **Sync now** must not create duplicates.
4. Subscribe to another channel on YouTube and use **Sync now**. Unsubscribe there
   and sync again: an imported-only follow should stop, while a separate manual
   follow remains. Unfollowing in Stash excludes that channel locally until you
   follow it again; it never changes YouTube.
5. Verify a newly published upload arrives through push notifications. Inspect
   queue logs for `youtube-notification` and `youtube-refresh-channel`. Reconciliation
   every six hours recovers missed notifications. Lease renewal retries hourly.
6. Disconnect and confirm account data is removed, imported-only follows stop,
   and independently saved videos and Stash notes/progress remain. Revoke access
   through Google's permissions page and confirm the next background sync
   removes account-derived relationships and offers reconnection.

Subscription snapshots run hourly. Failed or incomplete snapshots never apply
removals. Upload checkpoints advance only after a complete successful
reconciliation; push notifications do not move that checkpoint. API requests
share project-wide Redis quota counters and honor Google quota errors. Search
results are cached for an hour; searches are debounced in the app. Default quota
resets at midnight Pacific Time. Monitor quota in Google Cloud Console as other
clients using the project also consume it.

## Behaviour and limits

- The connection requests read-only access and cannot modify subscriptions or
  upload videos. One YouTube channel can be connected per Stash account.
- YouTube Watch Later, watch history and watch-position sync are unavailable.
  Saved videos and watching progress are Stash features.
- The official API does not identify Shorts reliably. **Hide videos under 3
  minutes** filters future automatic imports, including short regular videos;
  it is off by default and does not remove Saved videos.
- Automatic public transcript extraction is retired. Use the embedded YouTube
  player's caption controls. Chapters come from timecodes in the description.
- The player checks availability, embedding permission and Made for Kids status
  before loading. Playback tracking is disabled for Made for Kids videos.
- Stored public API metadata is refreshed after 27 days or removed at 30 days.
  Account-derived subscription data is removed on disconnect or detected
  revocation. The server must remain running for scheduled cleanup. Operators
  must also honor deletion requests in retained backups.
- Google access can expire or be revoked. Stash displays a reconnect action;
  network and quota failures retain existing follows and retry automatically.

## Local checks

`yarn workspace @omnivore/api test:youtube` runs the production migration and
subscription SQL against ephemeral PostgreSQL (PGlite), plus credential,
pagination, source-ownership, retry, duration-filter and quota tests. These tests
do not contact Google or your Stash server. Also run API/web type checks,
`native/scripts/test-native.sh`, and Mac/iOS builds before deployment.

References: [OAuth](https://developers.google.com/youtube/data/guides/auth/server-side-web-apps),
[subscriptions](https://developers.google.com/youtube/data/reference/rest/v3/subscriptions/list),
[push notifications](https://developers.google.com/youtube/data/guides/push_notifications),
[quotas](https://developers.google.com/youtube/data/determine_quota_cost),
[developer policies](https://developers.google.com/youtube/terms/developer-policies).

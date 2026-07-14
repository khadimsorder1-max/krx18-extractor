# Deployment Guide

## Prerequisites

- Telegram account + @BotFather access
- GitHub account (free)
- Cloudflare account (free)

## Step 1: Create Telegram Bot

1. Open Telegram → search `@BotFather`
2. Send `/newbot`
3. Choose a name (e.g. `KRX18 Korea Bot`)
4. Choose a username (e.g. `krx18_korea_bot`)
5. Copy the **HTTP API token** (`123456:ABCdef...`)
6. Send `/setinline` to BotFather → set placeholder (`Search Korea movies...`)

## Step 2: Get Your Telegram User ID

1. Search `@userinfobot` in Telegram
2. Send any message
3. Copy your numeric user ID (e.g. `123456789`)

## Step 3: Set Up GitHub Repo (for Direct Stream)

1. Go to https://github.com/new
2. Repository name: `krx18-extractor`
3. Visibility: **Public** (free unlimited Actions minutes)
4. Add a README → Create repository
5. Upload these files from the zip:
   - `extractor/index.js`
   - `extractor/browser.js`
   - `extractor/capture.js`
   - `extractor/notify.js`
   - `extractor/package.json`
   - `.github/workflows/extract-video.yml`
6. Go to **Settings → Secrets and variables → Actions**
7. Add secret: `BOT_TOKEN` = your Telegram bot token
8. Go to **Settings → Developer settings → Personal access tokens → Tokens (classic)**
9. Generate new token → scope: `repo` (full control)
10. Copy the PAT (`ghp_xxxxx...`)

## Step 4: Deploy Cloudflare Worker

### Install Wrangler

```bash
npm install -g wrangler
wrangler login
```

### Clone project

```bash
# Extract the krx18-v2 zip
cd krx18-v2
npm install
```

### Create KV namespace

```bash
wrangler kv namespace create CACHE_KV
```

Copy the `id` from the output → paste into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "CACHE_KV"
id = "YOUR_ID_HERE"
```

### Set secrets

```bash
wrangler secret put BOT_TOKEN
# paste your Telegram bot token

wrangler secret put ADMIN_CHAT_ID
# paste your Telegram user ID

wrangler secret put WEBHOOK_SECRET
# type a random string (e.g. mySecret123abc)

wrangler secret put ALLOWED_USERS
# paste your user ID (comma-separated for multiple)

wrangler secret put GITHUB_TOKEN
# paste your GitHub PAT

wrangler secret put GITHUB_REPO
# type: your-username/krx18-extractor
```

### Deploy

```bash
wrangler deploy
```

Note the worker URL: `https://krx18-korea-bot.<your-subdomain>.workers.dev`

## Step 5: Set Telegram Webhook

Open in browser (replace `<TOKEN>` and `<WORKER_URL>` and `<SECRET>`):

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<WORKER_URL>/webhook?token=<SECRET>
```

You should get:

```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

## Step 6: Verify

1. Visit `https://<WORKER_URL>/health` → JSON status
2. Send `/start` to your bot in Telegram
3. Send `/latest` → should see 10 Korean movies
4. Tap a movie → see poster + details + buttons
5. Tap "▶️ Watch Online Direct" → wait 30-60s → get direct URL
6. Paste URL in MX Player → plays without ads

## Update / Redeploy

```bash
# Pull latest code → deploy
wrangler deploy

# Tail logs (debug)
wrangler tail

# Update a secret
wrangler secret put BOT_TOKEN
```

## Optional: Enable Cron Auto-Notify

`wrangler.toml` already has:

```toml
[triggers]
crons = ["*/30 * * * *"]
```

This runs every 30 min — checks for new Korea movies → notifies admin.

## Rollback

```bash
# List deployments
wrangler deployments list

# Rollback to previous
wrangler deployments rollback
```

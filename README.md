# KRX18 Premium Bot v6

> Premium Korean movie bot for krx18.com — auto-remove ad overlay, capture abysscdn CDN URL,
> proxy for MX Player/VLC, Telegram Mini App, premium UI with badges + images.
>
> Deploys as **two Cloudflare Workers** + **GitHub Actions (Puppeteer)** + **TG Mini App**.

## ✨ What's New in v6

### 🎯 Direct Stream/Download URL Extraction (FINALLY WORKS!)
The old v5 couldn't reliably extract the video URL because:
- `abysscdn.com` URLs have no `.mp4` extension
- The video is loaded via an obfuscated `media` field (LZ-string compressed)
- JWPlayer decrypts it at runtime

**v6 solution:**
1. **Puppeteer auto-removes the ad overlay** — overrides `window.open`, clicks `#overlay` 3-5 times until it's gone (mimics the UC Browser flow you discovered: tap video → player opens → download works)
2. **Network interception** captures the actual video URL by:
   - CDN domain match (`abysscdn.com`, `iamcdn.net`, `sssrr.org`)
   - Content-Type match (`video/mp4` — even without `.mp4` extension)
   - Content-Length > 100KB (filters out thumbnails)
3. **Proxy Worker** adds the `Referer: https://mov18plus.cloud/` header that abysscdn requires — without this, MX Player/VLC/browser downloads fail with 403
4. **Premium Telegram buttons** with the proxy URL: ▶️ MX Player, ▶️ VLC, ▶️ Just Player, ▶️ MPV, ⬇️ Download

### 🎨 Premium Bot UI
- **Banner image** (webp) on `/start` — auto-uploaded to assets
- **Premium movie cards** with badges (4K, 1080P, ENG-Sub, Uncensored, etc.)
- **Rich inline keyboards** — every screen has navigation
- **Auto-remove** old messages (bot deletes previous pagination messages)
- **Haptic feedback** (via Mini App)
- **Stats dashboard** with bar charts

### 📱 Telegram Mini App
- **Full web app** at `/webapp/index.html`
- **TG WebApp SDK** — theme-aware, haptics, back button
- **Premium UI** — dark Netflix-grade theme, hero, grid, modal, player sheet
- **All bot features** — latest, search, movie details, watchlist

### 🌐 Cloudflare BD Edge
- Smart placement + Dhaka PoP caching
- Static assets: `immutable` (1 year)
- API: `s-maxage=600` (10 min edge cache)
- Images: `s-maxage=2592000` (30 days)

## 📦 What's Inside (Single Zip)

```
krx18-v6/
├── src/                          # Bot Worker (Cloudflare Worker)
│   ├── index.js                  # Entry + router + API endpoints
│   ├── config.js                 # Constants + env validation
│   ├── handlers/                 # start, latest, movie, direct, search, etc.
│   ├── middleware/               # auth, webhook
│   ├── parsers/                  # movieList, movieDetails
│   ├── services/                 # telegram, cache, github, stats
│   └── utils/                    # fetch, text, badges, players, logger, validate
├── extractor/                    # Puppeteer extractor (GitHub Actions)
│   ├── index.js                  # v6: auto-remove overlay + abysscdn capture + proxy URL
│   └── package.json
├── proxy/                        # Proxy Worker (separate Cloudflare Worker)
│   ├── index.js                  # Reverses-proxies video CDN URLs + adds Referer
│   └── wrangler.toml
├── webapp/                       # TG Mini App
│   ├── index.html                # Premium UI shell
│   ├── styles.css                # Dark theme, responsive, performance-first
│   ├── app.js                    # Vanilla JS app
│   └── manifest.json             # PWA manifest
├── assets/                       # 29 webp images (logo, banner, badges, icons, hero, splash, etc.)
├── .github/workflows/
│   └── extract-video.yml         # GitHub Actions workflow (Puppeteer)
├── wrangler.toml                 # Bot Worker config
├── package.json
├── .env.example
└── README.md                     # This file
```

## 🚀 Setup (3 Steps)

### Step 1 — Deploy the Proxy Worker
The proxy adds the `Referer` header that abysscdn requires for downloads.

```bash
cd proxy
npx wrangler deploy
# Note the URL: https://krx18-proxy.<your-subdomain>.workers.dev
```

### Step 2 — Deploy the Bot Worker

```bash
# Back to root
cd ..

# Set secrets
npx wrangler secret put BOT_TOKEN          # from @BotFather
npx wrangler secret put ADMIN_CHAT_ID      # your Telegram user ID
npx wrangler secret put GITHUB_TOKEN       # GitHub PAT with repo scope
npx wrangler secret put GITHUB_REPO        # e.g. yourname/krx18-extractor
npx wrangler secret put PROXY_WORKER_URL   # https://krx18-proxy.<your-subdomain>.workers.dev
npx wrangler secret put WEBAPP_URL         # https://krx18-bot.<your-subdomain>.workers.dev/webapp/index.html

# Optional: create KV namespace for caching + favorites
npx wrangler kv namespace create CACHE_KV
# Paste the ID into wrangler.toml, then:

# Deploy
npx wrangler deploy
# Note the URL: https://krx18-bot.<your-subdomain>.workers.dev
```

### Step 3 — One-Shot Bot Setup
Visit this URL in your browser (replace `<TOKEN>` and `<HOST>`):

```
https://<your-bot-worker>.workers.dev/setup?token=<BOT_TOKEN>&webhook=1
```

This automatically:
- Sets 9 bot commands (`/start`, `/latest`, `/search`, `/favs`, `/history`, `/stats`, `/settings`, `/request`, `/help`)
- Sets the bot name + description
- Sets the **menu button** to "🎬 Open Mini App" → opens your Mini App
- Sets the webhook

### Step 4 — Upload Extractor to GitHub

1. Create a GitHub repo (e.g. `krx18-extractor`)
2. Upload the `extractor/` folder + `.github/workflows/extract-video.yml`
3. Add repository secrets:
   - `BOT_TOKEN` — same as your worker
   - `PROXY_WORKER_URL` — same as your worker

### Step 5 — Test

1. Open your bot in Telegram
2. Send `/start` — see premium welcome with banner
3. Tap `🎬 Latest Movies` — see movie cards with badges
4. Tap any movie — see details + `▶️ Watch Online Direct (Server 1/2)`
5. Tap `▶️ Watch Online Direct (Server 2)` — Puppeteer auto-removes ads + captures abysscdn URL
6. After ~60s, the message edits with: `▶️ MX Player`, `▶️ VLC`, `⬇️ Download`
7. Tap `▶️ MX Player` — MX Player opens with the video (via proxy)
8. Or tap `⬇️ Download` — browser downloads the .mp4 (via proxy)
9. Tap the menu button (☰) — Mini App opens

## 🎯 How the Direct URL Extraction Works (v6)

```
User taps "▶️ Watch Online Direct (Server 2)"
  ↓
Bot Worker → GitHub Actions (repository_dispatch: extract_video)
  ↓
Puppeteer opens krx18.com/wp-json/dooplayer/v2/<postId>/movie/2
  → gets iframe URL: https://mov18plus.cloud/?v=kQ3QlRfg9
  ↓
Puppeteer opens the iframe
  → overrides window.open (fake popup → adblocker bypass)
  ↓
Puppeteer auto-clicks #overlay 3-5 times
  → each click opens a fake popup → overlay progresses
  → after 3 clicks, overlay is removed → JWPlayer loads
  ↓
Puppeteer captures network requests:
  → looks for content-type: video/mp4
  → looks for CDN domains: abysscdn.com, iamcdn.net, sssrr.org
  → captures: https://abysscdn.com/.../kQ3QlRfg9
  ↓
Puppeteer generates proxy URL:
  → https://krx18-proxy.xxx.workers.dev/proxy/<base64(cdn_url)>
  ↓
Puppeteer edits the Telegram message with:
  ▶️ MX Player (intent://<proxy-url>#Intent;package=com.mxtech.videoplayer.ad;end)
  ▶️ VLC (vlc://<proxy-url>)
  ▶️ Just Player (intent://...;package=com.brouken.player;end)
  ▶️ MPV (mpv://<proxy-url>)
  ⬇️ Download (<proxy-url>)
```

## 🛡 Why the Proxy is Required

`abysscdn.com` rejects direct downloads (HTTP 403) unless the request includes:
```
Referer: https://mov18plus.cloud/
Origin: https://mov18plus.cloud
```

MX Player, VLC, and browsers don't send that Referer, so direct downloads fail.
The Proxy Worker adds it transparently — all player buttons + download buttons
use the proxy URL.

## 📋 Commands

| Command | Description |
|---------|-------------|
| `/start` | Premium welcome with banner |
| `/latest [filter] [page]` | Latest Korean movies |
| `/search <query>` | Search movies |
| `/favs` | Your watchlist |
| `/history` | Recently viewed |
| `/stats` | Download stats |
| `/settings` | Bot settings |
| `/request <name>` | Request a movie |
| `/help` | Help message |

### Filters
`eng-sub`, `censored`, `uncensored`, `hd`, `korea`

## 🎨 Premium Badges

| Badge | Color | Example |
|-------|-------|---------|
| 🟪 4K | Purple | 4K UHD |
| 🟦 1080P | Blue | Full HD |
| 🟩 720P | Green | HD |
| 🟨 480P | Yellow | SD |
| 🔵 ENG | Blue | English subbed |
| 🟩 Uncensored | Green | Uncensored |
| 🟨 Censored | Yellow | Censored |

## 📊 Cost

| Resource | Free Tier | Usage |
|----------|-----------|-------|
| Cloudflare Workers | 100k req/day | ✅ |
| Cloudflare KV (optional) | 100k reads/day | ✅ |
| GitHub Actions (public repo) | Unlimited | ✅ |
| Telegram Bot API | Free | ✅ |
| **Total** | **$0** | ✅ |

## ⚠️ Legal Note

Personal use only. The bot is a link aggregator — it does not host any content.
Copyright is the user's responsibility.

## 🐛 Troubleshooting

### "No direct URL" in the Telegram message
- The Puppeteer extractor may have timed out — retry
- Try Server 1 instead of Server 2 (or vice versa)
- Check GitHub Actions logs for the extraction attempt

### Downloads fail with 403
- Make sure the Proxy Worker is deployed
- Make sure `PROXY_WORKER_URL` is set correctly in both the bot worker AND GitHub repo secrets
- The proxy URL in the Telegram button should start with `https://krx18-proxy.`

### Mini App doesn't open
- Make sure `WEBAPP_URL` is set correctly
- The URL must be `https://` (not `http://`)
- Visit the URL in a browser first to verify it loads

### Bot doesn't respond
- Check `/health` endpoint: `https://<worker>.workers.dev/health`
- Verify the webhook: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
- Check Worker logs: `npx wrangler tail`

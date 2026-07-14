# KRX18 Korea Bot v2 — Full Project Documentation

> Telegram bot for krx18.com Korean category — Cloudflare Workers + KV

---

## Project Info

| Field | Value |
|-------|-------|
| **Name** | `krx18-korea-bot` |
| **Version** | 2.0.0 |
| **Runtime** | Cloudflare Workers (ES Modules) |
| **Node.js** | Compatible via `nodejs_compat` flag |
| **Bot Username** | [@krx18exactorbot](https://t.me/krx18exactorbot) |
| **Worker URL** | `https://krx18-korea-bot.krx18bott.workers.dev` |
| **Source** | `https://github.com/khadimsorder1-max/krx18-extractor` |
| **Last Updated** | 2026-07-13 |

---

## Cloudflare Account

| Field | Value |
|-------|-------|
| **Email** | `khadimsorder@gmail.com` |
| **Account ID** | `1e25b0181d3dbbf168e8ec3f8fdda60c` |
| **Workers Subdomain** | `krx18bott` |

---

## Secrets (Set via `wrangler secret put <NAME>`)

> These are stored as Cloudflare Worker secrets (encrypted), NOT in any file.

| Secret | Value | Purpose |
|--------|-------|---------|
| `BOT_TOKEN` | `8866474167:AAHYFpd_JUbportB7X2AAopo6bwA9sskWkI` | Telegram Bot API token |
| `ADMIN_CHAT_ID` | `6771850412` | Admin Telegram user ID (auto-notify + requests) |
| `WEBHOOK_SECRET` | `9fad9b358f3238e6478705c1fe8cb4bff0c292606ff9aab7` | Webhook URL auth token |
| `ALLOWED_USERS` | _(not set — anyone can use)_ | Comma-separated Telegram user IDs |
| `GITHUB_TOKEN` | _(set)_ | GitHub PAT with repo scope |
| `GITHUB_REPO` | _(set)_ | `khadimsorder1-max/krx18-extractor` |

---

## KV Namespace

| Field | Value |
|-------|-------|
| **Binding** | `CACHE_KV` |
| **Namespace ID** | `a715f496734f4b7ebab429943b673553` |
| **Created On** | `khadimsorder@gmail.com` account |

### KV Keys Used

| Key Pattern | TTL | Purpose |
|-------------|-----|---------|
| `korea_latest_p{page}` | 30 min | Cached movie list per page |
| `movie:{slug}` | 2 hours | Movie details cache |
| `klist:{id}` | 30 min | Temporary slug list for callback_data |
| `fav:{userId}` | 1 year | User favorites |
| `dl:{userId}:{slug}` | 30 days | Download stats |
| `notify:last_seen` | 30 days | Last-seen slugs for auto-notify |

---

## Webhook

| Field | Value |
|-------|-------|
| **URL** | `https://krx18-korea-bot.krx18bott.workers.dev/webhook?token=9fad9b358f3238e6478705c1fe8cb4bff0c292606ff9aab7` |
| **Set via** | `https://api.telegram.org/bot<TOKEN>/setWebhook?url=...` |
| **SSL** | ✅ Verified |
| **Pending updates** | 0 |
| **Last error** | None |

---

## Cron Trigger

| Schedule | Purpose |
|----------|---------|
| `*/30 * * * *` | Auto-fetch latest movies, send new releases to admin |

---

## Bot Commands (Registered)

### Private Chat
```
start - শুরু করো
latest - Latest Korean movies
search - Search movies
movie - Movie details
fav - Add to favorites
favs - List favorites
unfav - Remove from favorites
request - Request a movie
stats - Download stats
```

### Group Chat
```
start - শুরু করো
latest - Latest Korean movies
search - Search movies
movie - Movie details
stats - Download stats
```

---

## Bot Description

- **Short**: `KRX18 Korea movie bot — search, download, favorites`
- **Full**: `KRX18.com Korea movies — browse latest, search, download links, favorites. Use /start to begin.`

---

## Project Structure

```
krx18-v2/
├── wrangler.toml              # Cloudflare Worker config
├── package.json               # Dependencies (dev only)
├── src/
│   ├── index.js               # Entry point + router (317 lines)
│   ├── config.js              # Constants + env validation (110 lines)
│   ├── handlers/
│   │   ├── start.js           # /start welcome message (32 lines)
│   │   ├── latest.js          # /latest gallery + pagination (148 lines)
│   │   ├── search.js          # /search gallery + inline mode (143 lines)
│   │   ├── movie.js           # Movie details + download links (114 lines)
│   │   ├── favorites.js       # /fav, /favs, /unfav (70 lines)
│   │   ├── similar.js         # Similar movies by genre (53 lines)
│   │   ├── request.js         # /request movie request (38 lines)
│   │   ├── stats.js           # /stats download stats (25 lines)
│   │   ├── notify.js          # Cron auto-notify (71 lines)
│   │   └── direct.js          # Direct stream (UNUSED, 65 lines)
│   ├── parsers/
│   │   ├── movieList.js       # HTML parser for movie lists (87 lines)
│   │   └── movieDetails.js    # HTML parser for movie details (182 lines)
│   ├── services/
│   │   ├── telegram.js        # Telegram Bot API client (86 lines)
│   │   ├── cache.js           # KV cache + favorites (93 lines)
│   │   ├── stats.js           # Download stats tracking (43 lines)
│   │   └── github.js          # GitHub API client (60 lines)
│   ├── middleware/
│   │   ├── auth.js            # User whitelist check (14 lines)
│   │   └── webhook.js         # Webhook secret check (10 lines)
│   └── utils/
│       ├── fetch.js           # HTTP fetch with retry + timeout (119 lines)
│       ├── text.js            # HTML escaping, base64, proxy (81 lines)
│       ├── validate.js        # URL/slug/callback validation (54 lines)
│       └── logger.js          # Structured logging (46 lines)
├── extractor/                 # Puppeteer extractor (unused by bot)
├── tests/                     # Unit tests
├── docs/                      # Architecture, deployment, troubleshooting
└── .github/workflows/         # GitHub Actions (unused by bot)
```

---

## Bot Features

### 1. `/latest` — Poster Gallery + Pagination
- Fetches `https://krx18.com/genre/korea/`
- Shows **10 poster images as swipeable gallery** (media group)
- Each poster caption: title, year, quality, genres, short synopsis
- Below gallery: numbered buttons (1️⃣-🔟) for movie details
- Pagination: ⬅️ Prev / Page N / Next ➡️
- Filters: `/latest eng-sub`, `/latest censored`, `/latest hd`

### 2. `/search <query>` — Poster Gallery
- Fetches `https://krx18.com/?s={query}`
- Same gallery format as `/latest`
- Numbered buttons for movie details

### 3. `/movie <slug>` — Movie Details
- Shows poster + rich info caption (title, country, quality, release, genres, cast, synopsis)
- Trailer button (if available)
- Download links with host selection
- "Similar Movies" + "Add to Favorites" buttons

### 4. `/fav <slug>` — Add to Favorites
### 5. `/favs` — List Favorites (with numbered buttons)
### 6. `/unfav <slug>` — Remove from Favorites
### 7. `/request <text>` — Send request to admin
### 8. `/stats` — Download statistics
### 9. Inline Mode — Search from any chat
### 10. Auto-Notify — New releases to admin every 30 min

---

## Key Technical Details

### Callback Data System
All inline buttons use **index-based callbacks** (not slugs) to stay within Telegram's 64-byte limit:

| Pattern | Used By | Example |
|---------|---------|---------|
| `movie:{page}:{index}` | /latest keyboard | `movie:1:3` |
| `mlist:{listId}:{index}` | Gallery numbered buttons | `mlist:lx7k2m:5` |
| `latest:{page}{:filter}` | Pagination buttons | `latest:2:eng-sub` |
| `similar:{listId}:0` | Similar movies button | `similar:lx7k2m:0` |
| `addfav:{listId}:0` | Add favorites button | `addfav:lx7k2m:0` |
| `noop` | No-op buttons | `noop` |

### Image Proxy
- Route: `/img/{b64url}` (URL-safe base64 encoded poster URL)
- 24h cache headers
- Used for all poster images in galleries to bypass CDN hotlink protection

### Poster URLs
- Source: `cdnupload.com/wp-content/uploads/...`
- Proxied through: `https://krx18-korea-bot.krx18bott.workers.dev/img/{b64}`

---

## Deploy Commands

```bash
# Install dependencies
npm install

# Login to Cloudflare
npx wrangler login

# Set secrets
npx wrangler secret put BOT_TOKEN
npx wrangler secret put ADMIN_CHAT_ID
npx wrangler secret put WEBHOOK_SECRET

# Set webhook
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://krx18-korea-bot.krx18bott.workers.dev/webhook?token=<SECRET>&allowed_updates=message,callback_query,inline_query"

# Deploy
npm run deploy

# View logs
npm run tail
```

---

## Known Issues

1. **`direct.js` handler exists but is NOT imported/called** — Direct Stream feature removed because krx18.com player has domain check + CryptoJS encryption
2. **GitHub Actions extractor** works (tested) but the bot doesn't call it anymore
3. **`ALLOWED_USERS` is not set** — anyone can use the bot (change if needed)

---

## Dependencies

### Worker (Runtime)
**None** — pure ES modules, no npm packages needed at runtime.

### Worker (Dev)
```json
{
  "@cloudflare/workers-types": "^4.20240101.0",
  "eslint": "^9.0.0",
  "prettier": "^3.2.0",
  "wrangler": "^3.50.0"
}
```

### Extractor (GitHub Actions)
```json
{
  "puppeteer": "^23.0.0",
  "puppeteer-extra": "^3.3.6",
  "puppeteer-extra-plugin-stealth": "^2.11.2",
  "puppeteer-extra-plugin-adblocker": "^2.13.3"
}
```

---

## GitHub Repository

| Field | Value |
|-------|-------|
| **Repo** | `khadimsorder1-max/krx18-extractor` |
| **Account** | `khadimsorder1-max` (GitHub) |
| **Workflow** | `.github/workflows/extract-video.yml` |
| **Status** | Working (tested) but not called by bot |

### GitHub Actions Secrets
```
BOT_TOKEN = 8866474167:AAHYFpd_JUbportB7X2AAopo6bwA9sskWkI
CHAT_ID = 6771850412
```

---

## Site Data Chain (krx18.com)

```
Genre Page (/genre/korea/)
  └── Article tags → poster, title, slug
       └── Movie Page (/movies/{slug}/)
            └── JSON-LD + HTML → details, downloads
                 └── Download URLs → k2s.cc / nitroflare / alterupload
```

- krx18.com has **double anti-bot protection**: domain check + CryptoJS encryption on player JS
- Worker bypasses this for **HTML scraping** (movie lists + details)
- Worker **cannot** extract video stream URLs (player blocks non-whitelisted origins)

---

## Change Log (Recent)

| Date | Change |
|------|--------|
| 2026-07-13 | Gallery UI upgrade (media group posters + numbered keyboard) |
| 2026-07-13 | Fixed oversized callback_data (64-byte limit) — all handlers |
| 2026-07-13 | Fixed search parser — search results missing `id="post-NNN"` |
| 2026-07-13 | Switched all handlers from MarkdownV2 to HTML parse_mode |
| 2026-07-13 | Removed Direct Stream feature (krx18 anti-bot too strong) |
| 2026-07-13 | Created GitHub repo `khadimsorder1-max/krx18-extractor` |
| 2026-07-13 | Migrated to new Cloudflare account (`khadimsorder@gmail.com`) |
| 2026-07-13 | Created `krx18bott` Workers subdomain |
| 2026-07-13 | Added centralized `esc()` HTML escape function |
| 2026-07-13 | Added `proxyPoster()` for CDN bypass |

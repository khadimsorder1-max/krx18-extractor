# Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Telegram User                            │
│  (sends /latest, taps buttons, clicks "Watch Online Direct")│
└──────────┬──────────────────────────────────────┬───────────┘
           │                                       │
           │ HTTPS webhook                         │ clicks URL
           ▼                                       ▼
┌─────────────────────────────┐         ┌─────────────────────┐
│   Cloudflare Worker (bot)   │         │  Browser / MX Player│
│  src/index.js (entry)       │         │  (opens .mp4 URL)   │
│                             │         └─────────────────────┘
│  ┌─────────────────────┐    │
│  │  middleware/         │    │
│  │   ├ auth.js         │    │
│  │   └ webhook.js      │    │
│  └─────────────────────┘    │
│  ┌─────────────────────┐    │
│  │  handlers/           │    │
│  │   ├ start.js        │    │
│  │   ├ latest.js       │    │
│  │   ├ search.js       │    │
│  │   ├ movie.js        │    │
│  │   ├ direct.js ──────┼────┼───► GitHub API (repository_dispatch)
│  │   ├ favorites.js    │    │
│  │   ├ similar.js      │    │
│  │   ├ request.js      │    │
│  │   ├ stats.js        │    │
│  │   └ notify.js (cron)│    │
│  └─────────────────────┘    │
│  ┌─────────────────────┐    │
│  │  services/           │    │
│  │   ├ telegram.js     │    │
│  │   ├ cache.js (KV)   │    │
│  │   ├ github.js       │    │
│  │   └ stats.js        │    │
│  └─────────────────────┘    │
│  ┌─────────────────────┐    │
│  │  parsers/            │    │
│  │   ├ movieList.js    │    │
│  │   └ movieDetails.js │    │
│  └─────────────────────┘    │
│  ┌─────────────────────┐    │
│  │  utils/              │    │
│  │   ├ fetch.js        │    │
│  │   ├ text.js         │    │
│  │   ├ validate.js     │    │
│  │   └ logger.js       │    │
│  └─────────────────────┘    │
│  config.js (constants)     │
└─────────────┬───────────────┘
              │
              │ fetch (krx18.com)
              ▼
┌─────────────────────────────┐
│   krx18.com (Dooplay theme) │
│   - /genre/korea/ listing   │
│   - /movies/<slug>/ details │
│   - /wp-json/dooplayer/v2/  │
└─────────────────────────────┘


                    ┌──────────────────────────────┐
                    │     GitHub Actions (Puppeteer) │
                    │     .github/workflows/         │
                    │     extract-video.yml          │
                    │                                │
                    │  ┌────────────────────────┐   │
                    │  │  extractor/             │   │
                    │  │   ├ index.js (main)    │   │
                    │  │   ├ browser.js         │   │
                    │  │   ├ capture.js         │   │
                    │  │   └ notify.js          │   │
                    │  └────────────────────────┘   │
                    │                                │
                    │  1. Launches Chromium          │
                    │     (stealth + adblocker)      │
                    │  2. Calls Dooplayer API        │
                    │  3. Opens iframe URL           │
                    │  4. Captures .mp4/.m3u8        │
                    │  5. Edits Telegram message     │
                    └──────────────────────────────┘
```

## Modules

### Worker (Cloudflare)

| Path | Responsibility |
|------|----------------|
| `src/index.js` | Entry, router, webhook handler |
| `src/config.js` | Constants + env validation |
| `src/middleware/auth.js` | User whitelist check |
| `src/middleware/webhook.js` | Webhook secret check |
| `src/handlers/start.js` | /start, /help |
| `src/handlers/latest.js` | /latest [filter] [page] |
| `src/handlers/search.js` | /search + inline mode |
| `src/handlers/movie.js` | Movie details + download buttons |
| `src/handlers/direct.js` | Watch Online Direct (triggers GitHub) |
| `src/handlers/favorites.js` | /fav, /favs, /unfav |
| `src/handlers/similar.js` | Same genre recommendations |
| `src/handlers/request.js` | /request → admin |
| `src/handlers/stats.js` | /stats |
| `src/handlers/notify.js` | Cron auto-notify |
| `src/services/telegram.js` | Bot API client |
| `src/services/cache.js` | KV cache + favorites |
| `src/services/github.js` | repository_dispatch |
| `src/services/stats.js` | Download counters |
| `src/parsers/movieList.js` | Listing page parser |
| `src/parsers/movieDetails.js` | Movie page + JSON-LD parser |
| `src/utils/fetch.js` | fetchText/Binary/Head with retry |
| `src/utils/text.js` | escapeMd, decodeEntities, b64 |
| `src/utils/validate.js` | URL/slug/filter validators |
| `src/utils/logger.js` | Structured logging |

### Extractor (GitHub Actions, Node.js)

| Path | Responsibility |
|------|----------------|
| `extractor/index.js` | Main entry — orchestrates extraction |
| `extractor/browser.js` | Puppeteer launch (stealth + adblocker) |
| `extractor/capture.js` | Network interception + JWPlayer eval |
| `extractor/notify.js` | Telegram sendMessage/editMessage |

## Data Flow

### Normal browsing

```
User → Worker /webhook → handleMessage → handleLatest
  → fetchText(krx18.com/genre/korea/) → parseMovieList
  → cache.setJson (KV) → sendMessage (Telegram)
```

### Movie details

```
User taps movie → handleMovieDetails
  → cache.getJson (KV) → if miss: fetchText(movie URL) → parseMovieDetails → cache
  → sendPhoto (poster + caption) → sendMessage (download buttons)
```

### Direct stream (GitHub Actions)

```
User taps "Watch Online Direct" → handleDirectStream
  → sendMessage ("⏳ processing") → dispatchEvent (GitHub API)
  → GitHub Action triggers → extractor/index.js runs
  → Puppeteer opens Chromium → calls Dooplayer API
  → opens iframe URL → captures .m3u8/.mp4 from network
  → editMessage (Telegram, with direct URL)
```

### Auto-notify (cron)

```
Cron fires (every 30 min) → handleScheduled
  → fetchText(krx18 homepage) → parseMovieList
  → getLastSeen (KV) → diff new vs seen
  → for each new movie: sendPhotoOrText to admin
  → setLastSeen (KV)
```

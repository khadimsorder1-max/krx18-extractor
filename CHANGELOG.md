# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [2.0.0] — 2026-07-13

### Added
- **Modular architecture**: split single-file worker into 18 modules across 6 folders
- **Config module** (`src/config.js`): central constants + env validation
- **Structured logger** (`src/utils/logger.js`): timestamps + request IDs + debug level
- **Validation utilities** (`src/utils/validate.js`): URL/slug/filter/page/callback validators
- **Service layer**: separate modules for Telegram, KV cache, GitHub dispatch, stats
- **Parser modules**: split movie list + movie details parsers
- **Middleware**: auth (whitelist) + webhook secret check
- **Unit tests**: 4 test files covering text utils, validators, config, parsers
- **ESLint + Prettier** configs
- **`.env.example`** with all env vars documented
- **`wrangler.toml`** with KV binding + cron trigger
- **Documentation**: ARCHITECTURE.md, DEPLOYMENT.md, TROUBLESHOOTING.md
- **GitHub Actions improvements**: npm cache, retry on failure, concurrency control
- **Extractor modularization**: split into browser.js, capture.js, notify.js, index.js
- **Image proxy** endpoint `/img/<b64>`
- **Health check** endpoint `/health` with JSON status

### Changed
- Default export moved from inline to `src/index.js`
- Constants moved from inline to `src/config.js`
- All `console.log` replaced with structured logger calls
- Fetch helper has retry with exponential backoff
- Cache TTLs centralized in config
- Movie caption truncation respects Telegram 1024-char limit
- Favorites list capped at 200 entries

### Fixed
- Cloudflare challenge detection (retry with movie page visit first)
- JSON-LD actor filtering (removes title repeats)
- Genre extraction uses only `<div class="sgeneros">` (not sidebar)
- Quality badge extraction has multiple fallback sources
- Webhook secret properly checked before processing update

### Removed
- Dead code from v1
- Duplicate fetch logic
- Inline constants scattered across file

## [1.0.0] — 2026-07-12

### Added
- Initial release
- Single-file Cloudflare Worker (~1000 lines)
- Movie list parser
- Movie details parser with JSON-LD
- Download button (newsmonth.today redirect)
- Watch Online Direct (GitHub Actions + Puppeteer)
- Favorites, similar movies, stats
- Auto-notify cron
- User whitelist
- Webhook secret
- Image proxy
- Health endpoint

# Troubleshooting

## Bot does not respond

### Check webhook is set

Open in browser:

```
https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

Look at:

- `url` — should be `https://<WORKER_URL>/webhook?token=<SECRET>`
- `last_error_message` — if present, that's the error
- `pending_update_count` — if > 0, messages are queuing

### Check Worker is up

Visit `https://<WORKER_URL>/health` → should return JSON with `status: "OK"`.

### Check Worker logs

```bash
wrangler tail
```

Then send `/start` to the bot — you should see incoming requests.

## "❌ অনুমতি নেই" (Permission denied)

`ALLOWED_USERS` is set but your user ID is not in the list.

**Fix:**

```bash
wrangler secret put ALLOWED_USERS
# enter: 123456789,987654321  (your IDs, comma-separated)
```

Or remove the secret to allow anyone (not recommended):

```bash
wrangler secret delete ALLOWED_USERS
```

## Movie details show empty fields

This usually means krx18 changed their HTML structure.

### Debug

```bash
wrangler tail
```

Then tap a movie. Look for `[info] Fetching movie details` log.

### Fix

The parser lives in `src/parsers/movieDetails.js`. Update the regex patterns to match the new HTML structure. Common patterns:

- Title: `<h1>` tag
- Poster: `<div class="poster"><img src="...">` or JSON-LD `image` field
- Synopsis: `<div itemprop="description">` or JSON-LD `description`
- Genres: `<div class="sgeneros"><a>...</a></div>`

## "Watch Online Direct" button missing

You haven't configured GitHub.

**Fix:**

```bash
wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_REPO
wrangler deploy
```

## GitHub Action fails

### Check Action logs

GitHub repo → **Actions** tab → click failed run → expand logs.

### Common errors

| Error | Fix |
|-------|-----|
| `Could not extract post ID` | Movie URL malformed — check slug |
| `No embed_url for server 1` | Server 1 down — try Server 2 button |
| `Cloudflare challenge` | Stealth plugin outdated — update puppeteer-extra-plugin-stealth |
| `Timeout` | Increase timeout in `extractor/index.js` |
| `BOT_TOKEN not set` | Add `BOT_TOKEN` secret in GitHub repo settings |

### Test Action manually

GitHub repo → **Actions** → "Extract Video URL" → **Run workflow** → fill inputs.

## Auto-notify not working

### Check cron is enabled

```bash
wrangler deploy
# Look for: "cron triggers: */30 * * * *"
```

### Check ADMIN_CHAT_ID is set

```bash
wrangler secret list
# Should include ADMIN_CHAT_ID
```

### Check bot can message you

You must `/start` the bot first — otherwise Telegram blocks bot from messaging you.

## KV cache issues

### Clear cache

```bash
wrangler kv key list --binding CACHE_KV
wrangler kv key delete --binding CACHE_KV <key>
```

### Disable cache temporarily

Edit `src/services/cache.js` → make `getJson` always return null → redeploy.

## Rate limits

### Cloudflare Workers

- Free: 100,000 requests/day
- If exceeded: upgrade to Workers Paid ($5/month, 10M requests)

### Telegram Bot API

- 30 messages/sec to different chats
- 1 message/sec to same chat
- If exceeded: 429 Too Many Requests → back off

### GitHub Actions

- Public repo: unlimited minutes
- Private repo: 2000 min/month free
- API: 5000 requests/hour per token

## Performance tuning

- Reduce `CACHE_TTL` in `src/config.js` for fresher data (more fetches)
- Increase `CACHE_TTL` for less fetching (staler data)
- Tune `MOVIES_PER_PAGE` (default 10) — Telegram inline keyboards support up to 8 columns × ~12 rows

## Still stuck?

1. Check Worker logs: `wrangler tail`
2. Check Action logs: GitHub → Actions tab
3. Check webhook: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
4. Visit `/health` endpoint for status
5. Enable debug logging: `wrangler secret put DEBUG` → value `1`

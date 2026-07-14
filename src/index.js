/**
 * KRX18 Premium Bot v6 — Worker entry point + router.
 *
 * Routes:
 *   /webhook        → Telegram webhook
 *   /health         → health check
 *   /img/<b64>      → image proxy
 *   /setup          → one-shot bot setup (commands, menu, webhook)
 *   /webapp.html    → Telegram Mini App
 *   /api/...        → API endpoints for Mini App
 *   /               → status page
 */
import { CONSTANTS, validateEnv, FILTERS } from "./config.js";
import { newReqId, info, error } from "./utils/logger.js";
import { fetchBinary, fetchText } from "./utils/fetch.js";
import { b64decode } from "./utils/text.js";

import { checkWebhookSecret } from "./middleware/webhook.js";
import { checkUser } from "./middleware/auth.js";
import { safeCallback } from "./utils/validate.js";

import { handleStart, handleHelp, handleSettings } from "./handlers/start.js";
import { handleLatest } from "./handlers/latest.js";
import { handleSearch, handleInline } from "./handlers/search.js";
import { handleMovieDetails } from "./handlers/movie.js";
import { handleDirectStream } from "./handlers/direct.js";
import { handleAddFavorite, handleListFavorites, handleRemoveFavorite } from "./handlers/favorites.js";
import { handleSimilar } from "./handlers/similar.js";
import { handleRequest } from "./handlers/request.js";
import { handleStats } from "./handlers/stats.js";
import { handleHistory } from "./handlers/history.js";
import { handleScheduled } from "./handlers/notify.js";
import { sendMessage, answerCallback, setMyCommands, setChatMenuButton, setWebhook } from "./services/telegram.js";

import { parseMovieList, filterMovies } from "./parsers/movieList.js";
import { parseMovieDetails } from "./parsers/movieDetails.js";
import { cache } from "./services/cache.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const reqId = newReqId();
    const { config } = validateEnv(env);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    try {
      if (url.pathname === "/webhook") {
        if (!checkWebhookSecret(config, request)) return new Response("Forbidden", { status: 403 });
        return await handleWebhook(request, env, config, url, reqId);
      }
      if (url.pathname === "/health") return handleHealth(env, config);
      if (url.pathname === "/setup") return handleSetup(request, env, config, url);

      const imgMatch = url.pathname.match(/^\/img\/([A-Za-z0-9_-]+)$/);
      if (imgMatch) return handleImageProxy(imgMatch[1], config);

      // API endpoints for Mini App
      if (url.pathname === "/api/latest") return handleApiLatest(env, config, url);
      if (url.pathname === "/api/movie") return handleApiMovie(env, config, url);
      if (url.pathname === "/api/search") return handleApiSearch(env, config, url);
      if (url.pathname === "/api/cache_stream") return handleApiCacheStream(request, env, config);
      if (url.pathname === "/api/extract") return handleApiExtract(request, env, config, url, reqId, ctx);

      if (url.pathname === "/" || url.pathname === "") return handleStatusPage(url, env, config);
      if (url.pathname === "/webapp.html" && env.ASSETS) return env.ASSETS.fetch(`https://${url.host}/index.html`);
      return new Response(JSON.stringify({ ok: false, error: "Not found" }), {
        status: 404, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    } catch (e) {
      error("Unhandled error", { path: url.pathname, error: String(e) }, reqId);
      return new Response(JSON.stringify({ ok: false, error: "Internal error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  },

  async scheduled(event, env, ctx) {
    const { config } = validateEnv(env);
    ctx.waitUntil(handleScheduled(config));
  },
};

// ─── Webhook ────────────────────────────────────────────────────────
async function handleWebhook(request, env, config, url, reqId) {
  if (!config.botToken) return new Response("BOT_TOKEN not set", { status: 500 });
  let update;
  try { update = await request.json(); }
  catch { return new Response("Invalid JSON", { status: 400 }); }

  if (update.inline_query) {
    await handleInline(config, update.inline_query);
    return new Response("OK");
  }

  if (update.callback_query) {
    const cq = update.callback_query;
    const data = safeCallback(cq.data);
    const chatId = cq.message?.chat?.id;
    const { allowed, userId } = checkUser(config, cq.from);
    if (!data) { await answerCallback(config.botToken, cq.id, "❌ Invalid"); return new Response("OK"); }
    if (!allowed) { await answerCallback(config.botToken, cq.id, "❌ অনুমতি নেই"); return new Response("OK"); }
    if (data === "noop") { await answerCallback(config.botToken, cq.id, ""); return new Response("OK"); }
    if (data === "home") { await answerCallback(config.botToken, cq.id, "🏠"); await handleStart(config, chatId); return new Response("OK"); }
    if (data === "help") { await answerCallback(config.botToken, cq.id, "❓"); await handleHelp(config, chatId); return new Response("OK"); }
    if (data === "settings") { await answerCallback(config.botToken, cq.id, "⚙️"); await handleSettings(config, chatId, userId); return new Response("OK"); }
    if (data === "favs") { await answerCallback(config.botToken, cq.id, "⭐"); await handleListFavorites(config, chatId, userId); return new Response("OK"); }
    if (data === "history") { await answerCallback(config.botToken, cq.id, "🕐"); await handleHistory(config, chatId, userId, reqId); return new Response("OK"); }
    if (data === "stats") { await answerCallback(config.botToken, cq.id, "📊"); await handleStats(config, chatId, userId); return new Response("OK"); }

    await answerCallback(config.botToken, cq.id, "⏳ লোড হচ্ছে...");

    try {
      if (data.startsWith("latest:")) {
        const parts = data.split(":");
        const page = parseInt(parts[1], 10) || 1;
        const filter = parts[2] || null;
        await handleLatest(config, chatId, page, filter, reqId);
      } else if (data.startsWith("movie:")) {
        await handleMovieDetails(config, chatId, data.split(":")[1], userId, reqId);
      } else if (data.startsWith("similar:")) {
        await handleSimilar(config, chatId, data.split(":")[1], reqId);
      } else if (data.startsWith("addfav:")) {
        const parts = data.split(":");
        await handleAddFavorite(config, chatId, parts[1], parts.slice(2).join(":"), userId);
      } else if (data.startsWith("direct:")) {
        const parts = data.split(":");
        await handleDirectStream(config, chatId, parts[1], parts[2] || "1", userId, reqId);
      }
    } catch (e) {
      error("Callback failed", { data, error: String(e) }, reqId);
    }
    return new Response("OK");
  }

  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const { allowed, userId, username } = checkUser(config, msg.from);
    const text = msg.text || "";
    if (!allowed) { await sendMessage(config.botToken, chatId, "❌ অনুমতি নেই"); return new Response("OK"); }
    try { await handleMessage(config, chatId, text, userId, username, reqId); }
    catch (e) { error("Message handler failed", { text: text.slice(0, 100), error: String(e) }, reqId); }
  }
  return new Response("OK");
}

async function handleMessage(config, chatId, text, userId, username, reqId) {
  if (text.startsWith("/start")) { await handleStart(config, chatId); }
  else if (text.startsWith("/help")) { await handleHelp(config, chatId); }
  else if (text.startsWith("/settings")) { await handleSettings(config, chatId, userId); }
  else if (text.startsWith("/latest")) {
    const { page, filter } = parseLatestArgs(text);
    await handleLatest(config, chatId, page, filter, reqId);
  }
  else if (text.startsWith("/search ")) { await handleSearch(config, chatId, text.slice("/search ".length).trim(), reqId); }
  else if (text.startsWith("/movie ")) {
    const url = text.slice("/movie ".length).trim();
    const slug = url.replace(/\/$/, "").split("/").pop();
    await handleMovieDetails(config, chatId, slug, userId, reqId);
  }
  else if (text.startsWith("/favs")) { await handleListFavorites(config, chatId, userId); }
  else if (text.startsWith("/history")) { await handleHistory(config, chatId, userId, reqId); }
  else if (text.startsWith("/stats")) { await handleStats(config, chatId, userId); }
  else if (text.startsWith("/request ")) { await handleRequest(config, chatId, text.slice("/request ".length).trim(), userId, username); }
  else if (text.startsWith("/unfav ")) {
    const slug = text.slice("/unfav ".length).trim().replace(/\/$/, "").split("/").pop();
    await handleRemoveFavorite(config, chatId, slug, userId);
  }
  else if (text.trim().length > 1) { await handleSearch(config, chatId, text.trim(), reqId); }
}

function parseLatestArgs(text) {
  const parts = text.split(/\s+/);
  let page = 1, filter = null;
  for (let i = 1; i < parts.length; i++) {
    const arg = parts[i].toLowerCase();
    if (/^\d+$/.test(arg)) page = parseInt(arg, 10);
    else if (FILTERS.has(arg)) filter = arg;
  }
  return { page, filter };
}

// ─── Image proxy ────────────────────────────────────────────────────
async function handleImageProxy(b64, config) {
  let url;
  try { url = b64decode(b64); }
  catch { return new Response("Invalid", { status: 400 }); }
  const r = await fetchBinary(url, { Accept: "image/*" });
  if (!r.ok) return new Response("Fetch failed", { status: 502 });
  return new Response(r.body, {
    headers: {
      "Content-Type": r.contentType || "image/jpeg",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ─── API endpoints for Mini App ─────────────────────────────────────
const JSON_HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

function jsonResponse(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });
}

async function handleApiLatest(env, config, url) {
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const filter = (url.searchParams.get("filter") || "").trim() || null;
  try {
    const cacheKey = `latest_p${page}_${filter || "all"}`;
    let movies = await cache.getJson(config.cacheKv, cacheKey);
    if (!movies) {
      const target = page === 1 ? CONSTANTS.KRX_KOREA : `${CONSTANTS.KRX_KOREA}page/${page}/`;
      const r = await fetchText(target);
      if (!r.ok) return jsonResponse({ ok: false, error: "Source fetch failed" }, 502);
      movies = parseMovieList(r.text);
      if (filter) movies = filterMovies(movies, filter);
      await cache.setJson(config.cacheKv, cacheKey, movies, CONSTANTS.CACHE_TTL);
    }
    return jsonResponse({ ok: true, items: movies, page, filter, hasMore: movies.length >= 10 }, 200, { "Cache-Control": "public, max-age=120, s-maxage=600" });
  } catch (e) {
    return jsonResponse({ ok: false, error: "API error: " + String(e).slice(0, 100) }, 500);
  }
}

async function handleApiMovie(env, config, url) {
  const slug = (url.searchParams.get("slug") || "").trim();
  if (!slug) return jsonResponse({ ok: false, error: "Missing slug" }, 400);
  try {
    const cacheKey = `movie:${slug}`;
    let details = await cache.getJson(config.cacheKv, cacheKey);
    if (!details) {
      const r = await fetchText(`${CONSTANTS.KRX_BASE}/movies/${slug}/`);
      if (!r.ok) return jsonResponse({ ok: false, error: "Movie fetch failed" }, 502);
      details = parseMovieDetails(r.text);
      details.movieUrl = `${CONSTANTS.KRX_BASE}/movies/${slug}/`;
      await cache.setJson(config.cacheKv, cacheKey, details, CONSTANTS.CACHE_TTL * 4);
    }
    let streamUrl = null;
    if (config.cacheKv) {
      streamUrl = await config.cacheKv.get(`stream:${slug}`);
      if (streamUrl && config.proxyWorkerUrl) {
        const b64 = btoa(streamUrl).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        streamUrl = `${config.proxyWorkerUrl.replace(/\/$/, "")}/proxy/${b64}`;
      }
    }
    return jsonResponse({ ok: true, ...details, streamUrl }, 200, { "Cache-Control": "public, max-age=300, s-maxage=1800" });
  } catch (e) {
    return jsonResponse({ ok: false, error: "Movie API error: " + String(e).slice(0, 100) }, 500);
  }
}

async function handleApiSearch(env, config, url) {
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return jsonResponse({ ok: true, items: [] });
  try {
    const cacheKey = `search:${q.toLowerCase()}`;
    let movies = await cache.getJson(config.cacheKv, cacheKey);
    if (!movies) {
      const r = await fetchText(`${CONSTANTS.KRX_BASE}/?s=${encodeURIComponent(q)}`);
      if (!r.ok) return jsonResponse({ ok: false, error: "Search fetch failed" }, 502);
      movies = parseMovieList(r.text);
      await cache.setJson(config.cacheKv, cacheKey, movies, CONSTANTS.CACHE_TTL);
    }
    return jsonResponse({ ok: true, items: movies, q, hasMore: false }, 200, { "Cache-Control": "public, max-age=120, s-maxage=600" });
  } catch (e) {
    return jsonResponse({ ok: false, error: "Search API error: " + String(e).slice(0, 100) }, 500);
  }
}

// ─── Setup ──────────────────────────────────────────────────────────
async function handleSetup(request, env, config, url) {
  const token = url.searchParams.get("token");
  if (!token) return jsonResponse({ ok: false, error: "Missing ?token= param" }, 401);
  const host = url.host;
  const webAppUrl = config.webappUrl || `https://${host}/webapp.html`;
  const webhookUrl = config.webhookSecret
      ? `https://${host}/webhook?token=${config.webhookSecret}`
      : `https://${host}/webhook`;
  const results = {};
  const COMMANDS = [
    { command: "start", description: "🚀 Start / welcome" },
    { command: "help", description: "❓ Help & commands" },
    { command: "latest", description: "🎬 Latest Korean movies" },
    { command: "search", description: "🔍 Search — /search <query>" },
    { command: "favs", description: "⭐ Your watchlist" },
    { command: "history", description: "🕐 Recently viewed" },
    { command: "stats", description: "📊 Download stats" },
    { command: "settings", description: "⚙️ Settings" },
    { command: "request", description: "📝 Request a movie" },
  ];
  results.commands = await setMyCommands(token, COMMANDS);
  results.menu_button = await setChatMenuButton(token, {
    type: "web_app", text: "🎬 Open Mini App", web_app: { url: webAppUrl },
  });
  if (url.searchParams.get("webhook") === "1") {
    results.webhook = await setWebhook(token, webhookUrl, config.webhookSecret);
  }
  results.bot_info = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json()).catch(() => null);
  return new Response(JSON.stringify({ ok: true, results, webAppUrl, webhookUrl }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Health ─────────────────────────────────────────────────────────
function handleHealth(env, config) {
  return new Response(JSON.stringify({
    status: "OK", timestamp: new Date().toISOString(),
    bot: "KRX18 Premium Bot v6", kv: !!config.cacheKv,
    admin: !!config.adminChatId, github: !!(config.githubToken && config.githubRepo),
    proxy: !!config.proxyWorkerUrl, webapp: !!config.webappUrl,
    allowed: config.allowedUsers ? config.allowedUsers.length : "anyone",
  }, null, 2), { headers: { "Content-Type": "application/json" } });
}

// ─── Status page ────────────────────────────────────────────────────
function handleStatusPage(url, env, config) {
  const wh = config.webhookSecret ? `?token=${config.webhookSecret}` : "";
  return new Response(
    `🎬 KRX18 Premium Bot v6\n\n` +
    `BOT_TOKEN: ${config.botToken ? "✅" : "❌"}\n` +
    `Admin: ${config.adminChatId ? "✅" : "❌"}\n` +
    `KV: ${config.cacheKv ? "✅" : "❌"}\n` +
    `GitHub: ${config.githubToken && config.githubRepo ? "✅" : "❌"}\n` +
    `Proxy: ${config.proxyWorkerUrl ? "✅" : "❌"}\n` +
    `Mini App: ${config.webappUrl ? "✅" : "❌"}\n\n` +
    `Setup: https://${url.host}/setup?token=<TOKEN>&webhook=1\n` +
    `Webhook: https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://${url.host}/webhook${wh}\n` +
    `Mini App: https://${url.host}/webapp.html`,
    { headers: { "Content-Type": "text/plain" } }
  );
}

// ─── API cache_stream / extract ──────────────────────────────────────
async function handleApiCacheStream(request, env, config) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || authHeader !== `Bearer ${config.botToken}`) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }
  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: "Invalid JSON" }, 400); }

  const { slug, streamUrl } = body;
  if (!slug || !streamUrl) return jsonResponse({ ok: false, error: "Missing parameters" }, 400);

  if (config.cacheKv) {
    await config.cacheKv.put(`stream:${slug}`, streamUrl, { expirationTtl: 60 * 60 * 24 });
  }
  return jsonResponse({ ok: true });
}

async function handleApiExtract(request, env, config, url, reqId, ctx) {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ ok: false, error: "Invalid JSON" }, 400); }

  const { slug, userId, server } = body;
  if (!slug) return jsonResponse({ ok: false, error: "Missing slug" }, 400);

  const targetServer = server || "2";
  const chatId = userId || config.adminChatId;
  const workerUrl = `${url.protocol}//${url.host}`;

  ctx.waitUntil(handleDirectStream(config, chatId, slug, targetServer, userId, reqId, workerUrl));
  return jsonResponse({ ok: true });
}


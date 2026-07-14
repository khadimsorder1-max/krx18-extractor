/**
 * KRX18 Premium Bot v6 — Configuration
 */

export const CONSTANTS = {
  KRX_BASE: "https://krx18.com",
  KRX_KOREA: "https://krx18.com/genre/korea/",
  USER_AGENT:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",

  // Cache TTLs (seconds)
  CACHE_TTL: 1800,                  // 30 min
  HOT_CACHE_TTL: 600,               // 10 min
  FAV_TTL: 60 * 60 * 24 * 365,
  STATS_TTL: 60 * 60 * 24 * 30,
  HISTORY_TTL: 60 * 60 * 24 * 30,
  URL_CACHE_TTL: 1800,              // extracted direct URLs cached 30 min

  // Timeouts
  FETCH_TIMEOUT_MS: 12000,
  FETCH_RETRIES: 2,
  FETCH_RETRY_BASE_MS: 500,
  HEAD_TIMEOUT_MS: 8000,
  IMG_TIMEOUT_MS: 15000,

  // Telegram
  TG_API_BASE: "https://api.telegram.org/bot",

  // GitHub
  GH_API_BASE: "https://api.github.com",
  GH_API_VERSION: "2022-11-28",

  // UI
  MOVIES_PER_PAGE: 10,
  MAX_FAVS: 200,
  MAX_HISTORY: 50,
  MAX_REQUEST_TEXT: 500,
  MAX_SYNOPSIS_LEN: 400,
  MAX_CAPTION_LEN: 1024,

  MAX_PAGINATION_DEPTH: 100,
};

export const KNOWN_HOSTS = [
  "newsmonth", "k2s.cc", "nitroflare.com", "alterupload.com",
  "keep2share", "rapidgator", "fileboom",
];

export const FILTERS = new Set([
  "eng-sub", "engsub", "censored", "uncensored", "hd", "korea",
]);

export function validateEnv(env = {}) {
  const required = ["BOT_TOKEN"];
  const missing = required.filter((k) => !env[k]);
  const config = {
    botToken: env.BOT_TOKEN,
    adminChatId: env.ADMIN_CHAT_ID,
    webhookSecret: env.WEBHOOK_SECRET,
    allowedUsers: env.ALLOWED_USERS
      ? env.ALLOWED_USERS.split(",").map((s) => s.trim()).filter(Boolean)
      : null,
    githubToken: env.GITHUB_TOKEN,
    githubRepo: env.GITHUB_REPO,
    cacheKv: env.CACHE_KV || null,
    proxyWorkerUrl: env.PROXY_WORKER_URL || "",  // e.g. https://krx18-proxy.xxx.workers.dev
    webappUrl: env.WEBAPP_URL || "",             // e.g. https://krx18-bot.xxx.workers.dev/webapp.html
  };
  return { ok: missing.length === 0, missing, config };
}

export function isUserAllowed(config, userId) {
  if (!config.allowedUsers) return true;
  if (!userId) return false;
  return config.allowedUsers.includes(String(userId));
}

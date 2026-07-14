/**
 * Fetch helper with retry + timeout + browser-like headers.
 */
import { CONSTANTS } from "../config.js";

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const BROWSER_HEADERS = {
  "User-Agent": CONSTANTS.USER_AGENT,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

export async function fetchText(url, options = {}) {
  const {
    headers = {},
    timeoutMs = CONSTANTS.FETCH_TIMEOUT_MS,
    retries = CONSTANTS.FETCH_RETRIES,
    accept,
    referer,
  } = options;

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        headers: {
          ...BROWSER_HEADERS,
          ...(accept ? { Accept: accept } : {}),
          ...(referer ? { Referer: referer, "Sec-Fetch-Site": "same-origin" } : {}),
          ...headers,
        },
        signal: ctrl.signal,
        redirect: "follow",
        cf: { cacheTtl: 60, cacheEverything: true, scrapeShield: false },
      });
      if (!r.ok) {
        if (attempt < retries && r.status >= 500) {
          await sleep(CONSTANTS.FETCH_RETRY_BASE_MS * (attempt + 1));
          continue;
        }
        return { ok: false, status: r.status, text: "" };
      }
      return { ok: true, status: r.status, text: await r.text() };
    } catch (e) {
      lastErr = String(e);
      clearTimeout(t);
      if (attempt < retries) {
        await sleep(CONSTANTS.FETCH_RETRY_BASE_MS * (attempt + 1));
        continue;
      }
      return { ok: false, status: 0, text: "", error: lastErr };
    } finally {
      clearTimeout(t);
    }
  }
  return { ok: false, status: 0, text: "", error: lastErr };
}

export async function fetchBinary(url, options = {}) {
  const { headers = {}, timeoutMs = 15000, referer } = options;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: {
        ...BROWSER_HEADERS,
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
        ...(referer ? { Referer: referer } : {}),
        ...headers,
      },
      signal: ctrl.signal,
      redirect: "follow",
      cf: { cacheTtl: 3600, cacheEverything: true, scrapeShield: false },
    });
    if (!r.ok) return { ok: false, status: r.status, body: null, contentType: "" };
    const body = await r.arrayBuffer();
    return { ok: true, status: r.status, body, contentType: r.headers.get("Content-Type") || "" };
  } catch (e) {
    return { ok: false, status: 0, body: null, contentType: "", error: String(e) };
  } finally {
    clearTimeout(t);
  }
}

export async function fetchHead(url, options = {}) {
  const { headers = {}, timeoutMs = CONSTANTS.HEAD_TIMEOUT_MS, referer } = options;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: "GET",
      headers: {
        ...BROWSER_HEADERS,
        Range: "bytes=0-0",
        ...(referer ? { Referer: referer } : {}),
        ...headers,
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
    return {
      ok: r.ok,
      status: r.status,
      contentType: r.headers.get("Content-Type") || "",
      contentRange: r.headers.get("Content-Range") || "",
      contentLength: r.headers.get("Content-Length") || "",
    };
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  } finally {
    clearTimeout(t);
  }
}

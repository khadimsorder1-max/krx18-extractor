/**
 * KRX18 Video Proxy Worker
 * ========================
 *
 * Reverses-proxies video CDN URLs and adds the Referer header that the CDN requires.
 *
 * Why: abysscdn.com / iamcdn.net reject direct downloads (403) unless the Referer
 *      is https://mov18plus.cloud/. MX Player, VLC, and browsers don't send that
 *      Referer, so downloads fail. This proxy adds it transparently.
 *
 * Usage:
 *   GET https://<this-worker>/proxy/<base64url-encoded-video-url>
 *
 * Setup:
 *   1. Deploy this as a separate Cloudflare Worker (e.g. krx18-proxy)
 *   2. Set the worker URL as PROXY_WORKER_URL secret in your bot worker + GitHub repo
 *   3. The Puppeteer extractor auto-generates proxy URLs for the Telegram buttons
 *
 * The proxy:
 *   - Streams the response (no buffering — supports range requests for seeking)
 *   - Adds CORS headers (so the Mini App can fetch)
 *   - Caches at the edge (s-maxage=86400)
 *   - Only allows known CDN hosts (abysscdn, iamcdn, sssrr, etc.)
 */

const ALLOWED_HOSTS = [
  "abysscdn.com",
  "iamcdn.net",
  "sssrr.org",
  "tapecontent.net",
  "mov18plus.cloud",
  "krx18.com",
];

const REFERER_MAP = {
  "abysscdn.com": "https://mov18plus.cloud/",
  "iamcdn.net": "https://mov18plus.cloud/",
  "sssrr.org": "https://mov18plus.cloud/",
  "tapecontent.net": "https://mov18plus.cloud/",
  "mov18plus.cloud": "https://krx18.com/",
  "krx18.com": "https://krx18.com/",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
};

function corsResponse(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: { "Content-Type": typeof body === "string" ? "text/plain" : "application/octet-stream", ...CORS_HEADERS, ...extra },
  });
}

function corsJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function isHostAllowed(host) {
  const h = host.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => h === allowed || h.endsWith("." + allowed));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Health check
    if (url.pathname === "/" || url.pathname === "/health") {
      return corsJson({
        ok: true,
        service: "krx18-proxy",
        version: "2.0.0",
        timestamp: new Date().toISOString(),
      });
    }

    // Proxy route: /proxy/<base64url>
    const m = url.pathname.match(/^\/proxy\/([A-Za-z0-9_-]+)$/);
    if (!m) {
      return corsJson({ ok: false, error: "Not found. Use /proxy/<base64url-encoded-url>" }, 404);
    }

    let targetUrl;
    try {
      let b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      targetUrl = atob(b64);
    } catch {
      return corsJson({ ok: false, error: "Invalid base64" }, 400);
    }

    if (!/^https?:\/\//.test(targetUrl)) {
      return corsJson({ ok: false, error: "Invalid URL" }, 400);
    }

    let targetHost;
    try { targetHost = new URL(targetUrl).hostname.replace(/^www\./, ""); }
    catch { return corsJson({ ok: false, error: "Invalid URL" }, 400); }

    if (!isHostAllowed(targetHost)) {
      return corsJson({ ok: false, error: `Host not allowed: ${targetHost}` }, 403);
    }

    const referer = REFERER_MAP[targetHost] || "https://krx18.com/";

    const upstreamHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": referer,
      "Origin": "https://mov18plus.cloud",
    };

    const range = request.headers.get("Range");
    if (range) upstreamHeaders["Range"] = range;

    try {
      const upstreamResp = await fetch(targetUrl, {
        headers: upstreamHeaders,
        redirect: "follow",
        cf: { cacheTtl: 86400, cacheEverything: true, scrapeShield: false },
      });

      const respHeaders = new Headers();
      for (const h of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "Last-Modified", "ETag"]) {
        const v = upstreamResp.headers.get(h);
        if (v) respHeaders.set(h, v);
      }
      respHeaders.set("Access-Control-Allow-Origin", "*");
      respHeaders.set("Access-Control-Allow-Headers", "*");
      respHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
      respHeaders.set("Cache-Control", "public, max-age=86400, s-maxage=86400");
      respHeaders.set("X-Proxy-Host", targetHost);

      return new Response(upstreamResp.body, {
        status: upstreamResp.status,
        statusText: upstreamResp.statusText,
        headers: respHeaders,
      });
    } catch (e) {
      return corsJson({ ok: false, error: `Upstream fetch failed: ${e.message}` }, 502);
    }
  },
};

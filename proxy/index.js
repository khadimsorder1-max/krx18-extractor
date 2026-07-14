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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Health check
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({
        ok: true,
        service: "krx18-proxy",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
      }), { headers: { "Content-Type": "application/json" } });
    }

    // Proxy route: /proxy/<base64url>
    const m = url.pathname.match(/^\/proxy\/([A-Za-z0-9_-]+)$/);
    if (!m) {
      return new Response("Not found. Use /proxy/<base64url-encoded-url>", { status: 404 });
    }

    let targetUrl;
    try {
      // base64url decode
      let b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      targetUrl = atob(b64);
    } catch {
      return new Response("Invalid base64", { status: 400 });
    }

    if (!/^https?:\/\//.test(targetUrl)) {
      return new Response("Invalid URL", { status: 400 });
    }

    // Check if host is allowed
    let targetHost;
    try { targetHost = new URL(targetUrl).hostname.replace(/^www\./, ""); }
    catch { return new Response("Invalid URL", { status: 400 }); }

    const isAllowed = ALLOWED_HOSTS.some((h) => targetHost.includes(h));
    if (!isAllowed) {
      return new Response(`Host not allowed: ${targetHost}`, { status: 403 });
    }

    // Determine the right Referer
    const referer = REFERER_MAP[targetHost] || "https://krx18.com/";

    // Build the upstream request — pass through Range header for seeking
    const upstreamHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": referer,
      "Origin": "https://mov18plus.cloud",
    };

    // Pass through Range header (for video seeking)
    const range = request.headers.get("Range");
    if (range) upstreamHeaders["Range"] = range;

    try {
      const upstreamResp = await fetch(targetUrl, {
        headers: upstreamHeaders,
        redirect: "follow",
        cf: {
          cacheTtl: 86400,
          cacheEverything: true,
          scrapeShield: false,
        },
      });

      // Build the response — stream it through
      const respHeaders = new Headers();
      // Pass through content-type, content-length, content-range, accept-ranges
      for (const h of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "Last-Modified", "ETag"]) {
        const v = upstreamResp.headers.get(h);
        if (v) respHeaders.set(h, v);
      }
      // CORS + cache
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
      return new Response(`Upstream fetch failed: ${e.message}`, { status: 502 });
    }
  },
};

/**
 * KRX18 Extractor v6 — Auto-Remove Overlay + abysscdn Capture + Proxy URL
 * =====================================================================
 *
 * What's new in v6:
 *   1. Auto-remove ad overlay — Puppeteer auto-clicks the #overlay until it's gone
 *      (mimics the UC Browser flow the user discovered: tap video → UC player opens → download works)
 *   2. Captures abysscdn.com / iamcdn.net / sssrr.org URLs (content-type: video/mp4)
 *   3. Generates PROXY URL for MX Player/VLC (proxy adds Referer: https://mov18plus.cloud/)
 *      Without the proxy, abysscdn rejects direct downloads (403) because the Referer is missing.
 *   4. Premium Telegram message with image banner + rich buttons
 *   5. Auto-fallback: Server 2 → Server 1 → newsmonth file host
 *
 * Flow:
 *   1. Extract post_id from movie URL
 *   2. Call Dooplayer API → iframe URL (mov18plus.cloud for Server 2)
 *   3. Open iframe in Puppeteer
 *   4. Override window.open (fake popup → adblocker bypass)
 *   5. Auto-click #overlay 3-5 times → overlay removed
 *   6. JWPlayer loads video from abysscdn.com
 *   7. Capture abysscdn URL from network (content-type: video/mp4)
 *   8. Generate proxy URL: https://<PROXY_WORKER>/proxy/<base64(cdn_url)>
 *   9. Edit Telegram message with result:
 *      [▶️ MX Player] [▶️ VLC] [▶️ Just Player] [▶️ MPV]
 *      [⬇️ Download] [📋 Copy URL]
 *      [🌐 Browser] [🔗 Alt URL]
 */

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const AdblockerPlugin = require("puppeteer-extra-plugin-adblocker");

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

// ─── Config ─────────────────────────────────────────────────────
const MOVIE_URL = process.env.MOVIE_URL;
const NEWSMONTH_URL = process.env.NEWSMONTH_URL || "";
const SERVER = process.env.SERVER || "2";
const MESSAGE_ID = process.env.MESSAGE_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const PROXY_WORKER_URL = process.env.PROXY_WORKER_URL || "";

const OVERALL_TIMEOUT_MS = 8 * 60 * 1000;

// CDN domains that serve the actual video
const CDN_DOMAINS = /(?:abysscdn\.com|sssrr\.org|tapecontent\.net|iamcdn\.net|edge\.|stream\.|cdn\.)/i;
const VIDEO_EXT_RE = /\.(mp4|m3u8|mkv|webm|ts|avi|mov)(\?|$)/i;
const FILE_HOST_RE = /(?:k2s\.cc|nitroflare|alterupload|1fichier|keep2share|rapidgator|flash-files|torupload)/i;

// ─── Telegram ───────────────────────────────────────────────────
async function tgSend(text, extra = {}) {
  if (!BOT_TOKEN || !CHAT_ID) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, ...extra }),
    });
    return await r.json();
  } catch (e) { console.error("tgSend:", e.message); return null; }
}

async function tgEdit(messageId, text, extra = {}) {
  if (!BOT_TOKEN || !CHAT_ID || !messageId) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, message_id: parseInt(messageId, 10), text, ...extra }),
    });
    return await r.json();
  } catch (e) { console.error("tgEdit:", e.message); return null; }
}

async function tgSendPhoto(photo, caption, extra = {}) {
  if (!BOT_TOKEN || !CHAT_ID) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, photo, caption, ...extra }),
    });
    return await r.json();
  } catch (e) { console.error("tgSendPhoto:", e.message); return null; }
}

// ─── Helpers ────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function getHost(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "unknown"; } }
function escHtml(s) { if (!s) return ""; return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function safeUrl(url, maxLen = 500) { return url && url.length > maxLen ? url.substring(0, maxLen) : url; }

function b64encode(s) {
  return Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeProxyUrl(cdnUrl) {
  if (!PROXY_WORKER_URL) return cdnUrl;
  const b64 = b64encode(cdnUrl);
  return `${PROXY_WORKER_URL}/proxy/${b64}`;
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  console.log("=== KRX18 Extractor v6 ===");
  console.log(`Movie: ${MOVIE_URL}`);
  console.log(`Server: ${SERVER}`);
  console.log(`Proxy: ${PROXY_WORKER_URL || "(none)"}`);

  if (!MOVIE_URL) { console.error("MOVIE_URL not set"); process.exit(1); }

  const procMsg = await tgSend(
    `⏳ <b>ভিডিও URL বের করা হচ্ছে...</b>\n\n🔄 Browser খোলা হচ্ছে...\n⏱️ 40-90s`,
    { parse_mode: "HTML" }
  );
  const procMsgId = procMsg?.result?.message_id || MESSAGE_ID;

  const timeoutId = setTimeout(async () => {
    console.error("Timeout!");
    await tgEdit(procMsgId, `⚠️ <b>Timeout!</b>\n\n🔗 <a href="${escHtml(MOVIE_URL)}">ব্রাউজারে খুলুন</a>`, { parse_mode: "HTML" }).catch(() => {});
    process.exit(1);
  }, OVERALL_TIMEOUT_MS);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
      "--disable-gpu", "--mute-audio", "--disable-popup-blocking",
      "--disable-blink-features=AutomationControlled", "--window-size=1280,720",
    ],
  });

  const results = { downloadUrls: [], streamUrls: [] };

  try {
    // Step 1: newsmonth 3-click (if URL provided)
    if (NEWSMONTH_URL) {
      await tgEdit(procMsgId, `⏳ <b>Step ১/৩: Download Link</b>\n\n🔄 newsmonth 3-click...`, { parse_mode: "HTML" });
      results.downloadUrls = await extractFromNewsmonth(browser, NEWSMONTH_URL);
      console.log(`Download URLs: ${results.downloadUrls.length}`);
    }

    // Step 2: Dooplayer → Server 2 → abysscdn CDN
    await tgEdit(procMsgId,
      `⏳ <b>Step ২/৩: Streaming</b>\n\n✅ Download: ${results.downloadUrls.length}\n🔄 Server ${SERVER} → CDN URL...`,
      { parse_mode: "HTML" }
    );

    let postId = null;
    const postIdM = MOVIE_URL.match(/\/movies\/(\d+)-/);
    if (postIdM) {
      postId = postIdM[1];
    } else {
      console.log("No post ID in URL, fetching page...");
      try {
        const page = await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
        await page.goto(MOVIE_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
        postId = await page.evaluate(() => {
          const el = document.querySelector("[data-post]");
          return el ? el.getAttribute("data-post") : null;
        });
        await page.close();
      } catch (e) { console.log(`Post ID extract: ${e.message}`); }
    }

    if (postId) {
      console.log(`Post ID: ${postId}`);
      let streamUrl = await tryDooplayer(browser, postId, MOVIE_URL, SERVER);
      if (!streamUrl) {
        console.log(`Server ${SERVER} failed, trying fallback...`);
        streamUrl = await tryDooplayer(browser, postId, MOVIE_URL, SERVER === "1" ? "2" : "1");
      }
      if (streamUrl) {
        results.streamUrls.push({ host: getHost(streamUrl), url: streamUrl });
        console.log(`✅ Stream URL: ${streamUrl}`);
      }
    }

    // Step 3: File host streaming
    if (results.downloadUrls.length > 0) {
      await tgEdit(procMsgId,
        `⏳ <b>Step ৩/৩: File Host</b>\n\n✅ Download: ${results.downloadUrls.length}\n✅ Stream: ${results.streamUrls.length}\n🔄 File host...`,
        { parse_mode: "HTML" }
      );
      for (const hostUrl of results.downloadUrls) {
        const sUrl = await extractStreamFromFileHost(browser, hostUrl);
        if (sUrl) {
          results.streamUrls.push({ host: getHost(hostUrl), url: sUrl });
          console.log(`✅ File host stream: ${sUrl}`);
        }
      }
    }

    await browser.close();
    clearTimeout(timeoutId);

    const hasAny = results.downloadUrls.length > 0 || results.streamUrls.length > 0;
    if (hasAny) {
      await sendResult(procMsgId, results);
    } else {
      await tgEdit(procMsgId, `⚠️ <b>URL বের করা যায়নি</b>\n\n🔗 <a href="${escHtml(MOVIE_URL)}">ব্রাউজারে খুলুন</a>`, { parse_mode: "HTML" });
    }
  } catch (err) {
    console.error("Fatal:", err);
    try { await browser.close(); } catch {}
    clearTimeout(timeoutId);
    await tgEdit(procMsgId, `❌ <b>Error:</b>\n<code>${escHtml(String(err.message).substring(0, 300))}</code>`, { parse_mode: "HTML" });
  }
}

// ═══ Dooplayer: Server → mov18plus → abysscdn ══════════════════
async function tryDooplayer(browser, postId, movieUrl, server) {
  const apiUrl = `https://krx18.com/wp-json/dooplayer/v2/${postId}/movie/${server}`;
  console.log(`Dooplayer API: ${apiUrl}`);

  const apiPage = await browser.newPage();
  await apiPage.setExtraHTTPHeaders({ Referer: movieUrl });
  let iframeUrl = null;
  try {
    const resp = await apiPage.goto(apiUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    try {
      const d = JSON.parse(await resp.text());
      iframeUrl = d.embed_url && d.embed_url !== "null" ? d.embed_url : null;
    } catch {
      console.log("API challenge, visiting movie page...");
      await apiPage.goto(movieUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
      await sleep(3000);
      const r = await apiPage.goto(apiUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
      const d = JSON.parse(await r.text());
      iframeUrl = d.embed_url && d.embed_url !== "null" ? d.embed_url : null;
    }
  } finally { await apiPage.close(); }

  if (!iframeUrl) { console.log(`Server ${server}: No iframe URL`); return null; }
  console.log(`Server ${server} iframe: ${iframeUrl}`);

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");

  // CRITICAL: Override window.open BEFORE page loads
  // This makes mov18plus think popups opened → overlay removed → JWPlayer loads
  await page.evaluateOnNewDocument(() => {
    const fakeWindow = { closed: false, focus: () => {}, close: () => {} };
    window.open = () => fakeWindow;
  });

  // Capture ALL video/CDN URLs from network
  const capturedUrls = [];
  page.on("response", (response) => {
    const url = response.url();
    const ct = response.headers()["content-type"] || "";

    if (VIDEO_EXT_RE.test(url) && !url.includes("favicon")) {
      console.log(`[VIDEO EXT] ${url}`);
      if (!capturedUrls.includes(url)) capturedUrls.push(url);
    }

    // Capture by content-type (video/mp4, video/x-matroska, etc.)
    // abysscdn URLs have NO .mp4 extension but content-type IS video/mp4
    if (ct.includes("video") || ct.includes("mpegurl") || ct.includes("octet-stream")) {
      const clHeader = response.headers()["content-length"];
      const cl = clHeader ? parseInt(clHeader, 10) : 0;
      if (!clHeader || cl > 100000) {
        console.log(`[VIDEO CT] ${url} (${ct}, ${cl || "chunked"})`);
        if (!capturedUrls.includes(url)) capturedUrls.push(url);
      }
    }

    // Capture by CDN domain
    if (CDN_DOMAINS.test(url) && !url.includes("favicon") && !url.includes(".css") && !url.includes(".js")) {
      console.log(`[CDN] ${url}`);
      if (!capturedUrls.includes(url)) capturedUrls.push(url);
    }
  });

  try {
    console.log("Opening iframe...");
    await page.goto(iframeUrl, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});

    // Wait for Cloudflare challenge
    console.log("Waiting for Cloudflare...");
    const start = Date.now();
    while (Date.now() - start < 20000) {
      const title = await page.title().catch(() => "");
      if (title && !title.toLowerCase().includes("just a moment") && !title.toLowerCase().includes("checking")) {
        console.log(`CF resolved (${Math.round((Date.now() - start) / 1000)}s)`);
        break;
      }
      await sleep(1000);
    }

    // ═══ AUTO-REMOVE AD OVERLAY (the key v6 feature) ════════════════
    // The mov18plus.cloud page has a #overlay that requires 3 clicks to remove.
    // With window.open override, each "click" opens a fake popup → overlay progresses.
    // After 3 successful "clicks", the overlay is removed and JWPlayer loads the video.
    console.log("═══ AUTO-REMOVING AD OVERLAY ═══");
    for (let i = 1; i <= 5; i++) {
      console.log(`Auto-click ${i}...`);
      try { await page.mouse.click(640, 360); } catch {}
      try { await page.click("#overlay").catch(() => {}); } catch {}
      await sleep(2000);

      // Check if overlay is gone (player should be loading)
      const overlayGone = await page.evaluate(() => !document.getElementById("overlay")).catch(() => false);
      if (overlayGone) {
        console.log(`✅ OVERLAY REMOVED after ${i} clicks! JWPlayer loading...`);
        break;
      }

      // Check if we already captured a URL (video started loading)
      if (capturedUrls.length > 0) {
        console.log(`✅ URL captured after ${i} clicks!`);
        break;
      }
    }

    // Wait for JWPlayer to load and start playing
    console.log("Waiting for JWPlayer to load video...");
    await sleep(8000);

    // Try clicking play button (sometimes needed)
    for (const sel of [".jw-icon.jw-icon-display", ".jw-display-icon-display", "#overlay", "video"]) {
      try { const el = await page.$(sel); if (el) { await el.click(); break; } } catch {}
    }
    await sleep(3000);

    // Method A: Check captured URLs (from network interception)
    if (capturedUrls.length > 0) {
      // Prefer abysscdn URLs (the actual video CDN)
      const cdnUrl = capturedUrls.find(u => CDN_DOMAINS.test(u));
      const mp4Url = capturedUrls.find(u => u.includes(".mp4"));
      const m3u8Url = capturedUrls.find(u => u.includes(".m3u8"));
      const best = cdnUrl || mp4Url || m3u8Url || capturedUrls[0];
      console.log(`✅ Captured: ${best}`);
      await page.close();
      return best;
    }

    // Method B: JWPlayer eval
    try {
      await page.waitForFunction(() => typeof jwplayer !== "undefined", { timeout: 15000 }).catch(() => {});
      const url = await page.evaluate(() => {
        try {
          const p = jwplayer();
          if (!p || !p.getPlaylist) return null;
          const pl = p.getPlaylist();
          if (!pl || pl.length === 0) return null;
          const item = pl[0];
          return item.file || (item.sources && item.sources[0] && item.sources[0].file) || null;
        } catch { return null; }
      });
      if (url && url.startsWith("http")) { console.log(`✅ JWPlayer: ${url}`); await page.close(); return url; }
    } catch (e) { console.log(`JWPlayer: ${e.message}`); }

    // Method C: Video element
    try {
      const src = await page.evaluate(() => {
        const v = document.querySelector("video");
        return v?.src || v?.querySelector("source")?.src || null;
      });
      if (src && src.startsWith("http")) { console.log(`✅ Video element: ${src}`); await page.close(); return src; }
    } catch {}

    // Method D: Extended wait + retry
    console.log("Extended wait (15s) + retry...");
    await sleep(15000);

    if (capturedUrls.length > 0) {
      const best = capturedUrls.find(u => CDN_DOMAINS.test(u)) || capturedUrls[0];
      console.log(`✅ Late capture: ${best}`);
      await page.close();
      return best;
    }

    await page.close();
    return null;
  } finally {
    try { await page.close(); } catch {}
  }
}

// ═══ newsmonth.today 3-click ═══════════════════════════════════
async function extractFromNewsmonth(browser, newsmonthUrl) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
  await page.evaluateOnNewDocument(() => {
    const fakeWindow = { closed: false, focus: () => {}, close: () => {} };
    window.open = () => fakeWindow;
  });

  const urls = [];
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const url = frame.url();
    if (FILE_HOST_RE.test(url) && !urls.includes(url)) urls.push(url);
  });
  page.on("response", (response) => {
    const url = response.url();
    if (FILE_HOST_RE.test(url) && !urls.includes(url)) urls.push(url);
  });
  const targetHandler = (target) => {
    const url = target.url();
    if (FILE_HOST_RE.test(url) && !urls.includes(url)) urls.push(url);
    target.page().then(p => p?.close().catch(() => {})).catch(() => {});
  };
  browser.on("targetcreated", targetHandler);

  try {
    await page.goto(newsmonthUrl, { waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
    await sleep(5000);
    for (let i = 1; i <= 5; i++) {
      try { await page.mouse.click(640, 360); } catch {}
      try { await page.click("#overlay").catch(() => {}); } catch {}
      await sleep(2000);
      if (urls.length > 0) break;
    }
    if (urls.length === 0) {
      try { const html = await page.content(); const m = html.match(/https?:\/\/[^"'\s<>]*(?:k2s\.cc|nitroflare|alterupload|1fichier|keep2share|flash-files|torupload)[^"'\s<>]*/gi); if (m) urls.push(...m); } catch {}
    }
  } finally {
    browser.removeAllListeners("targetcreated");
    try { await page.close(); } catch {}
  }
  return [...new Set(urls)].filter(u => FILE_HOST_RE.test(u));
}

// ═══ File host → streaming URL ═════════════════════════════════
async function extractStreamFromFileHost(browser, hostUrl) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
  await page.evaluateOnNewDocument(() => {
    const fakeWindow = { closed: false, focus: () => {}, close: () => {} };
    window.open = () => fakeWindow;
  });

  const videoUrls = [];
  page.on("response", (response) => {
    const url = response.url();
    const ct = response.headers()["content-type"] || "";
    if (VIDEO_EXT_RE.test(url) && !url.includes("favicon") && !videoUrls.includes(url)) videoUrls.push(url);
    if (CDN_DOMAINS.test(url) && !url.includes("favicon") && !url.includes(".css") && !url.includes(".js") && !videoUrls.includes(url)) videoUrls.push(url);
    if (ct.includes("video") || ct.includes("mpegurl") || ct.includes("octet-stream")) {
      const clHeader = response.headers()["content-length"];
      const cl = clHeader ? parseInt(clHeader, 10) : 0;
      if ((!clHeader || cl > 100000) && !videoUrls.includes(url)) videoUrls.push(url);
    }
  });

  try {
    await page.goto(hostUrl, { waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
    await sleep(3000);
    for (const sel of [".play-btn", "[class*='play']", "video", ".video-player", "#player", "a[download]", "a[href*='dl=1']"]) {
      try { const el = await page.$(sel); if (el) { await el.click(); break; } } catch {}
    }
    await sleep(5000);
  } finally { try { await page.close(); } catch {} }

  return videoUrls[0] || null;
}

// ═══ Send premium result with image + buttons ══════════════════
async function sendResult(messageId, results) {
  const { downloadUrls, streamUrls } = results;

  let msg = `✅ <b>URLs Found!</b>\n\n`;

  if (streamUrls.length > 0) {
    msg += `▶️ <b>Streaming URLs:</b>\n`;
    for (const s of streamUrls) {
      const displayUrl = PROXY_WORKER_URL ? makeProxyUrl(s.url) : s.url;
      msg += `<code>${escHtml(safeUrl(displayUrl))}</code> (${s.host})\n`;
    }
    msg += `\n`;
  }

  if (downloadUrls.length > 0) {
    msg += `⬇️ <b>Download URLs:</b>\n`;
    for (const u of downloadUrls.slice(0, 3)) {
      msg += `<code>${escHtml(safeUrl(u))}</code>\n`;
    }
  }

  if (PROXY_WORKER_URL && streamUrls.length > 0) {
    msg += `\n💡 <b>MX Player এ চালানোর নিয়ম:</b>\n`;
    msg += `1. Proxy URL copy করুন\n`;
    msg += `2. MX Player → Network Stream → Paste → Play\n`;
    msg += `3. অথবা নিচের ▶️ MX Player button চাপুন\n`;
  } else if (streamUrls.length > 0) {
    msg += `\n💡 <b>MX Player:</b> URL copy → Network Stream → Paste\n`;
  }

  const keyboard = [];

  // Premium player buttons — use PROXY URL if configured
  if (streamUrls.length > 0) {
    const bestStream = streamUrls[0].url;
    const playUrl = PROXY_WORKER_URL ? makeProxyUrl(bestStream) : bestStream;
    const cleanUrl = playUrl.replace(/^https?:\/\//, "");

    keyboard.push([
      { text: "▶️ MX Player", url: safeUrl(`intent://${cleanUrl}#Intent;package=com.mxtech.videoplayer.ad;end`, 400) },
      { text: "▶️ VLC", url: safeUrl(`vlc://${playUrl}`) },
    ]);
    keyboard.push([
      { text: "▶️ Just Player", url: safeUrl(`intent://${cleanUrl}#Intent;package=com.brouken.player;end`, 400) },
      { text: "▶️ MPV", url: safeUrl(`mpv://${playUrl}`) },
    ]);
    keyboard.push([{ text: "⬇️ Download (Browser)", url: safeUrl(playUrl) }]);
  }

  // Download buttons
  for (const u of downloadUrls.slice(0, 3)) {
    keyboard.push([{ text: `⬇️ ${getHost(u)}`, url: safeUrl(u) }]);
  }

  // Alt streaming
  if (streamUrls.length > 1) {
    const altUrl = PROXY_WORKER_URL ? makeProxyUrl(streamUrls[1].url) : streamUrls[1].url;
    keyboard.push([{ text: `▶️ Alt (${streamUrls[1].host})`, url: safeUrl(altUrl) }]);
  }

  // Open in browser (fallback)
  keyboard.push([{ text: "🌐 Open Movie Page", url: safeUrl(MOVIE_URL) }]);

  await tgEdit(messageId, msg, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: keyboard },
  });
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });

/**
 * KRX18 Extractor v5 — Upgraded
 * ============================================
 *
 * Upgrades from v4.1:
 *   - Puppeteer 25 (newer Chromium, better Cloudflare bypass)
 *   - headless: true (new API, not 'new')
 *   - Request interception (capture video URLs before they load)
 *   - Step-by-step Telegram status (3-4 steps with progress)
 *   - Better error context (sends error to Telegram with details)
 *   - Cleaner code structure
 *
 * Flow (3-4 steps):
 *   Step 1: newsmonth.today → 3-click → k2s.cc/nitroflare/alterupload URLs
 *   Step 2: Open each file host → capture streaming .mp4 URL
 *   Step 3: Dooplayer API → JWPlayer → .m3u8 URL (backup)
 *   Step 4: Send ALL URLs to Telegram (streaming + download + player buttons)
 *
 * 10 bugs fixed from v4 carried over.
 */

// ─── Global error handlers ─────────────────────────────────────
process.on("unhandledRejection", (reason, promise) => {
  console.error("UNHANDLED REJECTION:", reason instanceof Error ? reason.message : reason);
  console.error("Stack:", reason instanceof Error ? reason.stack : "");
});
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err.message);
  console.error("Stack:", err.stack);
});

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const AdblockerPlugin = require("puppeteer-extra-plugin-adblocker");

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

// ─── Config ─────────────────────────────────────────────────────

const MOVIE_URL = process.env.MOVIE_URL;
const NEWSMONTH_URL = process.env.NEWSMONTH_URL || "";
const SERVER = process.env.SERVER || "1";
const MESSAGE_ID = process.env.MESSAGE_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const FILE_HOST_RE = /(?:k2s\.cc|nitroflare|alterupload|1fichier|keep2share|rapidgator)/i;
const VIDEO_EXT_RE = /\.(mp4|m3u8|mkv|webm|ts|avi|mov)(\?|$)/i;
const OVERALL_TIMEOUT_MS = 9 * 60 * 1000;

// ─── Telegram ───────────────────────────────────────────────────

async function tgSend(text, extra = {}) {
  if (!BOT_TOKEN || !CHAT_ID) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, ...extra }),
    });
    return await r.json();
  } catch (e) {
    console.error("tgSend:", e.message);
    return null;
  }
}

async function tgEdit(messageId, text, extra = {}) {
  if (!BOT_TOKEN || !CHAT_ID || !messageId) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        message_id: parseInt(messageId, 10),
        text,
        ...extra,
      }),
    });
    return await r.json();
  } catch (e) {
    console.error("tgEdit:", e.message);
    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function escHtml(s) {
  if (!s) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeUrl(url, maxLen = 500) {
  if (!url) return url;
  return url.length > maxLen ? url.substring(0, maxLen) : url;
}

// ─── Browser Launch ─────────────────────────────────────────────

async function launchBrowser() {
  return puppeteer.launch({
    headless: true, // Puppeteer 25: use `true` not `"new"`
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--mute-audio",
      "--disable-popup-blocking",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--window-size=1280,720",
    ],
  });
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log("=== KRX18 Extractor v5.1 ===");
  console.log(`Movie: ${MOVIE_URL}`);
  console.log(`Newsmonth: ${NEWSMONTH_URL || "(none)"}`);
  console.log(`Server: ${SERVER}`);

  if (!MOVIE_URL) {
    console.error("MOVIE_URL not set");
    process.exit(1);
  }

  // Use Worker's message ID if available (edit Worker's "Processing..." message)
  // Otherwise send our own processing message
  let procMsgId = MESSAGE_ID;
  if (!procMsgId) {
    const procMsg = await tgSend(
      `⏳ <b>ভিডিও URL বের করা হচ্ছে...</b>\n\n` +
      `🔄 Browser খোলা হচ্ছে...\n` +
      `⏱️ সময় লাগবে ৪০-৯০ সেকেন্ড`,
      { parse_mode: "HTML" }
    );
    procMsgId = procMsg?.result?.message_id;
  }

  // Overall timeout — avoids process.exit(1) which masks real errors
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    console.error("Overall timeout reached (9 min)!");
    tgEdit(
      procMsgId,
      `⚠️ <b>Timeout!</b>\n\n৯ মিনিটে URL বের করা যায়নি।\n` +
      `🔗 <a href="${escHtml(MOVIE_URL)}">ব্রাউজারে খুলুন</a>`,
      { parse_mode: "HTML" }
    ).catch(() => {});
  }, OVERALL_TIMEOUT_MS);

  const browser = await launchBrowser();
  const results = { downloadUrls: [], streamUrls: [] };

  try {
    if (timedOut) return;
    // ─── Step 1: newsmonth 3-click → file host URLs ───
    if (NEWSMONTH_URL) {
      await tgEdit(
        procMsgId,
        `⏳ <b>Step ১/৩: Download Link</b>\n\n` +
        `🔄 newsmonth.today ৩-click bypass...\n` +
        `⏱️ ১৫-২০s অপেক্ষা করুন`,
        { parse_mode: "HTML" }
      );
      console.log("\n--- Step 1: newsmonth.today ---");
      results.downloadUrls = await extractFromNewsmonth(browser, NEWSMONTH_URL);
      console.log(`File host URLs: ${results.downloadUrls.length}`);
    }

    // ─── Step 2: File host → streaming URL ───
    if (results.downloadUrls.length > 0) {
      await tgEdit(
        procMsgId,
        `⏳ <b>Step ২/৩: Streaming URL</b>\n\n` +
        `✅ Download: ${results.downloadUrls.length} hosts\n` +
        `🔄 Streaming URL বের করা হচ্ছে...\n` +
        `⏱️ ১৫-২০s`,
        { parse_mode: "HTML" }
      );
      console.log("\n--- Step 2: File host streaming ---");
      for (const hostUrl of results.downloadUrls) {
        const streamUrl = await extractStreamFromFileHost(browser, hostUrl);
        if (streamUrl) {
          results.streamUrls.push({ host: getHost(hostUrl), url: streamUrl });
          console.log(`✅ Stream from ${getHost(hostUrl)}: ${streamUrl}`);
        }
      }
    }

    // ─── Step 3: Dooplayer streaming ───
    await tgEdit(
      procMsgId,
      `⏳ <b>Step ৩/৩: JWPlayer</b>\n\n` +
      `✅ Download: ${results.downloadUrls.length}\n` +
      `✅ Stream: ${results.streamUrls.length}\n` +
      `🔄 Dooplayer JWPlayer...\n` +
      `⏱️ ১৫-২০s`,
      { parse_mode: "HTML" }
    );
    console.log("\n--- Step 3: Dooplayer ---");
    // Extract post ID — handle BOTH URL formats:
    // Format 1: /movies/85947-slug/ (post ID in URL)
    // Format 2: /movies/slug/ (NO post ID — fetch page and extract from data-post)
    let postId = null;
    const postIdM = MOVIE_URL.match(/\/movies\/(\d+)-/);
    if (postIdM) {
      postId = postIdM[1];
      console.log(`Post ID from URL: ${postId}`);
    } else {
      // Fetch movie page and extract data-post='XXXXX'
      console.log("No post ID in URL, fetching page to extract...");
      try {
        const page = await browser.newPage();
        await page.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        );
        await page.goto(MOVIE_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
        postId = await page.evaluate(() => {
          const el = document.querySelector("[data-post]");
          return el ? el.getAttribute("data-post") : null;
        });
        await page.close();
        console.log(`Post ID from page: ${postId}`);
      } catch (e) {
        console.log(`Failed to extract post ID: ${e.message}`);
      }
    }

    if (postId) {
      const dpUrl = await extractDooplayerStream(browser, postId, MOVIE_URL, SERVER);
      if (dpUrl) {
        results.streamUrls.push({ host: "playkrx18", url: dpUrl });
        console.log(`✅ Dooplayer: ${dpUrl}`);
      }
    } else {
      console.log("❌ Could not find post ID — skipping Dooplayer");
    }

    await browser.close();
    clearTimeout(timeoutId);

  // ─── Step 4: Send result ───
  const hasAny = results.downloadUrls.length > 0 || results.streamUrls.length > 0;
  if (hasAny) {
    if (procMsgId) {
      await sendResult(procMsgId, results);
    } else {
      // No message to edit — send new message with results
      await sendNewResult(results);
    }
  } else {
    if (procMsgId) {
      await tgEdit(
        procMsgId,
        `⚠️ <b>URL বের করা যায়নি</b>\n\n` +
        `কারণ: সব method fail করেছে\n\n` +
        `🔗 <a href="${escHtml(MOVIE_URL)}">ব্রাউজারে খুলুন</a>`,
        { parse_mode: "HTML" }
      );
    } else {
      await tgSend(
        `⚠️ <b>URL বের করা যায়নি</b>\n\n` +
        `🔗 <a href="${escHtml(MOVIE_URL)}">ব্রাউজারে খুলুন</a>`,
        { parse_mode: "HTML" }
      );
    }
  }
  } catch (err) {
    console.error("Fatal:", err);
    try { await browser.close(); } catch {}
    clearTimeout(timeoutId);
    await tgEdit(
      procMsgId,
      `❌ <b>Error:</b>\n<code>${escHtml(String(err.message).substring(0, 300))}</code>\n\n` +
      `🔗 <a href="${escHtml(MOVIE_URL)}">ব্রাউজারে খুলুন</a>`,
      { parse_mode: "HTML" }
    );
  }
}

// ═══ Step 1: newsmonth.today 3-click ═══════════════════════════

async function extractFromNewsmonth(browser, newsmonthUrl) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  );

  const urls = [];

  // BUG FIX 2: Only main frame
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const url = frame.url();
    console.log(`[NAV] ${url}`);
    if (FILE_HOST_RE.test(url) && !urls.includes(url)) urls.push(url);
  });

  page.on("response", (response) => {
    const url = response.url();
    if (FILE_HOST_RE.test(url) && !urls.includes(url)) {
      console.log(`[HOST] ${url}`);
      urls.push(url);
    }
  });

  // BUG FIX 1: Named listener for cleanup
  const targetHandler = (target) => {
    const url = target.url();
    console.log(`[POPUP] ${url}`);
    if (FILE_HOST_RE.test(url) && !urls.includes(url)) urls.push(url);
    target.page().then((p) => p?.close().catch(() => {})).catch(() => {});
  };
  browser.on("targetcreated", targetHandler);

  try {
    console.log(`Opening: ${newsmonthUrl}`);
    await page.goto(newsmonthUrl, { waitUntil: "networkidle2", timeout: 30000 }).catch((e) => {
      console.log(`Page load: ${e.message}`);
    });
    await sleep(5000);

    console.log("3-click flow...");
    for (let i = 1; i <= 5; i++) {
      console.log(`Click ${i}...`);
      try { await page.mouse.click(640, 360); } catch {}
      try { await page.click("#overlay").catch(() => {}); } catch {}
      await sleep(2000);

      if (urls.length > 0) { console.log(`✅ Found after ${i} clicks!`); break; }

      // BUG FIX 5: try-catch for cross-origin
      try {
        const found = await page.evaluate(() => {
          return Array.from(document.querySelectorAll("a[href]"))
            .map((a) => a.href)
            .filter((h) => /k2s\.cc|nitroflare|alterupload|1fichier|keep2share/i.test(h));
        });
        if (found.length > 0) { urls.push(...found); console.log(`✅ In page after ${i} clicks!`); break; }
      } catch (e) {
        console.log(`Page eval (cross-origin?): ${e.message}`);
      }
    }

    // BUG FIX 5: try-catch for content()
    if (urls.length === 0) {
      try {
        const html = await page.content();
        const m = html.match(/https?:\/\/[^"'\s<>]*(?:k2s\.cc|nitroflare|alterupload|1fichier|keep2share)[^"'\s<>]*/gi);
        if (m) urls.push(...m);
      } catch (e) {
        console.log(`content() failed: ${e.message}`);
      }
    }

    // Check all browser pages
    for (const p of await browser.pages()) {
      try {
        const url = p.url();
        if (FILE_HOST_RE.test(url) && !urls.includes(url)) urls.push(url);
      } catch {}
    }
  } finally {
    browser.removeAllListeners("targetcreated");
    try { await page.close(); } catch {}
  }

  return [...new Set(urls)].filter((u) => FILE_HOST_RE.test(u));
}

// ═══ Step 2: File host → streaming URL ═════════════════════════

async function extractStreamFromFileHost(browser, hostUrl) {
  const host = getHost(hostUrl);
  console.log(`Extracting stream from ${host}: ${hostUrl}`);

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.evaluateOnNewDocument(() => {
    const fakeWindow = { closed: false, focus: () => {}, close: () => {} };
    window.open = () => fakeWindow;
  });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  );

  const videoUrls = [];

  // Capture ALL video requests
  page.on("response", (response) => {
    const url = response.url();
    const ct = response.headers()["content-type"] || "";

    if (VIDEO_EXT_RE.test(url) && !url.includes("favicon")) {
      console.log(`[VIDEO] ${url}`);
      if (!videoUrls.includes(url)) videoUrls.push(url);
    }

    // BUG FIX 4: Safe content-length check
    if (ct.includes("video") || ct.includes("mpegurl") || ct.includes("octet-stream")) {
      const clHeader = response.headers()["content-length"];
      const cl = clHeader ? parseInt(clHeader, 10) : 0;
      if (!clHeader || cl > 100000) {
        console.log(`[VIDEO-CT] ${url} (${ct}, ${cl || "chunked"})`);
        if (!videoUrls.includes(url)) videoUrls.push(url);
      }
    }
  });

  try {
    await page.goto(hostUrl, { waitUntil: "networkidle2", timeout: 30000 }).catch((e) => {
      console.log(`Host page: ${e.message}`);
    });
    await sleep(3000);

    // ─── k2s.cc / keep2share ───
    if (host.includes("k2s") || host.includes("keep2share")) {
      console.log("k2s.cc: Looking for player...");
      for (const sel of [".play-btn", "[class*='play']", "video", ".video-player", "#player"]) {
        try { const el = await page.$(sel); if (el) { await el.click(); break; } } catch {}
      }
      await sleep(3000);
      try {
        const src = await page.evaluate(() => {
          const v = document.querySelector("video");
          if (v?.src) return v.src;
          if (v?.querySelector("source")) return v.querySelector("source").src;
          const player = document.querySelector("[data-video], [data-src], [data-file]");
          if (player) return player.getAttribute("data-video") || player.getAttribute("data-src") || player.getAttribute("data-file");
          return null;
        });
        if (src?.startsWith("http") && !videoUrls.includes(src)) videoUrls.push(src);
      } catch (e) { console.log(`k2s eval: ${e.message}`); }
    }

    // ─── alterupload / 1fichier ───
    if (host.includes("alterupload") || host.includes("1fichier")) {
      console.log("1fichier: Looking for download link...");
      try {
        const dlUrl = await page.evaluate(() => {
          const btn = document.querySelector("a[download], a[href*='dl=1'], a.btn-download, a[href*='/download']");
          if (btn) return btn.href;
          const links = Array.from(document.querySelectorAll("a[href]"));
          const dl = links.find((a) => a.href.includes("dl=1") || a.textContent.includes("Download"));
          return dl?.href || null;
        });
        if (dlUrl && !videoUrls.includes(dlUrl)) { console.log(`1fichier direct: ${dlUrl}`); videoUrls.push(dlUrl); }
      } catch (e) { console.log(`1fichier eval: ${e.message}`); }
      // BUG FIX 3: Handle both ? and no-? cases
      const directUrl = hostUrl.includes("?")
        ? hostUrl + (hostUrl.includes("dl=") ? "" : "&dl=1")
        : hostUrl + "?dl=1";
      if (!videoUrls.includes(directUrl)) videoUrls.push(directUrl);
    }

    // ─── nitroflare ───
    if (host.includes("nitroflare")) {
      console.log("nitroflare: Looking for player...");
      for (const sel of [".video-player", "video", "[class*='play']", "#player"]) {
        try { const el = await page.$(sel); if (el) { await el.click(); break; } } catch {}
      }
      await sleep(3000);
      try {
        const src = await page.evaluate(() => {
          const v = document.querySelector("video");
          return v?.src || v?.querySelector("source")?.src || null;
        });
        if (src?.startsWith("http") && !videoUrls.includes(src)) videoUrls.push(src);
      } catch (e) { console.log(`nitroflare eval: ${e.message}`); }
    }

    // Generic fallback
    await sleep(3000);
    if (videoUrls.length === 0) {
      try { await page.mouse.click(640, 360); } catch {}
      await sleep(3000);
    }
  } finally {
    try { await page.close(); } catch {}
  }

  const mp4 = videoUrls.find((u) => u.includes(".mp4"));
  const m3u8 = videoUrls.find((u) => u.includes(".m3u8"));
  return mp4 || m3u8 || videoUrls[0] || null;
}

// ═══ Step 3: Dooplayer streaming ═══════════════════════════════

async function extractDooplayerStream(browser, postId, movieUrl, server) {
  try {
    let url = await tryDooplayer(browser, postId, movieUrl, server);
    if (url) return url;
    return await tryDooplayer(browser, postId, movieUrl, server === "1" ? "2" : "1");
  } catch (e) {
    console.log(`Dooplayer: ${e.message}`);
    return null;
  }
}

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
  } finally {
    await apiPage.close();
  }

  if (!iframeUrl) { console.log(`Server ${server}: No iframe URL`); return null; }
  console.log(`Server ${server} iframe: ${iframeUrl}`);

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.evaluateOnNewDocument(() => {
    const fakeWindow = { closed: false, focus: () => {}, close: () => {} };
    window.open = () => fakeWindow;
  });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  );

  const videoUrls = [];
  page.on("response", (response) => {
    const url = response.url();
    const ct = response.headers()["content-type"] || "";
    if (VIDEO_EXT_RE.test(url) && !url.includes("favicon")) {
      if (!videoUrls.includes(url)) videoUrls.push(url);
    }
    if (ct.includes("video") || ct.includes("mpegurl")) {
      if (!videoUrls.includes(url)) videoUrls.push(url);
    }
  });

  try {
    await page.goto(iframeUrl, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});

    // Wait for Cloudflare
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

    // Click play
    for (const sel of [".jw-icon.jw-icon-display", ".jw-display-icon-display", "#overlay", "video"]) {
      try { const el = await page.$(sel); if (el) { await el.click(); break; } } catch {}
    }
    await sleep(3000);

    // JWPlayer eval
    try {
      await page.waitForFunction(() => typeof jwplayer !== "undefined" && typeof jwplayer().getPlaylist === "function", { timeout: 15000 }).catch(() => {});
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
      if (url && url.startsWith("http")) { console.log(`✅ JWPlayer: ${url}`); return url; }

      const src = await page.evaluate(() => {
        const v = document.querySelector("video");
        return v?.src || v?.querySelector("source")?.src || null;
      });
      if (src && src.startsWith("http")) { console.log(`✅ Video element: ${src}`); return src; }
    } catch (e) { console.log(`JWPlayer eval: ${e.message}`); }

    if (videoUrls.length > 0) {
      const best = videoUrls.find((u) => u.includes(".m3u8")) || videoUrls.find((u) => u.includes(".mp4")) || videoUrls[0];
      console.log(`✅ Captured: ${best}`);
      return best;
    }

    // Extended retry
    console.log("Extended retry...");
    await sleep(5000);
    try { await page.mouse.click(640, 360); } catch {}
    await sleep(3000);

    try {
      const url = await page.evaluate(() => {
        try {
          const p = jwplayer();
          const pl = p?.getPlaylist?.();
          if (pl?.[0]) return pl[0].file || pl[0].sources?.[0]?.file;
          const v = document.querySelector("video");
          return v?.src || null;
        } catch { return null; }
      });
      if (url && url.startsWith("http")) return url;
    } catch {}

    if (videoUrls.length > 0) {
      return videoUrls.find((u) => u.includes(".m3u8")) || videoUrls.find((u) => u.includes(".mp4")) || videoUrls[0];
    }

    return null;
  } finally {
    try { await page.close(); } catch {}
  }
}

// ─── Send result ────────────────────────────────────────────────

async function sendResult(messageId, results) {
  const { downloadUrls, streamUrls } = results;

  let msg = `✅ <b>URLs Found!</b>\n\n`;

  if (streamUrls.length > 0) {
    msg += `▶️ <b>Streaming URLs:</b>\n`;
    for (const s of streamUrls) {
      msg += `<code>${escHtml(safeUrl(s.url))}</code> (${s.host})\n`;
    }
    msg += `\n`;
  }

  if (downloadUrls.length > 0) {
    msg += `⬇️ <b>Download URLs:</b>\n`;
    for (const u of downloadUrls.slice(0, 3)) {
      msg += `<code>${escHtml(safeUrl(u))}</code>\n`;
    }
  }

  msg += `\n<b>🎬 MX Player এ চালানোর নিয়ম:</b>\n`;
  msg += `1. URL copy করুন\n`;
  msg += `2. MX Player → ☰ → Network Stream\n`;
  msg += `3. Paste → Play\n`;

  const keyboard = [];

  if (streamUrls.length > 0) {
    const bestStream = streamUrls[0].url;
    const cleanUrl = bestStream.replace(/^https?:\/\//, "");
    keyboard.push([
      { text: "▶️ MX Player", url: safeUrl(`intent://${cleanUrl}#Intent;package=com.mxtech.videoplayer.ad;end`, 400) },
      { text: "▶️ VLC", url: safeUrl(`vlc://${bestStream}`) },
    ]);
    keyboard.push([{ text: "⬇️ Stream Download", url: safeUrl(bestStream) }]);
  }

  for (const u of downloadUrls.slice(0, 3)) {
    keyboard.push([{ text: `⬇️ ${getHost(u)}`, url: safeUrl(u) }]);
  }

  if (streamUrls.length > 1) {
    keyboard.push([{ text: `▶️ Alt (${streamUrls[1].host})`, url: safeUrl(streamUrls[1].url) }]);
  }

  if (keyboard.length === 0) {
    keyboard.push([{ text: "🌐 Open Movie", url: MOVIE_URL }]);
  }

  await tgEdit(messageId, msg, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: keyboard },
  });
}

// Send results as new message (when no Worker message to edit)
async function sendNewResult(results) {
  const { downloadUrls, streamUrls } = results;

  let msg = `✅ <b>URLs Found!</b>\n\n`;

  if (streamUrls.length > 0) {
    msg += `▶️ <b>Streaming URLs:</b>\n`;
    for (const s of streamUrls) {
      msg += `<code>${escHtml(safeUrl(s.url))}</code> (${s.host})\n`;
    }
    msg += `\n`;
  }

  if (downloadUrls.length > 0) {
    msg += `⬇️ <b>Download URLs:</b>\n`;
    for (const u of downloadUrls.slice(0, 3)) {
      msg += `<code>${escHtml(safeUrl(u))}</code>\n`;
    }
  }

  const keyboard = [];
  if (streamUrls.length > 0) {
    const bestStream = streamUrls[0].url;
    const cleanUrl = bestStream.replace(/^https?:\/\//, "");
    keyboard.push([
      { text: "▶️ MX Player", url: safeUrl(`intent://${cleanUrl}#Intent;package=com.mxtech.videoplayer.ad;end`, 400) },
      { text: "▶️ VLC", url: safeUrl(`vlc://${bestStream}`) },
    ]);
    keyboard.push([{ text: "⬇️ Stream Download", url: safeUrl(bestStream) }]);
  }
  for (const u of downloadUrls.slice(0, 3)) {
    keyboard.push([{ text: `⬇️ ${getHost(u)}`, url: safeUrl(u) }]);
  }
  if (keyboard.length === 0) {
    keyboard.push([{ text: "🌐 Open Movie", url: MOVIE_URL }]);
  }

  await tgSend(msg, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: keyboard },
  });
}

main().catch((e) => {
  console.error("Fatal in main():", e.message);
  console.error("Stack:", e.stack);
});

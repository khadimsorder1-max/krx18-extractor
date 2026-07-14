/**
 * Direct stream handler — triggers GitHub Actions (Puppeteer extractor v6).
 * Sends processing message → edits with result later (Action does the edit).
 *
 * v6 improvements:
 *  - Auto-remove ad overlay (Puppeteer clicks it away)
 *  - Captures abysscdn / iamcdn video URLs
 *  - Uses proxy worker for player URLs (bypasses Referer block)
 *  - Premium UI with progress updates
 */
import { CONSTANTS } from "../config.js";
import { escapeHtml } from "../utils/text.js";
import { fetchText } from "../utils/fetch.js";
import { sendMessage, editMessageText } from "../services/telegram.js";
import { dispatchEvent } from "../services/github.js";
import { cache } from "../services/cache.js";
import { parseMovieDetails } from "../parsers/movieDetails.js";
import * as logger from "../utils/logger.js";

export async function handleDirectStream(config, chatId, slug, server, userId, reqId, workerUrl) {
  const movieUrl = `${CONSTANTS.KRX_BASE}/movies/${slug}/`;

  if (!config.githubToken || !config.githubRepo) {
    await sendMessage(
      config.botToken, chatId,
      "❌ Direct stream configured নন!\n\nWorker এ <code>GITHUB_TOKEN</code> এবং <code>GITHUB_REPO</code> secret set করুন。\n\nSetup এর জন্য README দেখুন。",
      { parse_mode: "HTML" }
    );
    return;
  }

  // Try to get the newsmonth URL from cached movie details or fetch the page
  let newsmonthUrl = "";
  try {
    const cacheKey = `movie:${slug}`;
    let details = await cache.getJson(config.cacheKv, cacheKey);
    if (!details) {
      const r = await fetchText(movieUrl);
      if (r.ok) {
        details = parseMovieDetails(r.text);
      }
    }
    if (details?.downloads?.length > 0) {
      const dlUrl = details.downloads[0].url;
      if (dlUrl && dlUrl.includes("newsmonth")) newsmonthUrl = dlUrl;
    }
  } catch (e) {
    logger.warn("Failed to get newsmonth URL", { error: String(e) }, reqId);
  }

  // Send processing message with premium animation
  const procMsg = await sendMessage(
    config.botToken, chatId,
    `⏳ <b>Direct video URL বের করা হচ্ছে...</b>\n\n` +
    `🎬 Server ${escapeHtml(server)}\n` +
    `🔄 GitHub Actions এ Puppeteer trigger করা হচ্ছে...\n` +
    `⏱️ সময় লাগবে 30-90 সেকেন্ড\n\n` +
    `<i>এই message টা আপনার edit হবে যখন URL পাওয়া যাবে</i>`,
    { parse_mode: "HTML" }
  );
  const procMessageId = procMsg?.result?.message_id;
  if (!procMessageId) {
    logger.warn("Failed to send processing message", { procMsg }, reqId);
    return;
  }

  // Trigger GitHub Action
  const result = await dispatchEvent(config, "extract_video", {
    movie_url: movieUrl,
    newsmonth_url: newsmonthUrl,
    chat_id: String(chatId),
    message_id: String(procMessageId || ""),
    server: String(server),
    user_id: String(userId || ""),
    slug,
    proxy_worker_url: config.proxyWorkerUrl || "",
    worker_url: workerUrl || "",
  }, reqId);

  if (result.ok) {
    await editMessageText(
      config.botToken, chatId, procMessageId,
      `⏳ <b>Processing...</b>\n\n` +
      `✅ GitHub Action triggered!\n` +
      `🔄 Puppeteer browser খুলছে...\n` +
      `🎯 Auto-removing ad overlay...\n` +
      `⏱️ 30-90s অপেক্ষা করুন\n\n` +
      `<i>URL প্রস্তুত হলে এই message টা আপডেট হবে</i>`,
      { parse_mode: "HTML" }
    );
  } else {
    logger.warn("GitHub dispatch failed", { error: result.error }, reqId);
    await editMessageText(
      config.botToken, chatId, procMessageId,
      `❌ <b>GitHub Actions trigger failed!</b>\n\n${escapeHtml((result.error || "").slice(0, 200))}`,
      { parse_mode: "HTML" }
    );
  }
}

/** Auto-notify handler — checks for new releases, notifies admin/favs. */
import { CONSTANTS } from "../config.js";
import { fetchText } from "../utils/fetch.js";
import { sendMessage } from "../services/telegram.js";
import { cache } from "../services/cache.js";
import { parseMovieList } from "../parsers/movieList.js";
import * as logger from "../utils/logger.js";

export async function handleScheduled(config) {
  if (!config.cacheKv) return;
  try {
    const r = await fetchText(CONSTANTS.KRX_KOREA);
    if (!r.ok) return;
    const movies = parseMovieList(r.text).slice(0, 10);
    const seenKey = "notify:seen";
    const seen = (await config.cacheKv.get(seenKey, { type: "json" })) || [];
    const newMovies = movies.filter((m) => !seen.includes(m.slug));
    if (newMovies.length === 0) return;

    // Notify admin
    if (config.adminChatId) {
      for (const m of newMovies.slice(0, 5)) {
        const text = `🔔 *New Release\\!*\n\n🎬 ${m.title}\n📅 ${m.releaseDate}\n🎥 ${m.quality || "HD"}`;
        const keyboard = [[{ text: "🎬 View", callback_data: `movie:${m.slug}` }]];
        await sendMessage(config.botToken, config.adminChatId, text, {
          parse_mode: "MarkdownV2",
          reply_markup: { inline_keyboard: keyboard },
        }).catch(() => {});
      }
    }

    // Update seen list
    const newSeen = [...new Set([...seen, ...newMovies.map((m) => m.slug)])].slice(-100);
    await config.cacheKv.put(seenKey, JSON.stringify(newSeen), { expirationTtl: CONSTANTS.CACHE_TTL * 24 });
    logger.info("Notify: sent", { count: newMovies.length });
  } catch (e) {
    logger.error("Notify failed", { error: String(e) });
  }
}

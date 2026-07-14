/**
 * Search handler — text search + inline mode.
 */
import { CONSTANTS } from "../config.js";
import { fetchText } from "../utils/fetch.js";
import { escapeMd, truncate } from "../utils/text.js";
import { sendMessage } from "../services/telegram.js";
import { cache } from "../services/cache.js";
import { parseMovieList } from "../parsers/movieList.js";

export async function handleSearch(config, chatId, query, reqId) {
  if (!query || query.length < 2) {
    await sendMessage(config.botToken, chatId, "❌ Search query অন্তত ২ অক্ষরের হতে হবে");
    return;
  }
  const cacheKey = `search:${query.toLowerCase()}`;
  let movies = await cache.getJson(config.cacheKv, cacheKey);
  if (!movies) {
    const url = `${CONSTANTS.KRX_BASE}/?s=${encodeURIComponent(query)}`;
    const r = await fetchText(url);
    if (!r.ok) {
      await sendMessage(config.botToken, chatId, "❌ Search করা যায়নি");
      return;
    }
    movies = parseMovieList(r.text);
    await cache.setJson(config.cacheKv, cacheKey, movies, CONSTANTS.CACHE_TTL);
  }
  if (movies.length === 0) {
    await sendMessage(config.botToken, chatId, `❌ "${escapeMd(query)}" এর জন্য কোনো movie পাওয়া যায়নি`, { parse_mode: "MarkdownV2" });
    return;
  }

  const keyboard = movies.slice(0, 12).map((m) => [{ text: `🎬 ${truncate(m.title, 40)}`, callback_data: `movie:${m.slug}` }]);
  keyboard.push([{ text: "🏠 Home", callback_data: "home" }]);
  await sendMessage(
    config.botToken, chatId,
    `🔍 *Search results for "${escapeMd(query)}"* \\(${movies.length}\\)`,
    { parse_mode: "MarkdownV2", reply_markup: { inline_keyboard: keyboard } }
  );
}

export async function handleInline(config, inlineQuery) {
  const query = inlineQuery.query?.trim() || "";
  if (query.length < 2) {
    await fetch(`${CONSTANTS.TG_API_BASE}${config.botToken}/answerInlineQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inline_query_id: inlineQuery.id,
        results: [],
        cache_time: 30,
      }),
    });
    return;
  }
  const cacheKey = `search:${query.toLowerCase()}`;
  let movies = await cache.getJson(config.cacheKv, cacheKey);
  if (!movies) {
    const url = `${CONSTANTS.KRX_BASE}/?s=${encodeURIComponent(query)}`;
    const r = await fetchText(url);
    if (r.ok) {
      movies = parseMovieList(r.text);
      await cache.setJson(config.cacheKv, cacheKey, movies, CONSTANTS.CACHE_TTL);
    }
  }
  const results = (movies || []).slice(0, 20).map((m, i) => ({
    type: "article",
    id: `${m.slug}-${i}`,
    title: m.title,
    description: m.synopsis ? truncate(m.synopsis, 80) : (m.quality || ""),
    thumb_url: m.poster,
    input_message_content: {
      message_text: `🎬 ${m.title}\n📅 ${m.releaseDate || m.year}\n🎥 ${m.quality || "HD"}\n\nTap below for details:`,
    },
    reply_markup: { inline_keyboard: [[{ text: "🎬 View Details", callback_data: `movie:${m.slug}` }]] },
  }));
  await fetch(`${CONSTANTS.TG_API_BASE}${config.botToken}/answerInlineQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inline_query_id: inlineQuery.id, results, cache_time: 60 }),
  });
}

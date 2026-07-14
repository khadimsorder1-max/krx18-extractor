/**
 * Similar movies — genre-based recommendations.
 */
import { CONSTANTS } from "../config.js";
import { fetchText } from "../utils/fetch.js";
import { escapeMd, truncate } from "../utils/text.js";
import { sendMessage } from "../services/telegram.js";
import { cache } from "../services/cache.js";
import { parseMovieDetails } from "../parsers/movieDetails.js";
import { parseMovieList as parseList } from "../parsers/movieList.js";

export async function handleSimilar(config, chatId, slug, reqId) {
  // Get the movie's genres first
  const movieUrl = `${CONSTANTS.KRX_BASE}/movies/${slug}/`;
  let details = await cache.getJson(config.cacheKv, `movie:${slug}`);
  if (!details) {
    const r = await fetchText(movieUrl);
    if (!r.ok) { await sendMessage(config.botToken, chatId, "❌ Movie fetch করা যায়নি"); return; }
    details = parseMovieDetails(r.text);
    await cache.setJson(config.cacheKv, `movie:${slug}`, details, CONSTANTS.CACHE_TTL * 4);
  }

  if (!details.genres || details.genres.length === 0) {
    await sendMessage(config.botToken, chatId, "❌ কোনো genre info পাওয়া যায়নি");
    return;
  }

  // Fetch movies from the first genre
  const genre = details.genres[0].toLowerCase().replace(/\s+/g, "-");
  const genreUrl = `${CONSTANTS.KRX_BASE}/genre/${genre}/`;
  const r = await fetchText(genreUrl);
  if (!r.ok) { await sendMessage(config.botToken, chatId, "❌ Similar movies fetch করা যায়নি"); return; }

  const movies = parseList(r.text).filter((m) => m.slug !== slug).slice(0, 12);
  if (movies.length === 0) {
    await sendMessage(config.botToken, chatId, "❌ কোনো similar movie পাওয়া যায়নি");
    return;
  }

  const keyboard = movies.map((m) => [{ text: `🎬 ${truncate(m.title, 40)}`, callback_data: `movie:${m.slug}` }]);
  keyboard.push([{ text: "⬅️ Back to Movie", callback_data: `movie:${slug}` }]);
  keyboard.push([{ text: "🏠 Home", callback_data: "home" }]);

  await sendMessage(
    config.botToken, chatId,
    `🎭 *Similar movies* \\(${escapeMd(details.genres[0])}\\)`,
    { parse_mode: "MarkdownV2", reply_markup: { inline_keyboard: keyboard } }
  );
}

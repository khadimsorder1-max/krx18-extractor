/**
 * Favorites handler — KV-backed per-user watchlist.
 */
import { CONSTANTS } from "../config.js";
import { escapeHtml } from "../utils/text.js";
import { sendMessage } from "../services/telegram.js";
import { qualityBadge } from "../utils/badges.js";

export async function handleAddFavorite(config, chatId, slug, title, userId) {
  if (userId == null || !config.cacheKv) {
    await sendMessage(config.botToken, chatId, "❌ Favorites KV configured নন");
    return;
  }
  let movieTitle = title;
  if (!movieTitle) {
    try {
      const details = await config.cacheKv.get(`movie:${slug}`, { type: "json" });
      if (details) movieTitle = details.title;
    } catch {}
  }
  if (!movieTitle) movieTitle = slug;

  const key = `favs:${userId}`;
  try {
    const favs = (await config.cacheKv.get(key, { type: "json" })) || [];
    if (favs.find((f) => f.slug === slug)) {
      await sendMessage(config.botToken, chatId, "⭐ ইতিমধ্যে watchlist এ আছে");
      return;
    }
    if (favs.length >= CONSTANTS.MAX_FAVS) {
      await sendMessage(config.botToken, chatId, `❌ Watchlist পূর্ণ (max ${CONSTANTS.MAX_FAVS})`);
      return;
    }
    favs.push({ slug, title: movieTitle, addedAt: Date.now() });
    await config.cacheKv.put(key, JSON.stringify(favs), { expirationTtl: CONSTANTS.FAV_TTL });
    await sendMessage(config.botToken, chatId, `⭐ <b>${escapeHtml(movieTitle)}</b> watchlist এ added হয়েছে`, { parse_mode: "HTML" });
  } catch (e) {
    await sendMessage(config.botToken, chatId, "❌ Favorite add করা যায়নি");
  }
}

export async function handleListFavorites(config, chatId, userId) {
  if (userId == null || !config.cacheKv) {
    await sendMessage(config.botToken, chatId, "❌ Favorites KV configured নন");
    return;
  }
  const key = `favs:${userId}`;
  try {
    const favs = (await config.cacheKv.get(key, { type: "json" })) || [];
    if (favs.length === 0) {
      await sendMessage(config.botToken, chatId, "⭐ আপনার watchlist খালি\n\n/movie <slug> দিয়ে movie খুলে ⭐ Favorite button চাপুন।");
      return;
    }
    const keyboard = favs.slice(0, 20).map((f) => [{ text: `🎬 ${f.title.slice(0, 40)}`, callback_data: `movie:${f.slug}` }]);
    keyboard.push([{ text: "🏠 Home", callback_data: "home" }]);
    await sendMessage(config.botToken, chatId, `⭐ <b>Your Watchlist</b> (${favs.length})`, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard },
    });
  } catch {
    await sendMessage(config.botToken, chatId, "❌ Watchlist পড়া যায়নি");
  }
}

export async function handleRemoveFavorite(config, chatId, slug, userId) {
  if (userId == null || !config.cacheKv) return;
  const key = `favs:${userId}`;
  try {
    const favs = (await config.cacheKv.get(key, { type: "json" })) || [];
    const filtered = favs.filter((f) => f.slug !== slug);
    await config.cacheKv.put(key, JSON.stringify(filtered), { expirationTtl: CONSTANTS.FAV_TTL });
    await sendMessage(config.botToken, chatId, "🗑️ Watchlist থেকে removed হয়েছে");
  } catch {}
}

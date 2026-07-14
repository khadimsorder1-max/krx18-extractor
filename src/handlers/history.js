/** History handler */
import { CONSTANTS } from "../config.js";
import { escapeHtml, truncate } from "../utils/text.js";
import { sendMessage } from "../services/telegram.js";

export async function handleHistory(config, chatId, userId, reqId) {
  if (userId == null || !config.cacheKv) {
    await sendMessage(config.botToken, chatId, "❌ History KV configured নন");
    return;
  }
  try {
    const history = (await config.cacheKv.get(`history:${userId}`, { type: "json" })) || [];
    if (history.length === 0) {
      await sendMessage(config.botToken, chatId, "🕐 আপনার history খালি");
      return;
    }
    const keyboard = history.slice(0, 20).map((h) => [{ text: `🎬 ${truncate(h.title, 40)}`, callback_data: `movie:${h.slug}` }]);
    keyboard.push([{ text: "🏠 Home", callback_data: "home" }]);
    await sendMessage(config.botToken, chatId, `🕐 <b>Recently Viewed</b> (${history.length})`, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard },
    });
  } catch {
    await sendMessage(config.botToken, chatId, "❌ History পড়া যায়নি");
  }
}

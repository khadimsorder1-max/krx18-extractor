/** Stats handler — premium stats dashboard */
import { escapeHtml } from "../utils/text.js";
import { sendMessage } from "../services/telegram.js";
import { getStats } from "../services/stats.js";

export async function handleStats(config, chatId, userId) {
  const stats = await getStats(config.cacheKv);
  if (!stats) {
    await sendMessage(config.botToken, chatId, "📊 <b>Stats এভেইলেবল নয়</b>\n\nKV namespace configured নন।", { parse_mode: "HTML" });
    return;
  }
  let text = `📊 <b>KRX18 Premium Stats</b>\n\n📥 <b>Total Downloads:</b> ${escapeHtml(String(stats.total || 0))}\n👥 <b>Unique Users:</b> ${escapeHtml(String(stats.uniqueUsers || 0))}\n\n`;
  if (Object.keys(stats.daily).length > 0) {
    text += `📅 <b>Last 7 days:</b>\n`;
    const entries = Object.entries(stats.daily).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
    for (const [date, count] of entries) {
      const bar = "█".repeat(Math.min(10, Math.ceil(count / 5))) + "░".repeat(Math.max(0, 10 - Math.ceil(count / 5)));
      text += `  <code>${escapeHtml(date)}</code> ${escapeHtml(bar)} ${escapeHtml(String(count))}\n`;
    }
  }
  if (Object.keys(stats.hosts).length > 0) {
    text += `\n🌐 <b>By host:</b>\n`;
    for (const [host, count] of Object.entries(stats.hosts).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      text += `  ${escapeHtml(host)}: ${escapeHtml(String(count))}\n`;
    }
  }
  text += `\n💎 <i>Premium member benefit</i>`;
  await sendMessage(config.botToken, chatId, text, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: "🏠 Home", callback_data: "home" }]] },
  });
}

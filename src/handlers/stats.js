/** Stats handler — premium stats dashboard */
import { escapeMd } from "../utils/text.js";
import { sendMessage } from "../services/telegram.js";
import { getStats } from "../services/stats.js";

export async function handleStats(config, chatId, userId) {
  const stats = await getStats(config.cacheKv);
  if (!stats) {
    await sendMessage(config.botToken, chatId, "📊 *Stats এভেইলেবল নয়*\n\nKV namespace configured নন।", { parse_mode: "MarkdownV2" });
    return;
  }
  let text = `📊 *KRX18 Premium Stats*\n\n📥 *Total Downloads:* ${escapeMd(String(stats.total || 0))}\n👥 *Unique Users:* ${escapeMd(String(stats.uniqueUsers || 0))}\n\n`;
  if (Object.keys(stats.daily).length > 0) {
    text += `📅 *Last 7 days:*\n`;
    const entries = Object.entries(stats.daily).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
    for (const [date, count] of entries) {
      const bar = "█".repeat(Math.min(10, Math.ceil(count / 5))) + "░".repeat(Math.max(0, 10 - Math.ceil(count / 5)));
      text += `  \`${escapeMd(date)}\` ${escapeMd(bar)} ${escapeMd(String(count))}\n`;
    }
  }
  if (Object.keys(stats.hosts).length > 0) {
    text += `\n🌐 *By host:*\n`;
    for (const [host, count] of Object.entries(stats.hosts).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      text += `  ${escapeMd(host)}: ${escapeMd(String(count))}\n`;
    }
  }
  text += `\n💎 _Premium member benefit_`;
  await sendMessage(config.botToken, chatId, text, {
    parse_mode: "MarkdownV2",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: "🏠 Home", callback_data: "home" }]] },
  });
}

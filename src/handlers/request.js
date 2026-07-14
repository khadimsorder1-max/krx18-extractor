/** Request handler — forward request to admin */
import { CONSTANTS } from "../config.js";
import { escapeHtml } from "../utils/text.js";
import { sendMessage } from "../services/telegram.js";

export async function handleRequest(config, chatId, name, userId, username) {
  if (!name) { await sendMessage(config.botToken, chatId, "📝 /request <movie name>"); return; }
  if (name.length > CONSTANTS.MAX_REQUEST_TEXT) {
    await sendMessage(config.botToken, chatId, `❌ Request too long (max ${CONSTANTS.MAX_REQUEST_TEXT})`);
    return;
  }
  await sendMessage(config.botToken, chatId, `📝 আপনার request "<b>${escapeHtml(name)}</b>" admin কে পাঠানো হয়েছে!`, { parse_mode: "HTML" });
  if (config.adminChatId) {
    await sendMessage(
      config.botToken, config.adminChatId,
      `📝 <b>New Request</b>\n\n🎬 ${escapeHtml(name)}\n👤 ${escapeHtml(username || String(userId || "unknown"))}\n🆔 <code>${escapeHtml(String(userId))}</code>`,
      { parse_mode: "HTML" }
    );
  }
}

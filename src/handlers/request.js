/** Request handler — forward request to admin */
import { CONSTANTS } from "../config.js";
import { escapeMd } from "../utils/text.js";
import { sendMessage } from "../services/telegram.js";

export async function handleRequest(config, chatId, name, userId, username) {
  if (!name) { await sendMessage(config.botToken, chatId, "📝 /request <movie name>"); return; }
  if (name.length > CONSTANTS.MAX_REQUEST_TEXT) {
    await sendMessage(config.botToken, chatId, `❌ Request too long (max ${CONSTANTS.MAX_REQUEST_TEXT})`);
    return;
  }
  await sendMessage(config.botToken, chatId, `📝 আপনার request "${escapeMd(name)}" admin কে পাঠানো হয়েছে\\!`, { parse_mode: "MarkdownV2" });
  if (config.adminChatId) {
    await sendMessage(
      config.botToken, config.adminChatId,
      `📝 *New Request*\n\n🎬 ${escapeMd(name)}\n👤 ${escapeMd(username || String(userId || "unknown"))}\n🆔 ${escapeMd(String(userId))}`,
      { parse_mode: "MarkdownV2" }
    );
  }
}

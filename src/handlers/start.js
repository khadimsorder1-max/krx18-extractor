/**
 * /start, /help, /settings — Premium welcome with banner image
 */
import { sendMessage, sendPhoto } from "../services/telegram.js";
import { escapeMd } from "../utils/text.js";

// Banner image — hosted on Cloudflare
const BANNER_URL = "https://krx18-korea-bot.krx18bott.workers.dev/assets/logo-512.webp";

export async function handleStart(config, chatId) {
  const text =
    `👋 *Welcome to KRX18 Premium Bot v6!*\n\n` +
    `🎬 আমি তোমার personal premium Korean movie assistant.\n\n` +
    `✨ *Premium Features:*\n` +
    `✅ Premium media cards with badges\n` +
    `✅ Direct stream (MX Player, VLC, Just Player, MPV)\n` +
    `✅ Auto-remove ad overlay (no manual click)\n` +
    `✅ Video proxy (bypasses Referer block)\n` +
    `✅ Quality selection cards\n` +
    `✅ Watch history + continue watching\n` +
    `✅ Auto-notify new releases\n` +
    `✅ Premium badges (4K, HDR, HEVC, Eng-Sub, Uncensored)\n\n` +
    `📋 *Commands:*\n` +
    `🔹 /latest [filter] [page] - latest movies\n` +
    `🔹 /search <query> - search movies\n` +
    `🔹 /favs - your watchlist\n` +
    `🔹 /history - recently viewed\n` +
    `🔹 /stats - download stats\n` +
    `🔹 /settings - bot settings\n` +
    `🔹 /request <name> - request a movie\n` +
    `🔹 /help - this message\n\n` +
    `🎨 *Filters:* eng-sub, censored, uncensored, hd, korea\n\n` +
    `🚀 Tap a button below to get started!`;

  const keyboard = [
    [
      { text: "🎬 Latest Movies", callback_data: "latest:1" },
      { text: "🇰🇷 Korea", callback_data: "latest:1:korea" },
    ],
    [
      { text: "🔍 Search", switch_inline_query_current_chat: "" },
      { text: "⭐ Watchlist", callback_data: "favs" },
    ],
    [
      { text: "🕐 History", callback_data: "history" },
      { text: "📊 Stats", callback_data: "stats" },
    ],
    [
      { text: "⚙️ Settings", callback_data: "settings" },
      { text: "❓ Help", callback_data: "help" },
    ],
  ];

  // Try sending banner photo + caption; fallback to text
  if (config.webappUrl) {
    keyboard.push([{ text: "📱 Open Mini App", web_app: { url: config.webappUrl } }]);
  }

  try {
    const r = await sendPhoto(config.botToken, chatId, BANNER_URL, text, {
      parse_mode: "MarkdownV2",
      reply_markup: { inline_keyboard: keyboard },
    });
    if (r?.ok) return;
  } catch {}
  await sendMessage(config.botToken, chatId, text, {
    parse_mode: "MarkdownV2",
    reply_markup: { inline_keyboard: keyboard },
  });
}

export async function handleHelp(config, chatId) {
  const text =
    `📖 *KRX18 Premium Bot v6 — Help*\n\n` +
    `*Commands:*\n\n` +
    `🎬 /latest \\[filter\\] \\[page\\]\n` +
    `   Latest movies\\. Filters: eng\\-sub, censored, uncensored, hd, korea\n\n` +
    `🔍 /search <query>\n` +
    `   Search by title\n\n` +
    `⭐ /favs\n` +
    `   Your watchlist\n\n` +
    `🕐 /history\n` +
    `   Recently viewed movies\n\n` +
    `📊 /stats\n` +
    `   Download stats\n\n` +
    `📝 /request <name>\n` +
    `   Request a movie to admin\n\n` +
    `*Player Support:*\n` +
    `📱 Android: MX Player, VLC, Just Player, MPV\n` +
    `🍎 iOS: VLC, Infuse\n` +
    `🖥️ Windows: VLC, PotPlayer, MPV\n` +
    `🍏 macOS: IINA, VLC, MPV\n\n` +
    `*Premium Badges:*\n` +
    `🟪 4K  🟦 1080P  🟩 720P  🟨 480P\n` +
    `🔵 ENG  🟧 KOR  🟩 বাংলা\n` +
    `🟦 BluRay  🟩 WEB\\-DL  🔴 HDTC\n` +
    `🟩 Uncensored  🟨 Censored`;

  await sendMessage(config.botToken, chatId, text, {
    parse_mode: "MarkdownV2",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: "🏠 Home", callback_data: "home" }]] },
  });
}

export async function handleSettings(config, chatId, userId) {
  const text =
    `⚙️ *Settings*\n\n` +
    `বর্তমানে নিচের অপশনগুলো এভেইলেবল:\n\n` +
    `📱 *Player:* Auto\\-detect করা হয়\n` +
    `🔔 *Notifications:* চালু আছে\n` +
    `🎬 *Auto\\-remove ads:* চালু আছে \\(Puppeteer\\)\n` +
    `🌐 *Proxy:* ${config.proxyWorkerUrl ? "✅ চালু" : "❌ বন্ধ"}\n` +
    `🌐 *Mini App:* ${config.webappUrl ? "✅ চালু" : "❌ বন্ধ"}\n\n` +
    `আরও অপশন শীঘ্রই আসছে\\!`;

  await sendMessage(config.botToken, chatId, text, {
    parse_mode: "MarkdownV2",
    reply_markup: { inline_keyboard: [[{ text: "🏠 Home", callback_data: "home" }]] },
  });
}

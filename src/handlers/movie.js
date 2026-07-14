/**
 * Movie details handler — premium UI with poster, badges, player buttons.
 */
import { CONSTANTS } from "../config.js";
import { fetchText } from "../utils/fetch.js";
import { escapeMd, truncate } from "../utils/text.js";
import { sendMessage, sendPhotoOrText } from "../services/telegram.js";
import { cache } from "../services/cache.js";
import { recordDownload } from "../services/stats.js";
import { parseMovieDetails, extractPostId } from "../parsers/movieDetails.js";
import { qualityBadge, languageBadge, sourceBadge, censoredBadge, buildBadgeLine } from "../utils/badges.js";

export async function handleMovieDetails(config, chatId, slug, userId, reqId) {
  const movieUrl = `${CONSTANTS.KRX_BASE}/movies/${slug}/`;
  const cacheKey = `movie:${slug}`;

  let details = await cache.getJson(config.cacheKv, cacheKey);
  if (!details) {
    const r = await fetchText(movieUrl);
    if (!r.ok) {
      await sendMessage(config.botToken, chatId, "❌ Movie details fetch করা যায়নি");
      return;
    }
    details = parseMovieDetails(r.text);
    details.movieUrl = movieUrl;
    details.postId = extractPostId(r.text);
    await cache.setJson(config.cacheKv, cacheKey, details, CONSTANTS.CACHE_TTL * 4);
  }

  // Record history
  if (userId && config.cacheKv) {
    try {
      const historyKey = `history:${userId}`;
      const history = (await config.cacheKv.get(historyKey, { type: "json" })) || [];
      const filtered = history.filter((h) => h.slug !== slug);
      filtered.unshift({ slug, title: details.title, poster: details.poster, viewedAt: Date.now() });
      await config.cacheKv.put(historyKey, JSON.stringify(filtered.slice(0, CONSTANTS.MAX_HISTORY)), { expirationTtl: CONSTANTS.HISTORY_TTL });
    } catch {}
  }

  const caption = buildCaption(details);
  await sendPhotoOrText(config.botToken, chatId, details.poster, caption, { parse_mode: "MarkdownV2" });

  // Record stats
  if (userId && details.downloads?.length > 0) {
    await recordDownload(config.cacheKv, userId, details.downloads[0].host);
  }

  // Premium keyboard
  const keyboard = buildPremiumKeyboard(details, slug, config);

  const dlText =
    `📥 *Download / Watch Online:*\n\n` +
    (config.githubToken && config.githubRepo
      ? `▶️ *Watch Online Direct* — ad\\-free direct \\.mp4 URL \\(30\\-60s অপেক্ষা\\)\n` +
        `⬇️ *Download* — newsmonth → file host \\(k2s\\.cc / nitroflare / alterupload\\)\n\n` +
        `যেটা চাও সেটা select করো:`
      : `⬇️ *Download links:*\n` +
        `⚠️ Button চাপলে browser এ newsmonth\\.today খুলবে → সেখানে আসল file host এ যাবে\\.\n\n` +
        `যে host চাও সেটা select করো:`);

  await sendMessage(config.botToken, chatId, dlText, {
    parse_mode: "MarkdownV2",
    reply_markup: { inline_keyboard: keyboard },
  });
}

function buildCaption(d) {
  let cap = `🎬 *${escapeMd(d.title)}*\n`;
  if (d.koreanTitle) cap += `🇰🇷 ${escapeMd(d.koreanTitle)}\n`;
  cap += "\n📋 *Info:*\n";
  if (d.country) cap += `🌍 Country: ${escapeMd(d.country)}\n`;
  if (d.quality) cap += `🎥 Quality: ${escapeMd(d.quality)}\n`;
  if (d.releaseDate) cap += `📅 Release: ${escapeMd(d.releaseDate)}\n`;
  if ((d.genres || []).length > 0) cap += `🎭 Genres: ${escapeMd(d.genres.join(", "))}\n`;
  cap += "\n";
  if ((d.actors || []).length > 0) cap += `👥 *Cast:*\n${escapeMd(d.actors.slice(0, 5).join(", "))}\n\n`;

  // Badges
  const badges = [];
  const qb = qualityBadge(d.quality); if (qb) badges.push(qb);
  const lb = languageBadge((d.quality || "") + " " + (d.genres || []).join(" ")); if (lb) badges.push(lb);
  const sb = sourceBadge(d.quality); if (sb) badges.push(sb);
  const cb = censoredBadge(d.title); if (cb) badges.push(cb);
  if (badges.length > 0) cap += buildBadgeLine(badges) + "\n\n";

  if (d.description) cap += `📖 *Synopsis:*\n${escapeMd(truncate(d.description, CONSTANTS.MAX_SYNOPSIS_LEN))}\n`;

  if (cap.length > CONSTANTS.MAX_CAPTION_LEN) cap = cap.slice(0, CONSTANTS.MAX_CAPTION_LEN - 1) + "…";
  return cap;
}

function buildPremiumKeyboard(d, slug, config) {
  const keyboard = [];
  // Watch Online Direct (GitHub Actions)
  if (config.githubToken && config.githubRepo) {
    keyboard.push([
      { text: "▶️ Watch Online Direct (Server 1)", callback_data: `direct:${slug}:1` },
      { text: "▶️ Watch Online (Server 2)", callback_data: `direct:${slug}:2` },
    ]);
  }
  // Download buttons
  for (const dl of (d.downloads || [])) {
    const label = dl.quality ? `${dl.quality} (${dl.host})` : `Download (${dl.host})`;
    keyboard.push([{ text: `⬇️ ${label}`, url: dl.url }]);
  }
  // External links
  const row = [];
  if (d.trailer) row.push({ text: "▶️ Trailer", url: d.trailer });
  if ((d.genres || []).length > 0) row.push({ text: "🎭 Similar", callback_data: `similar:${slug}` });
  if (row.length > 0) keyboard.push(row);
  // Favs + history
  keyboard.push([
    { text: "⭐ Favorite", callback_data: `addfav:${slug}:${d.title.slice(0, 40)}` },
    { text: "🕐 History", callback_data: `history` },
  ]);
  // Navigation
  keyboard.push([
    { text: "🏠 Home", callback_data: "home" },
    { text: "🎬 More", callback_data: "latest:1" },
  ]);
  return keyboard;
}

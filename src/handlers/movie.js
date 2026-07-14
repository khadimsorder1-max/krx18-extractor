/**
 * Movie details handler — premium UI with poster, badges, player buttons.
 */
import { CONSTANTS } from "../config.js";
import { fetchText } from "../utils/fetch.js";
import { escapeHtml, truncate } from "../utils/text.js";
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
  await sendPhotoOrText(config.botToken, chatId, details.poster, caption, { parse_mode: "HTML" });

  // Record stats
  if (userId && details.downloads?.length > 0) {
    await recordDownload(config.cacheKv, userId, details.downloads[0].host);
  }

  // Premium keyboard
  const keyboard = buildPremiumKeyboard(details, slug, config);

  const dlText =
    `📥 <b>Download / Watch Online:</b>\n\n` +
    (config.githubToken && config.githubRepo
      ? `▶️ <b>Watch Online Direct</b> — ad-free direct .mp4 URL (30-60s অপেক্ষা)\n` +
        `⬇️ <b>Download</b> — newsmonth → file host (k2s.cc / nitroflare / alterupload)\n\n` +
        `যেটা চাও সেটা select করো:`
      : `⬇️ <b>Download links:</b>\n` +
        `⚠️ Button চাপলে browser এ newsmonth.today খুলবে → সেখানে আসল file host এ যাবে।\n\n` +
        `যে host চাও সেটা select করো:`);

  await sendMessage(config.botToken, chatId, dlText, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard },
  });
}

function buildCaption(d) {
  let cap = `🎬 <b>${escapeHtml(d.title)}</b>\n`;
  if (d.koreanTitle) cap += `🇰🇷 <i>${escapeHtml(d.koreanTitle)}</i>\n`;
  cap += "\n📋 <b>Info:</b>\n";
  if (d.country) cap += `🌍 Country: ${escapeHtml(d.country)}\n`;
  if (d.quality) cap += `🎥 Quality: ${escapeHtml(d.quality)}\n`;
  if (d.releaseDate) cap += `📅 Release: ${escapeHtml(d.releaseDate)}\n`;
  if ((d.genres || []).length > 0) cap += `🎭 Genres: ${escapeHtml(d.genres.join(", "))}\n`;
  cap += "\n";
  if ((d.actors || []).length > 0) cap += `👥 <b>Cast:</b>\n${escapeHtml(d.actors.slice(0, 5).join(", "))}\n\n`;

  // Badges
  const badges = [];
  const qb = qualityBadge(d.quality); if (qb) badges.push(qb);
  const lb = languageBadge((d.quality || "") + " " + (d.genres || []).join(" ")); if (lb) badges.push(lb);
  const sb = sourceBadge(d.quality); if (sb) badges.push(sb);
  const cb = censoredBadge(d.title); if (cb) badges.push(cb);
  if (badges.length > 0) cap += buildBadgeLine(badges) + "\n\n";

  if (d.description) cap += `📖 <b>Synopsis:</b>\n${escapeHtml(truncate(d.description, CONSTANTS.MAX_SYNOPSIS_LEN))}\n`;

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
  // Favs + history - changed callback_data to addfav:${slug} to prevent 64-byte payload limit overflow
  keyboard.push([
    { text: "⭐ Favorite", callback_data: `addfav:${slug}` },
    { text: "🕐 History", callback_data: `history` },
  ]);
  // Navigation
  keyboard.push([
    { text: "🏠 Home", callback_data: "home" },
    { text: "🎬 More", callback_data: "latest:1" },
  ]);
  return keyboard;
}

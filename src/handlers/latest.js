/**
 * /latest handler — Premium movie cards with badges.
 */
import { CONSTANTS, FILTERS } from "../config.js";
import { fetchText } from "../utils/fetch.js";
import { escapeMd, truncate } from "../utils/text.js";
import { sendMessage } from "../services/telegram.js";
import { cache } from "../services/cache.js";
import { parseMovieList, filterMovies } from "../parsers/movieList.js";
import { qualityBadge, languageBadge, sourceBadge, censoredBadge } from "../utils/badges.js";
import { isValidPage, isValidFilter } from "../utils/validate.js";

export async function handleLatest(config, chatId, page = 1, filter = null, reqId) {
  if (!isValidPage(page)) { await sendMessage(config.botToken, chatId, "❌ Invalid page"); return; }
  if (filter && !isValidFilter(filter, FILTERS)) {
    await sendMessage(config.botToken, chatId, `❌ Invalid filter. Options: ${[...FILTERS].join(", ")}`);
    return;
  }

  const cacheKey = `latest_p${page}`;
  let movies = await cache.getJson(config.cacheKv, cacheKey);
  if (!movies) {
    const url = page === 1 ? CONSTANTS.KRX_KOREA : `${CONSTANTS.KRX_KOREA}page/${page}/`;
    const r = await fetchText(url);
    if (!r.ok) {
      await sendMessage(config.botToken, chatId, "❌ krx18.com fetch করা যায়নি। পরে চেষ্টা করো।");
      return;
    }
    movies = parseMovieList(r.text);
    await cache.setJson(config.cacheKv, cacheKey, movies, CONSTANTS.CACHE_TTL);
  }

  if (filter) movies = filterMovies(movies, filter);
  if (movies.length === 0) {
    await sendMessage(config.botToken, chatId, "❌ কোনো movie পাওয়া যায়নি");
    return;
  }

  // Send first 5 movies as individual cards
  const top = movies.slice(0, 5);
  for (const m of top) {
    await sendMovieCard(config, chatId, m);
  }

  // Pagination + remaining movies as buttons
  const keyboard = [];
  if (movies.length > 5) {
    const row = [];
    for (let i = 5; i < Math.min(10, movies.length); i++) {
      const title = truncate(movies[i].title, 25);
      row.push({ text: `🎬 ${title}`, callback_data: `movie:${movies[i].slug}` });
      if (row.length === 2) { keyboard.push(row); row.length = 0; }
    }
    if (row.length > 0) keyboard.push(row);
  }
  keyboard.push([
    { text: "⬅️ Prev", callback_data: `latest:${Math.max(1, page - 1)}${filter ? ":" + filter : ""}` },
    { text: `📄 ${page}`, callback_data: "noop" },
    { text: "Next ➡️", callback_data: `latest:${page + 1}${filter ? ":" + filter : ""}` },
  ]);
  keyboard.push([
    { text: "🏠 Home", callback_data: "home" },
    { text: "⭐ Favs", callback_data: "favs" },
  ]);

  await sendMessage(config.botToken, chatId, `📖 *Page ${page}* — more movies:`, {
    parse_mode: "MarkdownV2",
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function sendMovieCard(config, chatId, m) {
  let caption = `🎬 *${escapeMd(m.title)}*\n\n`;
  if (m.releaseDate) caption += `📅 ${escapeMd(m.releaseDate)}`;
  if (m.year) caption += ` • ${escapeMd(m.year)}`;
  caption += "\n";

  const badges = [];
  const qb = qualityBadge(m.quality); if (qb) badges.push(qb);
  const lb = languageBadge(m.quality + " " + m.genres.join(" ")); if (lb) badges.push(lb);
  const sb = sourceBadge(m.quality); if (sb) badges.push(sb);
  const cb = censoredBadge(m.title); if (cb) badges.push(cb);
  if (badges.length > 0) caption += badges.join("  ") + "\n";

  if (m.synopsis) caption += `\n📖 ${escapeMd(truncate(m.synopsis, CONSTANTS.MAX_SYNOPSIS_LEN))}\n`;

  if (caption.length > CONSTANTS.MAX_CAPTION_LEN) {
    caption = caption.slice(0, CONSTANTS.MAX_CAPTION_LEN - 1) + "…";
  }

  const keyboard = [[{ text: "🎬 View Details", callback_data: `movie:${m.slug}` }]];

  if (m.poster) {
    try {
      const r = await fetch(`${CONSTANTS.TG_API_BASE}${config.botToken}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId, photo: m.poster, caption,
          parse_mode: "MarkdownV2",
          reply_markup: { inline_keyboard: keyboard },
        }),
      });
      if (r.ok) return;
    } catch {}
  }
  await sendMessage(config.botToken, chatId, caption, {
    parse_mode: "MarkdownV2",
    reply_markup: { inline_keyboard: keyboard },
  });
}

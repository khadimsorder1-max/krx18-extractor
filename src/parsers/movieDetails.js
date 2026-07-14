/**
 * Movie details parser — krx18 movie page.
 * Extracts: title, korean title, poster, synopsis, country, cast, genres, quality,
 *           download links (newsmonth.today → file host), trailer, server info.
 */
import { decodeEntities } from "../utils/text.js";

export function parseMovieDetails(html) {
  const ld = extractJsonLd(html);
  return {
    title: extractTitle(html, ld),
    koreanTitle: extractKoreanTitle(ld),
    poster: extractPoster(html, ld),
    description: extractDescription(html, ld),
    country: extractCountry(html, ld),
    actors: extractActors(ld, extractTitle(html, ld)),
    releaseDate: extractReleaseDate(html, ld),
    genres: extractGenres(html),
    quality: extractQuality(html, ld),
    downloads: extractDownloadLinks(html),
    trailer: extractTrailer(html),
    movieUrl: "",
  };
}

function extractJsonLd(html) {
  const m = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try {
    const data = JSON.parse(m[1].trim());
    if (Array.isArray(data["@graph"])) return data["@graph"].find((i) => i["@type"] === "Movie") || null;
    if (data["@type"] === "Movie") return data;
  } catch {}
  return null;
}

function extractTitle(html, ld) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return decodeEntities(h1[1].replace(/<[^>]+>/g, "").trim());
  return ld?.name || "";
}

function extractPoster(html, ld) {
  if (ld?.image) return ld.image;
  const p = html.match(/<div\s+class="poster"[^>]*>\s*<img[^>]+src="([^"]+)"/i);
  return p ? p[1] : "";
}

function extractDescription(html, ld) {
  const wp = html.match(/<div\s+itemprop="description"[^>]*class="wp-content"[^>]*>([\s\S]*?)<\/div>/i);
  if (wp) return decodeEntities(wp[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  return ld?.description || "";
}

function extractCountry(html, ld) {
  const c = html.match(/<span[^>]*class=["']country["'][^>]*>([^<]+)<\/span>/i);
  if (c) return c[1].trim();
  return ld?.countryOfOrigin?.name || "Korea";
}

function extractActors(ld, title) {
  if (!Array.isArray(ld?.actor)) return [];
  return ld.actor
    .map((a) => a.name)
    .filter((n) => n && n !== title && !/^\d{4}$/.test(n) &&
      !new RegExp(`^${escapeRegex(title.slice(0, 12))}`, "i").test(n));
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function extractReleaseDate(html, ld) {
  const ds = html.match(/<span[^>]*class=["']date["'][^>]*itemprop=["']dateCreated["'][^>]*>([^<]+)<\/span>/i);
  if (ds) return ds[1].trim();
  if (ld?.datePublished) {
    const d = new Date(ld.datePublished);
    if (!isNaN(d)) return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    return ld.datePublished;
  }
  return "";
}

function extractGenres(html) {
  const genres = [];
  const sg = html.match(/<div\s+class="sgeneros"[^>]*>([\s\S]*?)<\/div>/i);
  if (sg) {
    const re = /<a[^>]+href="[^"]*\/genre\/[^"]+"[^>]*>([^<]+)<\/a>/gi;
    let g;
    while ((g = re.exec(sg[1])) !== null) {
      const name = g[1].trim();
      if (!genres.includes(name)) genres.push(name);
    }
  }
  return genres;
}

function extractQuality(html, ld) {
  const q = html.match(/<span[^>]*class=["']quality["'][^>]*>([^<]+)<\/span>/i);
  if (q && q[1].trim()) return q[1].trim();
  if (ld?.keywords) {
    const kws = ld.keywords.split(",").map((k) => k.trim());
    const qKw = kws.find((k) => /^(hd[- ]?(eng|uncut|raw|jav|sub)?|4k|full\s*hd|uhd)$/i.test(k));
    if (qKw) return qKw;
  }
  return "";
}

function extractKoreanTitle(ld) {
  if (!ld?.keywords) return "";
  const kws = ld.keywords.split(",").map((k) => k.trim());
  return kws.find((k) => /[\uAC00-\uD7AF]/.test(k)) || "";
}

function extractDownloadLinks(html) {
  const out = [];
  const trRe = /<tr[^>]+id=["']link-(\d+)["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(html)) !== null) {
    const linkId = tr[1];
    const block = tr[2];
    const urlM = block.match(/<a[^>]+href=["']([^"']+)["']/i);
    if (!urlM) continue;
    const url = urlM[1];
    const favM = block.match(/favicons\?domain=([a-z0-9.]+)/i);
    const host = favM ? favM[1] : (url.includes("newsmonth") ? "newsmonth" : "file");
    const qM = block.match(/<strong[^>]*class=["']quality["'][^>]*>([^<]*)<\/strong>/i);
    out.push({ id: linkId, url, quality: (qM?.[1] || "").trim(), host });
  }
  if (out.length === 0) {
    const re = /<a[^>]+href=["'](https?:\/\/newsmonth\.today[^"']+)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      out.push({ id: "", url: m[1], quality: "", host: "newsmonth" });
    }
  }
  return out;
}

function extractTrailer(html) {
  const yt = html.match(/https?:\/\/(?:www\.youtube\.com\/(?:embed|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  return yt ? `https://www.youtube.com/watch?v=${yt[1]}` : "";
}

/**
 * Extract the player server info from the movie page:
 * Returns: [{ server: "1", host: "playkrx18.site" }, { server: "2", host: "mov18plus.cloud" }]
 */
export function extractPlayerServers(html) {
  const servers = [];
  const re = /data-post='(\d+)'[^>]*data-nume='(\d+)'[^>]*>\s*<i[^>]*><\/i>\s*<span[^>]*>Server\s*(\d+)<\/span>\s*<span[^>]*>([^<]+)<\/span>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    servers.push({ postId: m[1], nume: m[2], server: m[3], host: m[4].trim() });
  }
  return servers;
}

/**
 * Extract the post ID from the movie page (for Dooplayer API).
 */
export function extractPostId(html) {
  // Try data-post attribute first
  const m1 = html.match(/data-post='(\d+)'/);
  if (m1) return m1[1];
  // Try player-option
  const m2 = html.match(/data-post='?(\d+)'?[^>]*data-nume='?(\d+)/);
  if (m2) return m2[1];
  // Try URL
  const m3 = html.match(/\/movies\/(\d+)-/);
  if (m3) return m3[1];
  return null;
}

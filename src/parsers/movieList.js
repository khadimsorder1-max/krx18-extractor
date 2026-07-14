/**
 * Movie list parser — krx18 listing pages (genre/korea/, search, page/N/)
 */
import { decodeEntities } from "../utils/text.js";

export function parseMovieList(html) {
  const movies = [];
  const seen = new Set();
  const articleRe = /<article[^>]+id="post-(\d+)"[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = articleRe.exec(html)) !== null) {
    const postId = m[1];
    const inner = m[2];

    const imgMatch = inner.match(/<div\s+class="poster"[^>]*>\s*<img[^>]+src="([^"]+)"/i);
    const poster = imgMatch ? imgMatch[1] : "";

    const titleMatch = inner.match(/<h3[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
    if (!titleMatch) continue;
    const url = titleMatch[1];
    const title = decodeEntities(titleMatch[2].trim());

    if (seen.has(url)) continue;
    seen.add(url);

    const dateMatch = inner.match(/<div\s+class="data"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/i);
    const releaseDate = dateMatch ? dateMatch[1].trim() : "";
    const yearMatch = inner.match(/<div\s+class="metadata"[^>]*>\s*<span>(\d{4})<\/span>/i);
    const year = yearMatch ? yearMatch[1] : "";
    const synMatch = inner.match(/<div\s+class="texto">([^<]+)<\/div>/i);
    let synopsis = synMatch ? synMatch[1].trim() : "";
    if (synopsis.endsWith("...")) synopsis = synopsis.slice(0, -3).trim();
    const qualMatch = inner.match(/<span\s+class="quality">([^<]+)<\/span>/i);
    const quality = qualMatch ? qualMatch[1].trim() : "";

    const genres = [];
    const genreRe = /<a[^>]+href="[^"]*\/genre\/[^"]+"[^>]*>([^<]+)<\/a>/gi;
    let g;
    while ((g = genreRe.exec(inner)) !== null) {
      const name = g[1].trim();
      if (!genres.includes(name)) genres.push(name);
    }

    const slug = url.replace(/\/$/, "").split("/").pop();
    movies.push({ postId, title, url, poster, slug, releaseDate, year, synopsis, quality, genres });
  }
  return movies;
}

export function filterMovies(movies, filter) {
  if (!filter) return movies;
  const f = filter.toLowerCase();
  return movies.filter((m) => {
    const allGenres = (m.genres || []).join(" ").toLowerCase();
    const qual = (m.quality || "").toLowerCase();
    const title = (m.title || "").toLowerCase();
    if (f === "eng-sub" || f === "engsub") return allGenres.includes("eng sub") || qual.includes("eng");
    if (f === "censored") return allGenres.includes("censored") || title.includes("censored");
    if (f === "uncensored") return allGenres.includes("uncensored") || title.includes("uncensored");
    if (f === "hd") return qual.includes("hd");
    if (f === "korea") return allGenres.includes("korea");
    return true;
  });
}

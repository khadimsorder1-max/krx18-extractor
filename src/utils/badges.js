/** Premium badge helpers */
export function qualityBadge(q) {
  if (!q) return "";
  const s = String(q).toLowerCase();
  if (/4k|2160p|uhd/.test(s)) return "🟪 4K";
  if (/1080p|1080|full\s*hd|fhd/.test(s)) return "🟦 1080P";
  if (/720p|720|hd-/.test(s)) return "🟩 720P";
  if (/480p|480/.test(s)) return "🟨 480P";
  return "";
}

export function languageBadge(lang) {
  const s = String(lang || "").toLowerCase();
  if (s.includes("eng") || s.includes("english")) return "🔵 ENG";
  if (s.includes("korean") || s.includes("korea")) return "🟧 KOR";
  if (s.includes("bangla") || s.includes("bengali")) return "🟩 বাংলা";
  return "";
}

export function sourceBadge(q) {
  const s = String(q || "").toLowerCase();
  if (s.includes("bluray") || s.includes("blu-ray")) return "🟦 BluRay";
  if (s.includes("web-dl") || s.includes("webdl")) return "🟩 WEB-DL";
  if (s.includes("hdtc") || s.includes("hdts")) return "🔴 HDTC";
  return "";
}

export function censoredBadge(title) {
  const s = String(title || "").toLowerCase();
  if (s.includes("uncensored")) return "🟩 Uncensored";
  if (s.includes("censored")) return "🟨 Censored";
  return "";
}

export function imdbStars(rating) {
  const r = parseFloat(rating);
  if (isNaN(r)) return "";
  const full = Math.floor(r);
  const half = r - full >= 0.5 ? 1 : 0;
  return "⭐".repeat(full) + (half ? "✬" : "") + ` ${r.toFixed(1)}`;
}

export function sizeBadge(sizes) {
  if (!sizes || !sizes.length) return "";
  return "📦 " + sizes.join(" | ");
}

export function buildBadgeLine(badges) {
  return badges.filter(Boolean).join("  ");
}

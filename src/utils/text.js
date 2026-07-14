/**
 * Text utilities
 */

const ENTITY_MAP = {
  "&amp;": "&", "&#8211;": "-", "&#8217;": "'", "&#8216;": "'",
  "&#8220;": '"', "&#8221;": '"', "&nbsp;": " ", "&quot;": '"',
  "&#8230;": "…", "&lt;": "<", "&gt;": ">",
};

export function decodeEntities(s) {
  if (!s) return "";
  let out = s;
  for (const [k, v] of Object.entries(ENTITY_MAP)) out = out.split(k).join(v);
  out = out.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  return out;
}

const MD_V2_SPECIAL = /([_*`\[\]()~>#+\-=|{}.!\\])/g;

export function escapeMd(s) {
  if (!s) return "";
  return s.replace(MD_V2_SPECIAL, "\\$1");
}

export function stripTags(s) {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, "");
}

export function truncate(s, n) {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

export function slugify(s) {
  if (!s) return "";
  return s.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 60);
}

export function b64encode(s) {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64decode(s) {
  let b = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b.length % 4) b += "=";
  return atob(b);
}

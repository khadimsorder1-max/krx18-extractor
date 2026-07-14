import { FILTERS as DEFAULT_FILTERS } from "../config.js";

/** Validation helpers */
export function safeCallback(data) {
  if (!data || typeof data !== "string") return null;
  if (data.length > 64) return null;
  if (!/^[a-z0-9:_-]+$/i.test(data)) return null;
  return data;
}

export function isValidPage(page) {
  const num = Number(page);
  return Number.isInteger(num) && num >= 1 && num <= 100;
}

export function isValidFilter(filter, filters = DEFAULT_FILTERS) {
  return typeof filter === "string" && filters.has(filter);
}

export function isValidSlug(slug) {
  return /^[a-z0-9-]+$/i.test(slug) && slug.length >= 3 && slug.length <= 200;
}

export function isValidUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeRequestText(text) {
  if (!text || typeof text !== "string") return "";
  const trimmed = text.trim();
  if (trimmed.length > 500) {
     return trimmed.slice(0, 500);
  }
  return trimmed;
}


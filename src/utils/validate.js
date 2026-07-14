/** Validation helpers */
export function safeCallback(data) {
  if (!data || typeof data !== "string") return null;
  if (data.length > 200) return null;
  if (!/^[a-z0-9:_-]+$/i.test(data)) return null;
  return data;
}

export function isValidPage(page) {
  return Number.isInteger(page) && page >= 1 && page <= 100;
}

export function isValidFilter(filter, FILTERS) {
  return !filter || FILTERS.has(filter);
}

export function isValidSlug(slug) {
  return /^[a-z0-9-]+$/i.test(slug) && slug.length >= 2 && slug.length <= 200;
}

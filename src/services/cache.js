/** Cache service (Cloudflare KV) */
export const cache = {
  async getJson(kv, key) {
    if (!kv) return null;
    try {
      const v = await kv.get(key, { type: "json" });
      return v || null;
    } catch { return null; }
  },
  async setJson(kv, key, value, ttl) {
    if (!kv) return;
    try { await kv.put(key, JSON.stringify(value), { expirationTtl: ttl }); } catch {}
  },
  async del(kv, key) {
    if (!kv) return;
    try { await kv.delete(key); } catch {}
  },
};

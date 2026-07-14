/** Stats service */
import { CONSTANTS } from "../config.js";

export async function recordDownload(kv, userId, host) {
  if (!kv) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const key = `stats:${today}`;
    const data = (await kv.get(key, { type: "json" })) || { total: 0, hosts: {}, users: {} };
    data.total = (data.total || 0) + 1;
    data.hosts[host] = (data.hosts[host] || 0) + 1;
    if (userId) data.users[userId] = (data.users[userId] || 0) + 1;
    await kv.put(key, JSON.stringify(data), { expirationTtl: CONSTANTS.STATS_TTL });
  } catch {}
}

export async function getStats(kv) {
  if (!kv) return null;
  try {
    const total = { total: 0, hosts: {}, daily: {}, uniqueUsers: 0, uniqueMovies: 0 };
    const today = new Date();
    const userList = new Set();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today.getTime() - i * 86400000);
      const day = d.toISOString().slice(0, 10);
      const data = await kv.get(`stats:${day}`, { type: "json" });
      if (data) {
        total.daily[day] = data.total || 0;
        total.total += data.total || 0;
        for (const [h, c] of Object.entries(data.hosts || {})) total.hosts[h] = (total.hosts[h] || 0) + c;
        for (const u of Object.keys(data.users || {})) userList.add(u);
      }
    }
    total.uniqueUsers = userList.size;
    return total;
  } catch { return null; }
}

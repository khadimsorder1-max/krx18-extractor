/** GitHub Actions dispatch */
import { CONSTANTS } from "../config.js";
import * as logger from "../utils/logger.js";

export async function dispatchEvent(config, eventType, payload = {}, reqId) {
  if (!config.githubToken || !config.githubRepo) {
    return { ok: false, error: "GitHub not configured. Set GITHUB_TOKEN and GITHUB_REPO." };
  }
  const url = `${CONSTANTS.GH_API_BASE}/repos/${config.githubRepo}/dispatches`;
  logger.info("Dispatching GitHub event", { eventType, repo: config.githubRepo }, reqId);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": CONSTANTS.GH_API_VERSION,
        "User-Agent": "cloudflare-worker",
      },
      body: JSON.stringify({ event_type: eventType, client_payload: payload }),
    });
    if (r.status === 204) {
      logger.info("GitHub dispatch OK", { eventType }, reqId);
      return { ok: true };
    }
    const errText = await r.text();
    logger.warn("GitHub dispatch failed", { status: r.status, body: errText.slice(0, 200) }, reqId);
    return { ok: false, error: `GitHub API ${r.status}: ${errText.slice(0, 200)}` };
  } catch (e) {
    logger.error("GitHub dispatch exception", { error: String(e) }, reqId);
    return { ok: false, error: String(e) };
  }
}

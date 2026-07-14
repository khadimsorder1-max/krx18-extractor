/**
 * External Player URL Schemes — generates deep links for popular video players.
 */

import { b64encode } from "./text.js";

export function mxPlayerIntent(streamUrl, title = "") {
  const safeTitle = title.replace(/[#;]/g, "").slice(0, 100);
  return `intent://${streamUrl.replace(/^https?:\/\//, "")}#Intent;package=com.mxtech.videoplayer.ad;S.title=${encodeURIComponent(safeTitle)};end`;
}

export function vlcUrl(streamUrl) { return `vlc://${streamUrl}`; }
export function justPlayerIntent(streamUrl) {
  return `intent://${streamUrl.replace(/^https?:\/\//, "")}#Intent;package=com.brouken.player;end`;
}
export function mpvUrl(streamUrl) { return `mpv://${streamUrl}`; }
export function potPlayerUrl(streamUrl) { return `potplayer://${streamUrl}`; }

/**
 * Build all player buttons for a stream URL.
 * Returns array of {text, url} for inline keyboard.
 *
 * The stream URL can be either:
 *  - The raw CDN URL (if it works without Referer)
 *  - A proxy URL (if PROXY_WORKER_URL is set) — proxy adds Referer: https://mov18plus.cloud/
 */
export function buildPlayerButtons(streamUrl, title = "", useProxy = false, proxyWorkerUrl = "") {
  if (!streamUrl) return [];

  // If proxy is configured + needed, use proxy URL for players that need Referer
  // (abysscdn / iamcdn typically require Referer: https://mov18plus.cloud/)
  const needsProxy = useProxy && proxyWorkerUrl && /abysscdn|iamcdn|sssrr|tapecontent/i.test(streamUrl);
  const playUrl = needsProxy ? makeProxyUrl(streamUrl, proxyWorkerUrl) : streamUrl;

  return [
    [
      { text: "▶️ MX Player", url: mxPlayerIntent(playUrl, title) },
      { text: "▶️ VLC", url: vlcUrl(playUrl) },
    ],
    [
      { text: "▶️ Just Player", url: justPlayerIntent(playUrl) },
      { text: "▶️ MPV", url: mpvUrl(playUrl) },
    ],
    [
      { text: "⬇️ Download", url: playUrl },
      { text: "📋 Copy URL", callback_data: `copy:${b64encode(playUrl)}` },
    ],
  ];
}

export function makeProxyUrl(cdnUrl, proxyWorkerUrl) {
  if (!proxyWorkerUrl) return cdnUrl;
  const b64 = b64encode(cdnUrl);
  return `${proxyWorkerUrl}/proxy/${b64}`;
}

export function buildDesktopPlayerButtons(streamUrl, useProxy = false, proxyWorkerUrl = "") {
  if (!streamUrl) return [];
  const needsProxy = useProxy && proxyWorkerUrl && /abysscdn|iamcdn|sssrr|tapecontent/i.test(streamUrl);
  const playUrl = needsProxy ? makeProxyUrl(streamUrl, proxyWorkerUrl) : streamUrl;
  return [
    [
      { text: "▶️ VLC", url: vlcUrl(playUrl) },
      { text: "▶️ PotPlayer", url: potPlayerUrl(playUrl) },
    ],
    [
      { text: "▶️ MPV", url: mpvUrl(playUrl) },
      { text: "⬇️ Download", url: playUrl },
    ],
  ];
}

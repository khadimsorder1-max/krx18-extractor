/** Webhook secret check — supports header (Telegram recommended) + query param fallback */
export function checkWebhookSecret(config, request) {
  if (!config.webhookSecret) return true;
  const headerToken = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (headerToken && headerToken === config.webhookSecret) return true;
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  return queryToken === config.webhookSecret;
}

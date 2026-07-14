/** Telegram API service */
import { CONSTANTS } from "../config.js";

export async function sendMessage(botToken, chatId, text, extra = {}) {
  try {
    const r = await fetch(`${CONSTANTS.TG_API_BASE}${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, ...extra }),
    });
    return await r.json();
  } catch (e) {
    console.error("sendMessage:", e.message);
    return null;
  }
}

export async function sendPhoto(botToken, chatId, photo, caption, extra = {}) {
  try {
    const r = await fetch(`${CONSTANTS.TG_API_BASE}${botToken}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, photo, caption, ...extra }),
    });
    return await r.json();
  } catch (e) {
    console.error("sendPhoto:", e.message);
    return null;
  }
}

export async function sendPhotoOrText(botToken, chatId, photo, caption, extra = {}) {
  if (photo) {
    const r = await sendPhoto(botToken, chatId, photo, caption, extra);
    if (r?.ok) return r;
  }
  return sendMessage(botToken, chatId, caption, extra);
}

export async function editMessageText(botToken, chatId, messageId, text, extra = {}) {
  try {
    const r = await fetch(`${CONSTANTS.TG_API_BASE}${botToken}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, ...extra }),
    });
    return await r.json();
  } catch (e) {
    console.error("editMessageText:", e.message);
    return null;
  }
}

export async function answerCallback(botToken, callbackQueryId, text = "") {
  try {
    await fetch(`${CONSTANTS.TG_API_BASE}${botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch {}
}

export async function deleteMessage(botToken, chatId, messageId) {
  try {
    await fetch(`${CONSTANTS.TG_API_BASE}${botToken}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
  } catch {}
}

export async function setMyCommands(botToken, commands) {
  try {
    const r = await fetch(`${CONSTANTS.TG_API_BASE}${botToken}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands }),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function setChatMenuButton(botToken, button) {
  try {
    const r = await fetch(`${CONSTANTS.TG_API_BASE}${botToken}/setChatMenuButton`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menu_button: button }),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function setWebhook(botToken, url, secret) {
  try {
    const params = { url, max_connections: 40, allowed_updates: ["message", "callback_query", "inline_query"] };
    if (secret) params.secret_token = secret;
    const r = await fetch(`${CONSTANTS.TG_API_BASE}${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

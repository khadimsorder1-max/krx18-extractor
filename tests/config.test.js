/**
 * Unit tests — config + env validation
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEnv, isUserAllowed, CONSTANTS, FILTERS } from "../src/config.js";

test("validateEnv — missing BOT_TOKEN", () => {
  const { ok, missing, config } = validateEnv({});
  assert.equal(ok, false);
  assert.ok(missing.includes("BOT_TOKEN"));
  assert.equal(config.botToken, undefined);
});

test("validateEnv — all required present", () => {
  const { ok, missing, config } = validateEnv({ BOT_TOKEN: "test:token" });
  assert.equal(ok, true);
  assert.equal(missing.length, 0);
  assert.equal(config.botToken, "test:token");
});

test("validateEnv — parses ALLOWED_USERS", () => {
  const { config } = validateEnv({
    BOT_TOKEN: "x",
    ALLOWED_USERS: "111,222,333",
  });
  assert.deepEqual(config.allowedUsers, ["111", "222", "333"]);
});

test("validateEnv — empty ALLOWED_USERS → null (anyone)", () => {
  const { config } = validateEnv({ BOT_TOKEN: "x" });
  assert.equal(config.allowedUsers, null);
});

test("isUserAllowed — no whitelist = anyone", () => {
  const { config } = validateEnv({ BOT_TOKEN: "x" });
  assert.equal(isUserAllowed(config, 123), true);
  assert.equal(isUserAllowed(config, 999), true);
});

test("isUserAllowed — whitelist active", () => {
  const { config } = validateEnv({
    BOT_TOKEN: "x",
    ALLOWED_USERS: "111,222",
  });
  assert.equal(isUserAllowed(config, 111), true);
  assert.equal(isUserAllowed(config, 222), true);
  assert.equal(isUserAllowed(config, 333), false);
  assert.equal(isUserAllowed(config, undefined), false);
});

test("CONSTANTS — has required fields", () => {
  assert.ok(CONSTANTS.KRX_BASE);
  assert.ok(CONSTANTS.CACHE_TTL > 0);
  assert.ok(CONSTANTS.FETCH_TIMEOUT_MS > 0);
  assert.ok(CONSTANTS.MOVIES_PER_PAGE > 0);
});

test("FILTERS — contains expected options", () => {
  assert.ok(FILTERS.has("eng-sub"));
  assert.ok(FILTERS.has("censored"));
  assert.ok(FILTERS.has("uncensored"));
  assert.ok(FILTERS.has("hd"));
  assert.ok(FILTERS.has("korea"));
});

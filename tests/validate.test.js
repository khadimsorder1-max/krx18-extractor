/**
 * Unit tests — validate utilities
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidUrl,
  isValidSlug,
  isValidFilter,
  isValidPage,
  safeCallback,
  sanitizeRequestText,
} from "../src/utils/validate.js";

test("isValidUrl", () => {
  assert.equal(isValidUrl("https://example.com"), true);
  assert.equal(isValidUrl("http://localhost:3000"), true);
  assert.equal(isValidUrl("not a url"), false);
  assert.equal(isValidUrl(""), false);
  assert.equal(isValidUrl(null), false);
});

test("isValidSlug", () => {
  assert.equal(isValidSlug("massage-room-2026"), true);
  assert.equal(isValidSlug("85947-test-movie"), true);
  assert.equal(isValidSlug("ab"), false); // too short
  assert.equal(isValidSlug("../etc/passwd"), false); // path traversal
  assert.equal(isValidSlug("movie with spaces"), false);
  assert.equal(isValidSlug(""), false);
});

test("isValidFilter", () => {
  assert.equal(isValidFilter("eng-sub"), true);
  assert.equal(isValidFilter("censored"), true);
  assert.equal(isValidFilter("hd"), true);
  assert.equal(isValidFilter("invalid"), false);
  assert.equal(isValidFilter(""), false);
});

test("isValidPage", () => {
  assert.equal(isValidPage(1), true);
  assert.equal(isValidPage("5"), true);
  assert.equal(isValidPage(0), false);
  assert.equal(isValidPage(-1), false);
  assert.equal(isValidPage(1000), false); // too large
});

test("safeCallback — 64 byte limit", () => {
  assert.equal(safeCallback("short"), "short");
  assert.equal(safeCallback(null), null);
  const long = "x".repeat(65);
  assert.equal(safeCallback(long), null);
  const max = "x".repeat(64);
  assert.equal(safeCallback(max), max);
});

test("sanitizeRequestText", () => {
  assert.equal(sanitizeRequestText("  hello  "), "hello");
  assert.equal(sanitizeRequestText(""), "");
  assert.equal(sanitizeRequestText(null), "");
  const long = "x".repeat(600);
  assert.equal(sanitizeRequestText(long).length, 500);
});

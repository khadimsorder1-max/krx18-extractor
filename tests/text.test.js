/**
 * Unit tests — text utilities
 * Run with: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeEntities,
  escapeMd,
  stripTags,
  truncate,
  slugify,
  b64encode,
  b64decode,
} from "../src/utils/text.js";

test("decodeEntities — converts HTML entities", () => {
  assert.equal(decodeEntities("Dhamaal &amp; Co"), "Dhamaal & Co");
  assert.equal(decodeEntities("Hello&#8211;World"), "Hello-World");
  assert.equal(decodeEntities("It&#8217;s here"), "It's here");
  assert.equal(decodeEntities("&nbsp;&quot;Hi&quot;"), ' "Hi"');
  assert.equal(decodeEntities(""), "");
  assert.equal(decodeEntities(null), "");
});

test("escapeMd — escapes MarkdownV2 special chars", () => {
  assert.equal(escapeMd("hello.world"), "hello\\.world");
  assert.equal(escapeMd("a_b*c"), "a\\_b\\*c");
  assert.equal(escapeMd("done!"), "done\\!");
  assert.equal(escapeMd(""), "");
});

test("stripTags — removes HTML tags", () => {
  assert.equal(stripTags("<b>Hi</b>"), "Hi");
  assert.equal(stripTags("<a href='x'>Link</a>"), "Link");
  assert.equal(stripTags("no tags"), "no tags");
  assert.equal(stripTags("<div><span>Nested</span></div>"), "Nested");
});

test("truncate — trims to length with ellipsis", () => {
  assert.equal(truncate("hello", 10), "hello");
  assert.equal(truncate("hello world", 5), "hell…");
  assert.equal(truncate("", 5), "");
});

test("slugify — converts to URL slug", () => {
  assert.equal(slugify("Hello World!"), "hello-world");
  assert.equal(slugify("  Multiple   Spaces  "), "multiple-spaces");
  assert.equal(slugify(""), "");
});

test("b64encode/b64decode — round trip", () => {
  const original = "https://krx18.com/movies/85947-test/";
  const encoded = b64encode(original);
  assert.notEqual(encoded, original);
  assert.equal(b64decode(encoded), original);
});

test("b64encode — URL-safe (no + or /)", () => {
  const encoded = b64encode("https://example.com/path?a=b+c/d");
  assert.ok(!encoded.includes("+"), "should not contain +");
  assert.ok(!encoded.includes("/"), "should not contain /");
  assert.ok(!encoded.includes("="), "should not contain =");
});

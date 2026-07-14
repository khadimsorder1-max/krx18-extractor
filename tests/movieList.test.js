/**
 * Unit tests — movie list parser
 * Uses a minimal HTML snippet that mimics krx18's article structure.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMovieList, filterMovies } from "../src/parsers/movieList.js";

const SAMPLE_HTML = `
<article id="post-85947">
  <div class="poster">
    <img src="https://cdnupload.com/wp-content/uploads/2026/07/massage-room-2026-f501.jpg" alt="Massage Room">
    <div class="mepo"><span class="quality">HD-ENG</span></div>
    <a href="https://krx18.com/movies/85947-massage-room-2026/"><div class="see play4"></div></a>
  </div>
  <div class="data">
    <h3><a href="https://krx18.com/movies/85947-massage-room-2026/">Massage Room 2026</a></h3>
    <span>Jul. 12, 2026</span>
  </div>
  <div class="animation-1 dtinfo">
    <div class="title"><h4>Massage Room 2026</h4></div>
    <div class="metadata"><span>2026</span></div>
    <div class="texto">A short synopsis that gets truncated...</div>
    <div class="genres"><div class="mta">
      <a href="https://krx18.com/genre/eng-sub/" rel="tag">Eng Sub</a>
      <a href="https://krx18.com/genre/korea/" rel="tag">Korea</a>
    </div></div>
  </div>
</article>
<article id="post-85943">
  <div class="poster">
    <img src="https://cdnupload.com/wp-content/uploads/2026/07/uncensored-2026.jpg" alt="Uncensored">
    <div class="mepo"><span class="quality">HD-Uncut</span></div>
    <a href="https://krx18.com/movies/85943-uncensored-2026/"><div class="see play4"></div></a>
  </div>
  <div class="data">
    <h3><a href="https://krx18.com/movies/85943-uncensored-2026/">Uncensored 2026</a></h3>
    <span>Jul. 11, 2026</span>
  </div>
</article>
`;

test("parseMovieList — extracts all movies", () => {
  const movies = parseMovieList(SAMPLE_HTML);
  assert.equal(movies.length, 2);
});

test("parseMovieList — extracts title and URL", () => {
  const movies = parseMovieList(SAMPLE_HTML);
  assert.equal(movies[0].title, "Massage Room 2026");
  assert.equal(movies[0].url, "https://krx18.com/movies/85947-massage-room-2026/");
});

test("parseMovieList — extracts poster", () => {
  const movies = parseMovieList(SAMPLE_HTML);
  assert.equal(
    movies[0].poster,
    "https://cdnupload.com/wp-content/uploads/2026/07/massage-room-2026-f501.jpg"
  );
});

test("parseMovieList — extracts slug from URL", () => {
  const movies = parseMovieList(SAMPLE_HTML);
  assert.equal(movies[0].slug, "85947-massage-room-2026");
  assert.equal(movies[1].slug, "85943-uncensored-2026");
});

test("parseMovieList — extracts release date", () => {
  const movies = parseMovieList(SAMPLE_HTML);
  assert.equal(movies[0].releaseDate, "Jul. 12, 2026");
});

test("parseMovieList — extracts year", () => {
  const movies = parseMovieList(SAMPLE_HTML);
  assert.equal(movies[0].year, "2026");
});

test("parseMovieList — extracts quality badge", () => {
  const movies = parseMovieList(SAMPLE_HTML);
  assert.equal(movies[0].quality, "HD-ENG");
  assert.equal(movies[1].quality, "HD-Uncut");
});

test("parseMovieList — strips trailing ... from synopsis", () => {
  const movies = parseMovieList(SAMPLE_HTML);
  assert.equal(movies[0].synopsis, "A short synopsis that gets truncated");
});

test("parseMovieList — extracts genres", () => {
  const movies = parseMovieList(SAMPLE_HTML);
  assert.deepEqual(movies[0].genres, ["Eng Sub", "Korea"]);
});

test("parseMovieList — extracts post ID", () => {
  const movies = parseMovieList(SAMPLE_HTML);
  assert.equal(movies[0].postId, "85947");
});

test("parseMovieList — empty input returns empty array", () => {
  assert.deepEqual(parseMovieList(""), []);
  assert.deepEqual(parseMovieList("<html><body>no articles</body></html>"), []);
});

test("filterMovies — eng-sub filter", () => {
  const movies = parseMovieList(SAMPLE_HTML);
  const filtered = filterMovies(movies, "eng-sub");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].slug, "85947-massage-room-2026");
});

test("filterMovies — no filter returns all", () => {
  const movies = parseMovieList(SAMPLE_HTML);
  const filtered = filterMovies(movies, null);
  assert.equal(filtered.length, 2);
});

// node --test site/assets/page-data.test.js  (the event and partner pages' plain parts, no browser needed)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("./page-data.js");

const ev = {
  slug: "marathon-58-a1b2c3", name: "Marathon; du bout, du monde", tagline: "42 km\nentre mer et glaciers",
  starts_at: "2026-11-14T12:00:00+00:00", ends_at: "2026-11-14T18:00:00+00:00", timezone: "America/Argentina/Ushuaia"
};

test("texts: one line or several, controls and direction overrides gone, cut to their length", () => {
  assert.equal(P.text("  a\n b\tc  ", 80), "a b c");
  assert.equal(P.text("evil‮txt\u0000", 80), "eviltxt");
  assert.equal(P.text("a\r\nb\n\n\n\nc", 80, true), "a\nb\n\nc");
  assert.equal(P.text("é".repeat(90), 80).length, 80);
  for (const v of [null, 42, {}, ["x"]]) assert.equal(P.text(v, 80), "");
});

test("only a partner-media name of the right kind is ever fetched", () => {
  const cover = "12/cover-" + "a".repeat(32) + ".jpg";
  assert.equal(P.mediaName(cover, "cover"), cover);
  assert.equal(P.mediaName(cover, "logo"), null);
  for (const v of ["../12/cover-" + "a".repeat(32) + ".jpg", "12/cover-" + "a".repeat(31) + ".jpg", "12/cover-" + "a".repeat(32) + ".svg",
    "https://evil.example/x.jpg", "12/cover-" + "A".repeat(32) + ".png", null]) {
    assert.equal(P.mediaName(v, "cover"), null, String(v));
  }
});

test("dates and a station's hours read in the event's own time zone", () => {
  const d = P.dates(ev.starts_at, ev.ends_at, ev.timezone, "en");
  for (const part of [/Nov/, /14/, /9:00/, /3:00/]) assert.match(d, part); // Ushuaia is UTC-3
  assert.equal(P.dates("nope", ev.ends_at, ev.timezone, "en"), "");
  assert.equal(P.dates(ev.ends_at, ev.starts_at, ev.timezone, "en"), "");
  assert.match(P.dates(ev.starts_at, ev.ends_at, "Not/AZone", "en"), /12:00/); // a zone the browser doesn't know: UTC
  assert.equal(P.zone("Not/AZone"), "UTC");
  assert.equal(P.hours({ name: "x" }, ev, "en"), null);
  assert.match(P.hours({ opens_at: "2026-11-14T13:00:00Z", closes_at: "2026-11-14T15:30:00Z" }, ev, "en"), /^10:00\sAM – 12:30\sPM$/);
  assert.match(P.hours({ closes_at: "2026-11-14T15:30:00Z" }, ev, "en"), /^9:00\sAM – /); // opens with the event
  const long = Object.assign({}, ev, { ends_at: "2026-11-16T18:00:00Z" });
  assert.match(P.hours({ opens_at: "2026-11-15T13:00:00Z" }, long, "en"), /^Sun/); // several days: the day too
  assert.match(P.dates(ev.starts_at, ev.ends_at, ev.timezone, "ja"), /11/);
});

test("the route's sketch fits its box; stations keep their numbers; nothing to draw is null", () => {
  const s = P.sketch([[-54.8, -68.3], [-54.8, -68.25], [-54.78, -68.2]], [{ latitude: -54.801, longitude: -68.29 }, { latitude: 99, longitude: 0 }], 320, 200, 16);
  const pts = s.line.split(" ").map((p) => p.split(",").map(Number));
  assert.equal(pts.length, 3);
  for (const [x, y] of pts.concat([s.stops[0]])) {
    assert.ok(x >= 16 && x <= 304, String(x));
    assert.ok(y >= 16 && y <= 184, String(y));
  }
  assert.ok(pts[2][1] < pts[0][1], "north is up");
  assert.ok(pts[2][0] > pts[0][0], "east is right");
  assert.equal(s.stops[1], null, "a station out of range isn't drawn, the next keeps its number");
  assert.equal(P.sketch([], [], 320, 200, 16), null);
  assert.equal(P.sketch([[1, 2]], [], 320, 200, 16), null, "one point is no route");
  assert.deepEqual(P.sketch([], [{ latitude: 1, longitude: 2 }], 320, 200, 16), { line: "", stops: [[160, 100]] });
  assert.equal(P.sketch("nope", { a: 1 }, 320, 200, 16), null);
  assert.equal(P.sketch([["1", "2"], [null, 3]], [], 320, 200, 16), null, "only numbers are coordinates");
});

test("the calendar file: UTC times, escaped text, lines folded at 75 bytes", () => {
  const t = P.ics(ev, "https://example.org/e/?s=" + ev.slug, Date.parse("2026-10-29T08:00:00Z"));
  assert.ok(t.startsWith("BEGIN:VCALENDAR\r\n") && t.endsWith("END:VCALENDAR\r\n"));
  assert.match(t, /\r\nDTSTART:20261114T120000Z\r\nDTEND:20261114T180000Z\r\n/);
  assert.match(t, /\r\nDTSTAMP:20261029T080000Z\r\n/);
  assert.match(t, /\r\nSUMMARY:Marathon\\; du bout\\, du monde\r\n/);
  assert.match(t.replace(/\r\n /g, ""), /\r\nDESCRIPTION:42 km entre mer et glaciers\\nhttps:\/\/example\.org\/e\/\?s=marathon-58-a1b2c3\r\n/);
  assert.match(t, /\r\nUID:marathon-58-a1b2c3@waternow\r\n/);
  for (const line of t.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, line);
  const long = P.fold("DESCRIPTION:" + "é".repeat(60));
  assert.ok(long.split("\r\n").every((l, i) => Buffer.byteLength(l) <= 75 && (i === 0 || l.startsWith(" "))));
  assert.equal(long.split("\r\n").map((l, i) => (i ? l.slice(1) : l)).join(""), "DESCRIPTION:" + "é".repeat(60));
  assert.equal(P.ics(Object.assign({}, ev, { ends_at: ev.starts_at }), "x", 0), null);
});

/*
 * The event and partner pages' plain parts (e/, p/, their link previews), shared by the pages (window.WNP), the
 * preview generator and their node tests (module.exports). Whatever the server sends is checked here again: these
 * return plain values, and the pages write them with textContent only.
 */
(function (root) {
  "use strict";

  // Control characters and the direction overrides that could disguise a line (spot-params.js's set, but a line break
  // or a tab is a space).
  var UNSAFE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g;
  var MEDIA = /^[0-9]{1,18}\/(cover|logo)-[0-9a-f]{32}\.(jpg|png|webp)$/;

  /** [v] as text: one line (or [multiline]), at most [max] characters; "" for anything that isn't a string. */
  function text(v, max, multiline) {
    if (typeof v !== "string") return "";
    var t = v.replace(UNSAFE, "");
    t = multiline ? t.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n") : t.replace(/\s+/g, " ");
    return Array.from(t.trim()).slice(0, max).join("");
  }

  /** A partner-media name of that [kind] ("cover" or "logo"), else null: only these are ever fetched. */
  function mediaName(v, kind) {
    var m = typeof v === "string" ? MEDIA.exec(v) : null;
    return m && m[1] === kind ? v : null;
  }

  function time(v) {
    var t = typeof v === "string" ? Date.parse(v) : NaN;
    return isFinite(t) ? t : null;
  }

  /** The event's own zone when the browser knows it, else UTC. */
  function zone(tz) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return typeof tz === "string" && tz ? tz : "UTC";
    } catch (e) {
      return "UTC";
    }
  }

  function sameDay(a, b, tz) {
    var f = new Intl.DateTimeFormat("en-CA", { timeZone: zone(tz), year: "numeric", month: "2-digit", day: "2-digit" });
    return f.format(a) === f.format(b);
  }

  /** "Sat, Nov 14, 2026, 9:00 AM – 3:00 PM" in the event's zone and [lang]; "" when the times aren't usable. */
  function dates(startIso, endIso, tz, lang) {
    var a = time(startIso), b = time(endIso);
    if (a === null || b === null || b < a) return "";
    var f = new Intl.DateTimeFormat(lang, { timeZone: zone(tz), weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
    return typeof f.formatRange === "function" ? f.formatRange(a, b) : f.format(a) + " – " + f.format(b);
  }

  /**
   * A station's hours, "9:00 – 11:00" (with the day when the event lasts several), its open end the event's own;
   * null when it is open the whole event.
   */
  function hours(station, ev, lang) {
    var o = time(station && station.opens_at), c = time(station && station.closes_at);
    if (o === null && c === null) return null;
    var s = time(ev.starts_at), e = time(ev.ends_at);
    var opt = { timeZone: zone(ev.timezone), hour: "numeric", minute: "2-digit" };
    if (s !== null && e !== null && !sameDay(s, e - 1, ev.timezone)) opt.weekday = "short";
    var f = new Intl.DateTimeFormat(lang, opt);
    var from = o !== null ? o : s, to = c !== null ? c : e;
    return from === null || to === null ? null : f.format(from) + " – " + f.format(to);
  }

  /** A route point [lat, lon] or a station {latitude, longitude} as [lat, lon]; null when out of range. */
  function point(p) {
    var lat = Array.isArray(p) ? p[0] : p && p.latitude, lon = Array.isArray(p) ? p[1] : p && p.longitude;
    return typeof lat === "number" && typeof lon === "number" && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? [lat, lon] : null;
  }

  /**
   * The route's sketch in a [w] x [h] box ([pad] around): its line ("x,y x,y ...") and each station's place, on a flat
   * projection (longitudes narrowed by the latitude's cosine). Null with nothing to draw.
   */
  function sketch(route, stations, w, h, pad) {
    var line = (Array.isArray(route) ? route : []).map(point).filter(Boolean);
    if (line.length < 2) line = [];
    var stops = (Array.isArray(stations) ? stations : []).map(point);
    var all = line.concat(stops.filter(Boolean));
    if (!all.length) return null;
    var lat0 = all.reduce(function (s, p) { return s + p[0]; }, 0) / all.length;
    var k = Math.max(Math.cos(lat0 * Math.PI / 180), 0.01);
    var xs = all.map(function (p) { return p[1] * k; }), ys = all.map(function (p) { return p[0]; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var scale = Math.min((w - 2 * pad) / Math.max(maxX - minX, 1e-9), (h - 2 * pad) / Math.max(maxY - minY, 1e-9));
    var ox = (w - (maxX - minX) * scale) / 2, oy = (h - (maxY - minY) * scale) / 2;
    function at(p) { return [Math.round((ox + (p[1] * k - minX) * scale) * 10) / 10, Math.round((h - oy - (p[0] - minY) * scale) * 10) / 10]; }
    return {
      line: line.map(function (p) { return at(p).join(","); }).join(" "),
      stops: stops.map(function (p) { return p ? at(p) : null; })
    };
  }

  // iCalendar text: backslash, semicolon, comma and line breaks escaped; lines folded at 75 bytes (RFC 5545).
  function icsText(v) {
    return String(v).replace(/[\\;,]/g, function (c) { return "\\" + c; }).replace(/\r\n?|\n/g, "\\n");
  }
  function fold(line) {
    var out = [], cur = "", n = 0;
    Array.from(line).forEach(function (ch) {
      var cp = ch.codePointAt(0), b = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      if (n + b > 75) { out.push(cur); cur = " "; n = 1; }
      cur += ch;
      n += b;
    });
    out.push(cur);
    return out.join("\r\n");
  }
  function icsTime(ms) { return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }

  /** The event as an .ics file's text (UTC times, its page's [url]); null when its times aren't usable. */
  function ics(ev, url, now) {
    var a = time(ev.starts_at), b = time(ev.ends_at);
    if (a === null || b === null || b <= a) return null;
    var desc = [text(ev.tagline, 100), url].filter(Boolean).join("\n");
    return [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WaterNow//Events//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
      "UID:" + ev.slug + "@waternow", "DTSTAMP:" + icsTime(now), "DTSTART:" + icsTime(a), "DTEND:" + icsTime(b),
      "SUMMARY:" + icsText(text(ev.name, 80) || "WaterNow"), "DESCRIPTION:" + icsText(desc), "URL:" + url,
      "END:VEVENT", "END:VCALENDAR"
    ].map(fold).join("\r\n") + "\r\n";
  }

  var api = { text: text, mediaName: mediaName, zone: zone, dates: dates, hours: hours, sketch: sketch, ics: ics, fold: fold };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WNP = api;
})(this);

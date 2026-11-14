/*
 * WaterNow share links, shared by the share page (browser, window.WN) and its node test (module.exports).
 * A link can come from anyone: nothing in it is trusted, everything is validated before use.
 */
(function (root) {
  "use strict";

  var ID = /^[1-9][0-9]{0,15}$/;
  var COORD = /^-?[0-9]{1,3}(\.[0-9]{1,10})?$/;
  // Control characters and the direction overrides that could disguise a line (same set as the app).
  var UNSAFE = /[\u0000-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g;
  var NAME_MAX = 80;
  var RAW_NAME_MAX = 300; // longer isn't one of ours: dropped rather than cut
  var RAW_QUERY_MAX = 2048;

  /** Plain one-line text, at most NAME_MAX characters; "" for anything that isn't a short string. */
  function cleanName(raw) {
    if (typeof raw !== "string" || raw.length > RAW_NAME_MAX) return "";
    return Array.from(raw.replace(/\s+/g, " ").replace(UNSAFE, "").trim()).slice(0, NAME_MAX).join("");
  }

  // The English names the app stores for a point without its own (OverpassApiClient's defaults and the city importers'):
  // the app shows the kind's label in the reader's language instead, so the page does too (app/src/test SurfaceCoherenceTest).
  var DEFAULT_NAMES = [
    "Public Bottle Refill Station", "Drinking Water Fountain", "Pet & Dog Drinking Station", "Public Restroom",
    "Water Refill & Restroom Facility", "Water Point", "Drinking fountain", "Fontaine à boire", "Drinking water station",
    "Bottle filling station"
  ];

  /** True for a stored default name ([DEFAULT_NAMES]): not the point's own. */
  function isDefaultName(name) { return DEFAULT_NAMES.indexOf(name) >= 0; }

  /** {id (string, exact), lat, lon, name} from "?id=..&lat=..&lon=..&n=..", or null when id or coordinates are off. */
  function parseSpotParams(search) {
    if (typeof search !== "string" || search.length > RAW_QUERY_MAX) return null;
    var p;
    try { p = new URLSearchParams(search); } catch (e) { return null; }
    var id = p.get("id"), lat = p.get("lat"), lon = p.get("lon");
    if (!id || !ID.test(id) || !Number.isSafeInteger(Number(id))) return null;
    if (!lat || !COORD.test(lat) || !lon || !COORD.test(lon)) return null;
    var la = Number(lat), lo = Number(lon);
    if (!(la >= -90 && la <= 90 && lo >= -180 && lo <= 180)) return null;
    return { id: id, lat: la, lon: lo, name: cleanName(p.get("n")) };
  }

  // An event's or partner's address: the server's rule (and the app's PageLink).
  var SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  var SLUG_MAX = 48;

  function isSlug(s) { return typeof s === "string" && s.length <= SLUG_MAX && SLUG.test(s); }

  /** The slug from "?s=<slug>" (event and partner pages), or null when it is missing or not one. */
  function parseSlug(search) {
    if (typeof search !== "string" || search.length > RAW_QUERY_MAX) return null;
    var p;
    try { p = new URLSearchParams(search); } catch (e) { return null; }
    var s = p.get("s");
    return isSlug(s) ? s : null;
  }

  /** {kind, slug} from a page's own address ".../e/<slug>/" or ".../p/<slug>/" (the app's shares), else null. */
  function pathSlug(pathname) {
    var m = typeof pathname === "string" && pathname.length <= RAW_QUERY_MAX ? /\/(e|p)\/([^/]+)\/?$/.exec(pathname) : null;
    return m && isSlug(m[2]) ? { kind: m[1] === "p" ? "partner" : "event", slug: m[2] } : null;
  }

  /** "Open in WaterNow" for a page: waternow://event/<slug> or waternow://partner/<slug> (the app checks it again). */
  function pageAppLink(kind, slug) {
    return "waternow://" + (kind === "partner" ? "partner" : "event") + "/" + slug;
  }

  function ll(s) { return s.lat.toFixed(6) + "," + s.lon.toFixed(6); }

  /** "Open in WaterNow": the app checks every part again (SpotLink.parse). */
  function appLink(s) {
    return "waternow://spot/" + s.id + "?lat=" + s.lat.toFixed(6) + "&lon=" + s.lon.toFixed(6) +
      (s.name ? "&n=" + encodeURIComponent(s.name) : "");
  }

  /** The phone's map app on Android (geo:), Apple Maps on iOS, a universal maps link elsewhere. */
  function directionsLink(s, userAgent) {
    var ua = userAgent || "";
    if (/Android/i.test(ua)) return "geo:" + ll(s) + "?q=" + ll(s) + (s.name ? "(" + encodeURIComponent(s.name) + ")" : "");
    if (/iPhone|iPad|iPod/i.test(ua)) return "https://maps.apple.com/?daddr=" + ll(s);
    return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(ll(s));
  }

  /** version.json's apkUrl, only when it is an .apk in this site's download/ folder; null otherwise. */
  function safeApkUrl(manifest, siteBase) {
    var u = manifest && manifest.apkUrl;
    if (typeof u !== "string") return null;
    try {
      var url = new URL(u), base = new URL(siteBase), dir = base.pathname + "download/";
      if (url.protocol !== "https:" || url.origin !== base.origin || url.search || url.hash) return null;
      if (url.pathname.indexOf(dir) !== 0) return null;
      return /^[A-Za-z0-9._-]+\.apk$/.test(url.pathname.slice(dir.length)) ? url.href : null;
    } catch (e) {
      return null;
    }
  }

  var DEADLINE_MS = 15000;
  /**
   * fetch with a deadline: with no answer after [ms] (15 s by default) the request is aborted and fails as an offline
   * one does. A request that hung kept its shimmer, a disabled button or a stopped poll until the browser gave up,
   * minutes later. The deadline runs until the answer starts (its headers); a small JSON body comes with them.
   */
  function fetchIn(url, opts, ms, fetchImpl) {
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, ms || DEADLINE_MS) : null;
    return Promise.resolve()
      .then(function () { return (fetchImpl || fetch)(url, ctl ? Object.assign({}, opts, { signal: ctl.signal }) : opts); })
      .then(function (r) { clearTimeout(timer); return r; }, function (e) { clearTimeout(timer); throw e; });
  }

  /**
   * A read that failed (offline, no answer by its deadline, the read limit): [note] says [text], then a button [label]
   * that runs [again]. While it reads again the same button stays (aria-disabled, not disabled: the keyboard's focus
   * stays on it); it works again if that read fails too. Text through textContent only.
   */
  function offlineNote(doc, note, text, label, again) {
    var b = note.querySelector("button.retry");
    if (!b) {
      note.textContent = text + " ";
      b = doc.createElement("button");
      b.type = "button"; b.className = "retry"; b.textContent = label;
      b.addEventListener("click", function () {
        if (b.getAttribute("aria-disabled") === "true") return;
        b.setAttribute("aria-disabled", "true");
        again();
      });
      note.append(b);
    }
    b.removeAttribute("aria-disabled");
    note.classList.remove("hidden");
  }

  /**
   * The note's button is about to go (the read again answered, or WaterNow is being updated): the keyboard's focus, when
   * on it, moves to [heading] (the card's title, next to what the read brought): it fell to <body>, where a screen
   * reader lost its place and heard nothing of what came.
   */
  function leaveNote(doc, note, heading) {
    if (!note.contains(doc.activeElement)) return;
    heading.setAttribute("tabindex", "-1");
    heading.focus();
  }

  /**
   * "Get WaterNow" on a page of the site whose root is [siteBase]: a promise of version.json's APK (safeApkUrl), or of
   * null when the manifest can't be read or doesn't check out, and the button keeps its link to the home page.
   */
  function apkLink(siteBase, fetchImpl) {
    return fetchIn(siteBase + "version.json", { cache: "no-cache", credentials: "omit" }, 0, fetchImpl)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) { return safeApkUrl(m, siteBase); })
      .catch(function () { return null; });
  }

  /**
   * WaterNow's server answering 503: it is being updated (maintenance, or the gateway while it restarts). Pages say so
   * in one short line and try again later; nothing else on them breaks.
   */
  function isMaintenance(status) { return status === 503; }

  /** get_spot_card's "Verified by WaterNow" badge: only a real JSON true counts. */
  function isVerified(card) { return !!card && typeof card === "object" && card.verified === true; }

  /**
   * get_spot_card's "Free refill" (setup section 88): a business fills bottles for free here. Its last "yes" (ms) when
   * the server says a real JSON true with a date under 45 days old at [now] (the app's rule: a page left open keeps it
   * honest), else null.
   */
  function freeRefillSince(card, now) {
    if (!card || typeof card !== "object" || card.free_refill !== true || typeof card.free_refill_confirmed_at !== "string") return null;
    var at = Date.parse(card.free_refill_confirmed_at);
    return isFinite(at) && now - at < 45 * 86400000 ? at : null;
  }

  var LANGS = ["en", "fr", "es", "de", "pt", "ja", "ro"]; // the app's languages
  /**
   * The site language for the browser's languages, best first (navigator.languages, or one BCP-47 tag): the first one
   * the app speaks ("pt-PT" → "pt"; Italian then French → "fr"), "en" when none is one of LANGS. Reading only the first
   * gave English to someone whose second language was French.
   */
  function lang(prefs) {
    var list = Array.isArray(prefs) ? prefs : [prefs];
    for (var i = 0; i < list.length; i++) {
      var m = /^([a-z]{2,3})(?:[-_]|$)/i.exec(typeof list[i] === "string" ? list[i] : "");
      var code = m ? m[1].toLowerCase() : "";
      if (LANGS.indexOf(code) >= 0) return code;
    }
    return "en";
  }

  /** What [lang] reads in a browser: its whole list of languages when it has one. */
  function browserLangs(nav) {
    return nav && nav.languages && nav.languages.length ? Array.prototype.slice.call(nav.languages) : nav && nav.language;
  }

  /** "qr" or "nfc" when the link came from a sticker or a tag (the app's &src=), else null: nothing else is believed. */
  function scanSource(search) {
    if (typeof search !== "string" || search.length > RAW_QUERY_MAX) return null;
    var p;
    try { p = new URLSearchParams(search); } catch (e) { return null; }
    var s = p.get("src");
    return s === "qr" || s === "nfc" ? s : null;
  }

  var api = {
    scanSource: scanSource,
    cleanName: cleanName, isDefaultName: isDefaultName, parseSpotParams: parseSpotParams, appLink: appLink, directionsLink: directionsLink, safeApkUrl: safeApkUrl, apkLink: apkLink,
    fetchIn: fetchIn, offlineNote: offlineNote, leaveNote: leaveNote,
    isSlug: isSlug, parseSlug: parseSlug, pathSlug: pathSlug, pageAppLink: pageAppLink,
    isMaintenance: isMaintenance, isVerified: isVerified, freeRefillSince: freeRefillSince, lang: lang, browserLangs: browserLangs, LANGS: LANGS
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WN = api;
})(this);

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

  /**
   * WaterNow's server answering 503: it is being updated (maintenance, or the gateway while it restarts). Pages say so
   * in one short line and try again later; nothing else on them breaks.
   */
  function isMaintenance(status) { return status === 503; }

  /** get_spot_card's "Verified by WaterNow" badge: only a real JSON true counts. */
  function isVerified(card) { return !!card && typeof card === "object" && card.verified === true; }

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

  var api = {
    cleanName: cleanName, parseSpotParams: parseSpotParams, appLink: appLink, directionsLink: directionsLink, safeApkUrl: safeApkUrl,
    isSlug: isSlug, parseSlug: parseSlug, pathSlug: pathSlug, pageAppLink: pageAppLink,
    isMaintenance: isMaintenance, isVerified: isVerified, lang: lang, browserLangs: browserLangs, LANGS: LANGS
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WN = api;
})(this);

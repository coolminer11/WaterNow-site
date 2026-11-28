/*
 * The site's 404 page (404.html: GitHub Pages serves it for any missing address, at any depth). An app share
 * e/<slug> or p/<slug> whose preview folder isn't there, with or without its last slash or an index.html, goes to the
 * live page e/?s=<slug> (p/?s=<slug>), the rest of its query and its fragment kept. Anything else stays here, in the
 * reader's language, with a way home. Shared with the node test (module.exports).
 */
(function (root) {
  "use strict";

  /**
   * Where [pathname] + [search] should go, from the site's root folder [base] ("/WaterNow-site/"), else null. Only
   * e/<slug> and p/<slug> straight under the root: anything deeper or shallower isn't one of the app's shares.
   */
  function target(pathname, search, base, WN) {
    if (typeof pathname !== "string" || typeof base !== "string" || pathname.indexOf(base) !== 0) return null;
    var m = /^([ep])\/([^/]+)(?:\/(?:index\.html)?)?$/.exec(pathname.slice(base.length));
    if (!m || !WN.isSlug(m[2])) return null;
    var q = new URLSearchParams([["s", m[2]]]);
    try {
      new URLSearchParams(search || "").forEach(function (v, k) { if (k !== "s") q.append(k, v); });
    } catch (e) { /* the slug is enough */ }
    return base + m[1] + "/?" + q.toString();
  }

  // One table per app language (WN.LANGS); keys are element ids.
  var STRINGS = {
    en: { title: "This page doesn't exist", text: "The link may be incomplete, or the page was moved.", home: "Go to WaterNow's home page" },
    fr: { title: "Cette page n'existe pas", text: "Le lien est peut-être incomplet, ou la page a changé d'adresse.", home: "Aller à l'accueil de WaterNow" },
    es: { title: "Esta página no existe", text: "Puede que el enlace esté incompleto o que la página haya cambiado de dirección.", home: "Ir al inicio de WaterNow" },
    de: { title: "Diese Seite gibt es nicht", text: "Vielleicht ist der Link unvollständig, oder die Seite ist umgezogen.", home: "Zur Startseite von WaterNow" },
    pt: { title: "Esta página não existe", text: "O link pode estar incompleto, ou a página mudou de endereço.", home: "Ir para o início do WaterNow" },
    ja: { title: "このページは存在しません", text: "リンクが不完全か、ページが移動した可能性があります。", home: "WaterNowのホームへ" },
    ro: { title: "Această pagină nu există", text: "Linkul poate fi incomplet sau pagina s-a mutat.", home: "Mergi la pagina principală WaterNow" }
  };

  if (typeof module === "object" && module.exports) {
    module.exports = { target: target, STRINGS: STRINGS };
    return;
  }

  var WN = root.WN;
  // This script's own folder is the site's assets/: its parent is the root, wherever the site is hosted.
  var base = new URL("../", document.currentScript.src).pathname;
  var to = target(location.pathname, location.search, base, WN);
  // On its way to its page, "This page doesn't exist" never shows: the hold's 3 s net painted it (in English) while a
  // slow network was still bringing the share's page.
  if (to) { document.querySelector("main").classList.add("hidden"); location.replace(to + location.hash); return; }

  var lang = WN.lang(WN.browserLangs(navigator)), T = STRINGS[lang];
  document.documentElement.lang = lang;
  document.documentElement.classList.add("wn-ready"); // main.hold shows now, in this language (site.css)
  Object.keys(T).forEach(function (id) { document.getElementById(id).textContent = T[id]; });
})(this);

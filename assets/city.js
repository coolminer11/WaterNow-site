/* City pages (villes/, scripts/gen-city-pages.mjs): the download buttons take version.json's APK when it checks out
   (WN.apkLink); otherwise they keep their link to the home page, which offers it. Nothing else runs here. */
(function () {
  "use strict";
  var root = new URL(document.body.getAttribute("data-root") || "./", location.href).href;
  window.WN.apkLink(root).then(function (apk) {
    if (!apk) return;
    Array.prototype.forEach.call(document.querySelectorAll("a[data-get]"), function (a) { a.href = apk; });
  });
})();

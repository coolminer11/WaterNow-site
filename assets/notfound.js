/* The site's 404 page: an app share (e/<slug>/ or p/<slug>/) without its preview folder goes to the live page. */
(function () {
  "use strict";
  var page = window.WN.pathSlug(location.pathname);
  if (page) location.replace(location.pathname.replace(/[^/]+\/?$/, "") + "?s=" + page.slug);
})();

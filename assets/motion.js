/*
 * The public pages' scroll motion (site.css does the rest). A card that is below the screen when the page opens rises
 * in as it comes into view, and WNM.inView(el, fn) runs fn once el is on screen: the stats counters count up then, an
 * event's route draws itself, the heat map fades in. With prefers-reduced-motion, or without IntersectionObserver,
 * nothing waits: fn runs at once and every card is simply there. Loaded right after <main>, before the map's library,
 * so it sorts the cards before they are seen. Shared with the node test (module.exports).
 */
(function (root) {
  "use strict";

  function motion(win, doc) {
    var still = !win.IntersectionObserver || !win.matchMedia || win.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var waiting = [];
    // The whole screen counts, to its last pixel: with a bottom margin (-8 %) the last card of a long page (s/'s footer,
    // stats/'s privacy line) sat in that band even scrolled to the end and never showed.
    var io = still ? null : new win.IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        waiting = waiting.filter(function (w) { if (w[0] !== e.target) return true; w[1](); return false; });
      });
    });

    /** Runs [fn] once [el] is on screen (at once without motion). */
    function inView(el, fn) {
      if (!io || !el) { fn(); return; }
      waiting.push([el, fn]);
      io.observe(el);
    }

    // On screen at first paint: CSS's rise. Below it: hidden until it comes into view. Hidden ones (display: none)
    // measure 0 and rise with CSS when they are shown.
    if (!still) {
      var h = win.innerHeight || 0;
      Array.prototype.forEach.call(doc.querySelectorAll(".page > *"), function (el) {
        if (el.getBoundingClientRect().top < h) return;
        el.classList.add("later");
        inView(el, function () { el.classList.add("in"); });
      });
    }
    var api = { inView: inView, still: still };
    // Printing: what still waits to be seen is printed as it ends (a counter's number, a city's bar, a card), never as a
    // dash or an empty bar. From then on nothing waits or moves (inView runs at once, counters jump).
    if (io && win.addEventListener) {
      win.addEventListener("beforeprint", function () {
        var all = waiting;
        io.disconnect(); io = null; waiting = []; api.still = true;
        all.forEach(function (w) { w[1](); });
      });
    }
    return api;
  }

  if (typeof module === "object" && module.exports) module.exports = { motion: motion };
  else root.WNM = motion(root, root.document);
})(this);

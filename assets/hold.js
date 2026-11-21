/*
 * In the <head> of every page with its own script: that page (main.hold) waits unseen until its script has run and set
 * html.wn-ready (site.css), so a slow network never paints the English fallback and then jumps. Only when scripts run:
 * with them off or blocked this file never runs, nothing waits, and the page shows at once (it stayed blank 3 s). A
 * script that fails to load or throws before its page is ready shows the page at once too, as its HTML has it. site.css's
 * 3 s is the last net (a script still on its way). Shared with the node test (module.exports).
 */
(function (root) {
  "use strict";

  function hold(win, html) {
    html.classList.add("wn-hold");
    // Capture: a script that fails to load fires "error" on its element, which doesn't bubble to the window.
    win.addEventListener("error", function (e) {
      if ((win.ErrorEvent && e instanceof win.ErrorEvent) || (e.target && e.target.tagName === "SCRIPT")) html.classList.add("wn-ready");
    }, true);
  }

  if (typeof module === "object" && module.exports) module.exports = { hold: hold };
  else hold(root, root.document.documentElement);
})(this);

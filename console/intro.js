/*
 * WaterNow Statistics, the opening (intro.js + intro.css; docs/work/console-intro.md, "v3.1 — 3D and the 1 km grid").
 * Twelve seconds, the same on every load, drawn as the WaterNow app's own screens: the launch screen (the official icon
 * on the app's background, the app's splash exit), the WaterNow map (its style's colours, its pins and clusters); then
 * the camera dives and tilts into 3D like MapLibre's (36.87° field of view, a 56° pitch, a slight turn) while the
 * console's 1 km cells (EASE-Grid 2.0, its blue ramp) fade in as a heat map, rise as columns as high as their
 * (illustrative) refills and settle back, the target's cell last, outlined, with a card of its figures counting up; the
 * buildings rise as in the app's tilted map (the style's fill-extrusion colours and light); the pin is selected with a
 * toast « Point d'eau détecté », the point's sheet rises with the app's skeleton shimmer (« Accès aux informations… »)
 * and fills in with example values; then the official logo (site/assets/icon.svg as it is, never redrawn) and
 * « WaterNow Statistics » dock into the header while the sign-in card or the dashboard rises underneath.
 *
 * Esc skips (keyboards only: on touch screens it plays in full); prefers-reduced-motion: a still frame and a short cross-fade.
 * It never holds the console: console.js signs in and loads underneath the whole time, the overlay is aria-hidden and
 * never takes focus, and intro.css hides it on its own if this script dies midway. Nothing real is shown: the city, its
 * points, its cells and the sheet are a seeded illustration tagged « Exemple »; no tile, no request, nothing to wait
 * for. The session badge says "verified" only after the dashboard's own "wnc:render" event (console.js).
 * Debug, loopback hosts only: ?introAt=<ms> freezes the timeline at that moment (captures).
 * Shared with the node test (module.exports).
 */
(function (root) {
  "use strict";

  // ---- Timeline, in ms from the first frame: tweak here (docs/work/console-intro.md) ----
  var TOTAL = 12000;
  var TL = {
    splash: [60, 460],     // the official icon arrives on the app's background
    exit: [950, 1520],     // the launch screen's exit: breath, dive, ripple, the background melts, the map settles
    chrome: [1300, 1640],  // the map's search bar
    pins: [1250, 1850],    // clusters and pins drop in, nearest the centre first
    fly: [2000, 5800],     // the camera: pulls back over the whole city, then dives to one water point, turning (zoomAt)
    tilt: [2150, 4400],    // ... and tilting into 3D, 0 to PITCH
    cells: [2200, 2900],   // the statistics: the 1 km cells fade in as a heat map, from the target's cell outward
    rise: [2700, 3500],    // ... rise as columns, as high as their refills, the target's first
    sink: [3700, 4350],    // ... and settle back, the target's last, outlined; the camera dives; the buildings rise
    card: [4350, 5900],    // the cell's card: its two figures count up, « Exemple »
    back: [5450, 5850],    // the pins come back, at street level
    select: [6000, 6400],  // the pin is selected (the app's pop); the cell's outline goes
    toast: [6100, 7050],   // « Point d'eau détecté »
    sheet: [7000, 7400],   // the point's sheet rises over a scrim
    loading: [7070, 8400], // skeletons and their shimmer, « Accès aux informations… »
    fill: [8400, 8800],    // the details rise in, one after the other
    out: [9600, 9850],     // the app screen leaves
    logo: [9800, 10350],   // the official logo, the name, the line, the session badge
    dock: [11200, 11760],  // the logo and the name dock into the header's own (a swap at the end)
    reveal: 11250,         // the page starts rising under the field
    fade: [11250, 11800]   // the field fades out
  };
  var REDUCED = [300, 450];  // prefers-reduced-motion: a still frame for 300 ms, then a 450 ms cross-fade
  var SKIP = 380;            // Esc: everything fades out in 380 ms
  var REVEAL_KEEP = 1400;    // the page's rise lasts at most this long (intro.css), then its class goes
  var SESSION_KEY = "wn-console-session"; // console.js keeps the signed-in session there: only its presence is read
  var ZOOM = 3, ZOUT = 1.2;  // the flight: back 1.2 zoom levels to see the whole city's grid, then 4.2 down to the point
  var PITCH = 56;            // degrees of tilt at the end of the dive (MapLibre's 3D: 45 to 60)
  var TURN = 0.3;            // the camera turns this much on the way (radians): the parallax that shows the depth
  var FOCAL = 1.5;           // MapLibre's 36.87° field of view: the focal length is 1.5 × the screen's height
  var LIFT = 0.22;           // the selected point sits this share of the height above the middle (WnCamera SELECTED_LIFT)
  var CELL = 1000;           // EASE-Grid 2.0: 1 km² cells, upright on the map (north up before the camera turns)
  var HMAX = 1800;           // the tallest column, in metres (a data scale, as deck.gl's elevationScale)
  var REFILLS = 1240, RES10 = 8300; // the target cell's figures (illustrative, « Exemple »)

  // The app's words where it has them (MapStrings "search", SocialStrings "vs_working" / "trust_verified", SheetStrings
  // "free" / "directions" / "log_refill_ml"), the console's for the cell (i18n.js cellTitle / lRefills, sim-i18n.js
  // simRes10); the rest written in the same voice.
  var WORDS = {
    en: { skip: "Skip", search: "Search water, places or addresses", detected: "Water point detected", accessing: "Accessing information…",
          example: "Example", photo: "Example photo", name: "Park fountain", sub: "120 m · 2 min", type: "Fountain", works: "Works", free: "Free",
          verified: "Verified 2 days ago", directions: "Directions", refill: "Log 500 ml", cap: "Restricted access · Admins, partners, cities",
          tfaReq: "Two-factor authentication required", tfaWait: "Checking the session", tfaOk: "Session verified · 2FA",
          cell: "1 km cell", refills: "Refills", res10: "Residents ≈ 10 min away" },
    fr: { skip: "Passer", search: "Chercher de l'eau, un lieu ou une adresse", detected: "Point d'eau détecté", accessing: "Accès aux informations…",
          example: "Exemple", photo: "Photo d'exemple", name: "Fontaine du parc", sub: "120 m · 2 min", type: "Fontaine", works: "Fonctionne", free: "Gratuit",
          verified: "Vérifié il y a 2 jours", directions: "Itinéraire", refill: "Noter 500 ml", cap: "Accès restreint · Admins, partenaires, villes",
          tfaReq: "Double authentification requise", tfaWait: "Vérification de la session", tfaOk: "Session vérifiée · 2FA",
          cell: "Cellule de 1 km", refills: "Remplissages", res10: "Résidents à ≈ 10 min" },
    es: { skip: "Saltar", search: "Buscar agua, lugares o direcciones", detected: "Punto de agua detectado", accessing: "Accediendo a la información…",
          example: "Ejemplo", photo: "Foto de ejemplo", name: "Fuente del parque", sub: "120 m · 2 min", type: "Fuente", works: "Funciona", free: "Gratis",
          verified: "Verificado hace 2 días", directions: "Indicaciones", refill: "Registrar 500 ml", cap: "Acceso restringido · Administradores, socios, ciudades",
          tfaReq: "Autenticación de dos factores obligatoria", tfaWait: "Verificando la sesión", tfaOk: "Sesión verificada · 2FA",
          cell: "Celda de 1 km", refills: "Recargas", res10: "Residentes a ≈ 10 min" },
    de: { skip: "Überspringen", search: "Wasser, Orte oder Adressen suchen", detected: "Wasserstelle erkannt", accessing: "Zugriff auf Informationen…",
          example: "Beispiel", photo: "Beispielfoto", name: "Parkbrunnen", sub: "120 m · 2 Min.", type: "Trinkbrunnen", works: "Funktioniert", free: "Kostenlos",
          verified: "Geprüft vor 2 Tagen", directions: "Route", refill: "500 ml eintragen", cap: "Eingeschränkter Zugang · Admins, Partner, Städte",
          tfaReq: "Zwei-Faktor-Authentifizierung erforderlich", tfaWait: "Sitzung wird geprüft", tfaOk: "Sitzung bestätigt · 2FA",
          cell: "1-km-Zelle", refills: "Nachfüllungen", res10: "Einwohner in ≈ 10 Min." },
    pt: { skip: "Pular", search: "Buscar água, lugares ou endereços", detected: "Ponto de água detectado", accessing: "Acessando informações…",
          example: "Exemplo", photo: "Foto de exemplo", name: "Bebedouro do parque", sub: "120 m · 2 min", type: "Bebedouro", works: "Funciona", free: "Grátis",
          verified: "Verificado há 2 dias", directions: "Rota", refill: "Registrar 500 ml", cap: "Acesso restrito · Administradores, parceiros, cidades",
          tfaReq: "Autenticação em dois fatores obrigatória", tfaWait: "Verificando a sessão", tfaOk: "Sessão verificada · 2FA",
          cell: "Célula de 1 km", refills: "Recargas", res10: "Residentes a ≈ 10 min" },
    ja: { skip: "スキップ", search: "給水スポット・場所・住所を検索", detected: "給水ポイントを検出", accessing: "情報にアクセス中…",
          example: "例", photo: "写真の例", name: "公園の水飲み場", sub: "120 m · 徒歩2分", type: "水飲み場", works: "使える", free: "無料",
          verified: "確認済み · 2日前", directions: "ルート", refill: "500 mlを記録", cap: "限定アクセス · 管理者・パートナー・自治体",
          tfaReq: "2段階認証が必要です", tfaWait: "セッションを確認中", tfaOk: "セッション確認済み · 2FA",
          cell: "1kmセル", refills: "給水回数", res10: "徒歩約10分の住民" },
    ro: { skip: "Sari peste", search: "Caută apă, locuri sau adrese", detected: "Punct de apă detectat", accessing: "Se accesează informațiile…",
          example: "Exemplu", photo: "Fotografie de exemplu", name: "Cișmeaua din parc", sub: "120 m · 2 min", type: "Cișmea", works: "Funcționează", free: "Gratuit",
          verified: "Verificat acum 2 zile", directions: "Traseu", refill: "Notează 500 ml", cap: "Acces restricționat · Administratori, parteneri, orașe",
          tfaReq: "Autentificare în doi pași necesară", tfaWait: "Se verifică sesiunea", tfaOk: "Sesiune verificată · 2FA",
          cell: "Celulă de 1 km", refills: "Reumpleri", res10: "Locuitori la ≈ 10 min" }
  };

  // Material rounded icons, as the app draws them (Icons.Rounded.*; WaterDrop and Verified from wear/.../PinPaths.kt).
  var ICON = {
    drop: "M12.66 2.58C12.28 2.25 11.71 2.25 11.33 2.58C6.45 6.88 4 10.62 4 13.8C4 18.78 7.8 22 12 22C16.2 22 20 18.78 20 13.8C20 10.62 17.55 6.88 12.66 2.58ZM7.83 14C8.2 14 8.5 14.26 8.57 14.62C8.98 16.84 10.85 17.6 12.21 17.49C12.64 17.47 13 17.81 13 18.24C13 18.64 12.68 18.97 12.28 18.99C10.15 19.12 7.66 17.9 7.09 14.87C7.01 14.42 7.37 14 7.83 14Z",
    verified: "M23 12L20.56 9.21L20.9 5.52L17.29 4.7L15.4 1.5L12 2.96L8.6 1.5L6.71 4.69L3.1 5.5L3.44 9.2L1 12L3.44 14.79L3.1 18.49L6.71 19.31L8.6 22.5L12 21.03L15.4 22.49L17.29 19.3L20.9 18.48L20.56 14.79L23 12ZM9.38 16.01L7 13.61C6.61 13.22 6.61 12.59 7 12.2L7.07 12.13C7.46 11.74 8.1 11.74 8.49 12.13L10.1 13.75L15.25 8.59C15.64 8.2 16.28 8.2 16.67 8.59L16.74 8.66C17.13 9.05 17.13 9.68 16.74 10.07L10.82 16.01C10.41 16.4 9.78 16.4 9.38 16.01Z",
    search: "M15.5 14h-.79l-.28-.27c1.2-1.4 1.82-3.31 1.48-5.34-.47-2.78-2.79-5-5.59-5.34-4.23-.52-7.79 3.04-7.27 7.27.34 2.8 2.56 5.12 5.34 5.59 2.03.34 3.94-.28 5.34-1.48l.27.28v.79l4.25 4.25c.41.41 1.08.41 1.49 0 .41-.41.41-1.08 0-1.49L15.5 14zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
    image: "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.9 13.98l2.1 2.53 3.1-3.99c.2-.26.6-.26.8.01l3.51 4.68c.25.33.01.8-.4.8H6.02c-.42 0-.65-.48-.39-.81L8.12 14c.19-.26.57-.27.78-.02z",
    directions: "M21.71 11.29l-9-9a.996.996 0 0 0-1.41 0l-9 9a.996.996 0 0 0 0 1.41l9 9c.39.39 1.02.39 1.41 0l9-9a.996.996 0 0 0 0-1.41zM14 14.5V12h-4v2c0 .55-.45 1-1 1s-1-.45-1-1v-3c0-.55.45-1 1-1h5V7.5l3.15 3.15c.2.2.2.51 0 .71L14 14.5z"
  };

  /** What plays: nothing in a tab opened in the background, a still frame and a cross-fade with reduced motion. */
  function plan(env) {
    if (env.hidden) return { mode: "none", total: 0 };
    if (env.reduced) return { mode: "reduced", total: REDUCED[0] + REDUCED[1] };
    return { mode: "full", total: TOTAL };
  }
  /** ?introAt=<ms>, read on loopback hosts only (the preview server): anywhere else, null. */
  function debugAt(href) {
    try {
      var u = new URL(href);
      if (!/^(127\.0\.0\.1|localhost|\[::1\])$/.test(u.hostname)) return null;
      var v = u.searchParams.get("introAt");
      if (v == null || v === "" || !isFinite(Number(v))) return null;
      return Math.max(0, Math.min(TOTAL, Number(v)));
    } catch (e) { return null; }
  }
  function pickLang(list) {
    for (var i = 0; i < (list || []).length; i++) {
      var c = String(list[i] || "").toLowerCase().split("-")[0];
      if (WORDS[c]) return c;
    }
    return "en";
  }

  // ---- Motion: WnMotion's curves and springs ----
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function prog(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function mix(a, b, e) { return a + (b - a) * e; }
  function smooth(x) { return x * x * (3 - 2 * x); }
  /** CSS cubic-bezier(x1, y1, x2, y2) as a function of progress (bisection: exact enough, never diverges). */
  function bez(x1, y1, x2, y2) {
    var X = function (s) { return 3 * x1 * s * (1 - s) * (1 - s) + 3 * x2 * s * s * (1 - s) + s * s * s; };
    var Y = function (s) { return 3 * y1 * s * (1 - s) * (1 - s) + 3 * y2 * s * s * (1 - s) + s * s * s; };
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var lo = 0, hi = 1, s = x;
      for (var i = 0; i < 16; i++) { s = (lo + hi) / 2; if (X(s) < x) lo = s; else hi = s; }
      return Y(s);
    };
  }
  /** Compose's spring (mass 1) from `from` to 1, `ms` after it starts: WnMotion.bouncy() is (0.55, 700). */
  function spring(ms, from, damping, stiffness) {
    if (ms <= 0) return from;
    var w = Math.sqrt(stiffness), s = ms / 1000, wd = w * Math.sqrt(1 - damping * damping);
    return 1 - (1 - from) * Math.exp(-damping * w * s) * (Math.cos(wd * s) + damping * w / wd * Math.sin(wd * s));
  }
  var STD = bez(0.2, 0, 0, 1), DEC = bez(0.05, 0.7, 0.1, 1), ACC = bez(0.3, 0, 0.8, 0.15), // WnMotion Standard / Emphasized
      DIVE = bez(0.55, 0, 0.75, 0.35), MELT = bez(0.25, 0.1, 0.25, 1), DROP = bez(0.22, 0.8, 0.24, 1), // MainActivity, map.css
      UP = bez(0.3, 0, 0.2, 1), FLY = bez(0.5, 0, 0.25, 1), TILT = bez(0.45, 0, 0.3, 1),                // the camera
      SIN = bez(0.37, 0, 0.63, 1), DOCK = bez(0.65, 0, 0.15, 1), DOCKY = bez(0.16, 1, 0.3, 1);

  function rng(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** Greedy clustering (supercluster's idea): each point not yet taken gathers the others within r; a centre per group. */
  function cluster(pts, r) {
    var taken = [], out = [];
    for (var i = 0; i < pts.length; i++) {
      if (taken[i]) continue;
      var m = [i];
      taken[i] = true;
      for (var j = i + 1; j < pts.length; j++) {
        if (!taken[j] && Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y) <= r) { m.push(j); taken[j] = true; }
      }
      var x = 0, y = 0;
      m.forEach(function (k) { x += pts[k].x; y += pts[k].y; });
      out.push({ m: m, x: x / m.length, y: y / m.length });
    }
    return out;
  }

  // ---- The illustrative city: metres, y down, seeded (the same for everyone); nothing in it is real. Streets at
  //      irregular spacings, every fifth a boulevard; the grid turned on the map like a real city's (ROT) ----
  var NX = 64, NY = 80, XS = [], YS = [], ROT = -0.48; // the first 30 each way as drawn since v3, then the outskirts
  var RIVER = 135;                                         // the river's half width
  function riverY(x) { return 1180 + 240 * Math.sin(x / 1500 + 0.6) + 80 * Math.sin(x / 520 + 1.3); }
  function riverDY(x) { return 0.16 * Math.cos(x / 1500 + 0.6) + 80 / 520 * Math.cos(x / 520 + 1.3); }
  var PARKS = [[-4, -4, -1, -1], [5, 1, 8, 3], [-15, 2, -12, 5], [11, -10, 14, -7], [-4, 6, -1, 8], [17, 3, 20, 6], [-24, -9, -21, -6], [2, -12, 4, -10]]; // no boulevard inside one
  var DIAG = [-5100, -3200, 1500, 3400];                   // a boulevard across the grid
  var T, POND, WOOD;                                       // the water point the camera flies to, in the first park
  (function () {
    var R = rng(1113), i;
    XS[NX] = 0; YS[NY] = 0;
    for (i = 1; i <= 30; i++) { XS[NX + i] = XS[NX + i - 1] + 135 + R() * 60; XS[NX - i] = XS[NX - i + 1] - 135 - R() * 60; }
    for (i = 1; i <= 30; i++) { YS[NY + i] = YS[NY + i - 1] + 96 + R() * 40; YS[NY - i] = YS[NY - i + 1] - 96 - R() * 40; }
    for (i = 31; i <= NX; i++) { XS[NX + i] = XS[NX + i - 1] + 135 + R() * 60; XS[NX - i] = XS[NX - i + 1] - 135 - R() * 60; }
    for (i = 31; i <= NY; i++) { YS[NY + i] = YS[NY + i - 1] + 96 + R() * 40; YS[NY - i] = YS[NY - i + 1] - 96 - R() * 40; }
    var p = park(0);
    T = { x: mix(p[0], p[2], 0.33), y: mix(p[1], p[3], 0.6) };
    POND = [mix(p[0], p[2], 0.7), mix(p[1], p[3], 0.42), (p[2] - p[0]) * 0.15, (p[3] - p[1]) * 0.16];
    WOOD = [p[0] + 7, p[1] + 7, mix(p[0], p[2], 0.24), mix(p[1], p[3], 0.36)];
  })();
  function gx(i) { return XS[clamp(i, -NX, NX) + NX]; }
  function gy(i) { return YS[clamp(i, -NY, NY) + NY]; }
  function park(i) { var p = PARKS[i]; return [gx(p[0]), gy(p[1]), gx(p[2]), gy(p[3])]; }
  /** The index of the street at or before v (A: XS or YS, N: NX or NY). */
  function before(v, A, N) { for (var i = -N; i < N; i++) if (A[i + 1 + N] > v) return i; return N; }
  function inPark(x, y, m) {
    for (var i = 0; i < PARKS.length; i++) {
      var p = park(i);
      if (x > p[0] - m && x < p[2] + m && y > p[1] - m && y < p[3] + m) return true;
    }
    return false;
  }
  function wet(x, y, m) {
    return Math.abs(y - riverY(x)) < RIVER + m || Math.pow((x - POND[0]) / (POND[2] + m), 2) + Math.pow((y - POND[1]) / (POND[3] + m), 2) < 1;
  }
  function diagDist(x, y) {
    var dx = DIAG[2] - DIAG[0], dy = DIAG[3] - DIAG[1];
    return Math.abs((x - DIAG[0]) * dy - (y - DIAG[1]) * dx) / Math.hypot(dx, dy);
  }

  // The water points: seeded groups around a few centres ([x, y, spread, count]), the target first.
  var GROUPS = [[T.x + 60, T.y - 40, 150, 8], [900, -300, 210, 12], [-2000, 600, 170, 7], [2300, -1500, 180, 6], [-1500, -1700, 160, 6],
                [500, 640, 150, 5], [3000, 400, 190, 6], [-3200, -600, 190, 5], [1700, -2400, 170, 4], [-600, 1800, 170, 4]];
  function points() {
    var R = rng(20261113), pts = [{ x: T.x, y: T.y }], i;
    var gauss = function () { return Math.sqrt(-2 * Math.log(R() + 1e-9)) * Math.cos(2 * Math.PI * R()); };
    GROUPS.forEach(function (gr) {
      for (var k = 0, tries = 0; k < gr[3] && tries < 200; tries++) {
        var p = { x: gr[0] + gauss() * gr[2], y: gr[1] + gauss() * gr[2] * 0.8 };
        if (wet(p.x, p.y, 20) || Math.hypot(p.x - T.x, p.y - T.y) < 85) continue;
        pts.push(p); k++;
      }
    });
    for (i = 0; i < 8; i++) {
      var q = { x: (R() * 2 - 1) * 3800, y: (R() * 2 - 1) * 2600 };
      if (!wet(q.x, q.y, 20)) pts.push(q);
    }
    return pts;
  }

  /**
   * The console's grid over the city: 1 km cells upright on the map (the north frame: the city turned by ROT around the
   * target), the target 38 % / 60 % into its own. A cell's refills follow the points around it (illustrative), the
   * target's are REFILLS; classes are the console's quantile breaks (core.js breaks, 6 classes); a column's height is
   * proportional to the refills. Each cell knows when it fades in and rises (from the target outward) and sinks (the
   * target last).
   */
  var TIN = [0.38, 0.6];
  function cellsOf(pts) {
    var co = Math.cos(ROT), si = Math.sin(ROT), R = rng(124083), out = [], cnt = {}, i, j, k, tgt = null;
    for (k = 0; k < pts.length; k++) {
      var dx = pts[k].x - T.x, dy = pts[k].y - T.y;
      var key = Math.floor((dx * co - dy * si) / CELL + TIN[0]) + ":" + Math.floor((dx * si + dy * co) / CELL + TIN[1]);
      cnt[key] = (cnt[key] || 0) + 1;
    }
    for (i = -7; i <= 7; i++) for (j = -5; j <= 5; j++) {
      var u = (i + 0.5 - TIN[0]) * CELL, v = (j + 0.5 - TIN[1]) * CELL; // the cell's centre (north frame)
      var wx = T.x + u * co + v * si, wy = T.y - u * si + v * co;        // ... in the city
      if (Math.abs(wx) > gx(NX) - 450 || Math.abs(wy) > gy(NY) - 450) continue;
      var f = 0;
      for (k = 0; k < GROUPS.length; k++) {
        var gr = GROUPS[k], q = (Math.pow(wx - gr[0], 2) + Math.pow(wy - gr[1], 2)) / (2 * 1250 * 1250);
        f += gr[3] * Math.exp(-q);
      }
      var n = cnt[i + ":" + j] || 0, raw = Math.pow(f + 1.6 * n, 1.6) * (0.7 + 0.6 * R()); // a few busy cells, many quiet ones
      if (raw < 9 && !(i === 0 && j === 0)) continue;
      var c = { i: i, j: j, u0: u - CELL / 2, v0: v - CELL / 2, raw: raw, dist: Math.sqrt(i * i + j * j), target: i === 0 && j === 0 };
      if (c.target) tgt = c;
      out.push(c);
    }
    var vals = out.map(function (c) { return c.target ? REFILLS : Math.max(10, Math.round(c.raw * REFILLS / tgt.raw / 10) * 10); });
    var sorted = vals.slice().sort(function (a, b) { return a - b; }), br = [], max = sorted[sorted.length - 1];
    for (k = 1; k < 6; k++) { var b = sorted[Math.min(sorted.length - 1, Math.floor(k * sorted.length / 6))]; if (br.indexOf(b) < 0) br.push(b); }
    var far = 0;
    out.forEach(function (c) { far = Math.max(far, c.dist); });
    out.forEach(function (c, n) {
      c.refills = vals[n];
      for (c.cls = 0; c.cls < br.length && c.refills >= br[c.cls]; c.cls++) { /* the class: breaks at or below */ }
      c.k = c.refills / max;                                          // the column's height, a share of HMAX
      c.in = TL.cells[0] + c.dist * 70;                               // fades in over 300 ms
      c.up = TL.rise[0] + c.dist * 55;                                // rises over 520 ms
      c.down = c.target ? TL.sink[1] - 420 : TL.sink[0] + (far - c.dist) / far * 200; // sinks over 420 ms
    });
    return out;
  }

  // ---- The camera, MapLibre's: it looks at the target from a distance set by the zoom, tilted by the pitch, turned by
  //      the bearing; a lens shift puts the target where the story wants it on the screen (a little left of the middle
  //      at first, then 22 % above it, clear of the sheet), as MapLibre's padding does ----
  /** Zoom levels from the city view at t: back ZOUT while the cells come up (easing out), then the dive (easing in): the
   *  zoom turns around like a crane at the top of its arc while the turn goes on. back/dive: their progress (they also
   *  move the lens shift: the grid centred, then the point lifted). */
  function back(t) { return UP(prog(t, TL.fly[0], TL.rise[1])); }
  function dive(t) { return FLY(prog(t, TL.rise[1], TL.fly[1])); }
  function zoomAt(t, W, H) {
    // A tall screen sizes the city by its height: it pulls back further so the whole grid fits its width.
    var zout = ZOUT + 0.7 * Math.max(0, Math.log(Math.max(W / 5200, H / 4200) * 5200 / W) * Math.LOG2E);
    return -zout * back(t) + (ZOOM + zout) * dive(t);
  }
  /** The camera at t for a W × H screen (c is filled and returned): scale in px per metre at the target, pitch, turn. */
  function cam(t, W, H, c) {
    c = c || {};
    c.z = zoomAt(t, W, H);
    var bq = back(t), e = dive(t);
    c.s = Math.max(W / 5200, H / 4200) * Math.pow(2, c.z); // the city: about 5 km across a desktop
    c.ph = PITCH * Math.PI / 180 * TILT(prog(t, TL.tilt[0], TL.tilt[1]));
    c.b = TURN * SIN(prog(t, TL.fly[0], TL.fly[1]));
    c.co = Math.cos(ROT + c.b); c.si = Math.sin(ROT + c.b); c.cb = Math.cos(c.b); c.sb = Math.sin(c.b);
    c.sp = Math.sin(c.ph); c.cp = Math.cos(c.ph);
    c.f = FOCAL * H; c.D = c.f / c.s;                      // the focal length (px), the camera's distance (m)
    c.ox = mix(0.32 * W, W / 2, bq); c.oy = mix(mix(0.46 * H, 0.5 * H, bq), H * (0.5 - LIFT), e); // the grid centred, then lifted
    return c;
  }
  /** A point of the view frame (x right, y down the screen, z up, metres from the target) on the screen; returns its depth. */
  function project(c, xv, yv, z, out) {
    var d = c.D - yv * c.sp - z * c.cp;
    out[0] = c.ox + c.f * xv / d;
    out[1] = c.oy + c.f * (yv * c.cp - z * c.sp) / d;
    return d;
  }

  // ---- Light, the style's (waternow-*.json "light": viewport anchor, intensity 0.3, position [1.15, 210, 30]) turned
  //      into a vector as MapLibre does (sphericalToCartesian), screen axes; shade() is fill-extrusion's shader ----
  var LIGHT = (function () {
    var a = (210 + 90) * Math.PI / 180, p = 30 * Math.PI / 180;
    return [1.15 * Math.cos(a) * Math.sin(p), 1.15 * Math.sin(a) * Math.sin(p), 1.15 * Math.cos(p)];
  })();
  var LI = 0.3;
  /** How much of its colour a face keeps: its normal (screen axes), the colour's luminance cv; walls take the vertical
   *  gradient's floor (exact for buildings under ~120 m). */
  function shade(nx, ny, nz, cv, wall) {
    var d = clamp(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2], 0, 1);
    d = mix(1 - LI, Math.max(1 - cv + LI, 1), d);
    return wall ? d * mix(0.7, 0.98, 1 - LI) : d;
  }

  var api = { TOTAL: TOTAL, TL: TL, REDUCED: REDUCED, SKIP: SKIP, REVEAL_KEEP: REVEAL_KEEP, LIFT: LIFT, WORDS: WORDS, ICON: ICON,
              PITCH: PITCH, ZOOM: ZOOM, CELL: CELL, HMAX: HMAX, REFILLS: REFILLS, RES10: RES10, LIGHT: LIGHT, T: T,
              plan: plan, debugAt: debugAt, pickLang: pickLang, bez: bez, spring: spring, cluster: cluster,
              zoomAt: zoomAt, cam: cam, project: project, shade: shade, points: points, cellsOf: cellsOf };
  if (typeof module === "object" && module.exports) module.exports = api;
  var doc = root.document;
  if (!doc || !root.requestAnimationFrame || !root.matchMedia) return;

  // ---- In the page: decided in <head>, before the first paint ----
  var html = doc.documentElement;
  var at = debugAt(root.location.href);
  var reducedMq = root.matchMedia("(prefers-reduced-motion: reduce)"), darkMq = root.matchMedia("(prefers-color-scheme: dark)");
  var P = plan({ hidden: doc.hidden && at == null, reduced: reducedMq.matches });
  if (P.mode === "none") return;

  var ready = false, mounted = false, done = false, raf = 0, t0 = 0, pausedAt = -1, skipAt = -1, revealed = false, dirty = false, hasSession = false;
  var w, ov, bg, app, mc, g, pinBox, sel, search, toast, card, scrim, sheet, sheetIn, hero, spin, slots = [], skels = [], tiles = [], nums = [];
  var splash, sIcon, ripple, stage, logo, word, cap, badge, badgeTxt, esc, sr, NF = null;
  var L = {}, COL = {}, RGB = {}, ITEMS = [], PTS = points(), CELLS = cellsOf(PTS), TCELL = CELLS.filter(function (c) { return c.target; })[0];
  var C = {};

  function mountSafe() { try { mount(); } catch (e) { teardown(); } }

  function el(tag, cls, parent, txt) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    if (parent) parent.appendChild(e);
    return e;
  }
  /** One Material icon (24 × 24 path) as an inline SVG, its colour from CSS (currentColor). */
  function icon(name, cls, parent) {
    var s = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("class", "wn-intro-ic" + (cls ? " " + cls : ""));
    var p = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", ICON[name]);
    s.appendChild(p);
    if (parent) parent.appendChild(s);
    return s;
  }
  function badgeEl(parent, txt, variant, ic) {
    var b = el("span", "wn-intro-badge " + (variant || "wn-intro-b-sec"), parent);
    if (ic) icon(ic, null, b);
    el("span", null, b, txt);
    return b;
  }

  function mount() {
    if (mounted || !doc.body) return;
    mounted = true;
    var WN = root.WN, lang = WN && WN.lang && WN.browserLangs ? WN.lang(WN.browserLangs(root.navigator))
      : pickLang(root.navigator.languages || [root.navigator.language]);
    w = WORDS[lang] || WORDS.en;
    try { NF = new root.Intl.NumberFormat(lang); } catch (e) { NF = null; }
    try { hasSession = !!root.sessionStorage.getItem(SESSION_KEY); } catch (e) { hasSession = false; }
    var iconSrc = (function () { var l = doc.querySelector('link[rel="icon"]'); return l ? l.href : "../assets/icon.svg"; })();

    ov = el("div", "wn-intro" + (P.mode === "reduced" ? " wn-intro-still" : ""));
    ov.setAttribute("aria-hidden", "true");
    ov.lang = lang;
    bg = el("div", "wn-intro-bg", ov);

    // The app screen: the map (one canvas), its pins, the search bar, the cell's card, the toast, the scrim, the sheet.
    app = el("div", "wn-intro-app", ov);
    mc = el("canvas", "wn-intro-map", app);
    g = mc.getContext("2d");
    if (!g) throw new Error("no canvas");
    pinBox = el("div", "wn-intro-pins", app);
    search = el("div", "wn-intro-search", app);
    icon("search", null, search);
    el("span", null, search, w.search);
    // The cell's card: the console's cell panel in the app's card (title, « Exemple », two figures in muted tiles).
    card = el("div", "wn-intro-card", app);
    var kh = el("div", "wn-intro-card-head", card);
    el("i", "wn-intro-chip wn-intro-c" + TCELL.cls, kh);
    el("span", "wn-intro-card-title", kh, w.cell);
    badgeEl(kh, w.example, "wn-intro-b-out");
    var kg = el("div", "wn-intro-stats", card);
    [w.refills, w.res10].forEach(function (label) {
      var s = el("div", "wn-intro-stat", kg);
      nums.push(el("div", "wn-intro-num", s, "0"));
      el("div", "wn-intro-lbl", s, label);
      tiles.push(s);
    });
    toast = el("div", "wn-intro-toast", app, w.detected);
    scrim = el("div", "wn-intro-scrim", app);
    sheet = el("div", "wn-intro-sheet", app);
    el("i", "wn-intro-handle", sheet);
    sheetIn = el("div", "wn-intro-sheet-in", sheet);
    // Each part of the sheet: its skeleton (shimmering while it loads) over the real thing, which rises in.
    function slot(cls) { var s = el("div", "wn-intro-slot " + cls, sheetIn); s.real = el("div", "wn-intro-real", s); s.sk = el("div", "wn-intro-skel", s); slots.push(s); return s; }
    function skel(s, cls) { var k = el("i", "wn-intro-sk " + cls, s.sk); k.band = el("b", null, k); skels.push(k); return k; }
    var sH = slot("wn-intro-s-hero");
    hero = el("div", "wn-intro-hero", sH.real);
    var ph = el("div", "wn-intro-photo", hero);
    icon("image", null, ph);
    el("span", null, ph, w.photo);
    skel(sH, "wn-intro-k-hero");
    var load = el("div", "wn-intro-loading", sH.sk);
    spin = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    spin.setAttribute("viewBox", "0 0 16 16");
    spin.setAttribute("class", "wn-intro-spin");
    spin.arc = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
    spin.arc.setAttribute("cx", "8"); spin.arc.setAttribute("cy", "8"); spin.arc.setAttribute("r", "6");
    spin.appendChild(spin.arc);
    load.appendChild(spin);
    el("span", null, load, w.accessing);
    var sHd = slot("wn-intro-s-head");
    var tile = el("span", "wn-intro-tile", sHd.real);
    icon("drop", null, tile);
    var tt = el("div", "wn-intro-titles", sHd.real);
    el("div", "wn-intro-name", tt, w.name);
    el("div", "wn-intro-sub", tt, w.sub);
    badgeEl(sHd.real, w.example, "wn-intro-b-out");
    skel(sHd, "wn-intro-k-tile"); skel(sHd, "wn-intro-k-l1"); skel(sHd, "wn-intro-k-l2");
    var sB = slot("wn-intro-s-badges");
    badgeEl(sB.real, w.type, "wn-intro-b-sec"); badgeEl(sB.real, w.works, "wn-intro-b-ok"); badgeEl(sB.real, w.free, "wn-intro-b-ok");
    skel(sB, "wn-intro-k-p1"); skel(sB, "wn-intro-k-p2"); skel(sB, "wn-intro-k-p3");
    var sT = slot("wn-intro-s-trust");
    badgeEl(sT.real, w.verified, "wn-intro-b-ok", "verified");
    skel(sT, "wn-intro-k-p4");
    var sA = slot("wn-intro-s-actions");
    var b1 = el("span", "wn-intro-btn wn-intro-b-p", sA.real); icon("directions", null, b1); el("span", null, b1, w.directions);
    var b2 = el("span", "wn-intro-btn wn-intro-b-s", sA.real); icon("drop", null, b2); el("span", null, b2, w.refill);
    skel(sA, "wn-intro-k-b1"); skel(sA, "wn-intro-k-b2");

    // The launch screen over it all: the app's background, the official icon, the ripple of its exit.
    splash = el("div", "wn-intro-splash", ov);
    ripple = el("i", "wn-intro-ripple", ov);
    sIcon = el("img", "wn-intro-sicon", ov);
    sIcon.alt = "";
    sIcon.decoding = "async";
    sIcon.src = iconSrc;

    // The logo screen: the official icon, the name, the line, the session badge (the sign-in screen's lockup).
    stage = el("div", "wn-intro-stage", ov);
    logo = el("img", "wn-intro-logo", stage);
    logo.alt = "";
    logo.decoding = "async";
    logo.src = iconSrc;
    word = el("div", "wn-intro-word", stage, "WaterNow Statistics");
    cap = el("div", "wn-intro-cap", stage, w.cap);
    badge = el("span", "wn-intro-badge wn-intro-b-out wn-intro-session", stage);
    badge.ic = icon("verified", null, badge);
    badgeTxt = el("span", null, badge);

    // Esc, on keyboards (the hint hides on touch screens: the intro plays in full there, owner's call 2026-11-13).
    esc = el("div", "wn-intro-esc", ov);
    el("kbd", null, esc, "Esc");
    el("span", null, esc, w.skip);

    doc.body.appendChild(ov);
    sr = el("div", "wn-intro-sr", doc.body);
    sr.setAttribute("aria-live", "polite");
    html.classList.add("wn-intro-run");
    html.classList.remove("wn-intro-boot");

    colours();
    layout();
    world();

    root.addEventListener("keydown", onKey);
    root.addEventListener("resize", onResize);
    doc.addEventListener("visibilitychange", onVisibility);
    if (darkMq.addEventListener) darkMq.addEventListener("change", onTheme);
    ov.addEventListener("wheel", hold, { passive: false });
    ov.addEventListener("touchmove", hold, { passive: false });
    root.setTimeout(function () { if (sr) sr.textContent = "WaterNow Statistics"; }, 150);

    if (at != null) { ov.style.animation = "none"; frozen(); return; }
    ov.style.animationDelay = (P.total + 1500) + "ms"; // intro.css's failsafe, from this moment on
    t0 = root.performance.now();
    raf = root.requestAnimationFrame(frame);
  }

  // Scrolling the page hidden underneath would only move it out of place: the field keeps the wheel and the finger.
  function hold(e) { if (e.cancelable) e.preventDefault(); }
  function onKey(e) { if (e.key === "Escape" || e.key === "Esc") skip(); } // the event still reaches the page
  function onResize() { dirty = true; if (at != null) frozen(); }
  function onTheme() { colours(); if (at != null) frozen(); }
  function onReady() { ready = true; if (at != null && mounted && !done) frozen(); }
  function onVisibility() {
    if (!mounted || done || at != null) return;
    var now = root.performance.now();
    if (doc.hidden) {
      if (pausedAt < 0) { pausedAt = now; root.cancelAnimationFrame(raf); raf = 0; ov.style.animationPlayState = "paused"; }
    } else if (pausedAt >= 0) {
      t0 += now - pausedAt; pausedAt = -1; ov.style.animationPlayState = "running";
      raf = root.requestAnimationFrame(frame);
    }
  }
  function clock() { return root.performance.now() - t0; }
  function skip() {
    if (!mounted || done) return;
    if (at != null) { teardown(); return; }
    if (skipAt < 0) { skipAt = clock(); reveal(); ov.classList.add("wn-intro-out"); }
  }

  var STILL = TL.dock[0] - 50; // the composed logo: the reduced-motion frame
  function frame() {
    raf = 0;
    if (done) return;
    if (dirty) { dirty = false; layout(); world(); }
    var t = clock(), sceneT, op = 1;
    if (skipAt >= 0) {
      sceneT = P.mode === "reduced" ? STILL : skipAt;
      op = 1 - SIN(prog(t - skipAt, 0, SKIP));
      if (t - skipAt >= SKIP) { teardown(); return; }
    } else if (P.mode === "reduced") {
      sceneT = STILL;
      if (t >= REDUCED[0]) reveal();
      op = 1 - SIN(prog(t, REDUCED[0], REDUCED[0] + REDUCED[1]));
      if (t >= P.total) { teardown(); return; }
    } else {
      sceneT = t;
      if (t >= TL.dock[0] && !L.targeted) { L.targeted = true; targets(); }
      if (t >= TL.reveal) { reveal(); ov.classList.add("wn-intro-out"); }
      if (t >= TOTAL) { teardown(); return; }
    }
    ov.style.opacity = op < 1 ? String(op) : "";
    scene(sceneT);
    raf = root.requestAnimationFrame(frame);
  }

  /** ?introAt: one frame, the page's own rise scrubbed to the same moment; Esc ends it. */
  function frozen() {
    if (!mounted || done) return;
    dirty = false;
    layout(); world(); targets();
    var t = P.mode === "reduced" ? STILL : at;
    scene(t);
    if (at >= TL.reveal) {
      reveal();
      ov.classList.add("wn-intro-out");
      (doc.getAnimations ? doc.getAnimations() : []).forEach(function (a) {
        if (a.animationName && a.animationName.indexOf("wn-intro-") === 0 && a.animationName !== "wn-intro-gone") {
          a.pause(); a.currentTime = at - TL.reveal;
        }
      });
    }
  }

  function reveal() {
    if (revealed) return;
    revealed = true;
    html.classList.add("wn-intro-reveal"); // intro.css: the header fades in, the sign-in card or the dashboard rises
    if (at == null) root.setTimeout(function () { html.classList.remove("wn-intro-reveal"); }, REVEAL_KEEP);
  }

  function teardown() {
    done = true;
    if (raf) root.cancelAnimationFrame(raf);
    raf = 0;
    root.removeEventListener("keydown", onKey);
    root.removeEventListener("resize", onResize);
    doc.removeEventListener("visibilitychange", onVisibility);
    doc.removeEventListener("wnc:render", onReady);
    if (darkMq.removeEventListener) darkMq.removeEventListener("change", onTheme);
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    if (sr && sr.parentNode) sr.parentNode.removeChild(sr);
    html.classList.remove("wn-intro-boot", "wn-intro-run");
    if (!revealed) html.classList.remove("wn-intro-reveal");
    ov = sr = null;
  }

  // ---- Colours: intro.css's tokens (the app's, its map style's, the console's ramp; light and dark), so the canvas
  //      follows the page's theme ----
  var MAPC = ["bg", "park", "wood", "water", "bld", "path", "road", "road2", "road3", "case", "case2", "case3", "ext", "ext2",
              "cline", "csel", "r0", "r1", "r2", "r3", "r4", "r5"];
  var RAMP = [], RAMPRGB = [], FOOT = [], FACE = [];
  function rgbOf(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) || [0, "88", "88", "88"];
    return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
  }
  function css(r, g2, b) { return "rgb(" + Math.round(clamp(r, 0, 1) * 255) + "," + Math.round(clamp(g2, 0, 1) * 255) + "," + Math.round(clamp(b, 0, 1) * 255) + ")"; }
  function colours() {
    var cs = root.getComputedStyle(ov);
    MAPC.forEach(function (k) { COL[k] = cs.getPropertyValue("--wn-m-" + k).trim() || "#888888"; });
    ["bg", "bld", "ext", "ext2", "r0", "r1", "r2", "r3", "r4", "r5"].forEach(function (k) { RGB[k] = rgbOf(COL[k]); });
    for (var i = 0; i < 6; i++) { RAMP[i] = COL["r" + i]; RAMPRGB[i] = RGB["r" + i]; }
    // Building footprints fading in with the zoom: four steps from the background to the style's building colour.
    for (i = 0; i < 4; i++) FOOT[i] = css(mix(RGB.bg[0], RGB.bld[0], (i + 1) / 4), mix(RGB.bg[1], RGB.bld[1], (i + 1) / 4), mix(RGB.bg[2], RGB.bld[2], (i + 1) / 4));
    L.drawn = null; L.lit = null; L.fog = null;
  }
  /**
   * The faces' colours for this frame's bearing (the light is the viewport's): buildings in three heights (the style's
   * fill-extrusion-color by render_height, 0.9 opaque over the ground), then the console's six classes (opaque), each
   * as walls facing the four sides then the top. FACE[band * 5 + side], FACE[15 + class * 5 + side].
   */
  var NL = new Float64Array(8);
  /** One face's colour: the base (r, g2, b), side 0..3 a wall (normal in NL), 4 the top; MapLibre adds 0.03 of ambient. */
  function face(r, g2, b, side, op) {
    var cv = r * 0.2126 + g2 * 0.7152 + b * 0.0722;
    var k = side < 4 ? shade(NL[2 * side], NL[2 * side + 1], 0, cv, true) : shade(0, 0, 1, cv, false);
    return css(mix(RGB.bg[0], Math.min(1, (r + 0.03) * k), op), mix(RGB.bg[1], Math.min(1, (g2 + 0.03) * k), op), mix(RGB.bg[2], Math.min(1, (b + 0.03) * k), op));
  }
  function lit() {
    var q = Math.round(C.b * 400); // a new set every 0.15° of turn: closer than that the colours can't change
    if (L.lit === q) return;
    L.lit = q;
    var s, cs = Math.cos(ROT + q / 400), sn = Math.sin(ROT + q / 400), x = RGB.ext, y = RGB.ext2;
    NL[0] = sn; NL[1] = -cs; NL[2] = cs; NL[3] = sn; NL[4] = -sn; NL[5] = cs; NL[6] = -cs; NL[7] = -sn; // the street grid's walls
    for (var band = 0; band < 3; band++) {
      var e = (7 + band * 14) / 40;
      for (s = 0; s < 5; s++) FACE[band * 5 + s] = face(mix(x[0], y[0], e), mix(x[1], y[1], e), mix(x[2], y[2], e), s, 0.9);
    }
    cs = Math.cos(q / 400); sn = Math.sin(q / 400);
    NL[0] = sn; NL[1] = -cs; NL[2] = cs; NL[3] = sn; NL[4] = -sn; NL[5] = cs; NL[6] = -cs; NL[7] = -sn; // the cells' (north up)
    for (var cl = 0; cl < 6; cl++) for (s = 0; s < 5; s++) FACE[15 + cl * 5 + s] = face(RAMPRGB[cl][0], RAMPRGB[cl][1], RAMPRGB[cl][2], s, 1);
  }

  // ---- Layout: sizes, the sheet's skeletons, the header's targets ----
  function layout() {
    L.W = ov.clientWidth || root.innerWidth;
    L.H = ov.clientHeight || root.innerHeight;
    L.dpr = Math.min(root.devicePixelRatio || 1, 2);
    mc.width = Math.round(L.W * L.dpr);
    mc.height = Math.round(L.H * L.dpr);
    L.drawn = null; L.fog = null;
    L.s0 = Math.max(L.W / 5200, L.H / 4200);   // px per metre: the city, about 5 km across on a desktop
    L.minPx = L.W * L.H < 600000 ? 2.4 : 1.6;  // buildings smaller than this on screen are left out (phones: a bit more)
    // Where each skeleton sits in the sheet, so one light band crosses them all as one (WnSkeleton: window space).
    L.sheetX = sheet.offsetLeft;
    skels.forEach(function (k) { var x = 0, n = k; while (n && n !== sheet) { x += n.offsetLeft; n = n.offsetParent; } k.x = x; });
    logo.style.transform = ""; word.style.transform = "";
    var o = ov.getBoundingClientRect(), lr = logo.getBoundingClientRect(), wr = word.getBoundingClientRect();
    L.logo = { x: lr.left - o.left, y: lr.top - o.top, w: lr.width, h: lr.height };
    L.word = { x: wr.left - o.left, y: wr.top - o.top, w: wr.width, h: wr.height };
    L.fs = parseFloat(root.getComputedStyle(word).fontSize) || 28;
    if (L.targeted || at != null) targets();
    resetCache();
  }
  function targets() {
    var m = doc.querySelector(".top .mark"), b = doc.getElementById("brand");
    var mr = m && m.getBoundingClientRect(), br = b && b.getBoundingClientRect();
    var o = ov.getBoundingClientRect();
    L.markT = mr && mr.width > 0 && mr.bottom > 0 && mr.top < L.H ? { x: mr.left - o.left, y: mr.top - o.top, w: mr.width, h: mr.height } : null;
    if (br && br.width > 0 && br.bottom > 0 && br.top < L.H) {
      var s = (parseFloat(root.getComputedStyle(b).fontSize) || 16) / L.fs;
      L.wordT = { dx: br.left - o.left - L.word.x, dy: br.top - o.top + br.height / 2 - (L.word.y + L.word.h / 2), s: s };
    } else L.wordT = null;
  }

  // ---- Buildings: rows of narrow lots along each block's two long sides, now and then a large one, each with a height
  //      (render_height), made when their block is first seen, kept in one pool ----
  var BMAX = 60000, BP = new Float32Array(BMAX * 5), BN = 0, BLK = {}; // ponytail: a fixed pool (1.2 MB), the part ever seen fits
  function block(ix, iy) {
    var key = ix * 1000 + iy, b = BLK[key];
    if (b) return b;
    var R = rng((ix * 73856093) ^ (iy * 19349663) ^ 20261113), RH = rng((ix * 19349663) ^ (iy * 83492791) ^ 1113), start = BN;
    var x0 = gx(ix) + 8, x1 = gx(ix + 1) - 8, y0 = gy(iy) + 8, y1 = gy(iy + 1) - 8;
    for (var r = 0; r < 2; r++) {
      var ry = r ? y1 : y0, x = x0 + R() * 4;
      while (x < x1 - 6) {
        var big = R() < 0.1, bw = Math.min(big ? 30 + R() * 25 : 8 + R() * 9, x1 - x), bd = big ? 26 + R() * 12 : 12 + R() * 11;
        var by = r ? ry - bd : ry, cx = x + bw / 2, cy = by + bd / 2;
        if (R() > 0.08 && !inPark(cx, cy, 0) && !wet(cx, cy, 60) && diagDist(cx, cy) > 26 && BN < BMAX) {
          var o = BN * 5;
          BP[o] = x; BP[o + 1] = by; BP[o + 2] = bw; BP[o + 3] = bd;
          BP[o + 4] = big ? 14 + RH() * 20 : RH() < 0.05 ? 26 + RH() * 16 : 6 + RH() * 10;
          BN++;
        }
        x += bw + 1.2 + (R() < 0.12 ? 5 : 0);
      }
    }
    return (BLK[key] = [start, BN - start]);
  }
  /** While the map stands still (before the flight), the blocks within 2.6 km of the target are made a few per frame,
   *  so the dive never stalls on making them. */
  var WARM = { ix: 0, iy: 0, on: false };
  function warm() {
    if (!WARM.on) { WARM.on = true; WARM.x0 = before(T.x - 2600, XS, NX); WARM.x1 = before(T.x + 2600, XS, NX); WARM.ix = WARM.x0; WARM.iy = before(T.y - 2600, YS, NY); WARM.y0 = WARM.iy; WARM.y1 = before(T.y + 2600, YS, NY); }
    for (var n = 0; n < 40 && WARM.ix <= WARM.x1; n++) {
      block(WARM.ix, WARM.iy);
      if (++WARM.iy > WARM.y1) { WARM.iy = WARM.y0; WARM.ix++; }
    }
  }

  // Precomputed outlines in the city (metres): the river's banks every 40 m, the pond, the first park's footpaths.
  var RN = 0, RVX, RL, RR;
  (function () {
    var x0 = gx(-NX) - 800, x1 = gx(NX) + 800;
    RN = Math.ceil((x1 - x0) / 40) + 1;
    RVX = new Float64Array(RN); RL = new Float64Array(RN * 2); RR = new Float64Array(RN * 2);
    for (var k = 0; k < RN; k++) {
      var x = x0 + k * 40, y = riverY(x), d = riverDY(x), l = Math.sqrt(1 + d * d), nx = -d / l * RIVER, ny = 1 / l * RIVER;
      RVX[k] = x; RL[2 * k] = x - nx; RL[2 * k + 1] = y - ny; RR[2 * k] = x + nx; RR[2 * k + 1] = y + ny;
    }
  })();
  function ring(cx, cy, rx, ry, rot, n) {
    var a = new Float64Array(n * 2), co = Math.cos(rot), si = Math.sin(rot);
    for (var k = 0; k < n; k++) { var t = k / n * 2 * Math.PI, x = rx * Math.cos(t), y = ry * Math.sin(t); a[2 * k] = cx + x * co - y * si; a[2 * k + 1] = cy + x * si + y * co; }
    return a;
  }
  function curve(p0, p1, p2, p3, n) { // a cubic Bézier sampled (a quadratic: p1 === p2)
    var a = new Float64Array(n * 2);
    for (var k = 0; k < n; k++) {
      var t = k / (n - 1), u = 1 - t;
      for (var c = 0; c < 2; c++) a[2 * k + c] = u * u * u * p0[c] + 3 * u * u * t * p1[c] + 3 * u * t * t * p2[c] + t * t * t * p3[c];
    }
    return a;
  }
  var POLY = ring(POND[0], POND[1], POND[2], POND[3], -0.2, 40), PATHS = (function () {
    var q = park(0);
    return [ring(POND[0], POND[1], POND[2] + 22, POND[3] + 18, -0.2, 48),
            curve([q[0] + 7, mix(q[1], q[3], 0.82)], [mix(q[0], q[2], 0.3), mix(q[1], q[3], 0.7)], [mix(q[0], q[2], 0.42), mix(q[1], q[3], 0.3)], [q[2] - 7, q[1] + 18], 28),
            curve([mix(q[0], q[2], 0.18), q[3] - 7], [mix(q[0], q[2], 0.3), mix(q[1], q[3], 0.62)], [mix(q[0], q[2], 0.3), mix(q[1], q[3], 0.62)], [POND[0] - POND[2] - 22, POND[1] + 6], 20)];
  })();

  /** The water points' clusters at each zoom level, the opening's drop order, their DOM (the app's pins and bubbles). */
  function world() {
    // Clusters per zoom level (radius 60 px at that level's scale), keyed by their members: an item the same at two
    // levels stays put while the levels cross-fade.
    var byKey = {};
    ITEMS = [];
    for (var lv = 0; lv <= 4; lv++) {
      cluster(PTS, 60 / (L.s0 * Math.pow(2, lv))).forEach(function (c) {
        var key = c.m.length === 1 ? "p" + c.m[0] : "c" + c.m.join(",");
        var it = byKey[key];
        if (!it) { it = byKey[key] = { key: key, x: c.x, y: c.y, n: c.m.length, lv: [], target: c.m.length === 1 && c.m[0] === 0 }; ITEMS.push(it); }
        it.lv[lv] = 1;
      });
    }
    // The opening's drops: the items of the first level, nearest the screen's centre first.
    cam(0, L.W, L.H, C);
    ITEMS.forEach(function (it) {
      if (!it.lv[0]) { it.ta = -1e9; return; }
      vw(it.x, it.y); pj(VX, VY, 0);
      var d = Math.hypot(PX - L.W / 2, PY - L.H / 2) / Math.max(L.W, L.H);
      it.ta = TL.pins[0] + Math.min(1, d * 1.6) * 380 + ((it.n * 37) % 7) * 12;
    });
    while (pinBox.firstChild) pinBox.removeChild(pinBox.firstChild);
    ITEMS.forEach(function (it) {
      if (it.n === 1) { it.node = el("div", "wn-intro-pin", pinBox); icon("drop", null, it.node); }
      else {
        it.node = el("div", "wn-intro-cluster wn-intro-t" + (it.n < 10 ? 0 : it.n < 100 ? 1 : 2), pinBox);
        el("span", null, it.node, String(it.n));
      }
    });
    sel = el("div", "wn-intro-pin wn-intro-sel", pinBox);
    icon("drop", null, sel);
    resetCache();
  }

  // ---- 3D: the city to the view frame (turned by ROT and the bearing, around the target) and onto the screen; ground
  //      shapes are clipped where they pass under the camera; boxes are drawn far to near (painter's order) ----
  var VX = 0, VY = 0, PX = 0, PY = 0;
  function vw(x, y) { var dx = x - T.x, dy = y - T.y; VX = dx * C.co - dy * C.si; VY = dx * C.si + dy * C.co; }
  function pj(xv, yv, z) {
    var d = C.D - yv * C.sp - z * C.cp;
    PX = C.ox + C.f * xv / d; PY = C.oy + C.f * (yv * C.cp - z * C.sp) / d;
    return d;
  }
  var QX = new Float64Array(64), QY = new Float64Array(64), OX = new Float64Array(72), OY = new Float64Array(72);
  /** The polygon QX/QY (n points, view frame, at height z) clipped to the part in front of the camera, added to the path. */
  function gpoly(n, z) {
    var yn = C.sp > 1e-4 ? (0.75 * C.D - z * C.cp) / C.sp : 1e12, m = 0, i, j, k;
    for (i = 0; i < n; i++) {
      j = i + 1 === n ? 0 : i + 1;
      var ai = QY[i] <= yn, aj = QY[j] <= yn;
      if (ai) { OX[m] = QX[i]; OY[m] = QY[i]; m++; }
      if (ai !== aj) { k = (yn - QY[i]) / (QY[j] - QY[i]); OX[m] = QX[i] + (QX[j] - QX[i]) * k; OY[m] = yn; m++; }
    }
    if (m < 3) return;
    for (i = 0; i < m; i++) { pj(OX[i], OY[i], z); if (i) g.lineTo(PX, PY); else g.moveTo(PX, PY); }
    g.closePath();
  }
  /** A street from (ax, ay) to (bx, by), hw metres either side, as a ground quad. */
  function gseg(ax, ay, bx, by, hw) {
    vw(ax, ay); var x0 = VX, y0 = VY;
    vw(bx, by);
    var dx = VX - x0, dy = VY - y0, l = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / l * hw, ny = dx / l * hw;
    QX[0] = x0 + nx; QY[0] = y0 + ny; QX[1] = VX + nx; QY[1] = VY + ny; QX[2] = VX - nx; QY[2] = VY - ny; QX[3] = x0 - nx; QY[3] = y0 - ny;
    gpoly(4, 0);
  }
  function grect(x0, y0, x1, y1) {
    vw(x0, y0); QX[0] = VX; QY[0] = VY; vw(x1, y0); QX[1] = VX; QY[1] = VY;
    vw(x1, y1); QX[2] = VX; QY[2] = VY; vw(x0, y1); QX[3] = VX; QY[3] = VY;
    gpoly(4, 0);
  }
  function gring(a, n) { for (var k = 0; k < n; k++) { vw(a[2 * k], a[2 * k + 1]); QX[k] = VX; QY[k] = VY; } gpoly(n, 0); }

  /** What the screen sees of the ground: a box in the view frame (its corners' rays, the far ones capped) and the city's
   *  blocks under it. */
  var B = {};
  function bounds() {
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, k;
    for (k = 0; k < 4; k++) {
      var a = ((k & 1 ? L.W + 40 : -40) - C.ox) / C.f, b = ((k & 2 ? L.H + 40 : -40) - C.oy) / C.f, den = C.cp + b * C.sp;
      var lam = den > 1e-3 ? Math.min(C.D * C.cp / den, 4 * C.D) : 4 * C.D;
      var xv = lam * a, yv = C.D * C.sp + lam * (b * C.cp - C.sp);
      if (xv < x0) x0 = xv; if (xv > x1) x1 = xv; if (yv < y0) y0 = yv; if (yv > y1) y1 = yv;
    }
    if (y0 < -8600) { // nothing shows through the haze beyond 8.5 km: the ground stops there, as wide as the screen sees it
      var dk = (C.D + 8600 * C.sp) / C.f;
      y0 = -8600; x0 = Math.max(x0, (-40 - C.ox) * dk); x1 = Math.min(x1, (L.W + 40 - C.ox) * dk);
    }
    B.x0 = x0; B.x1 = x1; B.y0 = y0; B.y1 = y1 + 140 * C.sp; // a tall building just below the bottom edge still shows
    range(B.x0, B.x1, B.y0, B.y1, B);
    B.X0 = Math.max(B.wx0, gx(-NX)); B.X1 = Math.min(B.wx1, gx(NX)); B.Y0 = Math.max(B.wy0, gy(-NY)); B.Y1 = Math.min(B.wy1, gy(NY));
  }
  /** The city's box and blocks under a box of the view frame (into o). */
  function range(x0, x1, y0, y1, o) {
    var wx0 = 1e9, wx1 = -1e9, wy0 = 1e9, wy1 = -1e9;
    for (var k = 0; k < 4; k++) {
      var xv = k & 1 ? x1 : x0, yv = k & 2 ? y1 : y0;
      var wx = T.x + xv * C.co + yv * C.si, wy = T.y - xv * C.si + yv * C.co;
      if (wx < wx0) wx0 = wx; if (wx > wx1) wx1 = wx; if (wy < wy0) wy0 = wy; if (wy > wy1) wy1 = wy;
    }
    o.wx0 = wx0; o.wx1 = wx1; o.wy0 = wy0; o.wy1 = wy1;
    o.ix0 = before(wx0, XS, NX); o.ix1 = before(wx1, XS, NX) + 1; o.iy0 = before(wy0, YS, NY); o.iy1 = before(wy1, YS, NY) + 1;
  }

  // ---- The map, drawn like the app's style: background, minor streets, parks and water over them (so only the
  //      boulevards cross: bridges), footpaths, the main roads (widths in px at the zoom, so they thin with distance),
  //      flat building footprints, the console's cells, then the boxes (columns or buildings) far to near ----
  function streets(kind, hw) {
    var i, k;
    if (kind === 2) {
      gseg(DIAG[0], DIAG[1], DIAG[2], DIAG[3], hw);
      for (var x = B.X0 - 100; x <= B.X1 + 100; x += 60) gseg(x, riverY(x) - RIVER - 46, x + 60, riverY(x + 60) - RIVER - 46, hw);
      return;
    }
    for (i = B.ix0; i <= B.ix1; i++) if ((i % 5 === 0) === (kind === 1)) gseg(gx(i), B.Y0, gx(i), B.Y1, hw);
    for (k = B.iy0; k <= B.iy1; k++) if ((k % 5 === 0) === (kind === 1)) gseg(B.X0, gy(k), B.X1, gy(k), hw);
  }
  function road(kind, fill, casing, wpx, a) {
    g.globalAlpha = a;
    g.fillStyle = casing; g.beginPath(); streets(kind, (wpx + 1 + 0.35 * wpx) / C.s / 2); g.fill();
    g.fillStyle = fill; g.beginPath(); streets(kind, wpx / C.s / 2); g.fill();
    g.globalAlpha = 1;
  }

  function drawMap(t) {
    var z = C.z, i, k;
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = COL.bg;
    g.fillRect(0, 0, L.W, L.H);
    bounds();
    lit();
    road(0, COL.road, COL["case"], 0.55 * Math.pow(1.85, z), 0.6 + 0.4 * prog(z, 0, 1));
    // Parks (a wood in the first one), the river, the pond.
    g.fillStyle = COL.park;
    g.beginPath();
    for (i = 0; i < PARKS.length; i++) { var p = park(i); grect(p[0] + 7, p[1] + 7, p[2] - 7, p[3] - 7); }
    g.fill();
    g.fillStyle = COL.wood;
    g.beginPath(); grect(WOOD[0], WOOD[1], WOOD[2], WOOD[3]); g.fill();
    g.fillStyle = COL.water;
    g.beginPath();
    for (k = 0; k + 1 < RN; k++) {
      if (RVX[k + 1] < B.wx0 - 300 || RVX[k] > B.wx1 + 300) continue;
      vw(RL[2 * k], RL[2 * k + 1]); QX[0] = VX; QY[0] = VY; vw(RL[2 * k + 2], RL[2 * k + 3]); QX[1] = VX; QY[1] = VY;
      vw(RR[2 * k + 2], RR[2 * k + 3]); QX[2] = VX; QY[2] = VY; vw(RR[2 * k], RR[2 * k + 1]); QX[3] = VX; QY[3] = VY;
      gpoly(4, 0);
    }
    gring(POLY, 40);
    g.fill();
    // Footpaths in the first park, close up (the style's dashed grey paths).
    var pa = prog(z, 1.5, 2.2);
    if (pa > 0) {
      g.beginPath();
      for (i = 0; i < PATHS.length; i++) {
        var a = PATHS[i], n = a.length / 2;
        for (k = 0; k <= n; k++) {
          if (k === n && i > 0) break;
          var kk = k % n;
          vw(a[2 * kk], a[2 * kk + 1]); pj(VX, VY, 0);
          if (k) g.lineTo(PX, PY); else g.moveTo(PX, PY);
        }
      }
      g.globalAlpha = pa;
      g.strokeStyle = COL.path;
      g.lineWidth = 1.2;
      g.setLineDash(DASH);
      g.stroke();
      g.setLineDash(NODASH);
      g.globalAlpha = 1;
    }
    // The boulevards over everything (bridges over the river), the riverside road, the diagonal.
    road(1, COL.road2, COL.case2, 1.5 * Math.pow(1.7, z), 1);
    road(2, COL.road3, COL.case3, 2.2 * Math.pow(1.66, z), 1);
    footprints(t);
    cellState(t);
    flatCells();
    columns();
    boxes();
    // Distance haze, as MapLibre's fog: the ground fades into the background from 5.5 to 8.5 km beyond the point, so
    // the tilted view never shows where the illustrative city ends. One gradient, stretched over those two screen rows.
    var y0 = horizon(5500), y1 = horizon(8500);
    if (y0 > 0) {
      if (!L.fog) {
        L.fog = g.createLinearGradient(0, 0, 0, 1);
        L.fog.addColorStop(0, css(RGB.bg[0], RGB.bg[1], RGB.bg[2]));
        L.fog.addColorStop(1, "rgba(" + Math.round(RGB.bg[0] * 255) + "," + Math.round(RGB.bg[1] * 255) + "," + Math.round(RGB.bg[2] * 255) + ",0)");
      }
      g.fillStyle = COL.bg;
      if (y1 > 0) g.fillRect(0, 0, L.W, y1);
      g.setTransform(L.dpr, 0, 0, L.dpr * Math.max(1, y0 - y1), 0, L.dpr * y1);
      g.fillStyle = L.fog;
      g.fillRect(0, 0, L.W, 1);
      g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    }
  }
  /** The screen row of the ground r metres beyond the point (straight ahead). */
  function horizon(r) { return C.oy - C.f * r * C.cp / (C.D + r * C.sp); }
  var DASH = [2.4, 2.4], NODASH = [];

  /**
   * The buildings in view: flat footprints fading in with the zoom where they stand (MapLibre's farther tiles are at a
   * lower zoom: the building layer fades in between 1.3 and 2.1 here); extrusions rising as the map tilts (the app's
   * WnBuildings: from 6° to 40°) and the zoom where they stand grows (the style's height ramp), once the cells are down.
   * Flat ones are drawn here in four fade steps; the others wait in SORT for boxes().
   */
  var VMAX = 20000, PB = new Float32Array(VMAX * 8), VB = new Uint8Array(VMAX), VH = new Float32Array(VMAX), VO = new Uint32Array(VMAX);
  var SORT = new Float64Array(VMAX), NV = 0, NSORT = 0, F = {};
  function footprints(t) {
    NV = NSORT = 0;
    // Farther than dmax the layer hasn't faded in yet: only the blocks nearer than that are looked at.
    var dmax = C.D * Math.pow(2, C.z - 1.3);
    if (dmax < 0.55 * C.D || (C.sp < 1e-4 && dmax < C.D)) return; // nearer than ~0.55 D is under the screen's bottom
    var yf = C.sp < 1e-4 ? B.y0 : Math.max(B.y0, (C.D - dmax) / C.sp), df = C.D - yf * C.sp;
    range(Math.max(B.x0, (-40 - C.ox) * df / C.f), Math.min(B.x1, (L.W + 40 - C.ox) * df / C.f), yf, B.y1, F);
    var gate = smooth(clamp((C.ph * 180 / Math.PI - 6) / 34, 0, 1)) * STD(prog(t, TL.sink[1], TL.sink[1] + 800));
    var camY = C.D * C.sp, nv = 0, ns = 0, ix, iy, o, e, k, q;
    for (ix = F.ix0; ix < F.ix1; ix++) for (iy = F.iy0; iy < F.iy1; iy++) {
      if (ix < -NX || ix >= NX || iy < -NY || iy >= NY) continue;
      var blk = block(ix, iy);
      for (o = blk[0] * 5, e = o + blk[1] * 5; o < e && nv < VMAX; o += 5) {
        var x = BP[o], y = BP[o + 1], bw = BP[o + 2], bd = BP[o + 3];
        vw(x + bw / 2, y + bd / 2);
        if (VX < B.x0 || VX > B.x1 || VY < B.y0 || VY > B.y1) continue;
        var d = C.D - VY * C.sp, px = C.f * (bw > bd ? bw : bd) / d;
        if (d < 0.3 * C.D || d > dmax || px < L.minPx) continue;
        var zl = C.z + Math.log(C.D / d) * Math.LOG2E, ba = prog(zl, 1.3, 2.1);
        if (ba <= 0) continue;
        var cx = VX, cy = VY;
        q = nv * 8;
        vw(x, y); pj(VX, VY, 0); PB[q] = PX; PB[q + 1] = PY;
        vw(x + bw, y); pj(VX, VY, 0); PB[q + 2] = PX; PB[q + 3] = PY;
        vw(x + bw, y + bd); pj(VX, VY, 0); PB[q + 4] = PX; PB[q + 5] = PY;
        vw(x, y + bd); pj(VX, VY, 0); PB[q + 6] = PX; PB[q + 7] = PY;
        VB[nv] = ba >= 1 ? 3 : Math.floor(ba * 4);
        VH[nv] = px < 10 ? 0 : BP[o + 4] * gate * prog(zl, 1.8, 2.6); // under 10 px its walls would hardly show: it stays flat
        VO[nv] = o;
        if (VH[nv] >= 0.3) SORT[ns++] = Math.floor(Math.sqrt(cx * cx + (cy - camY) * (cy - camY)) * 4) * 65536 + nv;
        nv++;
      }
    }
    for (k = 0; k < 4; k++) {
      var any = false;
      g.beginPath();
      for (var v = 0; v < nv; v++) {
        if (VB[v] !== k || VH[v] >= 0.3) continue;
        q = v * 8; any = true;
        g.moveTo(PB[q], PB[q + 1]); g.lineTo(PB[q + 2], PB[q + 3]); g.lineTo(PB[q + 4], PB[q + 5]); g.lineTo(PB[q + 6], PB[q + 7]); g.closePath();
      }
      if (any) { g.fillStyle = FOOT[k]; g.fill(); }
    }
    NV = nv; NSORT = ns;
  }

  // One box (a building or a column): its base corners in BX/BY (view frame), height h; the walls facing the camera,
  // then the top, in the colours FACE[fi + side]; N: the walls' outward normals (view frame).
  var BX = new Float64Array(4), BY = new Float64Array(4), BPX = new Float64Array(4), BPY = new Float64Array(4), TPX = new Float64Array(4), TPY = new Float64Array(4);
  var NB = new Float64Array(8), NC = new Float64Array(8);
  function drawBox(h, fi, N) {
    var camY = C.D * C.sp, k, j;
    for (k = 0; k < 4; k++) { pj(BX[k], BY[k], 0); BPX[k] = PX; BPY[k] = PY; pj(BX[k], BY[k], h); TPX[k] = PX; TPY[k] = PY; }
    var tall = Math.abs(BPY[0] - TPY[0]) + Math.abs(BPY[2] - TPY[2]) > 3; // walls under ~1.5 px: only the top is drawn
    for (k = 0; tall && k < 4; k++) {
      j = (k + 1) & 3;
      if (N[2 * k] * -(BX[k] + BX[j]) * 0.5 + N[2 * k + 1] * (camY - (BY[k] + BY[j]) * 0.5) <= 0) continue;
      g.fillStyle = FACE[fi + k];
      g.beginPath(); g.moveTo(BPX[k], BPY[k]); g.lineTo(BPX[j], BPY[j]); g.lineTo(TPX[j], TPY[j]); g.lineTo(TPX[k], TPY[k]); g.closePath(); g.fill();
    }
    g.fillStyle = FACE[fi + 4];
    g.beginPath(); g.moveTo(TPX[0], TPY[0]); g.lineTo(TPX[1], TPY[1]); g.lineTo(TPX[2], TPY[2]); g.lineTo(TPX[3], TPY[3]); g.closePath(); g.fill();
  }
  function boxes() {
    if (!NSORT) return;
    NB[0] = C.si; NB[1] = -C.co; NB[2] = C.co; NB[3] = C.si; NB[4] = -C.si; NB[5] = C.co; NB[6] = -C.co; NB[7] = -C.si;
    var s = SORT.subarray(0, NSORT);
    s.sort();
    for (var i = NSORT - 1; i >= 0; i--) {
      var v = s[i] % 65536, o = VO[v], x = BP[o], y = BP[o + 1], bw = BP[o + 2], bd = BP[o + 3];
      vw(x, y); BX[0] = VX; BY[0] = VY; vw(x + bw, y); BX[1] = VX; BY[1] = VY;
      vw(x + bw, y + bd); BX[2] = VX; BY[2] = VY; vw(x, y + bd); BX[3] = VX; BY[3] = VY;
      drawBox(VH[v], (BP[o + 4] < 14 ? 0 : BP[o + 4] < 28 ? 1 : 2) * 5, NB);
    }
  }

  // ---- The console's cells: fade in flat (its fill opacity, its hairlines), rise as columns, sink, the target last and
  //      outlined (its selection line), then only the target's, until the pin is selected ----
  function cellState(t) {
    for (var i = 0; i < CELLS.length; i++) {
      var c = CELLS[i], fi = STD(prog(t, c.in, c.in + 300)), up = DEC(prog(t, c.up, c.up + 520)) * (1 - STD(prog(t, c.down, c.down + 420)));
      var gone = c.target ? STD(prog(t, TL.select[0], TL.select[0] + 500)) : STD(prog(t, c.down + 300, c.down + 560));
      c.h = HMAX * c.k * up;
      c.upq = up;
      c.ins = 240;                            // a slim column from the tile's middle (520 m wide), the tile kept under it
      c.af = fi * (1 - gone);                 // flat: the fill and its hairline
      c.ac = mix(0.6, 1, prog(up, 0, 0.3));   // a column turns opaque as it leaves the ground
      c.ol = c.target ? STD(prog(t, TL.sink[0], TL.sink[0] + 300)) * (1 - gone) : 0;
    }
  }
  function cellQuad(c, ins) { // its corners, view frame, in BX/BY (north frame turned by the bearing)
    var u0 = c.u0 + ins, v0 = c.v0 + ins, u1 = c.u0 + CELL - ins, v1 = c.v0 + CELL - ins;
    BX[0] = u0 * C.cb - v0 * C.sb; BY[0] = u0 * C.sb + v0 * C.cb; BX[1] = u1 * C.cb - v0 * C.sb; BY[1] = u1 * C.sb + v0 * C.cb;
    BX[2] = u1 * C.cb - v1 * C.sb; BY[2] = u1 * C.sb + v1 * C.cb; BX[3] = u0 * C.cb - v1 * C.sb; BY[3] = u0 * C.sb + v1 * C.cb;
  }
  function toQ() { for (var k = 0; k < 4; k++) { QX[k] = BX[k]; QY[k] = BY[k]; } }
  function outline(c, z, ins, a) {
    if (a <= 0.003) return;
    cellQuad(c, ins); toQ();
    g.globalAlpha = a; g.strokeStyle = COL.csel; g.lineWidth = 2.5; g.lineJoin = "round";
    g.beginPath(); gpoly(4, z); g.stroke();
    g.globalAlpha = 1;
  }
  function flatCells() {
    g.lineWidth = 1;
    for (var i = 0; i < CELLS.length; i++) {
      var c = CELLS[i];
      if (c.af <= 0.003) continue;
      cellQuad(c, 0); toQ();
      g.beginPath(); gpoly(4, 0);
      // The console's fill (lighter under a standing column, so its walls stand out from it, dark map included); the
      // target's goes as the camera enters it (its line stays).
      g.globalAlpha = c.af * 0.6 * (1 - 0.45 * c.upq) * (c.target ? 1 - smooth(prog(C.z, 0.9, 2.2)) : 1);
      g.fillStyle = RAMP[c.cls]; g.fill();
      g.globalAlpha = c.af; g.strokeStyle = COL.cline; g.stroke();
    }
    g.globalAlpha = 1;
    outline(TCELL, 0, 0, TCELL.ol);
  }
  var CORD = [];
  function columns() {
    var camY = C.D * C.sp, n = 0, i, j, c;
    NC[0] = C.sb; NC[1] = -C.cb; NC[2] = C.cb; NC[3] = C.sb; NC[4] = -C.sb; NC[5] = C.cb; NC[6] = -C.cb; NC[7] = -C.sb;
    for (i = 0; i < CELLS.length; i++) {
      c = CELLS[i];
      if (c.h < 0.5 || c.af <= 0.003) continue;
      var u = c.u0 + CELL / 2, v = c.v0 + CELL / 2, xv = u * C.cb - v * C.sb, yv = u * C.sb + v * C.cb;
      c.key = xv * xv + (yv - camY) * (yv - camY);
      c.d = C.D - yv * C.sp - c.h / 2 * C.cp;
      for (j = n++; j > 0 && CELLS[CORD[j - 1]].key < c.key; j--) CORD[j] = CORD[j - 1]; // far first
      CORD[j] = i;
    }
    for (i = 0; i < n; i++) {
      c = CELLS[CORD[i]];
      var near = clamp((c.d / C.D - 0.35) / 0.25, 0, 1); // the camera passes through the nearest: they dissolve
      if (near <= 0) continue;
      cellQuad(c, c.ins);
      g.globalAlpha = c.ac * c.af * near;
      drawBox(c.h, 15 + c.cls * 5, NC);
      g.globalAlpha = 1;
    }
  }

  // ---- One frame: a pure function of t (so ?introAt shows exactly what the timeline does) ----
  var STILL_MAP = TL.select[0] + 520; // after this the map no longer moves: drawn again only for a new size or theme
  function scene(t) {
    cam(t, L.W, L.H, C);
    var out = ACC(prog(t, TL.out[0], TL.out[1]));
    var settle = mix(1.04, 1, DEC(prog(t, TL.exit[0] + 140, TL.exit[0] + 560)));
    put(app, 1 - out, "scale(" + settle.toFixed(4) + ")"); // fade-through: the outgoing screen only fades
    if (t < TL.out[1]) {
      var key = t < TL.fly[0] ? 0 : t < STILL_MAP ? t : -1;
      if (t < TL.fly[0] && at == null) warm();
      if (L.drawn !== key) { L.drawn = key; drawMap(t); }
      pins(t); appUi(t);
    }
    splashUi(t);
    logoUi(t);
  }

  /** The pins: drops at the opening; gone while the cells tell the story, back at street level; clusters cross-fade
   *  into pins as the zoom passes each level (MapLibre's symbol fade); the target's pin becomes the selected one and
   *  pops (WnMotion.bouncy). Markers stay upright and the same size when the map tilts, as MapLibre's do. */
  function pins(t) {
    var lf = clamp(Math.floor(C.z), 0, 4), fr = C.z - lf, x = lf < 4 ? STD(clamp((fr - 0.72) / 0.28, 0, 1)) : 0; // this level, the next
    var bk = DEC(prog(t, TL.back[0], TL.back[1])), vis = 1 - STD(prog(t, TL.cells[0], TL.cells[0] + 300)) + bk;
    var bs = t >= TL.back[0] ? mix(0.85, 1, bk) : 1;
    var selOn = t >= TL.select[0];
    for (var i = 0; i < ITEMS.length; i++) {
      var it = ITEMS[i], op = ((it.lv[lf] ? 1 - x : 0) + (it.lv[lf + 1] ? x : 0)) * vis;
      var q = prog(t, it.ta, it.ta + 600), sc = bs;
      if (it.ta > 0) { op *= DROP(q); sc *= q < 0.6 ? 0.4 + 0.75 * DROP(q / 0.6) : 1.15 - 0.15 * DROP((q - 0.6) / 0.4); } // map.css wn-drop-in
      if (it.target && selOn) op = 0;
      if (op <= 0.001) { put(it.node, 0, null); continue; }
      vw(it.x, it.y);
      var d = pj(VX, VY, 0);
      if (d < 0.3 * C.D || PX < -60 || PX > L.W + 60 || PY < -60 || PY > L.H + 60) { put(it.node, 0, null); continue; }
      put(it.node, op, tr(PX, PY, sc));
    }
    if (selOn) put(sel, 1, tr(C.ox, C.oy, spring(t - TL.select[0], 0.75, 0.55, 700)));
    else put(sel, 0, null);
  }

  /** The search bar, the cell's card, the toast, the scrim and the sheet: loading, then filled. */
  function appUi(t) {
    var cq = DEC(prog(t, TL.chrome[0], TL.chrome[0] + 340));
    put(search, cq, tr(0, (1 - cq) * 12));
    // The card: rises in (appear), its tiles one after the other (staggerIn), the figures count up (EmphasizedDecelerate).
    var kq = DEC(prog(t, TL.card[0], TL.card[0] + 340)), kx = ACC(prog(t, TL.card[1] - 150, TL.card[1]));
    put(card, kq * (1 - kx), tr(0, (1 - kq) * 16));
    if (kq > 0 && kx < 1) {
      for (var i = 0; i < 2; i++) {
        var a = TL.card[0] + 70 + i * 35, q = DEC(prog(t, a, a + 340));
        put(tiles[i], q, tr(0, (1 - q) * 12));
        var n = Math.round((i ? RES10 : REFILLS) * DEC(prog(t, a + 40, a + 840)));
        txt(nums[i], NF ? NF.format(n) : String(n));
      }
    }
    var tq = DEC(prog(t, TL.toast[0], TL.toast[0] + 340)), tx = ACC(prog(t, TL.toast[1] - 150, TL.toast[1]));
    put(toast, tq * (1 - tx), tr(0, (1 - tq) * 16));
    put(scrim, STD(prog(t, TL.sheet[0], TL.sheet[0] + 300)), null);
    var sq = DEC(prog(t, TL.sheet[0], TL.sheet[1]));
    put(sheet, sq > 0 ? 1 : 0, sq > 0 ? "translate3d(0," + ((1 - sq) * 104).toFixed(2) + "%,0)" : null);
    if (sq <= 0) return;
    var rq = DEC(prog(t, TL.sheet[0] + 70, TL.sheet[0] + 410)); // SheetRise
    put(sheetIn, rq, tr(0, (1 - rq) * 18));
    // WnSkeleton's light band: one sweep across the window (1300 ms, Standard), drawn into every skeleton block.
    var band = -160 + (L.W + 320) * STD(prog(t, TL.loading[0] + 200, TL.loading[0] + 1500));
    skels.forEach(function (k) { put(k.band, 1, "translate3d(" + (band - L.sheetX - k.x).toFixed(1) + "px,0,0)"); });
    // The spinner of « Accès aux informations… » (Material's indeterminate arc).
    var u = t - TL.loading[0];
    spin.arc.setAttribute("stroke-dasharray", (6 + 22 * (0.5 - 0.5 * Math.cos(u / 1333 * 2 * Math.PI))).toFixed(2) + " 40");
    put(spin, 1, "rotate(" + ((u * 0.42) % 360).toFixed(1) + "deg)");
    // Filled: each part rises in (staggerIn: 35 ms apart, 12 px, 340 ms), its skeleton leaves (150 ms).
    slots.forEach(function (s, i) {
      var f0 = TL.fill[0] + i * 35, q = DEC(prog(t, f0, f0 + 340));
      put(s.real, q, tr(0, (1 - q) * 12));
      put(s.sk, 1 - ACC(prog(t, f0, f0 + 150)), null);
    });
  }

  /** The launch screen: the icon arrives, breathes, dives through the screen; a ring ripples out; the background melts. */
  function splashUi(t) {
    var e0 = TL.exit[0];
    var inq = DEC(prog(t, TL.splash[0], TL.splash[1]));
    var br = mix(1, 0.9, bez(0, 0, 0.58, 1)(prog(t, e0, e0 + 120))), dv = DIVE(prog(t, e0 + 120, e0 + 420));
    put(sIcon, inq * (1 - dv), "scale(" + (mix(0.86, 1, inq) * br * mix(1, 3.2 / 0.9, dv)).toFixed(4) + ")");
    var ra = t < e0 + 190 ? 0.55 * prog(t, e0 + 100, e0 + 190) : 0.55 * (1 - MELT(prog(t, e0 + 190, e0 + 570)));
    put(ripple, ra, "scale(" + mix(0.6, 3, MELT(prog(t, e0 + 190, e0 + 570))).toFixed(4) + ")");
    put(splash, 1 - MELT(prog(t, e0 + 160, e0 + 560)), null);
  }

  /** The logo screen and the dock: the logo and the name land on the header's own and are swapped for them at the end. */
  function logoUi(t) {
    var a = TL.logo[0], lq = DEC(prog(t, a, a + 400)), dk = DOCK(prog(t, TL.dock[0], TL.dock[1]));
    if (dk > 0 && L.markT) {
      put(logo, t < TL.dock[1] ? 1 : 0, tr((L.markT.x - L.logo.x) * dk, (L.markT.y - L.logo.y) * DOCKY(prog(t, TL.dock[0], TL.dock[1])), mix(1, L.markT.w / L.logo.w, dk)));
    } else {
      var ls = mix(0.92, 1, lq) * mix(1, 0.9, dk);
      put(logo, lq * (1 - dk), tr((1 - ls) * L.logo.w / 2, (1 - ls) * L.logo.h / 2, ls));
    }
    var wq = DEC(prog(t, a + 70, a + 410));
    if (dk > 0 && L.wordT) {
      var dw = DOCK(prog(t, TL.dock[0] + 40, TL.dock[1]));
      put(word, t < TL.dock[1] ? 1 : 0, tr(L.wordT.dx * dw, L.wordT.dy * DOCKY(prog(t, TL.dock[0] + 40, TL.dock[1])), mix(1, L.wordT.s, dw)));
    } else put(word, wq * (1 - dk), tr(0, (1 - wq) * 12, mix(1, 0.94, dk)));
    var leave = 1 - STD(prog(t, TL.dock[0] - 100, TL.dock[0] + 120));
    var kq = DEC(prog(t, a + 140, a + 480)), bq = DEC(prog(t, a + 210, a + 550));
    put(cap, kq * leave, tr(0, (1 - kq) * 12));
    // The session, honestly: "verified" only once the dashboard has drawn (wnc:render), "checking" with a session, else "required".
    var st = ready ? "ok" : hasSession ? "wait" : "req";
    if (badge.st !== st) {
      badge.st = st;
      badge.className = "wn-intro-badge wn-intro-session " + (st === "ok" ? "wn-intro-b-ok" : "wn-intro-b-out");
      badge.ic.setAttribute("class", "wn-intro-ic" + (st === "ok" ? "" : " wn-intro-off"));
      txt(badgeTxt, st === "ok" ? w.tfaOk : st === "wait" ? w.tfaWait : w.tfaReq);
    }
    put(badge, bq * leave, tr(0, (1 - bq) * 12));
    put(esc, DEC(prog(t, 700, 1040)) * leave, null);
    put(bg, 1 - SIN(prog(t, TL.fade[0], TL.fade[1])), null);
  }

  // ---- The DOM layer: transform and opacity only, written when they change ----
  function put(node, op, tf) {
    if (!node) return;
    var c = node.wnc || (node.wnc = {});
    var o = op >= 0.999 ? "1" : op <= 0.001 ? "0" : op.toFixed(3);
    if (c.o !== o) { node.style.opacity = o; c.o = o; }
    if (tf != null && c.t !== tf) { node.style.transform = tf; c.t = tf; }
  }
  function txt(node, s) { if (node.textContent !== s) node.textContent = s; }
  function resetCache() {
    var all = ov.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) all[i].wnc = null;
    ov.wnc = null;
  }
  function tr(x, y, s) { return "translate3d(" + x.toFixed(2) + "px," + y.toFixed(2) + "px,0)" + (s != null ? " scale(" + s.toFixed(4) + ")" : ""); }

  // Start: the app's background from the first paint (intro.css, its own failsafe), the overlay once the body is parsed.
  doc.addEventListener("wnc:render", onReady);
  html.classList.add("wn-intro-boot");
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", mountSafe); else mountSafe();
})(typeof window !== "undefined" ? window : globalThis);

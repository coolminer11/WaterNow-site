/* Share page: ?id=<spot id>&lat=..&lon=..&n=<name>. Everything is written with textContent, never as HTML. */
(function () {
  "use strict";
  var WN = window.WN;
  // Publishable key: public by design (it only reaches what row-level security lets anyone read).
  var SUPABASE_URL = "https://pkqsvlbiznrqxfckaxll.supabase.co";
  var PUBLISHABLE_KEY = "sb_publishable_Jw6cnMgupaVxupvltvUlPQ_mvwpiNVE";
  var SITE = new URL("../", location.href).href;

  // One table per app language (WN.LANGS). rating(r, n): r is the formatted average, n the review count (n > 0).
  var STRINGS = {
    en: {
      point: "Water point", open: "Open in WaterNow", dir: "Directions", map: "Map of the water point",
      badTitle: "Link incomplete", badText: "This link to a water point is damaged. Ask for it again.",
      getTitle: "No WaterNow yet?", getText: "Free drinking water near you, on a map the community keeps up to date.",
      get: "Get WaterNow", foot: "No trackers, no cookies.",
      verified: "Verified by WaterNow", maintenance: "WaterNow is being updated. The latest details will be back in a moment.",
      rating: function (r, n) { return "Rated " + r + "/5 (" + n + (n === 1 ? " review)" : " reviews)"); },
      checked: function (when, status) { return "Checked " + when + ": " + status; },
      types: { WATER_REFILL: "Refill station", FOUNTAIN: "Drinking fountain", DOG_WATER: "Water for dogs", RESTROOM: "Restroom", COMBO: "Water and restroom" },
      status: { working: "working", not_working: "not working", low_pressure: "low pressure", dirty: "dirty", closed_season: "closed for the season" }
    },
    fr: {
      point: "Point d'eau", open: "Ouvrir dans WaterNow", dir: "Itinéraire", map: "Carte du point d'eau",
      badTitle: "Lien incomplet", badText: "Ce lien vers un point d'eau est abîmé. Redemande-le.",
      getTitle: "Pas encore WaterNow ?", getText: "De l'eau potable gratuite près de toi, sur une carte que la communauté tient à jour.",
      get: "Obtenir WaterNow", foot: "Aucun traceur, aucun cookie.",
      verified: "Vérifié par WaterNow", maintenance: "WaterNow est en cours de mise à jour. Les dernières infos reviennent dans un moment.",
      rating: function (r, n) { return "Note " + r + "/5 (" + n + " avis)"; },
      checked: function (when, status) { return "Vérifié " + when + " : " + status; },
      types: { WATER_REFILL: "Station de remplissage", FOUNTAIN: "Fontaine à boire", DOG_WATER: "Eau pour chiens", RESTROOM: "Toilettes", COMBO: "Eau et toilettes" },
      status: { working: "fonctionne", not_working: "en panne", low_pressure: "faible pression", dirty: "sale", closed_season: "fermé pour la saison" }
    },
    es: {
      point: "Punto de agua", open: "Abrir en WaterNow", dir: "Indicaciones", map: "Mapa del punto de agua",
      badTitle: "Enlace incompleto", badText: "Este enlace a un punto de agua está dañado. Pídelo de nuevo.",
      getTitle: "¿Aún no tienes WaterNow?", getText: "Agua potable gratis cerca de ti, en un mapa que la comunidad mantiene al día.",
      get: "Consigue WaterNow", foot: "Sin rastreadores ni cookies.",
      verified: "Verificado por WaterNow", maintenance: "WaterNow se está actualizando. Los últimos detalles volverán en un momento.",
      rating: function (r, n) { return "Valoración " + r + "/5 (" + n + (n === 1 ? " reseña)" : " reseñas)"); },
      checked: function (when, status) { return "Verificado " + when + ": " + status; },
      types: { WATER_REFILL: "Estación de recarga", FOUNTAIN: "Fuente", DOG_WATER: "Agua para perros", RESTROOM: "Baños", COMBO: "Agua y baños" },
      status: { working: "funciona", not_working: "no funciona", low_pressure: "poca presión", dirty: "sucio", closed_season: "cerrado por temporada" }
    },
    de: {
      point: "Wasserstelle", open: "In WaterNow öffnen", dir: "Route", map: "Karte der Wasserstelle",
      badTitle: "Link unvollständig", badText: "Dieser Link zu einer Wasserstelle ist beschädigt. Lass ihn dir noch einmal schicken.",
      getTitle: "Noch kein WaterNow?", getText: "Kostenloses Trinkwasser in deiner Nähe, auf einer Karte, die die Community aktuell hält.",
      get: "WaterNow holen", foot: "Keine Tracker, keine Cookies.",
      verified: "Von WaterNow geprüft", maintenance: "WaterNow wird gerade aktualisiert. Die neuesten Details sind gleich wieder da.",
      rating: function (r, n) { return "Bewertet mit " + r + "/5 (" + n + (n === 1 ? " Bewertung)" : " Bewertungen)"); },
      checked: function (when, status) { return "Geprüft " + when + ": " + status; },
      types: { WATER_REFILL: "Nachfüllstation", FOUNTAIN: "Trinkbrunnen", DOG_WATER: "Hundetränke", RESTROOM: "Toiletten", COMBO: "Wasser und Toiletten" },
      status: { working: "funktioniert", not_working: "außer Betrieb", low_pressure: "schwacher Druck", dirty: "verschmutzt", closed_season: "saisonal geschlossen" }
    },
    pt: {
      point: "Ponto de água", open: "Abrir no WaterNow", dir: "Rota", map: "Mapa do ponto de água",
      badTitle: "Link incompleto", badText: "Este link para um ponto de água está corrompido. Peça de novo.",
      getTitle: "Ainda não tem o WaterNow?", getText: "Água potável grátis perto de você, em um mapa que a comunidade mantém atualizado.",
      get: "Baixe o WaterNow", foot: "Sem rastreadores, sem cookies.",
      verified: "Verificado pelo WaterNow", maintenance: "O WaterNow está sendo atualizado. Os detalhes mais recentes voltam daqui a pouco.",
      rating: function (r, n) { return "Nota " + r + "/5 (" + n + (n === 1 ? " avaliação)" : " avaliações)"); },
      checked: function (when, status) { return "Verificado " + when + ": " + status; },
      types: { WATER_REFILL: "Estação de recarga", FOUNTAIN: "Bebedouro", DOG_WATER: "Água para cães", RESTROOM: "Banheiros", COMBO: "Água e banheiros" },
      status: { working: "funcionando", not_working: "com defeito", low_pressure: "pressão baixa", dirty: "sujo", closed_season: "fechado nesta temporada" }
    },
    ja: {
      point: "給水スポット", open: "WaterNowで開く", dir: "ルート", map: "給水スポットの地図",
      badTitle: "リンクが不完全です", badText: "この給水スポットへのリンクは壊れています。もう一度送ってもらってください。",
      getTitle: "WaterNowをまだ使っていませんか？", getText: "近くの無料の飲み水を、コミュニティが更新し続けるマップで探せます。",
      get: "WaterNowを入手", foot: "トラッカーもCookieも使っていません。",
      verified: "WaterNow確認済み", maintenance: "WaterNowは現在アップデート中です。最新の情報はまもなく表示されます。",
      rating: function (r, n) { return "評価 " + r + "/5（" + n + "件のレビュー）"; },
      checked: function (when, status) { return "確認済み（" + when + "）：" + status; },
      types: { WATER_REFILL: "給水ステーション", FOUNTAIN: "水飲み場", DOG_WATER: "犬用の水", RESTROOM: "トイレ", COMBO: "給水とトイレ" },
      status: { working: "使用可能", not_working: "故障中", low_pressure: "水圧が弱い", dirty: "汚れている", closed_season: "シーズン休止中" }
    }
  };
  var lang = WN.lang(navigator.language);
  var T = STRINGS[lang];
  document.documentElement.lang = lang;

  var $ = function (id) { return document.getElementById(id); };
  var text = function (id, value) { $(id).textContent = value; };
  text("type", T.point); text("name", T.point); text("open", T.open); text("dir", T.dir);
  text("badTitle", T.badTitle); text("badText", T.badText);
  text("getTitle", T.getTitle); text("getText", T.getText); text("get", T.get); text("foot", T.foot);
  $("map").setAttribute("aria-label", T.map);

  // "Get WaterNow": the APK announced by the site's version.json when it checks out, else the home page.
  fetch(SITE + "version.json", { cache: "no-cache", credentials: "omit" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (m) { var apk = WN.safeApkUrl(m, SITE); if (apk) $("get").href = apk; })
    .catch(function () {});

  var spot = WN.parseSpotParams(location.search);
  if (!spot) {
    $("spot").classList.add("hidden");
    $("map").classList.add("hidden");
    $("bad").classList.remove("hidden");
    document.title = "WaterNow";
    return;
  }

  // Opens a little wide over the point, then flies in to street level (WN.map in assets/map.js).
  var map = WN.map($("map"), lang, [spot.lon, spot.lat], 12, "wn-marker");

  function show(s) {
    var name = s.name || T.point;
    text("name", name);
    document.title = name + " · WaterNow";
    text("coords", s.lat.toFixed(5) + ", " + s.lon.toFixed(5));
    $("open").href = WN.appLink(s);
    $("dir").href = WN.directionsLink(s, navigator.userAgent);
    if (map) map.show(s.lat, s.lon, 16);
  }
  show(spot);

  function fact(value, cls) {
    var li = document.createElement("li");
    li.textContent = value;
    if (cls) li.className = cls;
    $("facts").append(li);
    $("facts").classList.remove("hidden");
  }

  function ago(ms) {
    var s = Math.round((ms - Date.now()) / 1000);
    var rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
    var steps = [[60, "second"], [60, "minute"], [24, "hour"], [30, "day"], [12, "month"], [Infinity, "year"]];
    for (var i = 0; i < steps.length; i++) {
      if (Math.abs(s) < steps[i][0]) return rtf.format(s, steps[i][1]);
      s = Math.round(s / steps[i][0]);
    }
    return "";
  }

  // Live details when the point is on the server, in one read (get_spot_card): its own name, type and place win over
  // the link's. Any failure, the server's read limit (HTTP 429) included, leaves the link's own name and place. While
  // WaterNow is being updated (HTTP 503) one short line says so, and the read tries again each minute for a while.
  text("verified", T.verified);
  function load(tries) {
    fetch(SUPABASE_URL + "/rest/v1/rpc/get_spot_card", {
      method: "POST",
      headers: { apikey: PUBLISHABLE_KEY, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ p_spot_id: Number(spot.id) }),
      credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer"
    })
      .then(function (r) {
        $("note").classList.toggle("hidden", !WN.isMaintenance(r.status));
        if (WN.isMaintenance(r.status)) {
          text("note", T.maintenance);
          if (tries < 10) setTimeout(function () { load(tries + 1); }, 60000);
          return null;
        }
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(card)
      .catch(function () { /* the link's own name and place stay on screen */ });
  }
  load(0);

  function card(o) {
    if (!o || typeof o !== "object") return;
    var lat = Number(o.latitude), lon = Number(o.longitude);
    var ok = isFinite(lat) && isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
    show({ id: spot.id, lat: ok ? lat : spot.lat, lon: ok ? lon : spot.lon, name: WN.cleanName(o.name) || spot.name });
    $("verified").classList.toggle("hidden", !WN.isVerified(o));
    if (Object.prototype.hasOwnProperty.call(T.types, o.spot_type)) text("type", T.types[o.spot_type]);
    var n = Number(o.rating_count), r = Number(o.rating_average);
    if (Number.isInteger(n) && n > 0 && r > 0 && r <= 5) fact(T.rating(r.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), n));
    var at = Date.parse(o.last_verified_at);
    if (!isFinite(at) || !Object.prototype.hasOwnProperty.call(T.status, o.last_status)) return;
    fact(T.checked(ago(at), T.status[o.last_status]), o.last_status === "working" ? "ok" : "warn");
  }
})();

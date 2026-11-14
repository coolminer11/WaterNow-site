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
      get: "Get WaterNow", scanned: "You scanned a WaterNow point: open it in the app", scanText: "No WaterNow yet? It's free: no ads, no trackers, and water near you wherever you go.", foot: "No trackers, no cookies.",
      freeRefill: "Free refill", freeRefillWhen: function (when) { return "confirmed " + when; },
      verified: "Verified by WaterNow", maintenance: "WaterNow is being updated. The latest details will be back in a moment.",
      offline: "Couldn't load the latest details.", retry: "Try again",
      rating: function (r, n) { return "Rated " + r + "/5 (" + n + (n === 1 ? " review)" : " reviews)"); },
      checked: function (when, status) { return "Checked " + when + ": " + status; },
      types: { WATER_REFILL: "Water point", FOUNTAIN: "Water point", DOG_WATER: "Dog water", RESTROOM: "Toilets", COMBO: "Water and toilets" },
      status: { working: "working", not_working: "not working", low_pressure: "low pressure", dirty: "dirty", closed_season: "closed for the season" }
    },
    fr: {
      point: "Point d'eau", open: "Ouvrir dans WaterNow", dir: "Itinéraire", map: "Carte du point d'eau",
      badTitle: "Lien incomplet", badText: "Ce lien vers un point d'eau est abîmé. Redemande-le.",
      getTitle: "Pas encore WaterNow ?", getText: "De l'eau potable gratuite près de toi, sur une carte que la communauté tient à jour.",
      get: "Obtenir WaterNow", scanned: "Tu as scanné un point WaterNow : ouvre-le dans l'app", scanText: "Pas encore WaterNow ? C'est gratuit : sans pub, sans traceur, et de l'eau près de toi où que tu ailles.", foot: "Aucun traceur, aucun cookie.",
      freeRefill: "Remplissage gratuit", freeRefillWhen: function (when) { return "confirmé " + when; },
      verified: "Vérifié par WaterNow", maintenance: "WaterNow est en cours de mise à jour. Les dernières infos reviennent dans un moment.",
      offline: "Impossible de charger les dernières infos.", retry: "Réessayer",
      rating: function (r, n) { return "Note " + r + "/5 (" + n + " avis)"; },
      checked: function (when, status) { return "Vérifié " + when + " : " + status; },
      types: { WATER_REFILL: "Point d'eau", FOUNTAIN: "Point d'eau", DOG_WATER: "Eau pour chiens", RESTROOM: "Toilettes", COMBO: "Eau et toilettes" },
      status: { working: "fonctionne", not_working: "en panne", low_pressure: "faible pression", dirty: "sale", closed_season: "fermé pour la saison" }
    },
    es: {
      point: "Punto de agua", open: "Abrir en WaterNow", dir: "Indicaciones", map: "Mapa del punto de agua",
      badTitle: "Enlace incompleto", badText: "Este enlace a un punto de agua está dañado. Pídelo de nuevo.",
      getTitle: "¿Aún no tienes WaterNow?", getText: "Agua potable gratis cerca de ti, en un mapa que la comunidad mantiene al día.",
      get: "Consigue WaterNow", scanned: "Escaneaste un punto de WaterNow: ábrelo en la app", scanText: "¿Aún no tienes WaterNow? Es gratis: sin anuncios, sin rastreadores y con agua cerca de ti vayas donde vayas.", foot: "Sin rastreadores ni cookies.",
      freeRefill: "Recarga gratis", freeRefillWhen: function (when) { return "confirmado " + when; },
      verified: "Verificado por WaterNow", maintenance: "WaterNow se está actualizando. Los últimos detalles volverán en un momento.",
      offline: "No se pudieron cargar los últimos detalles.", retry: "Reintentar",
      rating: function (r, n) { return "Valoración " + r + "/5 (" + n + (n === 1 ? " reseña)" : " reseñas)"); },
      checked: function (when, status) { return "Verificado " + when + ": " + status; },
      types: { WATER_REFILL: "Punto de agua", FOUNTAIN: "Punto de agua", DOG_WATER: "Agua para perros", RESTROOM: "Baños", COMBO: "Agua y baños" },
      status: { working: "funciona", not_working: "no funciona", low_pressure: "poca presión", dirty: "sucio", closed_season: "cerrado por temporada" }
    },
    de: {
      point: "Wasserstelle", open: "In WaterNow öffnen", dir: "Route", map: "Karte der Wasserstelle",
      badTitle: "Link unvollständig", badText: "Dieser Link zu einer Wasserstelle ist beschädigt. Lass ihn dir noch einmal schicken.",
      getTitle: "Noch kein WaterNow?", getText: "Kostenloses Trinkwasser in deiner Nähe, auf einer Karte, die die Community aktuell hält.",
      get: "WaterNow holen", scanned: "Du hast einen WaterNow-Punkt gescannt: öffne ihn in der App", scanText: "Noch kein WaterNow? Es ist kostenlos: ohne Werbung, ohne Tracker, und Wasser in deiner Nähe, wo immer du bist.", foot: "Keine Tracker, keine Cookies.",
      freeRefill: "Gratis auffüllen", freeRefillWhen: function (when) { return "bestätigt " + when; },
      verified: "Von WaterNow geprüft", maintenance: "WaterNow wird gerade aktualisiert. Die neuesten Details sind gleich wieder da.",
      offline: "Die neuesten Details konnten nicht geladen werden.", retry: "Erneut versuchen",
      rating: function (r, n) { return "Bewertet mit " + r + "/5 (" + n + (n === 1 ? " Bewertung)" : " Bewertungen)"); },
      checked: function (when, status) { return "Geprüft " + when + ": " + status; },
      types: { WATER_REFILL: "Wasserstelle", FOUNTAIN: "Wasserstelle", DOG_WATER: "Hundetränke", RESTROOM: "Toiletten", COMBO: "Wasser und Toiletten" },
      status: { working: "funktioniert", not_working: "defekt", low_pressure: "wenig Druck", dirty: "verschmutzt", closed_season: "saisonal geschlossen" }
    },
    pt: {
      point: "Ponto de água", open: "Abrir no WaterNow", dir: "Rota", map: "Mapa do ponto de água",
      badTitle: "Link incompleto", badText: "Este link para um ponto de água está corrompido. Peça de novo.",
      getTitle: "Ainda não tem o WaterNow?", getText: "Água potável grátis perto de você, em um mapa que a comunidade mantém atualizado.",
      get: "Baixe o WaterNow", scanned: "Você escaneou um ponto do WaterNow: abra-o no app", scanText: "Ainda não tem o WaterNow? É grátis: sem anúncios, sem rastreadores e com água perto de você aonde for.", foot: "Sem rastreadores, sem cookies.",
      freeRefill: "Recarga grátis", freeRefillWhen: function (when) { return "confirmado " + when; },
      verified: "Verificado pelo WaterNow", maintenance: "O WaterNow está sendo atualizado. Os detalhes mais recentes voltam daqui a pouco.",
      offline: "Não foi possível carregar os detalhes mais recentes.", retry: "Tentar de novo",
      rating: function (r, n) { return "Nota " + r + "/5 (" + n + (n === 1 ? " avaliação)" : " avaliações)"); },
      checked: function (when, status) { return "Verificado " + when + ": " + status; },
      types: { WATER_REFILL: "Ponto de água", FOUNTAIN: "Ponto de água", DOG_WATER: "Água para cães", RESTROOM: "Banheiros", COMBO: "Água e banheiros" },
      status: { working: "funcionando", not_working: "com defeito", low_pressure: "pressão baixa", dirty: "sujo", closed_season: "fechado nesta temporada" }
    },
    ja: {
      point: "給水スポット", open: "WaterNowで開く", dir: "ルート", map: "給水スポットのマップ",
      badTitle: "リンクが不完全です", badText: "この給水スポットへのリンクは壊れています。もう一度送ってもらってください。",
      getTitle: "WaterNowをまだ使っていませんか？", getText: "近くの無料の飲み水を、コミュニティが更新し続けるマップで探せます。",
      get: "WaterNowを入手", scanned: "WaterNowのスポットをスキャンしました：アプリで開きましょう", scanText: "WaterNowをまだお持ちでないですか？無料で、広告もトラッカーもなく、どこへ行っても近くの水が見つかります。", foot: "トラッカーもCookieも使っていません。",
      freeRefill: "無料給水", freeRefillWhen: function (when) { return when + "に確認"; },
      verified: "WaterNow認証済み", maintenance: "WaterNowは現在アップデート中です。最新の情報はまもなく表示されます。",
      offline: "最新の情報を読み込めませんでした。", retry: "再試行",
      rating: function (r, n) { return "評価 " + r + "/5（" + n + "件のレビュー）"; },
      checked: function (when, status) { return "確認済み（" + when + "）：" + status; },
      types: { WATER_REFILL: "給水スポット", FOUNTAIN: "給水スポット", DOG_WATER: "犬用の水", RESTROOM: "トイレ", COMBO: "給水とトイレ" },
      status: { working: "使用可能", not_working: "故障中", low_pressure: "水圧が弱い", dirty: "汚れている", closed_season: "シーズン休止中" }
    },
    ro: {
      point: "Punct de apă", open: "Deschide în WaterNow", dir: "Traseu", map: "Harta punctului de apă",
      badTitle: "Link incomplet", badText: "Acest link către un punct de apă este deteriorat. Cere-l din nou.",
      getTitle: "Nu ai încă WaterNow?", getText: "Apă potabilă gratuită lângă tine, pe o hartă pe care comunitatea o ține la zi.",
      get: "Descarcă WaterNow", scanned: "Ai scanat un punct WaterNow: deschide-l în aplicație", scanText: "Nu ai încă WaterNow? E gratuit: fără reclame, fără trackere, și apă lângă tine oriunde mergi.", foot: "Fără trackere, fără cookie-uri.",
      freeRefill: "Reumplere gratuită", freeRefillWhen: function (when) { return "confirmat " + when; },
      verified: "Verificat de WaterNow", maintenance: "WaterNow se actualizează. Cele mai noi detalii revin în curând.",
      offline: "Cele mai noi detalii nu s-au putut încărca.", retry: "Încearcă din nou",
      // 1 recenzie, 2 recenzii, 20 de recenzii (Romanian puts "de" after 20-99 and round hundreds, as the app does).
      rating: function (r, n) { return "Evaluare " + r + "/5 (" + n + (n === 1 ? " recenzie)" : n % 100 >= 20 || n % 100 === 0 ? " de recenzii)" : " recenzii)"); },
      checked: function (when, status) { return "Verificat " + when + ": " + status; },
      types: { WATER_REFILL: "Punct de apă", FOUNTAIN: "Punct de apă", DOG_WATER: "Apă pentru câini", RESTROOM: "Toalete", COMBO: "Apă și toalete" },
      status: { working: "funcționează", not_working: "nu funcționează", low_pressure: "presiune scăzută", dirty: "murdar", closed_season: "închis pe sezon" }
    }
  };
  var lang = WN.lang(WN.browserLangs(navigator));
  var T = STRINGS[lang];
  document.documentElement.lang = lang;
  document.documentElement.classList.add("wn-ready"); // main.hold shows now, in this language (site.css)

  var $ = function (id) { return document.getElementById(id); };
  var text = function (id, value) { $(id).textContent = value; };
  text("type", T.point); text("name", T.point); text("open", T.open); text("dir", T.dir);
  text("badTitle", T.badTitle); text("badText", T.badText);
  text("getTitle", T.getTitle); text("getText", T.getText); text("get", T.get); text("foot", T.foot);
  text("scanGet", T.get); text("scanOpen", T.open);

  // "Get WaterNow" (and the scan banner's): the APK announced by the site's version.json when it checks out, else the
  // home page.
  WN.apkLink(SITE).then(function (apk) { if (apk) $("get").href = $("scanGet").href = apk; });

  var spot = WN.parseSpotParams(location.search);
  // From a sticker's QR code or a tag (&src=qr|nfc): the person stands at the point, so the app comes first, loudly: a
  // blue banner on top that leads to the download (and opens the app for those who have it); the quiet "No WaterNow
  // yet?" card below would only repeat it.
  if (spot && WN.scanSource(location.search)) {
    text("scan", T.scanned);
    text("scanText", T.scanText);
    $("scanCard").classList.remove("hidden");
    $("getCard").classList.add("hidden");
  }
  if (!spot) {
    $("spot").classList.add("hidden");
    $("map").classList.add("hidden");
    $("bad").classList.remove("hidden");
    document.title = "WaterNow";
    return;
  }

  // Opens a little wide over the point, then flies in to street level (WN.map in assets/map.js). The map's library is
  // the page's last script: the words above are on screen before it comes, and the map starts once it has run.
  var map = null, current = spot;
  document.addEventListener("DOMContentLoaded", function () {
    map = WN.map($("map"), lang, [spot.lon, spot.lat], 12, "wn-marker", T.map);
    show(current);
  });

  // A point without its own name is stored under an English default: titled by its kind, as the app shows it, once the
  // server says which kind (a water point until then).
  if (WN.isDefaultName(spot.name)) spot.name = "";
  var kind = T.point;

  function show(s) {
    current = s;
    var name = s.name || kind;
    text("name", name);
    document.title = name + " · WaterNow";
    text("coords", s.lat.toFixed(5) + ", " + s.lon.toFixed(5));
    $("open").href = $("scanOpen").href = WN.appLink(s);
    $("dir").href = WN.directionsLink(s, navigator.userAgent);
    if (map) map.show(s.lat, s.lon, 16);
  }
  show(spot);

  // The facts (rating, last check) sit under the buttons, which therefore never move when they come. Two shimmering
  // lines hold their place until the read answers; then the real ones, or nothing.
  function settle() {
    Array.prototype.slice.call($("facts").querySelectorAll(".sk-line")).forEach(function (li) { li.remove(); });
    $("facts").classList.toggle("hidden", !$("facts").children.length);
  }

  function fact(value, cls) {
    var li = document.createElement("li");
    li.textContent = value;
    li.className = "fade-in" + (cls ? " " + cls : "");
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
  // the link's. Any failure (offline, no answer within 15 s, the server's read limit) leaves the link's own name and
  // place, with one short line and a button to read again. While WaterNow is being updated (HTTP 503) one short line
  // says so, and the read tries again each minute for a while.
  text("verified", T.verified);
  function load(tries) {
    WN.fetchIn(SUPABASE_URL + "/rest/v1/rpc/get_spot_card", {
      method: "POST",
      headers: { apikey: PUBLISHABLE_KEY, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ p_spot_id: Number(spot.id) }),
      credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer"
    })
      .then(function (r) {
        if (r.ok || WN.isMaintenance(r.status)) WN.leaveNote(document, $("note"), $("name"));
        $("note").classList.toggle("hidden", !WN.isMaintenance(r.status));
        if (WN.isMaintenance(r.status)) {
          settle();
          text("note", T.maintenance);
          if (tries < 10) setTimeout(function () { load(tries + 1); }, 60000);
          return null;
        }
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(card)
      .catch(function () { WN.offlineNote(document, $("note"), T.offline, T.retry, function () { load(0); }); })
      .then(settle);
  }
  load(0);

  function card(o) {
    settle();
    if (!o || typeof o !== "object") return;
    var lat = Number(o.latitude), lon = Number(o.longitude);
    var ok = isFinite(lat) && isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
    if (Object.prototype.hasOwnProperty.call(T.types, o.spot_type)) { kind = T.types[o.spot_type]; text("type", kind); }
    var own = WN.cleanName(o.name);
    if (WN.isDefaultName(own)) own = "";
    show({ id: spot.id, lat: ok ? lat : spot.lat, lon: ok ? lon : spot.lon, name: own || spot.name });
    $("verified").classList.toggle("hidden", !WN.isVerified(o));
    // A business fills bottles for free here (setup section 88): its promise and when it last said yes, as in the app.
    var since = WN.freeRefillSince(o, Date.now());
    $("freeRefill").classList.toggle("hidden", since === null);
    if (since !== null) { text("freeRefillLabel", T.freeRefill); text("freeRefillWhen", T.freeRefillWhen(ago(since))); }
    var n = Number(o.rating_count), r = Number(o.rating_average);
    if (Number.isInteger(n) && n > 0 && r > 0 && r <= 5) fact(T.rating(r.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), n));
    var at = Date.parse(o.last_verified_at);
    if (!isFinite(at) || !Object.prototype.hasOwnProperty.call(T.status, o.last_status)) return;
    fact(T.checked(ago(at), T.status[o.last_status]), o.last_status === "working" ? "ok" : "warn");
  }
})();

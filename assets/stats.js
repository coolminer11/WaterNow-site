/*
 * WaterNow Statistics (stats/): the community's live impact, a refill heat map and the top cities, then "get the app".
 * Everything comes from get_public_impact (section 79): a snapshot the server rebuilds each hour at minute 0 from the
 * hours already over (section 86), counts only.
 * Pure helpers are shared with the node test (module.exports); text goes in with textContent only.
 */
(function (root) {
  "use strict";
  var SERVER = "https://pkqsvlbiznrqxfckaxll.supabase.co";
  var ENDPOINT = SERVER + "/rest/v1/rpc/get_public_impact";
  // Public by design, as on the other pages (live.js, s/app.js): the server's grants protect the data.
  var PUBLISHABLE_KEY = "sb_publishable_Jw6cnMgupaVxupvltvUlPQ_mvwpiNVE";
  var POLL_MS = 5 * 60 * 1000; // the hourly snapshot shows within 5 minutes
  var RETRY_MS = 30 * 1000; // after a problem (offline, no answer, maintenance)
  var K = 10; // the server's floor for a map cell; checked again here (belt and braces)

  function count(v) { var n = Number(v); return isFinite(n) && n >= 0 ? Math.floor(n) : 0; }

  /** [n] rounded down to 3 significant digits, for "more than 569,000": 569,766 → 569,000; under 1,000 unchanged. */
  function atLeast(n) {
    var p = Math.pow(10, Math.max(0, String(n).length - 3));
    return Math.floor(n / p) * p;
  }

  /** Whole minutes from the ISO time [iso] to [now] (ms), never below 0; null without a time. */
  function minutesAgo(iso, now) {
    var t = iso ? Date.parse(iso) : NaN;
    return isFinite(t) ? Math.max(0, Math.floor((now - t) / 60000)) : null;
  }

  /**
   * What the screen-reader line says when the pill changes. [before] is the last state ("" at first): a problem that
   * appears or changes (offline, maintenance) is said, and so is the page coming back after one ("Updated just now").
   * The minute tick ("Updated 3 min ago", then 4) and the first load stay silent: say is null.
   */
  function statusNews(before, problem, ago, T) {
    var state = problem ? "problem:" + problem : ago == null ? "" : "ok";
    if (state === before) return { state: state, say: null };
    return { state: state, say: problem || (before.indexOf("problem:") === 0 && ago != null ? T.updated(ago) : null) };
  }

  /** Romanian puts "de" between a number and its noun from 20 on (20 de, 101, 120 de). */
  function roDe(n) { return n % 100 >= 20 || (n > 0 && n % 100 === 0) ? " de" : ""; }

  /** The server's answer reduced to what the page draws, every number a whole count >= 0. Null when unusable. */
  function cleanImpact(b) {
    if (!b || typeof b !== "object" || Array.isArray(b)) return null;
    function trio(o) { o = o || {}; return { all: count(o.all), month: count(o.month), today: count(o.today) }; }
    var p = b.points || {}, off = b.official || {}, pl = b.places || {}, map = b.map || {};
    var cells = (Array.isArray(map.cells) ? map.cells : []).filter(function (c) {
      return c && Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180 && count(c.refills) >= K;
    }).map(function (c) { return { lat: Number(c.lat), lon: Number(c.lon), refills: count(c.refills) }; });
    var top = (Array.isArray(b.top_cities) ? b.top_cities : []).filter(function (c) {
      return c && typeof c.name === "string" && c.name.length > 0 && c.name.length <= 80;
    }).slice(0, 10).map(function (c) {
      return { name: c.name, country: typeof c.country === "string" && /^[A-Z]{2}$/.test(c.country) ? c.country : "",
               points: count(c.points), refills: c.refills == null ? null : count(c.refills) };
    });
    return {
      updatedAt: typeof b.updated_at === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d{1,3})?)?Z$/.test(b.updated_at) ? b.updated_at : null,
      bottles: trio(b.bottles), litres: trio(b.litres),
      refillsToday: count((b.refills || {}).today),
      water: count(p.water), toilets: count(p.toilets), lists: count(off.lists),
      cities: count(pl.cities), countries: count(pl.countries),
      trees: count(b.trees_planted), fontaine: b.fontaine_commune || null,
      cells: cells, top: top
    };
  }

  /** The SVG path of [qr]'s dark modules (1 unit each), inside a 4-module quiet zone: the viewBox is size + 8. */
  function qrPath(qr) {
    var d = "";
    for (var y = 0; y < qr.size; y++) for (var x = 0; x < qr.size; x++) if (qr.getModule(x, y)) d += "M" + (x + 4) + " " + (y + 4) + "h1v1h-1z";
    return d;
  }

  /** The heat map's GeoJSON: one point per cell, weighted by its refills. */
  function cellsGeoJSON(cells) {
    return {
      type: "FeatureCollection",
      features: cells.map(function (c) {
        return { type: "Feature", properties: { refills: c.refills }, geometry: { type: "Point", coordinates: [c.lon, c.lat] } };
      })
    };
  }

  // The heat layer. A cell holds at least K refills, often just over: even that must read as a clear spot at world zoom
  // (a cell is under a pixel there), and hundreds glow warm. MapLibre's centre density is weight × intensity × 0.4.
  var HEAT_PAINT = {
    "heatmap-weight": ["interpolate", ["linear"], ["get", "refills"], K, 0.4, 100, 0.7, 1000, 1],
    "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 2.5, 9, 1.5],
    "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 16, 4, 26, 9, 40, 14, 70],
    "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"],
      0, "rgba(51, 149, 255, 0)", 0.05, "rgba(51, 149, 255, 0.45)", 0.25, "#3395ff", 0.5, "#22d3ee", 0.75, "#fde047", 1, "#fb923c"],
    "heatmap-opacity": 0.9
  };

  /**
   * The totals note as [before, after] around the list count, so the page can write it at once with a shimmering
   * number in the middle (its lines are there from the first paint) and only the number arrives with the answer.
   */
  function listsParts(T) {
    var mark = "\u0000", t = T.lists(mark, 736);
    return t.indexOf(mark) >= 0 ? t.split(mark) : [t, ""];
  }

  /** The value shown [t] (0..1) into a count-up from [from] to [to], eased out. */
  function tween(from, to, t) {
    t = Math.min(1, Math.max(0, t));
    return Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
  }

  // One table per app language (WN.LANGS). `text` keys are element ids; the English in the HTML is the no-JS fallback.
  // lists/refills/points(s, n): s is the formatted count, n the number itself; updated(m): minutes since the snapshot.
  var STRINGS = {
    en: {
      doc: "WaterNow live impact",
      text: { title: "Live impact", lead: "What the WaterNow community does, together, right now.",
        bottlesLabel: "plastic bottles avoided", litresLabel: "litres of water refilled", refillsTodayLabel: "refills today",
        todayLabel: "today", monthLabel: "this month", waterLabel: "water points", toiletsLabel: "toilets",
        citiesLabel: "cities", countriesLabel: "countries",
        mapTitle: "Where people refill", mapNote: "Areas with at least 10 refills by 3 people or more, shown 1 to 2 days later. Never a person.",
        topTitle: "Top cities", topNote: "A friendly race between cities, never between people.",
        fontaineTitle: "The Community Fountain", fontaineText: "Coming soon: together, the community funds a real bottle refill station, in a place it chooses.",
        racinesTitle: "WaterNow Racines", treesLabel: "trees planted", racinesText: "Coming soon: a real tree planted every month.",
        ctaTitle: "Join them: get WaterNow", ctaText: "Free, no ads, no trackers. Find water near you and count the bottles you avoid.",
        download: "Download for Android", appStore: "App Store: coming soon", qrText: "Scan to get it on your phone",
        privacy: "Totals only: never a person, an account or an exact time." },
      map: "Heat map of refills by area", lists: function (s) { return "Water points and toilets from OpenStreetMap and " + s + " official city lists. The app removes the overlap between sources."; }, qr: "QR code to download WaterNow", over: "more than",
      refills: function (n) { return n + " refills"; }, points: function (n) { return n + " water points"; },
      hidden: "under 10 refills so far", empty: "No city yet. Yours could be first!",
      updated: function (m) { return m ? "Updated " + m + " min ago" : "Updated just now"; }, loading: "Loading…",
      offline: "Server unreachable, retrying…", maintenance: "WaterNow updating · retrying"
    },
    fr: {
      doc: "WaterNow, l'impact en direct",
      text: { title: "L'impact en direct", lead: "Ce que la communauté WaterNow fait, ensemble, en ce moment.",
        bottlesLabel: "bouteilles en plastique évitées", litresLabel: "litres d'eau remplis", refillsTodayLabel: "remplissages aujourd'hui",
        todayLabel: "aujourd'hui", monthLabel: "ce mois-ci", waterLabel: "points d'eau", toiletsLabel: "toilettes",
        citiesLabel: "villes", countriesLabel: "pays",
        mapTitle: "Où on remplit sa gourde", mapNote: "Les zones d'au moins 10 remplissages par 3 personnes ou plus, montrées 1 à 2 jours plus tard. Jamais une personne.",
        topTitle: "Le palmarès des villes", topNote: "Une course amicale entre villes, jamais entre personnes.",
        fontaineTitle: "La Fontaine commune", fontaineText: "Bientôt : la communauté finance ensemble une vraie station de remplissage, à l'endroit qu'elle choisit.",
        racinesTitle: "WaterNow Racines", treesLabel: "arbres plantés", racinesText: "Bientôt : un vrai arbre planté chaque mois.",
        ctaTitle: "Rejoins-les : installe WaterNow", ctaText: "Gratuit, sans pub, sans pisteurs. Trouve l'eau près de toi et compte les bouteilles que tu évites.",
        download: "Télécharger pour Android", appStore: "App Store : bientôt", qrText: "Scanne pour l'avoir sur ton téléphone",
        privacy: "Des totaux seulement : jamais une personne, un compte ni une heure exacte." },
      map: "Carte de chaleur des remplissages par zone", lists: function (s) { return "Points d'eau et toilettes d'OpenStreetMap et de " + s + " listes officielles de villes. L'app retire les doublons entre les sources."; }, qr: "Code QR pour télécharger WaterNow", over: "plus de",
      refills: function (n) { return n + " remplissages"; }, points: function (n) { return n + " points d'eau"; },
      hidden: "moins de 10 remplissages pour l'instant", empty: "Aucune ville pour l'instant. La tienne pourrait être la première !",
      updated: function (m) { return m ? "Mis à jour il y a " + m + " min" : "Mis à jour à l'instant"; }, loading: "Chargement…",
      offline: "Serveur injoignable · réessai…", maintenance: "Mise à jour · nouvel essai…"
    },
    es: {
      doc: "WaterNow, el impacto en directo",
      text: { title: "El impacto en directo", lead: "Lo que la comunidad WaterNow hace, junta, ahora mismo.",
        bottlesLabel: "botellas de plástico evitadas", litresLabel: "litros de agua recargados", refillsTodayLabel: "recargas hoy",
        todayLabel: "hoy", monthLabel: "este mes", waterLabel: "puntos de agua", toiletsLabel: "baños",
        citiesLabel: "ciudades", countriesLabel: "países",
        mapTitle: "Dónde se recarga", mapNote: "Zonas con al menos 10 recargas de 3 personas o más, mostradas 1 o 2 días después. Nunca una persona.",
        topTitle: "Ranking de ciudades", topNote: "Una carrera amistosa entre ciudades, nunca entre personas.",
        fontaineTitle: "La Fuente común", fontaineText: "Muy pronto: la comunidad financia junta una estación de recarga de verdad, en el lugar que elija.",
        racinesTitle: "WaterNow Racines", treesLabel: "árboles plantados", racinesText: "Muy pronto: un árbol de verdad plantado cada mes.",
        ctaTitle: "Únete: consigue WaterNow", ctaText: "Gratis, sin anuncios, sin rastreadores. Encuentra agua cerca de ti y cuenta las botellas que evitas.",
        download: "Descargar para Android", appStore: "App Store: muy pronto", qrText: "Escanea para tenerla en tu teléfono",
        privacy: "Solo totales: nunca una persona, una cuenta ni una hora exacta." },
      map: "Mapa de calor de las recargas por zona", lists: function (s) { return "Puntos de agua y baños de OpenStreetMap y de " + s + " listas oficiales de ciudades. La app quita los duplicados entre fuentes."; }, qr: "Código QR para descargar WaterNow", over: "más de",
      refills: function (n) { return n + " recargas"; }, points: function (n) { return n + " puntos de agua"; },
      hidden: "menos de 10 recargas por ahora", empty: "Aún no hay ninguna ciudad. ¡La tuya podría ser la primera!",
      updated: function (m) { return m ? "Actualizado hace " + m + " min" : "Actualizado hace un momento"; }, loading: "Cargando…",
      offline: "Sin conexión · reintentando…", maintenance: "Actualizando · reintentando…"
    },
    de: {
      doc: "WaterNow live: unsere Wirkung",
      text: { title: "Unsere Wirkung, live", lead: "Was die WaterNow-Community gerade gemeinsam bewegt.",
        bottlesLabel: "vermiedene Plastikflaschen", litresLabel: "Liter Wasser nachgefüllt", refillsTodayLabel: "Nachfüllungen heute",
        todayLabel: "heute", monthLabel: "diesen Monat", waterLabel: "Wasserstellen", toiletsLabel: "Toiletten",
        citiesLabel: "Städte", countriesLabel: "Länder",
        mapTitle: "Wo nachgefüllt wird", mapNote: "Gebiete mit mindestens 10 Nachfüllungen von 3 oder mehr Menschen, 1 bis 2 Tage später gezeigt. Nie eine Person.",
        topTitle: "Städte-Rangliste", topNote: "Ein freundlicher Wettstreit zwischen Städten, nie zwischen Menschen.",
        fontaineTitle: "Der Gemeinschaftsbrunnen", fontaineText: "Bald: Die Community finanziert gemeinsam eine echte Nachfüllstation, an einem Ort ihrer Wahl.",
        racinesTitle: "WaterNow Racines", treesLabel: "gepflanzte Bäume", racinesText: "Bald: jeden Monat ein echter gepflanzter Baum.",
        ctaTitle: "Mach mit: hol dir WaterNow", ctaText: "Kostenlos, ohne Werbung, ohne Tracker. Finde Wasser in deiner Nähe und zähle die Flaschen, die du vermeidest.",
        download: "Für Android herunterladen", appStore: "App Store: bald verfügbar", qrText: "Scanne den Code und hol sie dir aufs Handy",
        privacy: "Nur Summen: nie eine Person, ein Konto oder eine genaue Uhrzeit." },
      map: "Heatmap der Nachfüllungen nach Gebiet", lists: function (s) { return "Wasserstellen und Toiletten aus OpenStreetMap und " + s + " offiziellen Städtelisten. Die App entfernt doppelte Einträge zwischen den Quellen."; }, qr: "QR-Code zum Herunterladen von WaterNow", over: "über",
      refills: function (n) { return n + " Nachfüllungen"; }, points: function (n) { return n + " Wasserstellen"; },
      hidden: "bisher unter 10 Nachfüllungen", empty: "Noch keine Stadt. Deine könnte die erste sein!",
      updated: function (m) { return m ? "Vor " + m + " Min. aktualisiert" : "Gerade aktualisiert"; }, loading: "Wird geladen…",
      offline: "Server offline · neuer Versuch…", maintenance: "Update läuft · neuer Versuch…"
    },
    pt: {
      doc: "WaterNow, o impacto ao vivo",
      text: { title: "O impacto ao vivo", lead: "O que a comunidade WaterNow faz, junta, agora mesmo.",
        bottlesLabel: "garrafas plásticas evitadas", litresLabel: "litros de água recarregados", refillsTodayLabel: "recargas hoje",
        todayLabel: "hoje", monthLabel: "este mês", waterLabel: "pontos de água", toiletsLabel: "banheiros",
        citiesLabel: "cidades", countriesLabel: "países",
        mapTitle: "Onde as pessoas recarregam", mapNote: "Áreas com pelo menos 10 recargas de 3 pessoas ou mais, mostradas 1 a 2 dias depois. Nunca uma pessoa.",
        topTitle: "Ranking das cidades", topNote: "Uma disputa amigável entre cidades, nunca entre pessoas.",
        fontaineTitle: "A Fonte comum", fontaineText: "Em breve: a comunidade financia junta uma estação de recarga de verdade, no lugar que escolher.",
        racinesTitle: "WaterNow Racines", treesLabel: "árvores plantadas", racinesText: "Em breve: uma árvore de verdade plantada todo mês.",
        ctaTitle: "Junte-se a eles: baixe o WaterNow", ctaText: "Grátis, sem anúncios, sem rastreadores. Encontre água perto de você e conte as garrafas que você evita.",
        download: "Baixar para Android", appStore: "App Store: em breve", qrText: "Escaneie para baixar no seu celular",
        privacy: "Só totais: nunca uma pessoa, uma conta ou um horário exato." },
      map: "Mapa de calor das recargas por área", lists: function (s) { return "Pontos de água e banheiros do OpenStreetMap e de " + s + " listas oficiais de cidades. O app remove as duplicatas entre as fontes."; }, qr: "QR code para baixar o WaterNow", over: "mais de",
      refills: function (n) { return n + " recargas"; }, points: function (n) { return n + " pontos de água"; },
      hidden: "menos de 10 recargas por enquanto", empty: "Nenhuma cidade ainda. A sua pode ser a primeira!",
      updated: function (m) { return m ? "Atualizado há " + m + " min" : "Atualizado agora mesmo"; }, loading: "Carregando…",
      offline: "Servidor inacessível · tentando…", maintenance: "Atualizando · tentando de novo…"
    },
    ja: {
      doc: "WaterNow ライブインパクト",
      text: { title: "ライブインパクト", lead: "WaterNowコミュニティがいま、みんなで生み出している成果です。",
        bottlesLabel: "削減したペットボトル", litresLabel: "給水した水（リットル）", refillsTodayLabel: "今日の給水回数",
        todayLabel: "今日", monthLabel: "今月", waterLabel: "給水スポット", toiletsLabel: "トイレ",
        citiesLabel: "都市", countriesLabel: "か国",
        mapTitle: "給水されている場所", mapNote: "3人以上による給水が10回以上あったエリアだけを、1〜2日遅れで表示します。個人は表示しません。",
        topTitle: "都市ランキング", topNote: "競うのは都市どうしで、人どうしではありません。",
        fontaineTitle: "みんなの給水所", fontaineText: "近日公開：コミュニティが選んだ場所に、みんなで本物の給水ステーションを設置します。",
        racinesTitle: "WaterNow Racines", treesLabel: "植えた木", racinesText: "近日公開：毎月1本、本物の木を植えます。",
        ctaTitle: "あなたも参加しよう：WaterNowを入手", ctaText: "無料、広告なし、トラッカーなし。近くの水を見つけて、削減したペットボトルを数えましょう。",
        download: "Android版をダウンロード", appStore: "App Store：近日公開", qrText: "スマートフォンで読み取ってダウンロード",
        privacy: "表示するのは合計だけです。個人、アカウント、正確な時刻は表示しません。" },
      map: "エリア別の給水ヒートマップ", lists: function (s) { return "給水スポットとトイレは、OpenStreetMapと公式の都市リスト" + s + "件の合計です。アプリでは重複を除いて表示します。"; }, qr: "WaterNowをダウンロードするQRコード", over: "約",
      refills: function (n) { return n + "回"; }, points: function (n) { return n + "か所"; },
      hidden: "まだ10回未満", empty: "まだ都市はありません。あなたの街が最初になるかもしれません！",
      updated: function (m) { return m ? m + "分前に更新" : "たった今更新"; }, loading: "読み込み中…",
      offline: "接続できません・再試行中…", maintenance: "更新中・再試行しています"
    },
    ro: {
      doc: "WaterNow, impactul în direct",
      text: { title: "Impactul în direct", lead: "Ce face comunitatea WaterNow, împreună, chiar acum.",
        bottlesLabel: "sticle de plastic evitate", litresLabel: "litri de apă reumpluți", refillsTodayLabel: "reumpleri azi",
        todayLabel: "azi", monthLabel: "luna aceasta", waterLabel: "puncte de apă", toiletsLabel: "toalete",
        citiesLabel: "orașe", countriesLabel: "țări",
        mapTitle: "Unde se reumplu sticlele", mapNote: "Zone cu cel puțin 10 reumpleri făcute de 3 persoane sau mai multe, afișate cu 1-2 zile întârziere. Niciodată o persoană.",
        topTitle: "Clasamentul orașelor", topNote: "O întrecere prietenoasă între orașe, niciodată între oameni.",
        fontaineTitle: "Fântâna comună", fontaineText: "În curând: comunitatea finanțează împreună o stație de reumplere adevărată, în locul pe care îl alege.",
        racinesTitle: "WaterNow Racines", treesLabel: "copaci plantați", racinesText: "În curând: un copac adevărat plantat în fiecare lună.",
        ctaTitle: "Alătură-te lor: instalează WaterNow", ctaText: "Gratuit, fără reclame, fără trackere. Găsește apă lângă tine și numără sticlele pe care le eviți.",
        download: "Descarcă pentru Android", appStore: "App Store: în curând", qrText: "Scanează codul ca s-o ai pe telefon",
        privacy: "Doar totaluri: niciodată o persoană, un cont sau o oră exactă." },
      map: "Hartă termică a reumplerilor pe zone", lists: function (s, n) { return "Puncte de apă și toalete din OpenStreetMap și din " + s + roDe(n) + " liste oficiale ale orașelor. Aplicația elimină dublurile dintre surse."; }, qr: "Cod QR pentru a descărca WaterNow", over: "peste",
      refills: function (s, n) { return s + roDe(n) + " reumpleri"; }, points: function (s, n) { return s + roDe(n) + " puncte de apă"; },
      hidden: "sub 10 reumpleri deocamdată", empty: "Niciun oraș deocamdată. Al tău ar putea fi primul!",
      updated: function (m) { return m ? "Actualizat acum " + m + " min" : "Actualizat chiar acum"; }, loading: "Se încarcă…",
      offline: "Fără conexiune · se reîncearcă…", maintenance: "Actualizare · se reîncearcă…"
    }
  };

  if (typeof module === "object" && module.exports) {
    module.exports = { cleanImpact: cleanImpact, cellsGeoJSON: cellsGeoJSON, tween: tween, atLeast: atLeast, minutesAgo: minutesAgo,
                       statusNews: statusNews, listsParts: listsParts, qrPath: qrPath, roDe: roDe, HEAT_PAINT: HEAT_PAINT, STRINGS: STRINGS, ENDPOINT: ENDPOINT, K: K };
    return;
  }

  var WN = root.WN;
  var $ = function (id) { return document.getElementById(id); };
  var site = new URL("../", location.href).href;
  var lang = WN.lang(WN.browserLangs(navigator));
  var T = STRINGS[lang];
  document.documentElement.lang = lang;
  document.documentElement.classList.add("wn-ready"); // main.hold shows now, in this language (site.css)
  document.title = T.doc;
  Object.keys(T.text).forEach(function (id) { var el = $(id); if (el) el.textContent = T.text[id]; });
  $("qr").setAttribute("aria-label", T.qr);
  $("litresMonthLabel").textContent = T.text.monthLabel; $("litresTodayLabel").textContent = T.text.todayLabel;
  $("status").textContent = T.loading;

  var nf = new Intl.NumberFormat(lang);
  var M = root.WNM || { inView: function (el, fn) { fn(); }, still: true }; // assets/motion.js
  var shown = {}, runs = {}, answered = false; // each counter's value now (a refresh counts from there), its latest count-up

  // The totals note, written at once around a shimmering number (listsParts): its lines never jump.
  var listsN = document.createElement("span");
  listsN.className = "sk"; listsN.textContent = "000";
  $("lists").append(listsParts(T)[0], listsN, listsParts(T)[1]);

  /**
   * Counts element [id] up to [to] once it is on screen (a jump with prefers-reduced-motion): its shimmer stays until
   * then. A newer count for the same element replaces one still waiting or running.
   */
  function countUp(id, to) {
    var el = $(id), from = shown[id] || 0, run = runs[id] = (runs[id] || 0) + 1;
    shown[id] = to;
    M.inView(el, function () {
      if (runs[id] !== run) return;
      el.classList.remove("sk");
      if (M.still || from === to) { el.textContent = nf.format(to); return; }
      // Its widest text (digits are tabular: the larger of the two ends) holds its width while it counts: a narrower
      // number on the way would let a line re-wrap and the tile jump.
      el.style.minWidth = "";
      var wide = 0;
      [from, to].forEach(function (v) { el.textContent = nf.format(v); wide = Math.max(wide, el.getBoundingClientRect().width); });
      el.style.minWidth = Math.ceil(wide) + "px";
      var start = null;
      (function step(now) {
        if (runs[id] !== run) return;
        if (start === null) start = now;
        var t = (now - start) / 1600;
        el.textContent = nf.format(tween(from, to, t));
        if (t < 1) root.requestAnimationFrame(step);
      })(root.performance.now());
    });
  }

  /** No answer (offline, maintenance): the shimmer stops and the dashes show; nothing pretends to load forever. */
  // A month's or today's dash keeps its shimmer's width: in Japanese "– 今月" and "– 今日" then fitted one line where the
  // shimmer took two, and the tiles below jumped up (CLS 0.018 with no answer).
  function settle() {
    Array.prototype.slice.call(document.querySelectorAll(".page .sk, .page .sk-row")).forEach(function (el) {
      if (el.classList.contains("sk-row")) { el.remove(); return; }
      if (el.tagName === "B") el.style.minWidth = Math.ceil(el.getBoundingClientRect().width) + "px";
      el.classList.remove("sk");
    });
    if (!shown.lists) $("lists").textContent = "";
  }

  // The heat map (WN.map in assets/map.js) over the Atlantic world: the Americas to Europe, a little wider on a phone.
  // The map's library is the page's last script: the map starts once it has run, everything else is already there.
  var gl = null, heat = cellsGeoJSON([]), heatOn = false, heatWanted = false, mapReady = false;
  document.addEventListener("DOMContentLoaded", function () {
    var wnMap = WN.map($("map"), lang, [-40, 35], $("map").clientWidth < 600 ? 0.5 : 1.2, "wn-marker", T.map);
    gl = wnMap && wnMap.gl;
    // No map in this browser (MapLibre blocked or failed, no WebGL): its title card goes with it.
    if (!gl) { $("mapTitle").parentNode.classList.add("hidden"); return; }
    gl.on("styledata", addHeat);
    addHeat();
    gl.once("load", function () { mapReady = true; if (heatWanted) showHeat(); });
  });
  // The layer goes in as soon as the style can take it. Not isStyleLoaded(): that also waits for every tile, so an
  // answer arriving before the tiles left the map without its heat for good. A light/dark switch swaps the style,
  // which drops added layers: "styledata" puts them back. It starts transparent and fades in once the map is on screen
  // with an answer (at once with reduced motion); put back after a switch, it is simply there.
  function addHeat() {
    if (!gl || gl.getSource("refills")) return;
    try {
      gl.addSource("refills", { type: "geojson", data: heat });
      gl.addLayer({ id: "refills-heat", type: "heatmap", source: "refills", paint: Object.assign({}, HEAT_PAINT, {
        "heatmap-opacity": heatOn ? HEAT_PAINT["heatmap-opacity"] : 0,
        "heatmap-opacity-transition": { duration: M.still ? 0 : 1600, delay: 0 } }) });
    } catch (e) { /* style still loading: its next "styledata" calls again */ }
  }
  function showHeat() {
    heatOn = true;
    if (gl && gl.getLayer("refills-heat")) gl.setPaintProperty("refills-heat", "heatmap-opacity", HEAT_PAINT["heatmap-opacity"]);
  }
  function drawHeat() {
    var src = gl && gl.getSource("refills");
    if (src) src.setData(heat); else addHeat();
    if (!heatOn) M.inView($("map"), function () { heatWanted = true; if (mapReady) showHeat(); });
  }

  // The race: a rank, the city, its counts, and a bar of its refills against the leader's (none when they are hidden).
  function renderTop(top) {
    var list = $("topList"), most = Math.max.apply(null, top.map(function (c) { return c.refills || 0; }).concat(1));
    while (list.firstChild) list.removeChild(list.firstChild);
    $("topEmpty").textContent = top.length ? "" : T.empty;
    top.forEach(function (c, i) {
      var li = document.createElement("li"), rank = document.createElement("span"), name = document.createElement("span");
      var sub = document.createElement("span");
      rank.className = "rank"; name.className = "city"; sub.className = "muted";
      rank.textContent = String(i + 1);
      name.textContent = c.name + (c.country ? " · " + c.country : "");
      sub.textContent = (c.refills == null ? T.hidden : T.refills(nf.format(c.refills), c.refills)) + " · " + T.points(nf.format(c.points), c.points);
      li.append(rank, name, sub);
      if (c.refills != null) { li.className = "bar"; li.style.setProperty("--p", String(Math.max(0.03, c.refills / most))); }
      list.appendChild(li);
    });
    M.inView(list, function () { list.classList.add("in"); });
  }

  function render(d) {
    countUp("bottles", d.bottles.all); countUp("bottlesMonth", d.bottles.month); countUp("bottlesToday", d.bottles.today);
    countUp("litres", d.litres.all); countUp("litresMonth", d.litres.month); countUp("litresToday", d.litres.today);
    countUp("refillsToday", d.refillsToday);
    // Water points and toilets: OpenStreetMap plus the official lists (the server's sum), shown as "more than 569,000".
    ["water", "toilets"].forEach(function (id) {
      countUp(id, atLeast(d[id]));
      $(id + "Over").textContent = d[id] >= 1000 ? T.over : "";
    });
    countUp("cities", d.cities); countUp("countries", d.countries);
    countUp("trees", d.trees);
    answered = true; shown.lists = d.lists;
    $("lists").textContent = d.lists ? T.lists(nf.format(d.lists), d.lists) : "";
    renderTop(d.top);
    heat = cellsGeoJSON(d.cells);
    drawHeat();
  }

  // The pill under the title: "Updated N min ago" (kept current every minute), a problem, or nothing at all. It is not
  // a live region: #statusLive says only real changes (statusNews), never the minute tick.
  var updatedAt = null, problem = null, ticking = null, said = "";
  function showStatus() {
    var el = $("status"), ago = minutesAgo(updatedAt, Date.now());
    el.textContent = problem || (ago == null ? "" : T.updated(ago));
    el.className = problem ? "badge warn" : ago == null ? "badge hidden" : "badge ok";
    var news = statusNews(said, problem, ago, T);
    said = news.state;
    if (news.say) $("statusLive").textContent = news.say;
    if (!ticking) ticking = setInterval(showStatus, 60000);
  }

  // A read with no answer within 15 s fails as an offline one (it kept every shimmer and stopped the polling). After a
  // problem the next try comes in 30 s, not 5 minutes later: the pill says it is trying again.
  function poll() {
    WN.fetchIn(ENDPOINT, {
      method: "POST",
      headers: { "apikey": PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: "{}", referrerPolicy: "no-referrer", credentials: "omit", cache: "no-store"
    }).then(function (r) {
      if (WN.isMaintenance(r.status)) { problem = T.maintenance; return null; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (b) {
      var d = cleanImpact(b);
      if (d) { problem = null; updatedAt = d.updatedAt; render(d); }
    }).catch(function () {
      problem = T.offline;
    }).then(function () {
      if (!answered) settle();
      showStatus(); setTimeout(poll, problem ? RETRY_MS : POLL_MS);
    });
  }
  poll();

  // Get the app: the APK named by version.json when it checks out (WN.safeApkUrl, as on the home page). Otherwise the
  // button keeps its href, the home page (download/ is only a folder of APKs, no page). On a desktop, a QR code of the
  // same link takes it to the phone (assets/vendor/qrcodegen, shown by stats.css only with a mouse and a wide screen).
  function showQr() {
    try {
      var qr = root.qrcodegen.QrCode.encodeText($("download").href, root.qrcodegen.QrCode.Ecc.MEDIUM);
      $("qr").setAttribute("viewBox", "0 0 " + (qr.size + 8) + " " + (qr.size + 8));
      $("qrPath").setAttribute("d", qrPath(qr));
      $("qrBox").classList.remove("hidden");
      $("qrBox").classList.add("fade-in");
    } catch (e) { /* no code: the button is enough */ }
  }
  WN.fetchIn(site + "version.json", { cache: "no-cache", credentials: "omit" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (m) {
      var apk = WN.safeApkUrl(m, site);
      if (apk) $("download").href = apk;
    })
    .catch(function () {})
    .then(showQr);
})(this);

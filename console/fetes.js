/*
 * WaterNow Statistics, private console: « Fêtes » for admins (docs/21_FETES.md, section 96). Three tabs:
 *  - Calendar: the holiday dates the owner moves for one year (fetes_admin_set 'holiday_<id>'), the admins' 24-hour
 *    preview ('holiday_preview': visual only, in the admins' own app), the Advent threshold ('advent_min_days').
 *  - Egg hunt: the window ('egg_hunt_start' / 'egg_hunt_end'), the GPS knobs ('egg_max_accuracy_m',
 *    'egg_max_speed_kmh'), the eggs' coverage (counts and regions), « Poser les œufs » (fetes_admin_eggs_place) and the
 *    import of public water points (fetes_admin_eggs_import): OpenStreetMap drinking water around a centre (the app's
 *    Overpass mirrors, sim-core.js) or pasted lines.
 *  - Leaderboard: fetes_admin_leaderboard (names, strikes) with disqualify / reinstate (fetes_admin_disqualify).
 * Admin + aal2, checked by the server; every write lands in admin_log there. The session and calls are console.js's
 * (window.WNCAPP). Text through textContent only. Pure helpers shared with the node test (module.exports).
 */
(function (root) {
  "use strict";
  var node = typeof module === "object" && module.exports;
  var P = node ? require("../assets/page-data.js") : root.WNP;
  var IDS = ["new_year", "lunar_new_year", "valentine", "martisor", "water_day", "easter", "earth_day", "hanami", "tanabata", "mid_autumn",
             "diwali", "eid_al_fitr", "eid_al_adha", "halloween", "dia_de_muertos", "toilet_day", "national_day", "quebec_national_day", "christmas"];
  var POINTS_MAX = 5000, KM_MAX = 60, TILE = 0.5, HUMAN = ["FOUNTAIN", "WATER_REFILL", "COMBO"];

  function int(v) { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : 0; }
  function day(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; }
  function region(r) {
    if (!r || typeof r.key !== "string" || !r.key) return null;
    return { key: P.text(r.key, 100), name: typeof r.name === "string" ? P.text(r.name, 100) : null,
             lat: Number.isInteger(r.lat) ? r.lat : null, lon: Number.isInteger(r.lon) ? r.lon : null };
  }

  /** fetes_admin_overview's answer, cleaned (everything the page reads, with safe defaults). */
  function overview(o) {
    o = o && typeof o === "object" ? o : {};
    var c = o.config || {}, cal = o.calendar || {}, e = o.eggs || {}, ov = c.overrides || {}, hunt = cal.egg_hunt || {}, adv = o.advent || {};
    var dates = {};
    (Array.isArray(cal.holidays) ? cal.holidays : []).concat(Array.isArray(o.holidays) ? o.holidays : [])
      .forEach(function (h) { if (h && IDS.indexOf(h.id) >= 0 && day(h.date)) dates[h.id] = h.date; });
    var hs = o.hunts || {}, win = function (w) { return w && day(w.from) && day(w.to) ? { from: w.from, to: w.to } : null; };
    var pv = c.preview && IDS.indexOf(c.preview.holiday) >= 0 && typeof c.preview.until === "string" ? { holiday: c.preview.holiday, until: c.preview.until } : null;
    var greet = {};
    IDS.forEach(function (id) { greet[id] = int((o.greetings || {})[id]); });
    return {
      year: Number.isInteger(e.year) ? e.year : Number.isInteger(cal.year) ? cal.year : new Date().getUTCFullYear(),
      dates: dates,
      overrides: IDS.reduce(function (m, id) { m[id] = day(ov[id]); return m; }, {}),
      adventMin: Number.isInteger(c.advent_min_days) && c.advent_min_days >= 1 && c.advent_min_days <= 24 ? c.advent_min_days : 12,
      advent: { from: day((cal.advent || {}).from), to: day((cal.advent || {}).to), members: int(adv.members), done: int(adv.done) },
      hunt: { from: day(hunt.from), to: day(hunt.to), start: day(c.egg_hunt_start), end: day(c.egg_hunt_end) },
      hunts: { western: win(hs.western) || win(hunt), orthodox: win(hs.orthodox) },
      accuracy: Number.isInteger(c.egg_max_accuracy_m) ? c.egg_max_accuracy_m : 40,
      speed: Number.isInteger(c.egg_max_speed_kmh) ? c.egg_max_speed_kmh : 130,
      preview: pv,
      eggs: { total: int(e.total), spots: int(e.from_spots), imports: int(e.from_imports), candidates: int(e.candidates),
              collected: int(e.collected), hunters: int(e.hunters),
              regions: (Array.isArray(e.regions) ? e.regions : []).map(function (r) {
                var g = region(r); return g && { region: g, eggs: int(r.eggs), hunters: int(r.hunters) };
              }).filter(Boolean) },
      greetings: greet
    };
  }

  /** fetes_admin_leaderboard's rows, cleaned. */
  function board(o) {
    var rows = o && Array.isArray(o.rows) ? o.rows : [];
    return { final: !!(o && o.final === true), rows: rows.filter(function (r) { return r && typeof r.user_id === "string"; }).map(function (r) {
      return { rank: int(r.rank), user: r.user_id, name: P.text(r.name, 80), eggs: int(r.eggs), region: region(r.region), strikes: int(r.strikes),
               dq: r.disqualified === true, reason: typeof r.reason === "string" ? P.text(r.reason, 200) : "", flagged: r.flagged === true };
    }) };
  }

  /** A region as people read it: the place's name, or the 1-degree square's south-west corner ("46° N, 74° W"). */
  function regionLabel(r, T) {
    if (!r) return "";
    if (r.name) return r.name;
    if (r.lat == null || r.lon == null) return r.key;
    return T.square(Math.abs(r.lat) + "° " + (r.lat < 0 ? T.S : T.N) + ", " + Math.abs(r.lon) + "° " + (r.lon < 0 ? T.W : T.E));
  }

  /**
   * Pasted points: one per line, "lat, lon[, name]" (comma, semicolon or tab), or a GeoJSON FeatureCollection of points.
   * {points: [{lat, lon, name?}]} or {error: "empty" | "many"} or {error: "line", line} (1-based).
   */
  function pointsFromText(text) {
    var s = String(text || "").trim(), out = [];
    if (!s) return { error: "empty" };
    if (s.charAt(0) === "{") {
      var j; try { j = JSON.parse(s); } catch (e) { return { error: "line", line: 1 }; }
      var fs = j && Array.isArray(j.features) ? j.features : null;
      if (!fs) return { error: "line", line: 1 };
      for (var k = 0; k < fs.length; k++) {
        var g = fs[k] && fs[k].geometry, c = g && g.type === "Point" && Array.isArray(g.coordinates) ? g.coordinates : null;
        if (!c || !ok(c[1], c[0])) return { error: "line", line: k + 1 };
        var nm = fs[k].properties && typeof fs[k].properties.name === "string" ? P.text(fs[k].properties.name, 120) : "";
        out.push(nm ? { lat: c[1], lon: c[0], name: nm } : { lat: c[1], lon: c[0] });
      }
    } else {
      var lines = s.split(/\r?\n/);
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i].trim();
        if (!l) continue;
        var m = /^(-?\d+(?:\.\d+)?)\s*[,;\t]\s*(-?\d+(?:\.\d+)?)(?:\s*[,;\t]\s*(.*))?$/.exec(l);
        if (!m || !ok(+m[1], +m[2])) return { error: "line", line: i + 1 };
        var name = m[3] ? P.text(m[3], 120) : "";
        out.push(name ? { lat: +m[1], lon: +m[2], name: name } : { lat: +m[1], lon: +m[2] });
      }
    }
    if (!out.length) return { error: "empty" };
    if (out.length > 4 * POINTS_MAX) return { error: "many" };
    return { points: out };
    function ok(lat, lon) { return typeof lat === "number" && typeof lon === "number" && isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 85 && Math.abs(lon) <= 180; }
  }

  /** Overpass boxes [s, w, n, e] covering a centre's circle (km: 1 to 60), at most 0.5 degree a side each. */
  function boxes(lat, lon, km) {
    km = Math.max(1, Math.min(KM_MAX, km));
    var dLat = km / 111.32, dLon = km / (111.32 * Math.max(0.05, Math.cos(lat * Math.PI / 180)));
    var s = Math.max(-85, lat - dLat), n = Math.min(85, lat + dLat), w = Math.max(-180, lon - dLon), e = Math.min(180, lon + dLon), out = [];
    var rows = Math.max(1, Math.ceil((n - s) / TILE)), cols = Math.max(1, Math.ceil((e - w) / TILE));
    for (var i = 0; i < rows; i++) for (var k = 0; k < cols; k++) {
      out.push([s + (n - s) * i / rows, w + (e - w) * k / cols, s + (n - s) * (i + 1) / rows, w + (e - w) * (k + 1) / cols]);
    }
    return out;
  }

  /** Overpass points (sim-core's parseOsm) kept for eggs: drinking water for people, within km of the centre, once each. */
  function eggPoints(pts, lat, lon, km) {
    var seen = {}, out = [], r = 6371.0088, rad = Math.PI / 180;
    (pts || []).forEach(function (p) {
      if (!p || HUMAN.indexOf(p.type) < 0 || p.water === false || seen[p.id]) return;
      var a = Math.sin((p.lat - lat) * rad / 2), b = Math.sin((p.lon - lon) * rad / 2);
      var d = 2 * r * Math.asin(Math.min(1, Math.sqrt(a * a + Math.cos(lat * rad) * Math.cos(p.lat * rad) * b * b)));
      if (d > km) return;
      seen[p.id] = true;
      out.push({ lat: Math.round(p.lat * 1e6) / 1e6, lon: Math.round(p.lon * 1e6) / 1e6 });
    });
    return out;
  }

  function chunks(list, n) { var out = []; for (var i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; }

  // The console's 7 languages (docs/translations-glossary.md): French says "tu" and « courriel », Romanian writes ș ț.
  var STRINGS = {
    en: {
      title: "Holidays", lead: "Holiday dates, the Advent calendar and the Easter egg hunt (free for everyone). Every change is logged.",
      unavailable: "Holidays aren't on the server yet (section 96).", forbidden: "This account can't manage holidays.", refused: "The server refused this change.",
      tabs: { calendar: "Calendar", hunt: "Egg hunt", board: "Leaderboard" },
      names: { new_year: "New Year", valentine: "Valentine's Day", water_day: "World Water Day", easter: "Easter", earth_day: "Earth Day", halloween: "Halloween", christmas: "Christmas", lunar_new_year: "Lunar New Year", martisor: "Mărțișor", hanami: "Hanami", tanabata: "Tanabata", mid_autumn: "Mid-Autumn Festival", diwali: "Diwali", eid_al_fitr: "Eid al-Fitr", eid_al_adha: "Eid al-Adha", dia_de_muertos: "Día de Muertos", toilet_day: "World Toilet Day", national_day: "National day", quebec_national_day: "Fête nationale du Québec" },
      datesSample: "Each region keeps only its own holidays (docs/21_FETES.md). Where the date depends on the country, a sample one: Mărțișor RO, Lunar New Year and Mid-Autumn CN, Hanami and Tanabata JP, Diwali IN, the Eids SA, Día de Muertos MX, the Fête nationale du Québec CA-QC.",
      orthodox: function (a, b) { return "Orthodox hunt: " + a + " – " + b + "."; }, fCountry: "Country of the centre (ISO code: its Easter decides the hunt)",
      dates: function (y) { return "Dates in " + y; }, datesLead: "Move a holiday for one year (to test or to shift it): the date's year only. Moving Easter moves the hunt; moving Christmas moves Advent.",
      colHoliday: "Holiday", colDate: "Date", colMove: "Moved to", moved: "moved", save: "Save", reset: "Usual date", saved: "Saved.",
      preview: "Preview", previewLead: "Shows a holiday's pop-up and decorations in the admins' own app for 24 hours. Visual only: nothing is recorded.",
      previewOn: function (h, t) { return "On: " + h + ", until " + t + "."; }, previewOff: "Off.", turnOn: "Turn on", turnOff: "Turn off",
      advent: "Advent calendar", adventLead: "One box a day from 1 to 24 December (the 24 days before Christmas). Boxes needed to complete a year:",
      adventStats: function (m, d) { return m + " members opened a box this year · " + d + " completed it."; },
      greetings: "Holiday badges given this year", hunt: function (y) { return "Egg hunt " + y; },
      window: function (a, b) { return "Window: " + a + " to " + b + " (local dates)."; }, fStart: "First day", fEnd: "Last day",
      windowLead: "Empty: Good Friday to Easter Monday. An end more than 13 days after the start is ignored.",
      knobs: "GPS checks", fAccuracy: "Worst GPS accuracy (m, 10–100)", fSpeed: "Fastest speed between two eggs (km/h, 20–300)",
      kEggs: "Eggs", kSpots: "At WaterNow points", kImports: "At imported points", kCandidates: "Imported points", kCollected: "Eggs found", kHunters: "Hunters",
      place: "Lay the eggs now", placed: function (a, t) { return a + " eggs laid (" + t + " in all)."; },
      placeLead: "Eggs are laid every night from 14 days before the hunt; one per square of about 330 m, only at known public water points.",
      regions: "Eggs by city", colRegion: "City or region", colEggs: "Eggs", colHunters: "Hunters", noRegions: "No egg laid yet.",
      importTitle: "Import public water points", importLead: "OpenStreetMap drinking water around a centre (suburbs and regions included), or paste lines “lat, lon, name”.",
      fLat: "Latitude", fLon: "Longitude", fKm: "Radius (km, 1–60)", search: "Search OpenStreetMap", searching: function (i, n) { return "Searching OpenStreetMap… " + i + " / " + n; },
      found: function (n) { return n + " water points found."; }, osmFailed: "OpenStreetMap didn't answer. Try again or a smaller radius.",
      fPaste: "Or paste points", importBtn: function (n) { return "Import " + n + " points"; }, importText: "Import the pasted points",
      imported: function (a, d) { return a + " added" + (d ? ", " + d + " already known" : "") + ". Lay the eggs to use them."; },
      board: function (y) { return "Leaderboard " + y; }, boardLead: "Admins see every name, the strikes (mock or impossibly fast claims) and disqualified hunters at the rank they would have.",
      world: "World", colRank: "Rank", colName: "Member", colStrikes: "Strikes", colStatus: "Status", ok: "OK", dq: "Disqualified",
      final: "Final: medals are given.", notFinal: "The hunt isn't over: no medal yet.", noRows: "No hunter yet.",
      disqualify: "Disqualify", reinstate: "Reinstate", dqTitle: function (n) { return "Disqualify " + n; }, fReason: "Reason (3 to 200 characters)", confirm: "Confirm", cancel: "Cancel",
      done: "Done.", N: "N", S: "S", E: "E", W: "W", square: function (s) { return "Square " + s; }, member: "Member",
      bad: { country: "Two letters, e.g. CA or RO.", date: "Choose a date.", number: function (a, b) { return "A whole number from " + a + " to " + b + "."; }, empty: "Paste at least one point.",
        many: "Too many points at once.", line: function (n) { return "Line " + n + " isn't “lat, lon, name”."; }, reason: "Write a reason (3 characters or more)." },
      flagged: "To review", flaggedHint: "Three strikes: claims stopped until an admin disqualifies or reinstates.",
      reasons: { forbidden: "This account can’t act on that admin.", bad_country: "The server refused the country.", bad_key: "The server refused this setting.", bad_value: "The server refused this value.", bad_points: "The server refused a point.",
        bad_year: "Not this year or the next.", not_found: "This member has no hunt this year.", bad_reason: "Write a reason (3 to 200 characters).", bad_request: "The server refused this change." }
    },
    fr: {
      title: "Fêtes", lead: "Les dates des fêtes, le calendrier de l'Avent et la chasse aux œufs de Pâques (gratuit, pour tout le monde). Chaque changement est consigné.",
      unavailable: "Les fêtes ne sont pas encore sur le serveur (section 96).", forbidden: "Ce compte ne peut pas gérer les fêtes.", refused: "Le serveur a refusé ce changement.",
      tabs: { calendar: "Calendrier", hunt: "Chasse aux œufs", board: "Classement" },
      names: { new_year: "Nouvel An", valentine: "Saint-Valentin", water_day: "Journée mondiale de l'eau", easter: "Pâques", earth_day: "Jour de la Terre", halloween: "Halloween", christmas: "Noël", lunar_new_year: "Nouvel An lunaire", martisor: "Mărțișor", hanami: "Hanami", tanabata: "Tanabata", mid_autumn: "Fête de la mi-automne", diwali: "Diwali", eid_al_fitr: "Aïd el-Fitr", eid_al_adha: "Aïd el-Adha", dia_de_muertos: "Día de Muertos", toilet_day: "Journée mondiale des toilettes", national_day: "Fête nationale", quebec_national_day: "Fête nationale du Québec" },
      datesSample: "Chaque région ne garde que ses fêtes (docs/21_FETES.md). Quand la date dépend du pays, un pays exemple : Mărțișor RO, Nouvel An lunaire et mi-automne CN, Hanami et Tanabata JP, Diwali IN, les Aïds SA, Día de Muertos MX, la Fête nationale du Québec CA-QC.",
      orthodox: function (a, b) { return "Chasse orthodoxe : " + a + " – " + b + "."; }, fCountry: "Pays du centre (code ISO : sa date de Pâques fixe la chasse)",
      dates: function (y) { return "Dates en " + y; }, datesLead: "Déplace une fête pour une année (pour tester ou la décaler) : l'année de la date seulement. Déplacer Pâques déplace la chasse ; déplacer Noël déplace l'Avent.",
      colHoliday: "Fête", colDate: "Date", colMove: "Déplacée au", moved: "déplacée", save: "Enregistrer", reset: "Date habituelle", saved: "Enregistré.",
      preview: "Aperçu", previewLead: "Montre le pop-up et les décors d'une fête dans l'app des admins seulement, pendant 24 h. C'est visuel : rien n'est enregistré.",
      previewOn: function (h, t) { return "Activé : " + h + ", jusqu'au " + t + "."; }, previewOff: "Désactivé.", turnOn: "Activer", turnOff: "Désactiver",
      advent: "Calendrier de l'Avent", adventLead: "Une case par jour du 1er au 24 décembre (les 24 jours avant Noël). Cases pour réussir l'année :",
      adventStats: function (m, d) { return m + " membres ont ouvert une case cette année · " + d + " ont réussi le calendrier."; },
      greetings: "Badges de fête donnés cette année", hunt: function (y) { return "Chasse aux œufs " + y; },
      window: function (a, b) { return "Fenêtre : du " + a + " au " + b + " (dates locales)."; }, fStart: "Premier jour", fEnd: "Dernier jour",
      windowLead: "Vide : du Vendredi saint au lundi de Pâques. Une fin à plus de 13 jours du début est ignorée.",
      knobs: "Vérifications GPS", fAccuracy: "Pire précision GPS (m, 10 à 100)", fSpeed: "Vitesse maximale entre deux œufs (km/h, 20 à 300)",
      kEggs: "Œufs", kSpots: "Aux points WaterNow", kImports: "Aux points importés", kCandidates: "Points importés", kCollected: "Œufs trouvés", kHunters: "Chasseurs",
      place: "Poser les œufs maintenant", placed: function (a, t) { return a + " œufs posés (" + t + " en tout)."; },
      placeLead: "Les œufs se posent chaque nuit à partir de 14 jours avant la chasse ; un par carré d'environ 330 m, seulement sur des points d'eau publics connus.",
      regions: "Œufs par ville", colRegion: "Ville ou région", colEggs: "Œufs", colHunters: "Chasseurs", noRegions: "Aucun œuf posé pour l'instant.",
      importTitle: "Importer des points d'eau publics", importLead: "Les points d'eau potable d'OpenStreetMap autour d'un centre (banlieues et régions comprises), ou colle des lignes « lat, lon, nom ».",
      fLat: "Latitude", fLon: "Longitude", fKm: "Rayon (km, 1 à 60)", search: "Chercher dans OpenStreetMap", searching: function (i, n) { return "Recherche dans OpenStreetMap… " + i + " / " + n; },
      found: function (n) { return n + " points d'eau trouvés."; }, osmFailed: "OpenStreetMap n'a pas répondu. Réessaie, ou essaie un rayon plus petit.",
      fPaste: "Ou colle des points", importBtn: function (n) { return "Importer " + n + " points"; }, importText: "Importer les points collés",
      imported: function (a, d) { return a + " ajoutés" + (d ? ", " + d + " déjà connus" : "") + ". Pose les œufs pour les utiliser."; },
      board: function (y) { return "Classement " + y; }, boardLead: "Les admins voient tous les noms, les avertissements (positions simulées ou trop rapides) et les disqualifiés au rang qu'ils auraient.",
      world: "Monde", colRank: "Rang", colName: "Membre", colStrikes: "Avertissements", colStatus: "État", ok: "Correct", dq: "Disqualifié",
      final: "Terminée : les médailles sont remises.", notFinal: "La chasse n'est pas finie : pas encore de médaille.", noRows: "Aucun chasseur pour l'instant.",
      disqualify: "Disqualifier", reinstate: "Réintégrer", dqTitle: function (n) { return "Disqualifier " + n; }, fReason: "Raison (3 à 200 caractères)", confirm: "Confirmer", cancel: "Annuler",
      done: "C'est fait.", N: "N", S: "S", E: "E", W: "O", square: function (s) { return "Carré " + s; }, member: "Membre",
      bad: { country: "Deux lettres, par exemple CA ou RO.", date: "Choisis une date.", number: function (a, b) { return "Un nombre entier de " + a + " à " + b + "."; }, empty: "Colle au moins un point.",
        many: "Trop de points à la fois.", line: function (n) { return "La ligne " + n + " n'est pas « lat, lon, nom »."; }, reason: "Écris une raison (3 caractères ou plus)." },
      flagged: "À vérifier", flaggedHint: "Trois avertissements : ses œufs sont bloqués jusqu'à ce qu'un admin le disqualifie ou le réintègre.",
      reasons: { forbidden: "Ce compte ne peut pas agir sur cet admin.", bad_country: "Le serveur a refusé le pays.", bad_key: "Le serveur a refusé ce réglage.", bad_value: "Le serveur a refusé cette valeur.", bad_points: "Le serveur a refusé un point.",
        bad_year: "Ni cette année ni la suivante.", not_found: "Ce membre n'a pas de chasse cette année.", bad_reason: "Écris une raison (3 à 200 caractères).", bad_request: "Le serveur a refusé ce changement." }
    },
    es: {
      title: "Fiestas", lead: "Las fechas de las fiestas, el calendario de Adviento y la búsqueda de huevos de Pascua (gratis, para todos). Cada cambio queda registrado.",
      unavailable: "Las fiestas todavía no están en el servidor (sección 96).", forbidden: "Esta cuenta no puede gestionar las fiestas.", refused: "El servidor rechazó este cambio.",
      tabs: { calendar: "Calendario", hunt: "Búsqueda de huevos", board: "Clasificación" },
      names: { new_year: "Año Nuevo", valentine: "San Valentín", water_day: "Día Mundial del Agua", easter: "Pascua", earth_day: "Día de la Tierra", halloween: "Halloween", christmas: "Navidad", lunar_new_year: "Año Nuevo lunar", martisor: "Mărțișor", hanami: "Hanami", tanabata: "Tanabata", mid_autumn: "Festival del Medio Otoño", diwali: "Diwali", eid_al_fitr: "Aíd al-Fitr", eid_al_adha: "Aíd al-Adha", dia_de_muertos: "Día de Muertos", toilet_day: "Día Mundial del Retrete", national_day: "Fiesta nacional", quebec_national_day: "Fiesta nacional de Quebec" },
      datesSample: "Cada región solo tiene sus fiestas (docs/21_FETES.md). Cuando la fecha depende del país, uno de ejemplo: Mărțișor RO, Año Nuevo lunar y Medio Otoño CN, Hanami y Tanabata JP, Diwali IN, los Eid SA, Día de Muertos MX, la fiesta nacional de Quebec CA-QC.",
      orthodox: function (a, b) { return "Búsqueda ortodoxa: " + a + " – " + b + "."; }, fCountry: "País del centro (código ISO: su Pascua decide la búsqueda)",
      dates: function (y) { return "Fechas en " + y; }, datesLead: "Mueve una fiesta durante un año (para probar o desplazarla): solo el año de la fecha. Mover la Pascua mueve la búsqueda; mover la Navidad mueve el Adviento.",
      colHoliday: "Fiesta", colDate: "Fecha", colMove: "Movida al", moved: "movida", save: "Guardar", reset: "Fecha habitual", saved: "Guardado.",
      preview: "Vista previa", previewLead: "Muestra la ventana emergente y la decoración de una fiesta solo en la app de los administradores, durante 24 h. Es visual: no se registra nada.",
      previewOn: function (h, t) { return "Activada: " + h + ", hasta el " + t + "."; }, previewOff: "Desactivada.", turnOn: "Activar", turnOff: "Desactivar",
      advent: "Calendario de Adviento", adventLead: "Una casilla por día del 1 al 24 de diciembre (los 24 días antes de Navidad). Casillas para completar el año:",
      adventStats: function (m, d) { return m + " miembros abrieron una casilla este año · " + d + " completaron el calendario."; },
      greetings: "Insignias de fiesta dadas este año", hunt: function (y) { return "Búsqueda de huevos " + y; },
      window: function (a, b) { return "Período: del " + a + " al " + b + " (fechas locales)."; }, fStart: "Primer día", fEnd: "Último día",
      windowLead: "Vacío: del Viernes Santo al lunes de Pascua. Un final a más de 13 días del inicio se ignora.",
      knobs: "Controles GPS", fAccuracy: "Peor precisión GPS (m, 10–100)", fSpeed: "Velocidad máxima entre dos huevos (km/h, 20–300)",
      kEggs: "Huevos", kSpots: "En puntos de WaterNow", kImports: "En puntos importados", kCandidates: "Puntos importados", kCollected: "Huevos encontrados", kHunters: "Buscadores",
      place: "Colocar los huevos ahora", placed: function (a, t) { return a + " huevos colocados (" + t + " en total)."; },
      placeLead: "Los huevos se colocan cada noche desde 14 días antes de la búsqueda; uno por cuadrado de unos 330 m, solo en puntos de agua públicos conocidos.",
      regions: "Huevos por ciudad", colRegion: "Ciudad o región", colEggs: "Huevos", colHunters: "Buscadores", noRegions: "Todavía no hay huevos colocados.",
      importTitle: "Importar puntos de agua públicos", importLead: "Los puntos de agua potable de OpenStreetMap alrededor de un centro (con periferia y región), o pega líneas «lat, lon, nombre».",
      fLat: "Latitud", fLon: "Longitud", fKm: "Radio (km, 1–60)", search: "Buscar en OpenStreetMap", searching: function (i, n) { return "Buscando en OpenStreetMap… " + i + " / " + n; },
      found: function (n) { return n + " puntos de agua encontrados."; }, osmFailed: "OpenStreetMap no respondió. Inténtalo de nuevo o con un radio menor.",
      fPaste: "O pega puntos", importBtn: function (n) { return "Importar " + n + " puntos"; }, importText: "Importar los puntos pegados",
      imported: function (a, d) { return a + " añadidos" + (d ? ", " + d + " ya conocidos" : "") + ". Coloca los huevos para usarlos."; },
      board: function (y) { return "Clasificación " + y; }, boardLead: "Los administradores ven todos los nombres, los avisos (posiciones simuladas o demasiado rápidas) y los descalificados en el puesto que tendrían.",
      world: "Mundo", colRank: "Puesto", colName: "Miembro", colStrikes: "Avisos", colStatus: "Estado", ok: "Correcto", dq: "Descalificado",
      final: "Terminada: se entregan las medallas.", notFinal: "La búsqueda no ha terminado: todavía no hay medallas.", noRows: "Todavía no hay buscadores.",
      disqualify: "Descalificar", reinstate: "Readmitir", dqTitle: function (n) { return "Descalificar a " + n; }, fReason: "Motivo (de 3 a 200 caracteres)", confirm: "Confirmar", cancel: "Cancelar",
      done: "Hecho.", N: "N", S: "S", E: "E", W: "O", square: function (s) { return "Cuadrado " + s; }, member: "Miembro",
      bad: { country: "Dos letras, por ejemplo CA o RO.", date: "Elige una fecha.", number: function (a, b) { return "Un número entero de " + a + " a " + b + "."; }, empty: "Pega al menos un punto.",
        many: "Demasiados puntos a la vez.", line: function (n) { return "La línea " + n + " no es «lat, lon, nombre»."; }, reason: "Escribe un motivo (3 caracteres o más)." },
      flagged: "Por revisar", flaggedHint: "Tres avisos: sus huevos están bloqueados hasta que un administrador lo descalifique o lo readmita.",
      reasons: { forbidden: "Esta cuenta no puede actuar sobre ese administrador.", bad_country: "El servidor rechazó el país.", bad_key: "El servidor rechazó este ajuste.", bad_value: "El servidor rechazó este valor.", bad_points: "El servidor rechazó un punto.",
        bad_year: "Ni este año ni el siguiente.", not_found: "Este miembro no tiene búsqueda este año.", bad_reason: "Escribe un motivo (de 3 a 200 caracteres).", bad_request: "El servidor rechazó este cambio." }
    },
    de: {
      title: "Feiertage", lead: "Die Daten der Feiertage, der Adventskalender und die Ostereiersuche (kostenlos, für alle). Jede Änderung wird protokolliert.",
      unavailable: "Die Feiertage sind noch nicht auf dem Server (Abschnitt 96).", forbidden: "Dieses Konto kann die Feiertage nicht verwalten.", refused: "Der Server hat diese Änderung abgelehnt.",
      tabs: { calendar: "Kalender", hunt: "Eiersuche", board: "Rangliste" },
      names: { new_year: "Neujahr", valentine: "Valentinstag", water_day: "Weltwassertag", easter: "Ostern", earth_day: "Tag der Erde", halloween: "Halloween", christmas: "Weihnachten", lunar_new_year: "Mondneujahr", martisor: "Mărțișor", hanami: "Hanami", tanabata: "Tanabata", mid_autumn: "Mondfest", diwali: "Diwali", eid_al_fitr: "Fest des Fastenbrechens", eid_al_adha: "Opferfest", dia_de_muertos: "Día de Muertos", toilet_day: "Welttoilettentag", national_day: "Nationalfeiertag", quebec_national_day: "Nationalfeiertag von Québec" },
      datesSample: "Jede Region hat nur ihre eigenen Feiertage (docs/21_FETES.md). Hängt das Datum vom Land ab, gilt ein Beispielland: Mărțișor RO, Mondneujahr und Mondfest CN, Hanami und Tanabata JP, Diwali IN, die Eids SA, Día de Muertos MX, der Nationalfeiertag von Québec CA-QC.",
      orthodox: function (a, b) { return "Orthodoxe Suche: " + a + " – " + b + "."; }, fCountry: "Land des Mittelpunkts (ISO-Code: sein Osterdatum bestimmt die Suche)",
      dates: function (y) { return "Daten " + y; }, datesLead: "Verschiebe einen Feiertag für ein Jahr (zum Testen oder Verlegen): nur im Jahr des Datums. Ostern verschiebt die Eiersuche, Weihnachten den Advent.",
      colHoliday: "Feiertag", colDate: "Datum", colMove: "Verschoben auf", moved: "verschoben", save: "Speichern", reset: "Übliches Datum", saved: "Gespeichert.",
      preview: "Vorschau", previewLead: "Zeigt das Pop-up und die Dekoration eines Feiertags nur in der App der Admins, 24 Stunden lang. Nur optisch: nichts wird gespeichert.",
      previewOn: function (h, t) { return "An: " + h + ", bis " + t + "."; }, previewOff: "Aus.", turnOn: "Einschalten", turnOff: "Ausschalten",
      advent: "Adventskalender", adventLead: "Ein Türchen pro Tag vom 1. bis 24. Dezember (die 24 Tage vor Weihnachten). Türchen, um das Jahr zu schaffen:",
      adventStats: function (m, d) { return m + " Mitglieder haben dieses Jahr ein Türchen geöffnet · " + d + " haben es geschafft."; },
      greetings: "Feiertagsabzeichen dieses Jahr", hunt: function (y) { return "Eiersuche " + y; },
      window: function (a, b) { return "Zeitraum: " + a + " bis " + b + " (nach Ortszeit)."; }, fStart: "Erster Tag", fEnd: "Letzter Tag",
      windowLead: "Leer: Karfreitag bis Ostermontag. Ein Ende mehr als 13 Tage nach dem Beginn wird ignoriert.",
      knobs: "GPS-Prüfungen", fAccuracy: "Schlechteste GPS-Genauigkeit (m, 10–100)", fSpeed: "Höchste Geschwindigkeit zwischen zwei Eiern (km/h, 20–300)",
      kEggs: "Eier", kSpots: "An WaterNow-Punkten", kImports: "An importierten Punkten", kCandidates: "Importierte Punkte", kCollected: "Gefundene Eier", kHunters: "Suchende",
      place: "Eier jetzt verstecken", placed: function (a, t) { return a + " Eier versteckt (" + t + " insgesamt)."; },
      placeLead: "Eier werden ab 14 Tage vor der Suche jede Nacht versteckt; eines pro Quadrat von etwa 330 m, nur an bekannten öffentlichen Wasserstellen.",
      regions: "Eier pro Stadt", colRegion: "Stadt oder Region", colEggs: "Eier", colHunters: "Suchende", noRegions: "Noch keine Eier versteckt.",
      importTitle: "Öffentliche Wasserstellen importieren", importLead: "Trinkwasserstellen aus OpenStreetMap um einen Mittelpunkt (mit Vororten und Region), oder füge Zeilen „lat, lon, Name“ ein.",
      fLat: "Breite", fLon: "Länge", fKm: "Radius (km, 1–60)", search: "In OpenStreetMap suchen", searching: function (i, n) { return "Suche in OpenStreetMap… " + i + " / " + n; },
      found: function (n) { return n + " Wasserstellen gefunden."; }, osmFailed: "OpenStreetMap hat nicht geantwortet. Versuche es noch einmal oder mit kleinerem Radius.",
      fPaste: "Oder Punkte einfügen", importBtn: function (n) { return n + " Punkte importieren"; }, importText: "Eingefügte Punkte importieren",
      imported: function (a, d) { return a + " hinzugefügt" + (d ? ", " + d + " schon bekannt" : "") + ". Verstecke die Eier, um sie zu nutzen."; },
      board: function (y) { return "Rangliste " + y; }, boardLead: "Admins sehen alle Namen, die Verwarnungen (simulierte oder zu schnelle Positionen) und Disqualifizierte auf dem Rang, den sie hätten.",
      world: "Welt", colRank: "Rang", colName: "Mitglied", colStrikes: "Verwarnungen", colStatus: "Status", ok: "In Ordnung", dq: "Disqualifiziert",
      final: "Endstand: Die Medaillen sind vergeben.", notFinal: "Die Suche läuft noch: noch keine Medaille.", noRows: "Noch niemand sucht.",
      disqualify: "Disqualifizieren", reinstate: "Wieder zulassen", dqTitle: function (n) { return n + " disqualifizieren"; }, fReason: "Grund (3 bis 200 Zeichen)", confirm: "Bestätigen", cancel: "Abbrechen",
      done: "Erledigt.", N: "N", S: "S", E: "O", W: "W", square: function (s) { return "Quadrat " + s; }, member: "Mitglied",
      bad: { country: "Zwei Buchstaben, z. B. CA oder RO.", date: "Wähle ein Datum.", number: function (a, b) { return "Eine ganze Zahl von " + a + " bis " + b + "."; }, empty: "Füge mindestens einen Punkt ein.",
        many: "Zu viele Punkte auf einmal.", line: function (n) { return "Zeile " + n + " ist nicht „lat, lon, Name“."; }, reason: "Gib einen Grund an (mindestens 3 Zeichen)." },
      flagged: "Zu prüfen", flaggedHint: "Drei Verwarnungen: gesperrt, bis ein Admin disqualifiziert oder wieder zulässt.",
      reasons: { forbidden: "Dieses Konto kann bei diesem Admin nichts tun.", bad_country: "Der Server hat das Land abgelehnt.", bad_key: "Der Server hat diese Einstellung abgelehnt.", bad_value: "Der Server hat diesen Wert abgelehnt.", bad_points: "Der Server hat einen Punkt abgelehnt.",
        bad_year: "Weder dieses noch nächstes Jahr.", not_found: "Dieses Mitglied hat dieses Jahr keine Suche.", bad_reason: "Gib einen Grund an (3 bis 200 Zeichen).", bad_request: "Der Server hat diese Änderung abgelehnt." }
    },
    pt: {
      title: "Festas", lead: "As datas das festas, o calendário do Advento e a caça aos ovos de Páscoa (grátis, para todos). Cada mudança fica registrada.",
      unavailable: "As festas ainda não estão no servidor (seção 96).", forbidden: "Esta conta não pode gerenciar as festas.", refused: "O servidor recusou esta mudança.",
      tabs: { calendar: "Calendário", hunt: "Caça aos ovos", board: "Classificação" },
      names: { new_year: "Ano-Novo", valentine: "Dia de São Valentim", water_day: "Dia Mundial da Água", easter: "Páscoa", earth_day: "Dia da Terra", halloween: "Halloween", christmas: "Natal", lunar_new_year: "Ano-Novo Lunar", martisor: "Mărțișor", hanami: "Hanami", tanabata: "Tanabata", mid_autumn: "Festival do Meio do Outono", diwali: "Diwali", eid_al_fitr: "Festa do Fim do Ramadã", eid_al_adha: "Festa do Sacrifício", dia_de_muertos: "Día de Muertos", toilet_day: "Dia Mundial do Banheiro", national_day: "Dia nacional", quebec_national_day: "Festa nacional do Quebec" },
      datesSample: "Cada região só tem as suas festas (docs/21_FETES.md). Quando a data depende do país, um de exemplo: Mărțișor RO, Ano-Novo Lunar e Meio do Outono CN, Hanami e Tanabata JP, Diwali IN, os Eid SA, Día de Muertos MX, a festa nacional do Quebec CA-QC.",
      orthodox: function (a, b) { return "Caça ortodoxa: " + a + " – " + b + "."; }, fCountry: "País do centro (código ISO: a sua Páscoa decide a caça)",
      dates: function (y) { return "Datas em " + y; }, datesLead: "Mova uma festa por um ano (para testar ou mudar a data): só no ano da data. Mover a Páscoa move a caça; mover o Natal move o Advento.",
      colHoliday: "Festa", colDate: "Data", colMove: "Movida para", moved: "movida", save: "Salvar", reset: "Data habitual", saved: "Salvo.",
      preview: "Pré-visualização", previewLead: "Mostra o pop-up e a decoração de uma festa só no app dos administradores, durante 24 h. É visual: nada é registrado.",
      previewOn: function (h, t) { return "Ligada: " + h + ", até " + t + "."; }, previewOff: "Desligada.", turnOn: "Ligar", turnOff: "Desligar",
      advent: "Calendário do Advento", adventLead: "Uma casinha por dia de 1 a 24 de dezembro (os 24 dias antes do Natal). Casinhas para completar o ano:",
      adventStats: function (m, d) { return m + " membros abriram uma casinha este ano · " + d + " completaram o calendário."; },
      greetings: "Medalhas de festa dadas este ano", hunt: function (y) { return "Caça aos ovos " + y; },
      window: function (a, b) { return "Período: de " + a + " a " + b + " (datas locais)."; }, fStart: "Primeiro dia", fEnd: "Último dia",
      windowLead: "Vazio: da Sexta-feira Santa à segunda-feira de Páscoa. Um fim a mais de 13 dias do início é ignorado.",
      knobs: "Verificações de GPS", fAccuracy: "Pior precisão do GPS (m, 10–100)", fSpeed: "Velocidade máxima entre dois ovos (km/h, 20–300)",
      kEggs: "Ovos", kSpots: "Em pontos WaterNow", kImports: "Em pontos importados", kCandidates: "Pontos importados", kCollected: "Ovos encontrados", kHunters: "Caçadores",
      place: "Colocar os ovos agora", placed: function (a, t) { return a + " ovos colocados (" + t + " no total)."; },
      placeLead: "Os ovos são colocados todas as noites a partir de 14 dias antes da caça; um por quadrado de cerca de 330 m, só em pontos de água públicos conhecidos.",
      regions: "Ovos por cidade", colRegion: "Cidade ou região", colEggs: "Ovos", colHunters: "Caçadores", noRegions: "Ainda não há ovos colocados.",
      importTitle: "Importar pontos de água públicos", importLead: "Os pontos de água potável do OpenStreetMap ao redor de um centro (com arredores e região), ou cole linhas “lat, lon, nome”.",
      fLat: "Latitude", fLon: "Longitude", fKm: "Raio (km, 1–60)", search: "Procurar no OpenStreetMap", searching: function (i, n) { return "Procurando no OpenStreetMap… " + i + " / " + n; },
      found: function (n) { return n + " pontos de água encontrados."; }, osmFailed: "O OpenStreetMap não respondeu. Tente de novo ou use um raio menor.",
      fPaste: "Ou cole pontos", importBtn: function (n) { return "Importar " + n + " pontos"; }, importText: "Importar os pontos colados",
      imported: function (a, d) { return a + " adicionados" + (d ? ", " + d + " já conhecidos" : "") + ". Coloque os ovos para usá-los."; },
      board: function (y) { return "Classificação " + y; }, boardLead: "Os administradores veem todos os nomes, os avisos (posições simuladas ou rápidas demais) e os desclassificados na posição que teriam.",
      world: "Mundo", colRank: "Posição", colName: "Membro", colStrikes: "Avisos", colStatus: "Estado", ok: "Certo", dq: "Desclassificado",
      final: "Encerrada: as medalhas foram entregues.", notFinal: "A caça não acabou: ainda não há medalhas.", noRows: "Ainda não há caçadores.",
      disqualify: "Desclassificar", reinstate: "Readmitir", dqTitle: function (n) { return "Desclassificar " + n; }, fReason: "Motivo (3 a 200 caracteres)", confirm: "Confirmar", cancel: "Cancelar",
      done: "Feito.", N: "N", S: "S", E: "L", W: "O", square: function (s) { return "Quadrado " + s; }, member: "Membro",
      bad: { country: "Duas letras, por exemplo CA ou RO.", date: "Escolha uma data.", number: function (a, b) { return "Um número inteiro de " + a + " a " + b + "."; }, empty: "Cole pelo menos um ponto.",
        many: "Pontos demais de uma vez.", line: function (n) { return "A linha " + n + " não é “lat, lon, nome”."; }, reason: "Escreva um motivo (3 caracteres ou mais)." },
      flagged: "A verificar", flaggedHint: "Três avisos: os ovos ficam bloqueados até um administrador desclassificar ou readmitir.",
      reasons: { forbidden: "Esta conta não pode agir sobre esse administrador.", bad_country: "O servidor recusou o país.", bad_key: "O servidor recusou esta configuração.", bad_value: "O servidor recusou este valor.", bad_points: "O servidor recusou um ponto.",
        bad_year: "Nem este ano nem o próximo.", not_found: "Este membro não tem caça este ano.", bad_reason: "Escreva um motivo (3 a 200 caracteres).", bad_request: "O servidor recusou esta mudança." }
    },
    ja: {
      title: "季節のイベント", lead: "祝日の日付、アドベントカレンダー、イースターのエッグハント（無料、全員向け）。変更はすべて記録されます。",
      unavailable: "イベントはまだサーバーにありません（セクション96）。", forbidden: "このアカウントではイベントを管理できません。", refused: "サーバーがこの変更を拒否しました。",
      tabs: { calendar: "カレンダー", hunt: "エッグハント", board: "ランキング" },
      names: { new_year: "お正月", valentine: "バレンタインデー", water_day: "世界水の日", easter: "イースター", earth_day: "アースデイ", halloween: "ハロウィン", christmas: "クリスマス", lunar_new_year: "旧正月", martisor: "マルツィショール", hanami: "お花見", tanabata: "七夕", mid_autumn: "中秋節", diwali: "ディワリ", eid_al_fitr: "イード・アル＝フィトル", eid_al_adha: "イード・アル＝アドハー", dia_de_muertos: "死者の日", toilet_day: "世界トイレの日", national_day: "建国記念日", quebec_national_day: "ケベック州の祝日" },
      datesSample: "各地域では、その地域の祝日だけが表示されます（docs/21_FETES.md）。日付が国によって違う祝日は例の国で表示：マルツィショール RO、旧正月と中秋節 CN、お花見と七夕 JP、ディワリ IN、イード SA、死者の日 MX、ケベック州の祝日 CA-QC。",
      orthodox: function (a, b) { return "正教会のエッグハント：" + a + " – " + b + "。"; }, fCountry: "中心の国（ISOコード：その国のイースターでハントが決まります）",
      dates: function (y) { return y + "年の日付"; }, datesLead: "祝日を1年だけ動かせます（テストや変更用、その日付の年のみ）。イースターを動かすとエッグハントも、クリスマスを動かすとアドベントも動きます。",
      colHoliday: "祝日", colDate: "日付", colMove: "変更後", moved: "変更済み", save: "保存", reset: "通常の日付", saved: "保存しました。",
      preview: "プレビュー", previewLead: "管理者のアプリだけに、祝日のポップアップと飾りを24時間表示します。表示のみで、何も記録されません。",
      previewOn: function (h, t) { return "オン：" + h + "（" + t + "まで）。"; }, previewOff: "オフ。", turnOn: "オンにする", turnOff: "オフにする",
      advent: "アドベントカレンダー", adventLead: "12月1日〜24日（クリスマス前の24日間）に1日1マス。その年を達成するのに必要なマス数：",
      adventStats: function (m, d) { return "今年マスを開けたメンバー " + m + "人 · 達成 " + d + "人。"; },
      greetings: "今年配った祝日バッジ", hunt: function (y) { return "エッグハント " + y; },
      window: function (a, b) { return "期間：" + a + "〜" + b + "（現地の日付）。"; }, fStart: "初日", fEnd: "最終日",
      windowLead: "空欄：聖金曜日〜イースターマンデー。開始から13日を超える終了日は無視されます。",
      knobs: "GPSチェック", fAccuracy: "許容するGPS精度（m、10〜100）", fSpeed: "卵と卵の間の最高速度（km/h、20〜300）",
      kEggs: "卵", kSpots: "WaterNowの地点", kImports: "インポートした地点", kCandidates: "インポート地点", kCollected: "見つかった卵", kHunters: "参加者",
      place: "今すぐ卵を置く", placed: function (a, t) { return a + "個の卵を置きました（合計" + t + "個）。"; },
      placeLead: "卵はハントの14日前から毎晩置かれます。約330 mの区画ごとに1個、既知の公共の給水地点だけに置きます。",
      regions: "都市別の卵", colRegion: "都市・地域", colEggs: "卵", colHunters: "参加者", noRegions: "まだ卵はありません。",
      importTitle: "公共の給水地点をインポート", importLead: "中心のまわり（郊外や地方も含む）のOpenStreetMapの給水地点、または「緯度, 経度, 名前」の行を貼り付けます。",
      fLat: "緯度", fLon: "経度", fKm: "半径（km、1〜60）", search: "OpenStreetMapで検索", searching: function (i, n) { return "OpenStreetMapで検索中… " + i + " / " + n; },
      found: function (n) { return n + "か所の給水地点が見つかりました。"; }, osmFailed: "OpenStreetMapが応答しませんでした。もう一度、または半径を小さくして試してください。",
      fPaste: "または地点を貼り付け", importBtn: function (n) { return n + "か所をインポート"; }, importText: "貼り付けた地点をインポート",
      imported: function (a, d) { return a + "か所を追加" + (d ? "、" + d + "か所は登録済み" : "") + "。使うには卵を置いてください。"; },
      board: function (y) { return "ランキング " + y; }, boardLead: "管理者にはすべての名前、警告（偽の位置や速すぎる移動）、失格者が本来の順位で表示されます。",
      world: "世界", colRank: "順位", colName: "メンバー", colStrikes: "警告", colStatus: "状態", ok: "正常", dq: "失格",
      final: "確定：メダルが授与されました。", notFinal: "ハントはまだ終わっていません：メダルはまだです。", noRows: "まだ参加者はいません。",
      disqualify: "失格にする", reinstate: "復帰させる", dqTitle: function (n) { return n + "を失格にする"; }, fReason: "理由（3〜200文字）", confirm: "確定", cancel: "キャンセル",
      done: "完了しました。", N: "N", S: "S", E: "E", W: "W", square: function (s) { return "区画 " + s; }, member: "メンバー",
      bad: { country: "2文字にしてください（例：CA、RO）。", date: "日付を選んでください。", number: function (a, b) { return a + "〜" + b + "の整数にしてください。"; }, empty: "地点を1つ以上貼り付けてください。",
        many: "一度に貼り付ける地点が多すぎます。", line: function (n) { return n + "行目が「緯度, 経度, 名前」になっていません。"; }, reason: "理由を書いてください（3文字以上）。" },
      flagged: "要確認", flaggedHint: "警告3回：管理者が失格か復帰を決めるまで、卵は拾えません。",
      reasons: { forbidden: "このアカウントではその管理者に対して操作できません。", bad_country: "サーバーが国を拒否しました。", bad_key: "サーバーがこの設定を拒否しました。", bad_value: "サーバーがこの値を拒否しました。", bad_points: "サーバーが地点を拒否しました。",
        bad_year: "今年か来年にしてください。", not_found: "このメンバーは今年のハントに参加していません。", bad_reason: "理由を書いてください（3〜200文字）。", bad_request: "サーバーがこの変更を拒否しました。" }
    },
    ro: {
      title: "Sărbători", lead: "Datele sărbătorilor, calendarul de Advent și vânătoarea de ouă de Paște (gratuit, pentru toți). Fiecare schimbare e înregistrată.",
      unavailable: "Sărbătorile nu sunt încă pe server (secțiunea 96).", forbidden: "Acest cont nu poate gestiona sărbătorile.", refused: "Serverul a refuzat această schimbare.",
      tabs: { calendar: "Calendar", hunt: "Vânătoarea de ouă", board: "Clasament" },
      names: { new_year: "Anul Nou", valentine: "Ziua Îndrăgostiților", water_day: "Ziua Mondială a Apei", easter: "Paștele", earth_day: "Ziua Pământului", halloween: "Halloween", christmas: "Crăciunul", lunar_new_year: "Anul Nou Lunar", martisor: "Mărțișor", hanami: "Hanami", tanabata: "Tanabata", mid_autumn: "Festivalul de la mijlocul toamnei", diwali: "Diwali", eid_al_fitr: "Ramazan Bairam", eid_al_adha: "Kurban Bairam", dia_de_muertos: "Día de Muertos", toilet_day: "Ziua Mondială a Toaletei", national_day: "Ziua Națională", quebec_national_day: "Ziua Națională a Quebecului" },
      datesSample: "Fiecare regiune are doar sărbătorile ei (docs/21_FETES.md). Când data depinde de țară, o țară exemplu: Mărțișor RO, Anul Nou Lunar și mijlocul toamnei CN, Hanami și Tanabata JP, Diwali IN, Eid SA, Día de Muertos MX, Ziua Națională a Quebecului CA-QC.",
      orthodox: function (a, b) { return "Vânătoarea ortodoxă: " + a + " – " + b + "."; }, fCountry: "Țara centrului (cod ISO: Paștele ei decide vânătoarea)",
      dates: function (y) { return "Datele din " + y; }, datesLead: "Mută o sărbătoare pentru un an (ca test sau ca s-o muți): doar în anul datei. Mutarea Paștelui mută vânătoarea; mutarea Crăciunului mută Adventul.",
      colHoliday: "Sărbătoare", colDate: "Data", colMove: "Mutată pe", moved: "mutată", save: "Salvează", reset: "Data obișnuită", saved: "Salvat.",
      preview: "Previzualizare", previewLead: "Arată fereastra pop-up și decorurile unei sărbători doar în aplicația administratorilor, timp de 24 de ore. E doar vizual: nu se înregistrează nimic.",
      previewOn: function (h, t) { return "Pornită: " + h + ", până la " + t + "."; }, previewOff: "Oprită.", turnOn: "Pornește", turnOff: "Oprește",
      advent: "Calendarul de Advent", adventLead: "O căsuță pe zi, de la 1 la 24 decembrie (cele 24 de zile dinainte de Crăciun). Căsuțe necesare ca să completezi anul:",
      adventStats: function (m, d) { return m + " membri au deschis o căsuță anul acesta · " + d + " au reușit."; },
      greetings: "Insigne de sărbătoare date anul acesta", hunt: function (y) { return "Vânătoarea de ouă " + y; },
      window: function (a, b) { return "Perioada: de la " + a + " la " + b + " (date locale)."; }, fStart: "Prima zi", fEnd: "Ultima zi",
      windowLead: "Gol: din Vinerea Mare până în a doua zi de Paște. Un sfârșit la peste 13 zile de la început e ignorat.",
      knobs: "Verificări GPS", fAccuracy: "Cea mai slabă precizie GPS (m, 10–100)", fSpeed: "Viteza maximă între două ouă (km/h, 20–300)",
      kEggs: "Ouă", kSpots: "La punctele WaterNow", kImports: "La punctele importate", kCandidates: "Puncte importate", kCollected: "Ouă găsite", kHunters: "Vânători",
      place: "Pune ouăle acum", placed: function (a, t) { return a + " ouă puse (" + t + " în total)."; },
      placeLead: "Ouăle se pun în fiecare noapte începând cu 14 zile înainte de vânătoare; unul pe pătrat de circa 330 m, doar la puncte de apă publice cunoscute.",
      regions: "Ouă pe oraș", colRegion: "Oraș sau regiune", colEggs: "Ouă", colHunters: "Vânători", noRegions: "Încă nu s-a pus niciun ou.",
      importTitle: "Importă puncte de apă publice", importLead: "Punctele de apă potabilă din OpenStreetMap în jurul unui centru (cu suburbii și regiune), sau lipește rânduri „lat, lon, nume”.",
      fLat: "Latitudine", fLon: "Longitudine", fKm: "Rază (km, 1–60)", search: "Caută în OpenStreetMap", searching: function (i, n) { return "Se caută în OpenStreetMap… " + i + " / " + n; },
      found: function (n) { return n + " puncte de apă găsite."; }, osmFailed: "OpenStreetMap nu a răspuns. Încearcă din nou sau cu o rază mai mică.",
      fPaste: "Sau lipește puncte", importBtn: function (n) { return "Importă " + n + " puncte"; }, importText: "Importă punctele lipite",
      imported: function (a, d) { return a + " adăugate" + (d ? ", " + d + " deja cunoscute" : "") + ". Pune ouăle ca să le folosești."; },
      board: function (y) { return "Clasament " + y; }, boardLead: "Administratorii văd toate numele, avertismentele (poziții simulate sau prea rapide) și descalificații pe locul pe care l-ar avea.",
      world: "Lume", colRank: "Loc", colName: "Membru", colStrikes: "Avertismente", colStatus: "Stare", ok: "În regulă", dq: "Descalificat",
      final: "Încheiată: medaliile au fost acordate.", notFinal: "Vânătoarea nu s-a terminat: încă nicio medalie.", noRows: "Încă niciun vânător.",
      disqualify: "Descalifică", reinstate: "Reprimește", dqTitle: function (n) { return "Descalifică pe " + n; }, fReason: "Motivul (3 până la 200 de caractere)", confirm: "Confirmă", cancel: "Anulează",
      done: "Gata.", N: "N", S: "S", E: "E", W: "V", square: function (s) { return "Pătratul " + s; }, member: "Membru",
      bad: { country: "Două litere, de exemplu CA sau RO.", date: "Alege o dată.", number: function (a, b) { return "Un număr întreg de la " + a + " la " + b + "."; }, empty: "Lipește cel puțin un punct.",
        many: "Prea multe puncte deodată.", line: function (n) { return "Rândul " + n + " nu e „lat, lon, nume”."; }, reason: "Scrie un motiv (3 caractere sau mai mult)." },
      flagged: "De verificat", flaggedHint: "Trei avertismente: ouăle sunt blocate până când un administrator îl descalifică sau îl reprimește.",
      reasons: { forbidden: "Acest cont nu poate acționa asupra acelui administrator.", bad_country: "Serverul a refuzat țara.", bad_key: "Serverul a refuzat această setare.", bad_value: "Serverul a refuzat această valoare.", bad_points: "Serverul a refuzat un punct.",
        bad_year: "Nici anul acesta, nici anul viitor.", not_found: "Acest membru nu are vânătoare anul acesta.", bad_reason: "Scrie un motiv (3 până la 200 de caractere).", bad_request: "Serverul a refuzat această schimbare." }
    }
  };

  var api = { STRINGS: STRINGS, IDS: IDS, overview: overview, board: board, regionLabel: regionLabel, pointsFromText: pointsFromText,
              boxes: boxes, eggPoints: eggPoints, chunks: chunks, POINTS_MAX: POINTS_MAX };
  if (node) { module.exports = api; return; }

  // ---- The page ----
  var A = root.WNCAPP;
  if (!A || !P) return;
  var T = STRINGS[A.lang] || STRINGS.en, nf = new Intl.NumberFormat(A.lang);
  var fmtDay = function (d) { return d ? new Date(d + "T12:00:00Z").toLocaleDateString(A.lang, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "—"; };
  var fmtTime = function (t) { var d = new Date(t); return isNaN(d) ? "—" : d.toLocaleString(A.lang, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }); };
  function el(tag, cls, t) { var e = document.createElement(tag); if (cls) e.className = cls; if (t != null) e.textContent = t; return e; }
  function clear(x) { while (x.firstChild) x.removeChild(x.firstChild); return x; }
  function btn(parent, t, cls) { var b = el("button", cls == null ? "ghost" : cls, t); b.type = "button"; parent.appendChild(b); return b; }
  var uid = 0;
  function field(parent, label, type, value, attrs) {
    var id = "fe" + (++uid), w = el("div", "rc-f"), l = el("label", "field", label), i = el(type === "select" || type === "textarea" ? type : "input", "input");
    l.htmlFor = id; i.id = id;
    if (type !== "select" && type !== "textarea") i.type = type;
    Object.keys(attrs || {}).forEach(function (k) { i.setAttribute(k, attrs[k]); });
    if (value != null && type !== "select") i.value = value;
    w.appendChild(l); w.appendChild(i); parent.appendChild(w);
    return i;
  }
  function waiting(b, on) { if (on) b.setAttribute("aria-disabled", "true"); else b.removeAttribute("aria-disabled"); }
  function isWaiting(b) { return b.getAttribute("aria-disabled") === "true"; }
  function kpi(parent, label, value) {
    var k = el("div", "kpi card"); k.appendChild(el("div", "l", label)); k.appendChild(el("div", "v", value)); parent.appendChild(k);
  }
  function table(parent, heads, rows) {
    var wrap = el("div", "rc-scroll"), t = el("table", "rc-table"), thead = el("thead"), hr = el("tr"), tb = el("tbody");
    heads.forEach(function (h) { var th = el("th", h[1] ? "n" : null, h[0]); th.scope = "col"; hr.appendChild(th); });
    thead.appendChild(hr); t.appendChild(thead);
    rows.forEach(function (r) { tb.appendChild(r); });
    t.appendChild(tb); wrap.appendChild(t); parent.appendChild(wrap);
    return t;
  }
  function meta(n) { var m = document.querySelector('meta[name="' + n + '"]'); return m ? m.getAttribute("content") || "" : ""; }

  var box = document.getElementById("fetes"), ov = null, lb = null, tab = "calendar", where = "", pick = null, found = null;
  var msg = null, last = null, inited = false;
  function say(t, cls) { last = t ? [t, cls] : null; if (msg) { msg.textContent = t || ""; msg.className = "msg" + (cls ? " " + cls : ""); } }
  function fatal(e) {
    if (e.status === 401) { A.lost(); return true; }
    if (e.code === "WNMFA") { A.showMfa(); return true; }
    return false;
  }

  async function load() {
    try {
      ov = overview(await A.rpc("fetes_admin_overview", {}));
      if (tab === "board") {
        try { lb = board(await A.rpc("fetes_admin_leaderboard", { p_year: ov.year, p_region: where || null })); }
        catch (e) { if (e.code !== "42501" && e.status !== 403) throw e; lb = { final: false, rows: [], denied: true }; }  // moderation power needed
      }
    } catch (e) {
      if (fatal(e)) return;
      clear(box);
      box.appendChild(el("h2", null, T.title));
      box.appendChild(el("p", "note", e.status === 404 ? T.unavailable : e.code === "42501" || e.status === 403 ? T.forbidden : T.refused));
      box.classList.remove("hidden");
      return;
    }
    render();
  }

  /** One write: the answer when the server took it ({result: 'ok', …}), else null; the line under the card says why not. */
  async function call(name, args, b) {
    if (b && isWaiting(b)) return null;
    if (b) waiting(b, true);
    try {
      var r = await A.rpc(name, args);
      if (!r || r.result !== "ok") {
        var why = r && typeof r.result === "string" ? r.result : "";
        say(T.reasons[why] || T.refused + (why ? " (" + P.text(why, 40) + ")" : ""), "err");
        return null;
      }
      return r;
    } catch (e) {
      if (fatal(e)) return null;
      say(e.code === "42501" || e.status === 403 ? T.forbidden : T.refused, "err");
      return null;
    } finally { if (b) waiting(b, false); }
  }
  async function set(key, value, b, okText) {
    if (!(await call("fetes_admin_set", { p_key: key, p_value: value == null || value === "" ? null : String(value) }, b))) return;
    say(okText || T.saved, "ok");
    await load();
  }

  function render() {
    clear(box);
    box.classList.remove("hidden");
    var head = el("div", "card-head"), hl = el("div");
    hl.appendChild(el("h2", null, T.title));
    hl.appendChild(el("p", "muted small", T.lead));
    head.appendChild(hl);
    box.appendChild(head);
    var tabs = el("div", "tabs rc-tabs");
    tabs.setAttribute("role", "group");
    ["calendar", "hunt", "board"].forEach(function (k) {
      var b = btn(tabs, T.tabs[k], "");
      b.setAttribute("aria-pressed", String(k === tab));
      b.addEventListener("click", function () { tab = k; last = null; pick = null; if (k === "board") load(); else render(); });
    });
    box.appendChild(tabs);
    var body = el("div", "rc-body");
    ({ calendar: calendarTab, hunt: huntTab, board: boardTab })[tab](body);
    box.appendChild(body);
    msg = el("p", "msg");
    msg.setAttribute("role", "status");
    box.appendChild(msg);
    if (last) say(last[0], last[1]);
  }

  function calendarTab(b) {
    b.appendChild(el("h3", "rc-h3", T.dates(ov.year)));
    b.appendChild(el("p", "muted small rc-lead", T.datesLead));
    b.appendChild(el("p", "muted small rc-lead", T.datesSample));
    table(b, [[T.colHoliday], [T.colDate], [T.colMove], [""]], IDS.filter(function (id) { return id !== "national_day"; }).map(function (id) {
      var tr = el("tr"), th = el("th", null, T.names[id]), when = el("td"), mv = el("td"), cell = el("td"), acts = el("div", "fe-acts");
      th.scope = "row";
      when.appendChild(document.createTextNode(fmtDay(ov.dates[id])));
      if (ov.overrides[id]) { when.appendChild(document.createTextNode(" ")); when.appendChild(el("span", "chip rc-open", T.moved)); }
      var inp = el("input", "input fe-date"); inp.type = "date"; inp.value = ov.overrides[id] || ""; inp.setAttribute("aria-label", T.colMove + " · " + T.names[id]);
      mv.appendChild(inp);
      var s = btn(acts, T.save, "ghost small-btn");
      s.addEventListener("click", function () { if (!inp.value) { say(T.bad.date, "err"); inp.focus(); return; } set("holiday_" + id, inp.value, s); });
      if (ov.overrides[id]) { var r = btn(acts, T.reset, "ghost small-btn"); r.addEventListener("click", function () { set("holiday_" + id, null, r); }); }
      cell.appendChild(acts);
      tr.appendChild(th); tr.appendChild(when); tr.appendChild(mv); tr.appendChild(cell);
      return tr;
    }));

    var forms = el("div", "rc-forms fe-forms");
    var pv = el("div", "rc-form");
    pv.appendChild(el("h3", "rc-h3", T.preview));
    pv.appendChild(el("p", "muted small", T.previewLead));
    pv.appendChild(el("p", "fe-state", ov.preview ? T.previewOn(T.names[ov.preview.holiday], fmtTime(ov.preview.until)) : T.previewOff));
    var sel = field(pv, T.colHoliday, "select");
    IDS.forEach(function (id) { var o = el("option", null, T.names[id]); o.value = id; sel.appendChild(o); });
    sel.value = ov.preview ? ov.preview.holiday : "christmas";
    var pa = el("div", "rc-acts"), on = btn(pa, T.turnOn, "primary");
    on.addEventListener("click", function () { set("holiday_preview", sel.value, on); });
    if (ov.preview) { var off = btn(pa, T.turnOff); off.addEventListener("click", function () { set("holiday_preview", null, off); }); }
    pv.appendChild(pa);
    forms.appendChild(pv);

    var ad = el("div", "rc-form");
    ad.appendChild(el("h3", "rc-h3", T.advent));
    var min = field(ad, T.adventLead, "number", String(ov.adventMin), { min: "1", max: "24", step: "1", inputmode: "numeric" });
    var aa = el("div", "rc-acts"), as = btn(aa, T.save, "primary");
    as.addEventListener("click", function () {
      var v = Number(min.value);
      if (!Number.isInteger(v) || v < 1 || v > 24) { say(T.bad.number(1, 24), "err"); min.focus(); return; }
      set("advent_min_days", v, as);
    });
    ad.appendChild(aa);
    ad.appendChild(el("p", "muted small", T.adventStats(nf.format(ov.advent.members), nf.format(ov.advent.done))));
    ad.appendChild(el("h3", "rc-h3", T.greetings));
    var ul = el("ul", "fe-greet");
    IDS.forEach(function (id) { ul.appendChild(el("li", null, T.names[id] + " · " + nf.format(ov.greetings[id]))); });
    ad.appendChild(ul);
    forms.appendChild(ad);
    b.appendChild(forms);
  }

  function huntTab(b) {
    b.appendChild(el("h3", "rc-h3", T.hunt(ov.year)));
    var k = el("div", "kpis rc-kpis");
    kpi(k, T.kEggs, nf.format(ov.eggs.total)); kpi(k, T.kSpots, nf.format(ov.eggs.spots)); kpi(k, T.kImports, nf.format(ov.eggs.imports));
    kpi(k, T.kCandidates, nf.format(ov.eggs.candidates)); kpi(k, T.kCollected, nf.format(ov.eggs.collected)); kpi(k, T.kHunters, nf.format(ov.eggs.hunters));
    b.appendChild(k);
    var forms = el("div", "rc-forms fe-forms");

    var w = el("div", "rc-form");
    w.appendChild(el("h3", "rc-h3", T.window(fmtDay((ov.hunts.western || ov.hunt).from), fmtDay((ov.hunts.western || ov.hunt).to))));
    if (ov.hunts.orthodox) w.appendChild(el("p", "fe-state", T.orthodox(fmtDay(ov.hunts.orthodox.from), fmtDay(ov.hunts.orthodox.to))));
    w.appendChild(el("p", "muted small", T.windowLead));
    var st = field(w, T.fStart, "date", ov.hunt.start || ""), en = field(w, T.fEnd, "date", ov.hunt.end || "");
    var wa = el("div", "rc-acts"), ws = btn(wa, T.save, "primary");
    ws.addEventListener("click", async function () {
      if (!(await call("fetes_admin_set", { p_key: "egg_hunt_start", p_value: st.value || null }, ws))) return;
      await set("egg_hunt_end", en.value || null, ws);
    });
    if (ov.hunt.start || ov.hunt.end) {
      var wr = btn(wa, T.reset);
      wr.addEventListener("click", async function () {
        if (!(await call("fetes_admin_set", { p_key: "egg_hunt_start", p_value: null }, wr))) return;
        await set("egg_hunt_end", null, wr);
      });
    }
    w.appendChild(wa);
    w.appendChild(el("h3", "rc-h3", T.knobs));
    var acc = field(w, T.fAccuracy, "number", String(ov.accuracy), { min: "10", max: "100", step: "1", inputmode: "numeric" });
    var spd = field(w, T.fSpeed, "number", String(ov.speed), { min: "20", max: "300", step: "1", inputmode: "numeric" });
    var ka = el("div", "rc-acts"), ks = btn(ka, T.save, "primary");
    ks.addEventListener("click", async function () {
      var a = Number(acc.value), s = Number(spd.value);
      if (!Number.isInteger(a) || a < 10 || a > 100) { say(T.bad.number(10, 100), "err"); acc.focus(); return; }
      if (!Number.isInteger(s) || s < 20 || s > 300) { say(T.bad.number(20, 300), "err"); spd.focus(); return; }
      if (!(await call("fetes_admin_set", { p_key: "egg_max_accuracy_m", p_value: String(a) }, ks))) return;
      await set("egg_max_speed_kmh", s, ks);
    });
    w.appendChild(ka);
    forms.appendChild(w);

    var cov = el("div", "rc-form");
    cov.appendChild(el("h3", "rc-h3", T.regions));
    cov.appendChild(el("p", "muted small", T.placeLead));
    var pa = el("div", "rc-acts"), pl = btn(pa, T.place, "primary");
    pl.addEventListener("click", async function () {
      var r = await call("fetes_admin_eggs_place", { p_year: ov.year }, pl);
      if (r) { say(T.placed(nf.format(r.added || 0), nf.format(r.total || 0)), "ok"); await load(); }
    });
    cov.appendChild(pa);
    if (!ov.eggs.regions.length) cov.appendChild(el("p", "note", T.noRegions));
    else table(cov, [[T.colRegion], [T.colEggs, 1], [T.colHunters, 1]], ov.eggs.regions.map(function (r) {
      var tr = el("tr"), th = el("th", null, regionLabel(r.region, T));
      th.scope = "row"; tr.appendChild(th);
      tr.appendChild(el("td", "n", nf.format(r.eggs))); tr.appendChild(el("td", "n", nf.format(r.hunters)));
      return tr;
    }));
    forms.appendChild(cov);

    var im = el("div", "rc-form");
    im.appendChild(el("h3", "rc-h3", T.importTitle));
    im.appendChild(el("p", "muted small", T.importLead));
    var row = el("div", "fe-row");
    var lat = field(row, T.fLat, "number", "45.5019", { step: "any", min: "-85", max: "85" });
    var lon = field(row, T.fLon, "number", "-73.5674", { step: "any", min: "-180", max: "180" });
    var km = field(row, T.fKm, "number", "30", { step: "1", min: "1", max: "60", inputmode: "numeric" });
    im.appendChild(row);
    var cc = field(im, T.fCountry, "text", "CA", { maxlength: "2", autocomplete: "off", spellcheck: "false", "class": "input fe-cc" });
    var ia = el("div", "rc-acts"), go = btn(ia, T.search, "primary");
    if (found && found.length) {
      var ib = btn(ia, T.importBtn(nf.format(found.length)));
      ib.addEventListener("click", function () { var c = country(); if (c !== false) importPoints(found, c, ib, function () { found = null; }); });
    }
    im.appendChild(ia);
    go.addEventListener("click", async function () {
      var la = Number(lat.value), lo = Number(lon.value), r = Number(km.value);
      if (!isFinite(la) || Math.abs(la) > 85 || !isFinite(lo) || Math.abs(lo) > 180) { say(T.bad.number(-85, 85), "err"); lat.focus(); return; }
      if (!Number.isInteger(r) || r < 1 || r > 60) { say(T.bad.number(1, 60), "err"); km.focus(); return; }
      if (isWaiting(go) || !root.WNS) return;
      waiting(go, true);
      var bs = boxes(la, lo, r), all = [], osm = meta("wn-osm");
      try {
        for (var i = 0; i < bs.length; i++) {
          say(T.searching(i + 1, bs.length));
          var pts = await root.WNS.osmFetch(bs[i], { fetch: window.fetch.bind(window), mirrors: osm ? [osm] : null, timeout: 25000 });
          if (!pts) { say(T.osmFailed, "err"); return; }
          all = all.concat(pts);
        }
        found = eggPoints(all, la, lo, r);
        last = [T.found(nf.format(found.length)), "ok"];
        render();
      } finally { waiting(go, false); }
    });
    var paste = field(im, T.fPaste, "textarea", "", { rows: "4", spellcheck: "false", placeholder: "45.5088, -73.5878, Parc Jeanne-Mance\n46.8123, -71.2145" });
    var ta = el("div", "rc-acts"), it = btn(ta, T.importText);
    it.addEventListener("click", function () {
      var p = pointsFromText(paste.value);
      if (p.error) { say(p.error === "line" ? T.bad.line(p.line) : T.bad[p.error], "err"); paste.focus(); return; }
      var c = country(); if (c === false) return;
      importPoints(p.points, c, it, function () { paste.value = ""; });
    });
    im.appendChild(ta);
    /** The import's country (two letters, upper case), null when empty, false (said) when it isn't one. */
    function country() {
      var v = cc.value.trim().toUpperCase();
      if (!v) return null;
      if (!/^[A-Z]{2}$/.test(v)) { say(T.bad.country, "err"); cc.focus(); return false; }
      return v;
    }
    forms.appendChild(im);
    b.appendChild(forms);
  }

  async function importPoints(points, cc, b, after) {
    var added = 0, dup = 0, parts = chunks(points, POINTS_MAX);
    for (var i = 0; i < parts.length; i++) {
      var r = await call("fetes_admin_eggs_import", { p_points: parts[i], p_country: cc }, b);
      if (!r) return;
      added += r.added || 0; dup += r.duplicates || 0;
    }
    after();
    say(T.imported(nf.format(added), dup ? nf.format(dup) : ""), "ok");
    await load();
  }

  function boardTab(b) {
    b.appendChild(el("h3", "rc-h3", T.board(ov.year)));
    b.appendChild(el("p", "muted small rc-lead", T.boardLead));
    var sel = field(b, T.colRegion, "select");
    var o0 = el("option", null, T.world); o0.value = ""; sel.appendChild(o0);
    ov.eggs.regions.forEach(function (r) { var o = el("option", null, regionLabel(r.region, T)); o.value = r.region.key; sel.appendChild(o); });
    sel.value = where;
    sel.parentNode.classList.add("fe-where");
    sel.addEventListener("change", function () { where = sel.value; pick = null; load(); });
    if (lb && lb.denied) { b.appendChild(el("p", "note", T.forbidden)); return; }
    var rows = lb ? lb.rows : [];
    b.appendChild(el("p", "fe-state", lb && lb.final ? T.final : T.notFinal));
    if (!rows.length) { b.appendChild(el("p", "note", T.noRows)); return; }
    table(b, [[T.colRank, 1], [T.colName], [T.colEggs, 1], [T.colRegion], [T.colStrikes, 1], [T.colStatus], [""]], rows.map(function (r) {
      var tr = el("tr", r.dq ? "fe-dq" : null);
      tr.appendChild(el("td", "n", nf.format(r.rank)));
      var th = el("th", "rc-wrap", r.name || T.member); th.scope = "row"; tr.appendChild(th);
      tr.appendChild(el("td", "n", nf.format(r.eggs)));
      tr.appendChild(el("td", null, regionLabel(r.region, T)));
      tr.appendChild(el("td", "n" + (r.strikes ? " rc-error" : ""), nf.format(r.strikes)));
      var stt = el("td", "rc-wrap");
      stt.appendChild(el("span", "chip " + (r.dq ? "rc-failed" : r.flagged ? "rc-open" : "rc-shown"), r.dq ? T.dq : r.flagged ? T.flagged : T.ok));
      if (r.flagged && !r.dq) { stt.lastChild.title = T.flaggedHint; stt.appendChild(el("span", "muted small fe-reason", " " + T.flaggedHint)); }
      if (r.dq && r.reason) stt.appendChild(el("span", "muted small fe-reason", " " + r.reason));
      tr.appendChild(stt);
      var act = el("td");
      if (r.dq) {
        var re = btn(act, T.reinstate, "ghost small-btn");
        re.addEventListener("click", async function () {
          if (await call("fetes_admin_disqualify", { p_user: r.user, p_year: ov.year, p_on: false, p_reason: null }, re)) { say(T.done, "ok"); await load(); }
        });
      } else {
        var dq = btn(act, T.disqualify, "ghost small-btn rc-danger");
        dq.setAttribute("aria-pressed", String(!!pick && pick.user === r.user));
        dq.addEventListener("click", function () { pick = r; last = null; render(); });
      }
      tr.appendChild(act);
      return tr;
    }));
    if (pick) {
      var f = el("div", "rc-form fe-dq-form");
      f.appendChild(el("h3", "rc-h3", T.dqTitle(pick.name || T.member)));
      var why = field(f, T.fReason, "text", "", { maxlength: "200", autocomplete: "off" });
      var fa = el("div", "rc-acts"), ok = btn(fa, T.confirm, "primary");
      btn(fa, T.cancel).addEventListener("click", function () { pick = null; last = null; render(); });
      ok.addEventListener("click", async function () {
        if (Array.from(why.value.trim()).length < 3) { say(T.bad.reason, "err"); why.focus(); return; }
        if (await call("fetes_admin_disqualify", { p_user: pick.user, p_year: ov.year, p_on: true, p_reason: why.value.trim() }, ok)) { pick = null; say(T.done, "ok"); await load(); }
      });
      f.appendChild(fa);
      b.appendChild(f);
      setTimeout(function () { why.focus(); }, 0);
    }
  }

  // Admins only (the server checks again); once the console has drawn its first figures.
  function start() {
    if (inited || !A.admin || !A.admin()) return;
    inited = true;
    load();
  }
  document.addEventListener("wnc:render", start);
  // On a fast connection the first figures can be drawn before this script loads: catch up.
  if (root.WNC_PAGE && root.WNC_PAGE.data && root.WNC_PAGE.data()) start();
  if (A.demo) root.WNC_FETES = { open: function (k, region) { tab = k; where = region || ""; pick = null; last = null; return load(); },
                                 pick: function (i) { pick = lb && lb.rows[i] || null; last = null; render(); } };
})(this);

/*
 * Event and partner pages (e/ and p/): ?s=<slug>, or a link preview's own folder (e/<slug>/, its <body data-slug>,
 * written by .github/gen-share-pages.mjs). The page's kind is its own <body data-kind>. What the server sends is read
 * through the public reads (get_event_public, get_partner_public) with the site's publishable key and written with
 * textContent only; nothing from the address is written into the page, which only builds links from a slug that
 * passed WN.isSlug.
 */
(function () {
  "use strict";
  var WN = window.WN, P = window.WNP;
  // The only server this page talks to (also pinned by the page's CSP connect-src). The key is public by design, as on
  // the share pages (s/app.js): the server's grants and row-level security are what protect the data.
  var SERVER = "https://pkqsvlbiznrqxfckaxll.supabase.co";
  var PUBLISHABLE_KEY = "sb_publishable_Jw6cnMgupaVxupvltvUlPQ_mvwpiNVE";
  var KIND = document.body.getAttribute("data-kind") === "partner" ? "partner" : "event";

  // One table per app language (WN.LANGS). Functions get a name, a count or a time zone.
  var STRINGS = {
    en: {
      event: { eyebrow: "Event", title: "An event on WaterNow", text: "Its dates, route and water stations are in the app." },
      partner: { eyebrow: "Partner", title: "A WaterNow partner", text: "Their page, places and events are in the app." },
      open: "Open in WaterNow", badTitle: "Link incomplete", badText: "This link is damaged. Ask for it again.",
      getTitle: "No WaterNow yet?", getText: "Free drinking water near you, on a map the community keeps up to date.",
      get: "Get WaterNow", foot: "No trackers, no cookies.",
      kinds: { marathon: "Marathon", race: "Race", pilgrimage: "Pilgrimage", hike: "Hike", festival: "Festival", other: "Event",
        refill_place: "Free refill place", event_organizer: "Event organizer", sponsor: "Sponsor", city: "City or organization" },
      route: "Route and water stations", sketch: "Sketch of the route with its water stations", allEvent: "During the whole event",
      about: "About", calendar: "Add to calendar", upcoming: "Upcoming events",
      gone: { event: "This event isn't available", partner: "This page isn't available" },
      goneText: { event: "It may have been removed or suspended, or the link is wrong.", partner: "It may be suspended, or it no longer exists." },
      maintenance: "WaterNow is being updated. The latest details will be back in a moment.",
      localTime: function (tz) { return "Local time · " + tz; },
      organizedBy: function (name) { return "Organized by " + name; },
      presentedBy: function (name) { return "Presented by " + name; },
      station: function (n) { return "Station " + n; },
      places: function (n) { return n === 1 ? "1 water point" : n + " water points"; }
    },
    fr: {
      event: { eyebrow: "Événement", title: "Un événement sur WaterNow", text: "Ses dates, son parcours et ses stations d'eau sont dans l'app." },
      partner: { eyebrow: "Partenaire", title: "Un partenaire de WaterNow", text: "Sa page, ses lieux et ses événements sont dans l'app." },
      open: "Ouvrir dans WaterNow", badTitle: "Lien incomplet", badText: "Ce lien est abîmé. Redemande-le.",
      getTitle: "Pas encore WaterNow ?", getText: "De l'eau potable gratuite près de toi, sur une carte que la communauté tient à jour.",
      get: "Obtenir WaterNow", foot: "Aucun traceur, aucun cookie.",
      kinds: { marathon: "Marathon", race: "Course", pilgrimage: "Pèlerinage", hike: "Randonnée", festival: "Festival", other: "Événement",
        refill_place: "Lieu de remplissage gratuit", event_organizer: "Organisateur d'événements", sponsor: "Commanditaire", city: "Ville ou organisme" },
      route: "Parcours et stations d'eau", sketch: "Croquis du parcours avec ses stations d'eau", allEvent: "Pendant tout l'événement",
      about: "À propos", calendar: "Ajouter au calendrier", upcoming: "Événements à venir",
      gone: { event: "Cet événement n'est pas disponible", partner: "Cette page n'est pas disponible" },
      goneText: { event: "Il a peut-être été retiré ou suspendu, ou le lien est erroné.", partner: "Elle est peut-être suspendue, ou elle n'existe plus." },
      maintenance: "WaterNow est en cours de mise à jour. Les dernières infos reviennent dans un moment.",
      localTime: function (tz) { return "Heure locale · " + tz; },
      organizedBy: function (name) { return "Organisé par " + name; },
      presentedBy: function (name) { return "Présenté par " + name; },
      station: function (n) { return "Station " + n; },
      places: function (n) { return n === 1 ? "1 point d'eau" : n + " points d'eau"; }
    },
    es: {
      event: { eyebrow: "Evento", title: "Un evento en WaterNow", text: "Sus fechas, su recorrido y sus estaciones de agua están en la app." },
      partner: { eyebrow: "Socio", title: "Un socio de WaterNow", text: "Su página, sus lugares y sus eventos están en la app." },
      open: "Abrir en WaterNow", badTitle: "Enlace incompleto", badText: "Este enlace está dañado. Pídelo de nuevo.",
      getTitle: "¿Aún no tienes WaterNow?", getText: "Agua potable gratis cerca de ti, en un mapa que la comunidad mantiene al día.",
      get: "Consigue WaterNow", foot: "Sin rastreadores ni cookies.",
      kinds: { marathon: "Maratón", race: "Carrera", pilgrimage: "Peregrinación", hike: "Senderismo", festival: "Festival", other: "Evento",
        refill_place: "Lugar de relleno gratis", event_organizer: "Organizador de eventos", sponsor: "Patrocinador", city: "Ciudad u organismo" },
      route: "Recorrido y estaciones de agua", sketch: "Croquis del recorrido con sus estaciones de agua", allEvent: "Durante todo el evento",
      about: "Acerca de", calendar: "Añadir al calendario", upcoming: "Próximos eventos",
      gone: { event: "Este evento no está disponible", partner: "Esta página no está disponible" },
      goneText: { event: "Puede que se haya retirado o suspendido, o el enlace es incorrecto.", partner: "Puede que esté suspendida o que ya no exista." },
      maintenance: "WaterNow se está actualizando. Los últimos detalles volverán en un momento.",
      localTime: function (tz) { return "Hora local · " + tz; },
      organizedBy: function (name) { return "Organizado por " + name; },
      presentedBy: function (name) { return "Presentado por " + name; },
      station: function (n) { return "Estación " + n; },
      places: function (n) { return n === 1 ? "1 punto de agua" : n + " puntos de agua"; }
    },
    de: {
      event: { eyebrow: "Veranstaltung", title: "Eine Veranstaltung auf WaterNow", text: "Termine, Strecke und Wasserstationen findest du in der App." },
      partner: { eyebrow: "Partner", title: "Ein Partner von WaterNow", text: "Seite, Orte und Veranstaltungen findest du in der App." },
      open: "In WaterNow öffnen", badTitle: "Link unvollständig", badText: "Dieser Link ist beschädigt. Lass ihn dir noch einmal schicken.",
      getTitle: "Noch kein WaterNow?", getText: "Kostenloses Trinkwasser in deiner Nähe, auf einer Karte, die die Community aktuell hält.",
      get: "WaterNow holen", foot: "Keine Tracker, keine Cookies.",
      kinds: { marathon: "Marathon", race: "Lauf", pilgrimage: "Pilgerweg", hike: "Wanderung", festival: "Festival", other: "Veranstaltung",
        refill_place: "Kostenloser Nachfüllort", event_organizer: "Veranstalter", sponsor: "Sponsor", city: "Stadt oder Organisation" },
      route: "Strecke und Wasserstationen", sketch: "Skizze der Strecke mit ihren Wasserstationen", allEvent: "Während der ganzen Veranstaltung",
      about: "Über", calendar: "Zum Kalender hinzufügen", upcoming: "Kommende Veranstaltungen",
      gone: { event: "Diese Veranstaltung ist nicht verfügbar", partner: "Diese Seite ist nicht verfügbar" },
      goneText: { event: "Sie wurde vielleicht entfernt oder gesperrt, oder der Link ist falsch.", partner: "Sie ist vielleicht gesperrt oder existiert nicht mehr." },
      maintenance: "WaterNow wird gerade aktualisiert. Die neuesten Details sind gleich wieder da.",
      localTime: function (tz) { return "Ortszeit · " + tz; },
      organizedBy: function (name) { return "Veranstaltet von " + name; },
      presentedBy: function (name) { return "Präsentiert von " + name; },
      station: function (n) { return "Station " + n; },
      places: function (n) { return n === 1 ? "1 Wasserstelle" : n + " Wasserstellen"; }
    },
    pt: {
      event: { eyebrow: "Evento", title: "Um evento no WaterNow", text: "As datas, o percurso e os postos de água estão no app." },
      partner: { eyebrow: "Parceiro", title: "Um parceiro do WaterNow", text: "A página, os locais e os eventos estão no app." },
      open: "Abrir no WaterNow", badTitle: "Link incompleto", badText: "Este link está corrompido. Peça de novo.",
      getTitle: "Ainda não tem o WaterNow?", getText: "Água potável grátis perto de você, em um mapa que a comunidade mantém atualizado.",
      get: "Baixe o WaterNow", foot: "Sem rastreadores, sem cookies.",
      kinds: { marathon: "Maratona", race: "Corrida", pilgrimage: "Peregrinação", hike: "Caminhada", festival: "Festival", other: "Evento",
        refill_place: "Local de reabastecimento grátis", event_organizer: "Organizador de eventos", sponsor: "Patrocinador", city: "Cidade ou organização" },
      route: "Percurso e postos de água", sketch: "Esboço do percurso com seus postos de água", allEvent: "Durante todo o evento",
      about: "Sobre", calendar: "Adicionar à agenda", upcoming: "Próximos eventos",
      gone: { event: "Este evento não está disponível", partner: "Esta página não está disponível" },
      goneText: { event: "Ele pode ter sido removido ou suspenso, ou o link está errado.", partner: "Ela pode estar suspensa ou não existir mais." },
      maintenance: "O WaterNow está sendo atualizado. Os detalhes mais recentes voltam daqui a pouco.",
      localTime: function (tz) { return "Hora local · " + tz; },
      organizedBy: function (name) { return "Organizado por " + name; },
      presentedBy: function (name) { return "Apresentado por " + name; },
      station: function (n) { return "Posto " + n; },
      places: function (n) { return n === 1 ? "1 ponto de água" : n + " pontos de água"; }
    },
    ja: {
      event: { eyebrow: "イベント", title: "WaterNowのイベント", text: "日程、コース、給水所はアプリで確認できます。" },
      partner: { eyebrow: "パートナー", title: "WaterNowのパートナー", text: "ページ、場所、イベントはアプリで確認できます。" },
      open: "WaterNowで開く", badTitle: "リンクが不完全です", badText: "このリンクは壊れています。もう一度送ってもらってください。",
      getTitle: "WaterNowをまだ使っていませんか？", getText: "近くの無料の飲み水を、コミュニティが更新し続けるマップで探せます。",
      get: "WaterNowを入手", foot: "トラッカーもCookieも使っていません。",
      kinds: { marathon: "マラソン", race: "レース", pilgrimage: "巡礼", hike: "ハイキング", festival: "フェスティバル", other: "イベント",
        refill_place: "無料給水スポット", event_organizer: "イベント主催者", sponsor: "スポンサー", city: "自治体・団体" },
      route: "コースと給水所", sketch: "給水所の入ったコースの略図", allEvent: "イベント期間中ずっと",
      about: "概要", calendar: "カレンダーに追加", upcoming: "開催予定のイベント",
      gone: { event: "このイベントは利用できません", partner: "このページは表示できません" },
      goneText: { event: "削除または停止されたか、リンクが正しくない可能性があります。", partner: "停止中か、すでに存在しない可能性があります。" },
      maintenance: "WaterNowは現在アップデート中です。最新の情報はまもなく表示されます。",
      localTime: function (tz) { return "現地時間 · " + tz; },
      organizedBy: function (name) { return "主催：" + name; },
      presentedBy: function (name) { return "提供：" + name; },
      station: function (n) { return "給水所 " + n; },
      places: function (n) { return "給水スポット " + n + "か所"; }
    },
    ro: {
      event: { eyebrow: "Eveniment", title: "Un eveniment pe WaterNow", text: "Datele, traseul și stațiile de apă sunt în aplicație." },
      partner: { eyebrow: "Partener", title: "Un partener WaterNow", text: "Pagina, locurile și evenimentele lui sunt în aplicație." },
      open: "Deschide în WaterNow", badTitle: "Link incomplet", badText: "Acest link este deteriorat. Cere-l din nou.",
      getTitle: "Nu ai încă WaterNow?", getText: "Apă potabilă gratuită lângă tine, pe o hartă pe care comunitatea o ține la zi.",
      get: "Descarcă WaterNow", foot: "Fără trackere, fără cookie-uri.",
      kinds: { marathon: "Maraton", race: "Cursă", pilgrimage: "Pelerinaj", hike: "Drumeție", festival: "Festival", other: "Eveniment",
        refill_place: "Loc de umplere gratuită", event_organizer: "Organizator de evenimente", sponsor: "Sponsor", city: "Oraș sau organizație" },
      route: "Traseu și stații de apă", sketch: "Schița traseului cu stațiile lui de apă", allEvent: "Pe toată durata evenimentului",
      about: "Despre", calendar: "Adaugă în calendar", upcoming: "Evenimente viitoare",
      gone: { event: "Acest eveniment nu este disponibil", partner: "Această pagină nu este disponibilă" },
      goneText: { event: "Poate a fost eliminat sau suspendat, sau linkul este greșit.", partner: "Poate fi suspendată sau nu mai există." },
      maintenance: "WaterNow se actualizează. Cele mai noi detalii revin în curând.",
      localTime: function (tz) { return "Ora locală · " + tz; },
      organizedBy: function (name) { return "Organizat de " + name; },
      presentedBy: function (name) { return "Prezentat de " + name; },
      station: function (n) { return "Stația " + n; },
      // 1 punct, 2 puncte, 20 de puncte (Romanian puts "de" after 20-99 and round hundreds, as the app does).
      places: function (n) { return n === 1 ? "1 punct de apă" : n + (n % 100 >= 20 || n % 100 === 0 ? " de puncte de apă" : " puncte de apă"); }
    }
  };
  var lang = WN.lang(WN.browserLangs(navigator));
  var T = STRINGS[lang];
  var K = T[KIND];
  document.documentElement.lang = lang;

  var $ = function (id) { return document.getElementById(id); };
  var text = function (id, value) { $(id).textContent = value; };
  var show = function (id, on) { $(id).classList.toggle("hidden", !on); };
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  text("eyebrow", K.eyebrow); text("open", T.open);
  text("badTitle", T.badTitle); text("badText", T.badText);
  text("getTitle", T.getTitle); text("getText", T.getText); text("get", T.get); text("foot", T.foot);
  // A link preview's folder already holds the name: only the generic page starts from the generic words.
  var mine = document.body.getAttribute("data-slug");
  if (!mine) { text("title", K.title); text("text", K.text); document.title = K.title; }

  var slug = WN.isSlug(mine) ? mine : WN.parseSlug(location.search);
  if (!slug) {
    show("page", false);
    show("bad", true);
    return;
  }
  $("open").href = WN.pageAppLink(KIND, slug);
  // The site's root: a preview's folder (e/<slug>/) is one level deeper than e/.
  var ROOT = new URL(mine ? "../../" : "../", location.href).href;

  function fact(value) {
    var li = document.createElement("li");
    li.textContent = value;
    $("facts").append(li);
    show("facts", true);
  }

  // A cover or a logo: read with the key (the bucket is private; the server's policy lets anyone read a visible
  // page's current images), shown from memory.
  function image(name, img) {
    if (!name) return;
    fetch(SERVER + "/storage/v1/object/authenticated/partner-media/" + name, {
      headers: { apikey: PUBLISHABLE_KEY }, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer"
    })
      .then(function (r) { return r.ok ? r.blob() : null; })
      .then(function (b) {
        if (!b || !/^image\/(jpeg|png|webp)$/.test(b.type)) return;
        img.src = URL.createObjectURL(b);
        img.classList.remove("hidden");
      })
      .catch(function () {});
  }

  var SVG = "http://www.w3.org/2000/svg";
  function svg(tag, attrs, parent) {
    var el = document.createElementNS(SVG, tag);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    parent.append(el);
    return el;
  }

  function event(o) {
    var name = P.text(o.name, 80) || K.title;
    text("title", name);
    document.title = name + " · WaterNow";
    if (own(T.kinds, o.kind)) text("eyebrow", T.kinds[o.kind]);
    var tagline = P.text(o.tagline, 100);
    text("text", tagline);
    show("text", !!tagline);
    var when = P.dates(o.starts_at, o.ends_at, o.timezone, lang);
    if (when) fact(when);
    if (when && P.zone(o.timezone) !== "UTC") fact(T.localTime(P.zone(o.timezone)));
    var by = P.text(o.organizer && o.organizer.name, 80), with_ = P.text(o.sponsor && o.sponsor.name, 80);
    if (by) fact(T.organizedBy(by));
    if (with_) fact(T.presentedBy(with_));
    image(P.mediaName(o.cover, "cover"), $("cover"));

    var stations = Array.isArray(o.stations) ? o.stations.slice(0, 60) : [];
    var sk = P.sketch(o.route, stations, 320, 200, 16);
    if (sk) {
      var box = $("sketch");
      box.setAttribute("aria-label", T.sketch);
      if (sk.line) svg("polyline", { points: sk.line, "class": "route" }, box);
      sk.stops.forEach(function (p, i) {
        if (!p) return;
        var g = svg("g", { "class": "stop" }, box);
        svg("circle", { cx: p[0], cy: p[1], r: 9 }, g);
        svg("text", { x: p[0], y: p[1] + 3.5, "text-anchor": "middle" }, g).textContent = String(i + 1);
      });
      show("sketch", true);
    }
    stations.forEach(function (s, i) {
      var li = document.createElement("li"), n = document.createElement("span"), body = document.createElement("span");
      var label = document.createElement("strong"), when = document.createElement("span");
      n.className = "num"; n.textContent = String(i + 1);
      label.textContent = P.text(s && s.name, 60) || T.station(i + 1);
      when.className = "hours"; when.textContent = P.hours(s, o, lang) || T.allEvent;
      body.append(label, when);
      li.append(n, body);
      $("stations").append(li);
    });
    text("routeTitle", T.route);
    show("route", !!sk || stations.length > 0);

    var about = P.text(o.description, 2000, true);
    text("aboutTitle", T.about);
    text("description", about);
    show("about", !!about);

    var cal = P.ics({ slug: slug, name: name, tagline: tagline, starts_at: o.starts_at, ends_at: o.ends_at }, ROOT + "e/?s=" + slug, Date.now());
    if (cal) {
      $("ics").href = URL.createObjectURL(new Blob([cal], { type: "text/calendar" }));
      $("ics").download = slug + ".ics";
      text("ics", T.calendar);
      show("ics", true);
    }
  }

  function partner(o) {
    var name = P.text(o.name, 80) || K.title;
    text("title", name);
    document.title = name + " · WaterNow";
    if (own(T.kinds, o.kind)) text("eyebrow", T.kinds[o.kind]);
    var tagline = P.text(o.tagline, 100);
    text("text", tagline);
    show("text", !!tagline);
    image(P.mediaName(o.logo, "logo"), $("logo"));
    var n = Number(o.places);
    if (Number.isInteger(n) && n > 0) fact(T.places(n));
    var events = (Array.isArray(o.events) ? o.events : []).filter(function (e) { return e && WN.isSlug(e.slug); }).slice(0, 20);
    events.forEach(function (e) {
      var li = document.createElement("li"), a = document.createElement("a"), when = document.createElement("span");
      a.href = ROOT + "e/?s=" + e.slug;
      a.textContent = P.text(e.name, 80) || T.kinds.other;
      when.className = "muted";
      when.textContent = P.dates(e.starts_at, e.ends_at, e.timezone, lang);
      a.append(when);
      li.append(a);
      $("events").append(li);
    });
    text("upcoming", T.upcoming);
    show("upcomingCard", events.length > 0);
  }

  function gone() {
    text("title", T.gone[KIND]);
    text("text", T.goneText[KIND]);
    show("text", true);
    document.title = "WaterNow";
  }

  // One read; while WaterNow is being updated (HTTP 503) one short line says so and it tries again each minute for a
  // while. Any other failure, the read limit included, leaves the page as it is (Open in WaterNow still works).
  function load(tries) {
    fetch(SERVER + "/rest/v1/rpc/" + (KIND === "partner" ? "get_partner_public" : "get_event_public"), {
      method: "POST",
      headers: { apikey: PUBLISHABLE_KEY, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ p_slug: slug }),
      credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer"
    })
      .then(function (r) {
        show("note", WN.isMaintenance(r.status));
        if (WN.isMaintenance(r.status)) {
          text("note", T.maintenance);
          if (tries < 10) setTimeout(function () { load(tries + 1); }, 60000);
          return undefined;
        }
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (o) {
        if (o === undefined) return;
        if (!o || typeof o !== "object" || Array.isArray(o)) gone();
        else if (KIND === "partner") partner(o);
        else event(o);
      })
      .catch(function () {});
  }
  load(0);
})();

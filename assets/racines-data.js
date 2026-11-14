/*
 * WaterNow Racines et Plus (docs/19_RACINES_ET_PLUS.md, section 90): the plain parts of its public pages (racines/,
 * racines/merci/, racines/entreprises/), shared by the pages (window.WNR) and their node test (module.exports). Whatever
 * the server sends is checked here again: these return plain values, and the pages write them with textContent only.
 * Words: « un arbre planté par Tree-Nation, certificat à l'appui », never the climate claims docs/19 forbids (the test checks).
 */
(function (root) {
  "use strict";
  var P = typeof module === "object" && module.exports ? require("./page-data.js") : root.WNP;

  // The prices (cents, CAD): the year is 11 months (« 1 mois offert »). The app's checkout charges them; these are words.
  var PRICES = { racines: { month: 325, year: 3575 }, plus: { month: 599, year: 6589 } };
  var LAUNCH = "2026-11"; // the first month with a report: the month picker starts there
  var APP_LINK = "waternow://racines"; // the app's Racines and Plus screen (the app checks it again)

  function count(v) { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 1e9 ? v : null; }

  /** A link a visitor may follow (a project, the certificates, a company): https only, no credentials; else null. */
  function link(v) {
    if (typeof v !== "string" || v.length > 500) return null;
    try {
      var u = new URL(v);
      return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
    } catch (e) { return null; }
  }

  /**
   * A company's logo, only from WaterNow's own public storage (the server's origin, /storage/v1/object/public/…): a page
   * never calls a third party (no tracker by the back door) and img-src stays one origin. Else null: its initial shows.
   */
  function logo(v, api, base) {
    if (typeof v !== "string" || v.length > 500 || typeof api !== "string") return null; // api "": the preview's same origin
    try {
      var u = new URL(v, base), a = new URL(api, base);
      return u.origin === a.origin && (u.protocol === "https:" || u.hostname === "127.0.0.1") && !u.username &&
        u.pathname.indexOf("/storage/v1/object/public/") === 0 && !/\.\./.test(u.pathname) ? u.href : null;
    } catch (e) { return null; }
  }

  function monthOf(v) {
    var m = typeof v === "string" ? /^(\d{4})-(\d{2})(?:-\d{2})?/.exec(v) : null;
    return m && +m[2] >= 1 && +m[2] <= 12 ? m[1] + "-" + m[2] : null;
  }

  /** A country as the server sends it: an ISO code ("MG") in the reader's language, else its name, cleaned. */
  function country(v, lang) {
    if (typeof v === "string" && /^[A-Za-z]{2}$/.test(v) && typeof Intl.DisplayNames === "function") {
      try { return new Intl.DisplayNames([lang], { type: "region" }).of(v.toUpperCase()) || v.toUpperCase(); } catch (e) { /* the name below */ }
    }
    return P.text(v, 60);
  }

  /**
   * racines_public_report's answer, cleaned: {month "YYYY-MM", planted, pending, total (live trees planted since the
   * start, any month), members (a multiple of 5 from 10, else null), projects [{name, country, trees, url}], certificates,
   * commons (cents)}; null when it isn't one. No name, no id. Without p_month the server answers the previous month (the
   * one the last lot planted); live Stripe data only.
   */
  function report(o, lang) {
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    var m = count(o.members_count_rounded);
    return {
      month: monthOf(o.month), planted: count(o.trees_planted) || 0, pending: count(o.trees_pending) || 0, total: count(o.trees_total) || 0,
      members: m !== null && m >= 10 && m % 5 === 0 ? m : null,
      projects: (Array.isArray(o.projects) ? o.projects : []).filter(function (p) { return p && typeof p === "object" && P.text(p.name, 80); })
        .slice(0, 20).map(function (p) { return { name: P.text(p.name, 80), country: country(p.country, lang), trees: count(p.trees), url: link(p.url) }; }),
      certificates: link(o.certificates_url), commons: count(o.commons_cents) || 0
    };
  }

  /** racines_thanks's names, cleaned, without doubles, in the reader's alphabetical order (no rank, no count). */
  function thanks(list, lang) {
    var seen = {}, out = [];
    (Array.isArray(list) ? list : []).slice(0, 5000).forEach(function (o) {
      var n = o && typeof o === "object" ? P.text(o.name, 40) : "";
      if (n && !seen[n]) { seen[n] = true; out.push(n); }
    });
    return out.sort(new Intl.Collator(lang, { sensitivity: "base" }).compare);
  }

  /** racines_companies's answer, cleaned, in the server's order: [{name, trees, logo, url, since "YYYY-MM"}]. */
  function companies(list, api, base) {
    return (Array.isArray(list) ? list : []).filter(function (c) { return c && typeof c === "object" && P.text(c.name, 80); })
      .slice(0, 200).map(function (c) { return { name: P.text(c.name, 80), trees: count(c.trees), logo: logo(c.logo_url, api, base), url: link(c.url), since: monthOf(c.since) }; });
  }

  /** "?m=YYYY-MM": a month from [since] (LAUNCH) to [now]'s, else null (the page then shows the current month). */
  function monthParam(search, now, since) {
    if (typeof search !== "string" || search.length > 2048) return null;
    var v;
    try { v = new URLSearchParams(search).get("m"); } catch (e) { return null; }
    var m = v && /^\d{4}-\d{2}$/.test(v) ? monthOf(v) : null;
    return m && m >= (since || LAUNCH) && m <= ym(now) ? m : null;
  }

  function ym(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }

  /** The months from [since] to [now]'s, newest first ("YYYY-MM"), 60 at most. */
  function months(since, now) {
    var out = [], y = now.getFullYear(), m = now.getMonth() + 1;
    for (var k = ym(now); k >= since && out.length < 60; k = y + "-" + String(m).padStart(2, "0")) {
      out.push(k);
      if (--m === 0) { m = 12; y--; }
    }
    return out;
  }

  /** "novembre 2026", "November 2026", "2026年11月" for "YYYY-MM". */
  function monthName(m, lang) {
    return new Intl.DateTimeFormat(lang, { month: "long", year: "numeric", timeZone: "UTC" }).format(Date.parse(m + "-01T00:00:00Z"));
  }

  /** "3,25 $" / "$3.25" / "$500": Canadian dollars in [lang], cents only when there are some. */
  function money(c, lang) {
    var whole = c % 100 === 0;
    return new Intl.NumberFormat(lang, { style: "currency", currency: "CAD", currencyDisplay: "narrowSymbol",
      minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(c / 100);
  }

  /** A contact address, or null: the legal pages' contact (scripts/legal-fill.js writes it in racines/entreprises/). */
  function email(v) { return typeof v === "string" && /^[^\s@<>"?&]+@[^\s@<>"?&]+\.[a-z]{2,}$/i.test(v) ? v : null; }

  /** Stripe Checkout's way back (billing-checkout: racines/succes/?k=subscription|trees|pack): what was bought, or null. */
  function checkoutKind(search) {
    if (typeof search !== "string" || search.length > 2048) return null;
    var k;
    try { k = new URLSearchParams(search).get("k"); } catch (e) { return null; }
    return k === "subscription" || k === "trees" || k === "pack" ? k : null;
  }

  // Romanian puts "de" between a number and its noun from 20 on (20 de, 101, 120 de), as the app does.
  var roDe = function (n) { return n % 100 >= 20 || (n > 0 && n % 100 === 0) ? " de" : ""; };

  // One table per app language (WN.LANGS). `ids`: each page's fixed words by element id (a page fills those it has).
  // Functions take the value already formatted (s) and, where a language needs it, the number itself (n), or a month (m).
  var STRINGS = {
    en: {
      demo: "Demo data", docReport: "WaterNow Racines and Plus", docThanks: "Thanks to… · WaterNow Racines", docCompanies: "Companies plant trees with WaterNow",
      ids: {
        title: "WaterNow Racines and Plus",
        lead: "A real tree planted every month in your name by Tree-Nation, certificate included. And a hand for the Community Fountain.",
        free: "Everything useful stays free: the map, search, directions, offline maps, adding points, safety and accessibility. No existing feature ever becomes paid.",
        racinesName: "Racines", plusName: "Plus",
        ri1: "1 tree planted every month by Tree-Nation", ri2: "Your forest in the app, each tree with its certificate",
        ri3: "The Racines badge, discreet, only if you want it", ri4: "3 app icons", ri5: "Your share for the Community Fountain",
        pi1: "2 trees planted every month", pi2: "Everything in Racines", pi3: "Themes: map, pins, widget and every app icon",
        pi4: "WaterNow Wrapped, every December", pi5: "Ride extras: elevation, segments, GPX export with your water stops",
        subscribe: "Subscribe in the app", get: "Get WaterNow",
        subNote: "On Android for now; iPhone will follow. Secure payment by Stripe, and you cancel in one tap, whenever you like.",
        extra: "Want to plant more? Extra trees, one at a time or in packs, in the app.",
        moneyTitle: "Where the money goes",
        moneyTrees: "Every tree is planted by Tree-Nation in a real reforestation project, with a public certificate.",
        moneyCommons: "10% of the margin goes to the Community Fountain: the community funds a real bottle refill station, in a place it chooses.",
        moneyRest: "The rest keeps WaterNow going: servers, the map and new features, with no ads and no trackers.",
        commonsLink: "See the Community Fountain",
        reportTitle: "Monthly report", monthLabel: "Month", projectsTitle: "The projects", certs: "See the certificates on Tree-Nation",
        thanksLink: "Thanks to…", thanksSub: "The members who chose to show their name",
        companiesLink: "Companies", companiesSub: "Plant trees in bulk with WaterNow",
        thanksTitle: "Thanks to…",
        thanksLead: "The Racines and Plus members who chose to show their name here, in alphabetical order. Thank you for growing trees and the Community Fountain.",
        thanksHow: "A member? You can show your name here from the Racines screen in the app.",
        back: "Racines and Plus",
        coTitle: "Plant trees with WaterNow, as a company",
        coLead: "Trees in bulk, planted by Tree-Nation in your company's name, for your team or your customers, with their certificates.",
        howTitle: "How it works",
        step1: "You choose how many trees: 100, 500 or more.", step2: "We agree on the price: it depends on the quantity (on request).",
        step3: "Tree-Nation plants them; each tree has its public certificate.", step4: "If you like, your company shows on this page, with its logo and its trees.",
        coPrice: "For example: 500 trees. Price on request.", coCommons: "10% of the margin also goes to the Community Fountain.",
        contactTitle: "Write to us", listTitle: "They plant trees with WaterNow",
        foot: "No trackers, no cookies."
      },
      perMonth: "/ month", perYear: function (s) { return "or " + s + " a year · 1 month free"; },
      planted: function (s, n) { return n === 1 ? "tree planted" : "trees planted"; }, pending: "waiting to be planted", commonsFig: "for the Community Fountain",
      line: function (m, s, n) { return "The community planted " + (n === 1 ? "1 tree" : s + " trees") + " in " + m + "."; },
      pendingLine: function (m, s, n) { return "In " + m + ", " + (n === 1 ? "1 tree is" : s + " trees are") + " waiting for the next planting: Tree-Nation plants them together, once a month."; },
      none: function (m) { return "No trees in " + m + "."; },
      members: function (s) { return "About " + s + " Racines and Plus members."; },
      total: function (s, n) { return "Since the start: " + (n === 1 ? "1 tree" : s + " trees") + " planted."; },
      trees: function (s, n) { return n === 1 ? "1 tree" : s + " trees"; },
      soon: "The first report is coming soon.", soonText: "Every month, here: the trees the community planted, the projects and the certificates.",
      offline: "Couldn't load the report.", retry: "Try again", maintenance: "WaterNow is being updated. This page will be back in a moment.",
      thanksSoon: "The “Thanks to…” page opens soon.", thanksEmpty: "No names yet.", thanksOffline: "Couldn't load the names.",
      since: function (d) { return "since " + d; }, coEmpty: "No company shown yet.", coOffline: "Couldn't load the list.",
      contact: "To plant trees with WaterNow, write to us at {email}.",
      contactSoon: "To plant trees with WaterNow, write to us: our email address is coming to this page very soon.",
      firstTrees: "The first trees will be planted on the 1st of next month.",
      docOk: "Thank you · WaterNow Racines", okTitle: "Thank you!", okOpen: "Open WaterNow to see your forest.", forestBtn: "Open Your forest",
      okText: { subscription: "Your subscription is active. This month's trees will be planted by Tree-Nation at the start of next month, certificate included.",
        trees: "Your trees will be planted by Tree-Nation at the start of next month, certificate included.",
        pack: "Your pack of trees will be planted by Tree-Nation at the start of next month, certificate included.",
        other: "Thank you for planting trees with WaterNow." },
      okReceipt: "Stripe sends you the receipt by email.", okManage: "You can manage or cancel your subscription in one tap from the Racines screen in the app."
    },
    fr: {
      demo: "Données de démonstration", docReport: "WaterNow Racines et Plus", docThanks: "Merci à… · WaterNow Racines", docCompanies: "Les entreprises plantent avec WaterNow",
      ids: {
        title: "WaterNow Racines et Plus",
        lead: "Un vrai arbre planté chaque mois à ton nom par Tree-Nation, certificat à l'appui. Et un coup de main à la Fontaine commune.",
        free: "Tout ce qui est utile reste gratuit : la carte, la recherche, le guidage, les cartes hors ligne, l'ajout de points, la sécurité et l'accessibilité. Aucune fonction existante ne devient payante.",
        racinesName: "Racines", plusName: "Plus",
        ri1: "1 arbre planté chaque mois par Tree-Nation", ri2: "Ta forêt dans l'app, chaque arbre avec son certificat",
        ri3: "Le badge Racines, discret, seulement si tu le veux", ri4: "3 icônes d'app", ri5: "Ta part pour la Fontaine commune",
        pi1: "2 arbres plantés chaque mois", pi2: "Tout ce qu'il y a dans Racines", pi3: "Les thèmes : carte, épingles, widget et toutes les icônes d'app",
        pi4: "WaterNow Wrapped, chaque décembre", pi5: "Les extras de sortie : dénivelé, segments, export GPX avec tes arrêts eau",
        subscribe: "S'abonner dans l'app", get: "Obtenir WaterNow",
        subNote: "Sur Android pour l'instant ; l'iPhone suivra. Paiement sécurisé par Stripe, et tu annules en une touche, quand tu veux.",
        extra: "Envie d'en planter plus ? Des arbres en plus, à l'unité ou en paquets, dans l'app.",
        moneyTitle: "Où va l'argent",
        moneyTrees: "Chaque arbre est planté par Tree-Nation dans un vrai projet de reboisement, avec un certificat public.",
        moneyCommons: "10 % de la marge va à la Fontaine commune : la communauté finance une vraie station de remplissage, à l'endroit qu'elle choisit.",
        moneyRest: "Le reste fait vivre WaterNow : les serveurs, la carte et les nouvelles fonctions, sans pub ni traceur.",
        commonsLink: "Voir la Fontaine commune",
        reportTitle: "Le bilan du mois", monthLabel: "Mois", projectsTitle: "Les projets", certs: "Voir les certificats chez Tree-Nation",
        thanksLink: "Merci à…", thanksSub: "Les membres qui ont choisi d'afficher leur nom",
        companiesLink: "Entreprises", companiesSub: "Planter des arbres en gros avec WaterNow",
        thanksTitle: "Merci à…",
        thanksLead: "Les membres de Racines et Plus qui ont choisi d'afficher leur nom ici, en ordre alphabétique. Merci de faire pousser des arbres et la Fontaine commune.",
        thanksHow: "Tu es membre ? Tu peux afficher ton nom ici depuis l'écran Racines de l'app.",
        back: "Racines et Plus",
        coTitle: "Planter des arbres avec WaterNow, en entreprise",
        coLead: "Des arbres en gros, plantés par Tree-Nation au nom de ton entreprise, pour ton équipe ou tes clients, avec leurs certificats.",
        howTitle: "Comment ça marche",
        step1: "Tu choisis le nombre d'arbres : 100, 500 ou plus.", step2: "On s'entend sur le prix : il dépend de la quantité (sur demande).",
        step3: "Tree-Nation les plante ; chaque arbre a son certificat public.", step4: "Si tu le veux, ton entreprise apparaît sur cette page, avec son logo et ses arbres.",
        coPrice: "Par exemple : 500 arbres. Prix sur demande.", coCommons: "10 % de la marge va aussi à la Fontaine commune.",
        contactTitle: "Nous écrire", listTitle: "Elles plantent avec WaterNow",
        foot: "Aucun traceur, aucun cookie."
      },
      perMonth: "/ mois", perYear: function (s) { return "ou " + s + " par année · 1 mois offert"; },
      planted: function (s, n) { return n <= 1 ? "arbre planté" : "arbres plantés"; }, pending: "en attente de plantation", commonsFig: "pour la Fontaine commune",
      line: function (m, s, n) { return "La communauté a planté " + (n === 1 ? "1 arbre" : s + " arbres") + " en " + m + "."; },
      pendingLine: function (m, s, n) { return "En " + m + ", " + (n === 1 ? "1 arbre attend" : s + " arbres attendent") + " la prochaine plantation : Tree-Nation les plante ensemble, une fois par mois."; },
      none: function (m) { return "Aucun arbre en " + m + "."; },
      members: function (s) { return "Environ " + s + " membres Racines et Plus."; },
      total: function (s, n) { return "Depuis le début : " + (n === 1 ? "1 arbre planté" : s + " arbres plantés") + "."; },
      trees: function (s, n) { return n === 1 ? "1 arbre" : s + " arbres"; },
      soon: "Le premier bilan arrive bientôt.", soonText: "Chaque mois, ici : les arbres plantés par la communauté, les projets et les certificats.",
      offline: "Impossible de charger le bilan.", retry: "Réessayer", maintenance: "WaterNow est en cours de mise à jour. Cette page revient dans un instant.",
      thanksSoon: "La page « Merci à… » ouvre bientôt.", thanksEmpty: "Aucun nom pour l'instant.", thanksOffline: "Impossible de charger les noms.",
      since: function (d) { return "depuis " + d; }, coEmpty: "Aucune entreprise affichée pour l'instant.", coOffline: "Impossible de charger la liste.",
      contact: "Pour planter des arbres avec WaterNow, écris-nous à {email}.",
      contactSoon: "Pour planter des arbres avec WaterNow, écris-nous : notre adresse courriel arrive sur cette page très bientôt.",
      firstTrees: "Les premiers arbres seront plantés le 1er du mois prochain.",
      docOk: "Merci · WaterNow Racines", okTitle: "Merci !", okOpen: "Ouvre WaterNow pour voir ta forêt.", forestBtn: "Ouvrir Ta forêt",
      okText: { subscription: "Ton abonnement est actif. Les arbres de ce mois-ci seront plantés par Tree-Nation au début du mois prochain, certificat à l'appui.",
        trees: "Tes arbres seront plantés par Tree-Nation au début du mois prochain, certificat à l'appui.",
        pack: "Ton paquet d'arbres sera planté par Tree-Nation au début du mois prochain, certificat à l'appui.",
        other: "Merci de planter des arbres avec WaterNow." },
      okReceipt: "Stripe t'envoie le reçu par courriel.", okManage: "Tu peux gérer ou annuler ton abonnement en une touche depuis l'écran Racines de l'app."
    },
    es: {
      demo: "Datos de demostración", docReport: "WaterNow Racines y Plus", docThanks: "Gracias a… · WaterNow Racines", docCompanies: "Las empresas plantan árboles con WaterNow",
      ids: {
        title: "WaterNow Racines y Plus",
        lead: "Un árbol de verdad plantado cada mes a tu nombre por Tree-Nation, con certificado. Y una ayuda para la Fuente común.",
        free: "Todo lo útil sigue siendo gratis: el mapa, la búsqueda, la navegación, los mapas sin conexión, añadir puntos, la seguridad y la accesibilidad. Ninguna función existente pasa a ser de pago.",
        racinesName: "Racines", plusName: "Plus",
        ri1: "1 árbol plantado cada mes por Tree-Nation", ri2: "Tu bosque en la app, cada árbol con su certificado",
        ri3: "La insignia Racines, discreta, solo si la quieres", ri4: "3 iconos de la app", ri5: "Tu parte para la Fuente común",
        pi1: "2 árboles plantados cada mes", pi2: "Todo lo de Racines", pi3: "Los temas: mapa, marcadores, widget y todos los iconos de la app",
        pi4: "WaterNow Wrapped, cada diciembre", pi5: "Extras de salida: desnivel, segmentos, exportación GPX con tus paradas de agua",
        subscribe: "Suscribirse en la app", get: "Consigue WaterNow",
        subNote: "Por ahora en Android; el iPhone llegará después. Pago seguro con Stripe, y cancelas con un toque, cuando quieras.",
        extra: "¿Quieres plantar más? Árboles extra, de uno en uno o en paquetes, en la app.",
        moneyTitle: "Adónde va el dinero",
        moneyTrees: "Cada árbol lo planta Tree-Nation en un proyecto real de reforestación, con un certificado público.",
        moneyCommons: "El 10 % del margen va a la Fuente común: la comunidad financia una estación de recarga de verdad, en el lugar que elige.",
        moneyRest: "El resto mantiene WaterNow en marcha: los servidores, el mapa y las nuevas funciones, sin anuncios ni rastreadores.",
        commonsLink: "Ver la Fuente común",
        reportTitle: "El balance del mes", monthLabel: "Mes", projectsTitle: "Los proyectos", certs: "Ver los certificados en Tree-Nation",
        thanksLink: "Gracias a…", thanksSub: "Los miembros que eligieron mostrar su nombre",
        companiesLink: "Empresas", companiesSub: "Plantar árboles al por mayor con WaterNow",
        thanksTitle: "Gracias a…",
        thanksLead: "Los miembros de Racines y Plus que eligieron mostrar su nombre aquí, en orden alfabético. Gracias por hacer crecer árboles y la Fuente común.",
        thanksHow: "¿Eres miembro? Puedes mostrar tu nombre aquí desde la pantalla Racines de la app.",
        back: "Racines y Plus",
        coTitle: "Plantar árboles con WaterNow, como empresa",
        coLead: "Árboles al por mayor, plantados por Tree-Nation a nombre de tu empresa, para tu equipo o tus clientes, con sus certificados.",
        howTitle: "Cómo funciona",
        step1: "Eliges cuántos árboles: 100, 500 o más.", step2: "Acordamos el precio: depende de la cantidad (a consultar).",
        step3: "Tree-Nation los planta; cada árbol tiene su certificado público.", step4: "Si quieres, tu empresa aparece en esta página, con su logotipo y sus árboles.",
        coPrice: "Por ejemplo: 500 árboles. Precio a consultar.", coCommons: "El 10 % del margen también va a la Fuente común.",
        contactTitle: "Escríbenos", listTitle: "Plantan árboles con WaterNow",
        foot: "Sin rastreadores ni cookies."
      },
      perMonth: "/ mes", perYear: function (s) { return "o " + s + " al año · 1 mes gratis"; },
      planted: function (s, n) { return n === 1 ? "árbol plantado" : "árboles plantados"; }, pending: "esperando a ser plantados", commonsFig: "para la Fuente común",
      line: function (m, s, n) { return "La comunidad plantó " + (n === 1 ? "1 árbol" : s + " árboles") + " en " + m + "."; },
      pendingLine: function (m, s, n) { return "En " + m + ", " + (n === 1 ? "1 árbol espera" : s + " árboles esperan") + " la próxima plantación: Tree-Nation los planta juntos, una vez al mes."; },
      none: function (m) { return "Ningún árbol en " + m + "."; },
      members: function (s) { return "Unos " + s + " miembros de Racines y Plus."; },
      total: function (s, n) { return "Desde el principio: " + (n === 1 ? "1 árbol plantado" : s + " árboles plantados") + "."; },
      trees: function (s, n) { return n === 1 ? "1 árbol" : s + " árboles"; },
      soon: "El primer balance llega pronto.", soonText: "Cada mes, aquí: los árboles que plantó la comunidad, los proyectos y los certificados.",
      offline: "No se pudo cargar el balance.", retry: "Reintentar", maintenance: "WaterNow se está actualizando. Esta página volverá en un momento.",
      thanksSoon: "La página «Gracias a…» abre pronto.", thanksEmpty: "Todavía no hay nombres.", thanksOffline: "No se pudieron cargar los nombres.",
      since: function (d) { return "desde " + d; }, coEmpty: "Todavía no se muestra ninguna empresa.", coOffline: "No se pudo cargar la lista.",
      contact: "Para plantar árboles con WaterNow, escríbenos a {email}.",
      contactSoon: "Para plantar árboles con WaterNow, escríbenos: nuestra dirección de correo llega a esta página muy pronto.",
      firstTrees: "Los primeros árboles se plantarán el día 1 del mes que viene.",
      docOk: "Gracias · WaterNow Racines", okTitle: "¡Gracias!", okOpen: "Abre WaterNow para ver tu bosque.", forestBtn: "Abrir Tu bosque",
      okText: { subscription: "Tu suscripción está activa. Tree-Nation plantará los árboles de este mes a principios del mes que viene, con certificado.",
        trees: "Tree-Nation plantará tus árboles a principios del mes que viene, con certificado.",
        pack: "Tree-Nation plantará tu paquete de árboles a principios del mes que viene, con certificado.",
        other: "Gracias por plantar árboles con WaterNow." },
      okReceipt: "Stripe te envía el recibo por correo.", okManage: "Puedes gestionar o cancelar tu suscripción con un toque desde la pantalla Racines de la app."
    },
    de: {
      demo: "Demodaten", docReport: "WaterNow Racines und Plus", docThanks: "Danke an… · WaterNow Racines", docCompanies: "Unternehmen pflanzen Bäume mit WaterNow",
      ids: {
        title: "WaterNow Racines und Plus",
        lead: "Jeden Monat ein echter Baum, in deinem Namen von Tree-Nation gepflanzt, mit Zertifikat. Und eine Hilfe für den Gemeinschaftsbrunnen.",
        free: "Alles Nützliche bleibt kostenlos: die Karte, die Suche, die Navigation, die Offline-Karten, das Hinzufügen von Orten, die Sicherheit und die Barrierefreiheit. Keine bestehende Funktion wird kostenpflichtig.",
        racinesName: "Racines", plusName: "Plus",
        ri1: "Jeden Monat 1 Baum, gepflanzt von Tree-Nation", ri2: "Dein Wald in der App, jeder Baum mit seinem Zertifikat",
        ri3: "Das Racines-Abzeichen, dezent, nur wenn du willst", ri4: "3 App-Symbole", ri5: "Dein Anteil für den Gemeinschaftsbrunnen",
        pi1: "Jeden Monat 2 gepflanzte Bäume", pi2: "Alles aus Racines", pi3: "Designs: Karte, Markierungen, Widget und alle App-Symbole",
        pi4: "WaterNow Wrapped, jeden Dezember", pi5: "Extras für Fahrten: Höhenmeter, Abschnitte, GPX-Export mit deinen Wasserstopps",
        subscribe: "In der App abonnieren", get: "WaterNow holen",
        subNote: "Vorerst auf Android; das iPhone folgt. Sichere Zahlung über Stripe, und du kündigst mit einem Tippen, wann du willst.",
        extra: "Lust, mehr zu pflanzen? Zusätzliche Bäume, einzeln oder im Paket, in der App.",
        moneyTitle: "Wohin das Geld geht",
        moneyTrees: "Jeder Baum wird von Tree-Nation in einem echten Aufforstungsprojekt gepflanzt, mit einem öffentlichen Zertifikat.",
        moneyCommons: "10 % der Marge gehen an den Gemeinschaftsbrunnen: Die Community finanziert eine echte Nachfüllstation, an einem Ort, den sie wählt.",
        moneyRest: "Der Rest hält WaterNow am Laufen: die Server, die Karte und neue Funktionen, ohne Werbung und ohne Tracker.",
        commonsLink: "Den Gemeinschaftsbrunnen ansehen",
        reportTitle: "Der Monatsbericht", monthLabel: "Monat", projectsTitle: "Die Projekte", certs: "Die Zertifikate bei Tree-Nation ansehen",
        thanksLink: "Danke an…", thanksSub: "Die Mitglieder, die ihren Namen zeigen wollten",
        companiesLink: "Unternehmen", companiesSub: "Bäume in großer Zahl mit WaterNow pflanzen",
        thanksTitle: "Danke an…",
        thanksLead: "Die Mitglieder von Racines und Plus, die ihren Namen hier zeigen wollten, in alphabetischer Reihenfolge. Danke, dass ihr Bäume und den Gemeinschaftsbrunnen wachsen lasst.",
        thanksHow: "Du bist Mitglied? Du kannst deinen Namen hier über den Racines-Bildschirm der App zeigen.",
        back: "Racines und Plus",
        coTitle: "Bäume pflanzen mit WaterNow, als Unternehmen",
        coLead: "Bäume in großer Zahl, von Tree-Nation im Namen deines Unternehmens gepflanzt, für dein Team oder deine Kundschaft, mit ihren Zertifikaten.",
        howTitle: "So funktioniert es",
        step1: "Du wählst, wie viele Bäume: 100, 500 oder mehr.", step2: "Wir einigen uns auf den Preis: Er hängt von der Menge ab (auf Anfrage).",
        step3: "Tree-Nation pflanzt sie; jeder Baum hat sein öffentliches Zertifikat.", step4: "Wenn du willst, erscheint dein Unternehmen auf dieser Seite, mit seinem Logo und seinen Bäumen.",
        coPrice: "Zum Beispiel: 500 Bäume. Preis auf Anfrage.", coCommons: "10 % der Marge gehen auch an den Gemeinschaftsbrunnen.",
        contactTitle: "Schreib uns", listTitle: "Sie pflanzen Bäume mit WaterNow",
        foot: "Keine Tracker, keine Cookies."
      },
      perMonth: "/ Monat", perYear: function (s) { return "oder " + s + " im Jahr · 1 Monat gratis"; },
      planted: function (s, n) { return n === 1 ? "Baum gepflanzt" : "Bäume gepflanzt"; }, pending: "warten aufs Pflanzen", commonsFig: "für den Gemeinschaftsbrunnen",
      line: function (m, s, n) { return "Im " + m + " hat die Community " + (n === 1 ? "1 Baum" : s + " Bäume") + " gepflanzt."; },
      pendingLine: function (m, s, n) { return "Im " + m + " " + (n === 1 ? "wartet 1 Baum" : "warten " + s + " Bäume") + " auf die nächste Pflanzung: Tree-Nation pflanzt sie gemeinsam, einmal im Monat."; },
      none: function (m) { return "Keine Bäume im " + m + "."; },
      members: function (s) { return "Etwa " + s + " Mitglieder bei Racines und Plus."; },
      total: function (s, n) { return "Seit dem Start: " + (n === 1 ? "1 Baum" : s + " Bäume") + " gepflanzt."; },
      trees: function (s, n) { return n === 1 ? "1 Baum" : s + " Bäume"; },
      soon: "Der erste Bericht kommt bald.", soonText: "Jeden Monat hier: die Bäume, die die Community gepflanzt hat, die Projekte und die Zertifikate.",
      offline: "Der Bericht konnte nicht geladen werden.", retry: "Erneut versuchen", maintenance: "WaterNow wird gerade aktualisiert. Diese Seite ist gleich wieder da.",
      thanksSoon: "Die Seite „Danke an…“ öffnet bald.", thanksEmpty: "Noch keine Namen.", thanksOffline: "Die Namen konnten nicht geladen werden.",
      since: function (d) { return "seit " + d; }, coEmpty: "Noch kein Unternehmen angezeigt.", coOffline: "Die Liste konnte nicht geladen werden.",
      contact: "Um mit WaterNow Bäume zu pflanzen, schreib uns an {email}.",
      contactSoon: "Um mit WaterNow Bäume zu pflanzen, schreib uns: Unsere E-Mail-Adresse kommt sehr bald auf diese Seite.",
      firstTrees: "Die ersten Bäume werden am 1. des nächsten Monats gepflanzt.",
      docOk: "Danke · WaterNow Racines", okTitle: "Danke!", okOpen: "Öffne WaterNow, um deinen Wald zu sehen.", forestBtn: "Deinen Wald öffnen",
      okText: { subscription: "Dein Abo ist aktiv. Die Bäume dieses Monats pflanzt Tree-Nation Anfang nächsten Monats, mit Zertifikat.",
        trees: "Tree-Nation pflanzt deine Bäume Anfang nächsten Monats, mit Zertifikat.",
        pack: "Tree-Nation pflanzt dein Baumpaket Anfang nächsten Monats, mit Zertifikat.",
        other: "Danke, dass du mit WaterNow Bäume pflanzt." },
      okReceipt: "Stripe schickt dir die Quittung per E-Mail.", okManage: "Du kannst dein Abo mit einem Tippen im Racines-Bildschirm der App verwalten oder kündigen."
    },
    pt: {
      demo: "Dados de demonstração", docReport: "WaterNow Racines e Plus", docThanks: "Obrigado a… · WaterNow Racines", docCompanies: "Empresas plantam árvores com o WaterNow",
      ids: {
        title: "WaterNow Racines e Plus",
        lead: "Uma árvore de verdade plantada todo mês em seu nome pela Tree-Nation, com certificado. E uma ajuda para a Fonte comum.",
        free: "Tudo o que é útil continua grátis: o mapa, a busca, a navegação, os mapas offline, adicionar pontos, a segurança e a acessibilidade. Nenhuma função existente passa a ser paga.",
        racinesName: "Racines", plusName: "Plus",
        ri1: "1 árvore plantada todo mês pela Tree-Nation", ri2: "Sua floresta no app, cada árvore com seu certificado",
        ri3: "A medalha Racines, discreta, só se você quiser", ri4: "3 ícones do app", ri5: "Sua parte para a Fonte comum",
        pi1: "2 árvores plantadas todo mês", pi2: "Tudo o que há no Racines", pi3: "Temas: mapa, marcadores, widget e todos os ícones do app",
        pi4: "WaterNow Wrapped, todo dezembro", pi5: "Extras de trajeto: desnível, segmentos, exportação GPX com suas paradas de água",
        subscribe: "Assinar no app", get: "Baixe o WaterNow",
        subNote: "Por enquanto no Android; o iPhone vem depois. Pagamento seguro pela Stripe, e você cancela com um toque, quando quiser.",
        extra: "Quer plantar mais? Árvores extras, uma por vez ou em pacotes, no app.",
        moneyTitle: "Para onde vai o dinheiro",
        moneyTrees: "Cada árvore é plantada pela Tree-Nation em um projeto real de reflorestamento, com um certificado público.",
        moneyCommons: "10% da margem vai para a Fonte comum: a comunidade financia uma estação de recarga de verdade, no lugar que ela escolhe.",
        moneyRest: "O resto mantém o WaterNow funcionando: os servidores, o mapa e as novas funções, sem anúncios nem rastreadores.",
        commonsLink: "Ver a Fonte comum",
        reportTitle: "O balanço do mês", monthLabel: "Mês", projectsTitle: "Os projetos", certs: "Ver os certificados na Tree-Nation",
        thanksLink: "Obrigado a…", thanksSub: "Os membros que escolheram mostrar o nome",
        companiesLink: "Empresas", companiesSub: "Plantar árvores em grande quantidade com o WaterNow",
        thanksTitle: "Obrigado a…",
        thanksLead: "Os membros do Racines e do Plus que escolheram mostrar o nome aqui, em ordem alfabética. Obrigado por fazer crescer árvores e a Fonte comum.",
        thanksHow: "Você é membro? Você pode mostrar seu nome aqui pela tela Racines do app.",
        back: "Racines e Plus",
        coTitle: "Plantar árvores com o WaterNow, como empresa",
        coLead: "Árvores em grande quantidade, plantadas pela Tree-Nation em nome da sua empresa, para sua equipe ou seus clientes, com os certificados.",
        howTitle: "Como funciona",
        step1: "Você escolhe quantas árvores: 100, 500 ou mais.", step2: "Combinamos o preço: ele depende da quantidade (sob consulta).",
        step3: "A Tree-Nation planta as árvores; cada uma tem seu certificado público.", step4: "Se quiser, sua empresa aparece nesta página, com o logo e as árvores dela.",
        coPrice: "Por exemplo: 500 árvores. Preço sob consulta.", coCommons: "10% da margem também vai para a Fonte comum.",
        contactTitle: "Fale com a gente", listTitle: "Elas plantam árvores com o WaterNow",
        foot: "Sem rastreadores, sem cookies."
      },
      perMonth: "/ mês", perYear: function (s) { return "ou " + s + " por ano · 1 mês grátis"; },
      planted: function (s, n) { return n === 1 ? "árvore plantada" : "árvores plantadas"; }, pending: "aguardando plantio", commonsFig: "para a Fonte comum",
      line: function (m, s, n) { return "A comunidade plantou " + (n === 1 ? "1 árvore" : s + " árvores") + " em " + m + "."; },
      pendingLine: function (m, s, n) { return "Em " + m + ", " + (n === 1 ? "1 árvore aguarda" : s + " árvores aguardam") + " o próximo plantio: a Tree-Nation planta todas juntas, uma vez por mês."; },
      none: function (m) { return "Nenhuma árvore em " + m + "."; },
      members: function (s) { return "Cerca de " + s + " membros do Racines e do Plus."; },
      total: function (s, n) { return "Desde o início: " + (n === 1 ? "1 árvore plantada" : s + " árvores plantadas") + "."; },
      trees: function (s, n) { return n === 1 ? "1 árvore" : s + " árvores"; },
      soon: "O primeiro balanço chega em breve.", soonText: "Todo mês, aqui: as árvores que a comunidade plantou, os projetos e os certificados.",
      offline: "Não foi possível carregar o balanço.", retry: "Tentar de novo", maintenance: "O WaterNow está sendo atualizado. Esta página volta daqui a pouco.",
      thanksSoon: "A página “Obrigado a…” abre em breve.", thanksEmpty: "Ainda não há nomes.", thanksOffline: "Não foi possível carregar os nomes.",
      since: function (d) { return "desde " + d; }, coEmpty: "Nenhuma empresa exibida ainda.", coOffline: "Não foi possível carregar a lista.",
      contact: "Para plantar árvores com o WaterNow, escreva para {email}.",
      contactSoon: "Para plantar árvores com o WaterNow, fale com a gente: nosso e-mail chega a esta página muito em breve.",
      firstTrees: "As primeiras árvores serão plantadas no dia 1º do mês que vem.",
      docOk: "Obrigado · WaterNow Racines", okTitle: "Obrigado!", okOpen: "Abra o WaterNow para ver sua floresta.", forestBtn: "Abrir Sua floresta",
      okText: { subscription: "Sua assinatura está ativa. As árvores deste mês serão plantadas pela Tree-Nation no início do mês que vem, com certificado.",
        trees: "Suas árvores serão plantadas pela Tree-Nation no início do mês que vem, com certificado.",
        pack: "Seu pacote de árvores será plantado pela Tree-Nation no início do mês que vem, com certificado.",
        other: "Obrigado por plantar árvores com o WaterNow." },
      okReceipt: "A Stripe envia o recibo para o seu e-mail.", okManage: "Você pode gerenciar ou cancelar sua assinatura com um toque na tela Racines do app."
    },
    ja: {
      demo: "デモデータ", docReport: "WaterNow Racines と Plus", docThanks: "感謝を込めて・WaterNow Racines", docCompanies: "企業でWaterNowと木を植える",
      ids: {
        title: "WaterNow Racines と Plus",
        lead: "毎月1本、あなたの名前で本物の木をTree-Nationが植えます（証明書付き）。みんなの給水所の応援にもなります。",
        free: "便利な機能はすべて無料のままです：マップ、検索、ナビ、オフラインマップ、スポットの追加、安全、アクセシビリティ。既存の機能が有料になることはありません。",
        racinesName: "Racines", plusName: "Plus",
        ri1: "毎月1本、Tree-Nationが木を植えます", ri2: "アプリにあなたの森（1本ごとに証明書付き）",
        ri3: "控えめなRacinesバッジ（表示するかは自由）", ri4: "アプリアイコン3種", ri5: "みんなの給水所へのあなたの分",
        pi1: "毎月2本の木を植えます", pi2: "Racinesの内容すべて", pi3: "テーマ：マップ、ピン、ウィジェット、すべてのアプリアイコン",
        pi4: "WaterNow Wrapped（毎年12月）", pi5: "ライドの追加機能：獲得標高、区間、給水ポイント付きGPXエクスポート",
        subscribe: "アプリで登録", get: "WaterNowを入手",
        subNote: "現在はAndroidのみで、iPhone版は今後対応します。お支払いはStripeで安全に行われ、いつでもワンタップで解約できます。",
        extra: "もっと植えたい方は、アプリで木を1本ずつ、またはパックで追加できます。",
        moneyTitle: "お金の使い道",
        moneyTrees: "どの木も、Tree-Nationが実際の植林プロジェクトで植え、公開の証明書が付きます。",
        moneyCommons: "利益の10%はみんなの給水所に充てられます。コミュニティが選んだ場所に、本物の給水ステーションをみんなで設置します。",
        moneyRest: "残りはWaterNowの運営に使われます：サーバー、マップ、新機能。広告もトラッカーもありません。",
        commonsLink: "みんなの給水所を見る",
        reportTitle: "今月の報告", monthLabel: "月", projectsTitle: "プロジェクト", certs: "Tree-Nationで証明書を見る",
        thanksLink: "感謝を込めて", thanksSub: "名前の表示を選んだメンバー",
        companiesLink: "企業の方へ", companiesSub: "WaterNowと木をまとめて植える",
        thanksTitle: "感謝を込めて",
        thanksLead: "ここに名前を表示することを選んだRacinesとPlusのメンバーです（五十音・アルファベット順）。木とみんなの給水所を育ててくださり、ありがとうございます。",
        thanksHow: "メンバーの方は、アプリのRacines画面からここに名前を表示できます。",
        back: "Racines と Plus",
        coTitle: "企業でWaterNowと木を植える",
        coLead: "Tree-Nationが御社の名前で木をまとめて植えます。従業員やお客様のために、証明書付きでどうぞ。",
        howTitle: "しくみ",
        step1: "本数を選びます：100本、500本、またはそれ以上。", step2: "価格をご相談します：本数によって変わります（お問い合わせください）。",
        step3: "Tree-Nationが植え、1本ごとに公開の証明書が付きます。", step4: "ご希望なら、御社のロゴと植えた本数をこのページに掲載します。",
        coPrice: "例：500本。価格はお問い合わせください。", coCommons: "利益の10%はみんなの給水所にも充てられます。",
        contactTitle: "お問い合わせ", listTitle: "WaterNowと木を植えている企業",
        foot: "トラッカーもCookieも使っていません。"
      },
      perMonth: "/月", perYear: function (s) { return "または" + s + "/年（1か月分無料）"; },
      planted: function () { return "植えた木の本数"; }, pending: "植樹待ちの本数", commonsFig: "みんなの給水所へ",
      line: function (m, s) { return m + "、コミュニティは" + s + "本の木を植えました。"; },
      pendingLine: function (m, s) { return m + "は" + s + "本の木が次の植樹を待っています。Tree-Nationが月に1回まとめて植えます。"; },
      none: function (m) { return m + "に植えた木はありません。"; },
      members: function (s) { return "RacinesとPlusのメンバーは約" + s + "人です。"; },
      total: function (s) { return "開始以来、" + s + "本の木を植えました。"; },
      trees: function (s) { return s + "本"; },
      soon: "最初の報告はまもなく公開します。", soonText: "毎月ここで、コミュニティが植えた木、プロジェクト、証明書をお知らせします。",
      offline: "報告を読み込めませんでした。", retry: "再試行", maintenance: "WaterNowは現在アップデート中です。このページはまもなく表示されます。",
      thanksSoon: "「感謝を込めて」のページはまもなく公開します。", thanksEmpty: "まだ名前はありません。", thanksOffline: "名前を読み込めませんでした。",
      since: function (d) { return d + "から"; }, coEmpty: "掲載中の企業はまだありません。", coOffline: "一覧を読み込めませんでした。",
      contact: "WaterNowと木を植えたい企業の方は、{email}までご連絡ください。",
      contactSoon: "WaterNowと木を植えたい企業の方へ：連絡先のメールアドレスはまもなくこのページに掲載します。",
      firstTrees: "最初の木は来月1日に植えます。",
      docOk: "ありがとうございます・WaterNow Racines", okTitle: "ありがとうございます！", okOpen: "WaterNowを開いて、あなたの森を見てみましょう。", forestBtn: "あなたの森を開く",
      okText: { subscription: "定期購入が有効になりました。今月分の木は、来月初めにTree-Nationが植えます（証明書付き）。",
        trees: "あなたの木は、来月初めにTree-Nationが植えます（証明書付き）。",
        pack: "木のパックは、来月初めにTree-Nationが植えます（証明書付き）。",
        other: "WaterNowで木を植えてくださり、ありがとうございます。" },
      okReceipt: "領収書はStripeからメールで届きます。", okManage: "定期購入の管理や解約は、アプリのRacines画面からワンタップでできます。"
    },
    ro: {
      demo: "Date demonstrative", docReport: "WaterNow Racines și Plus", docThanks: "Mulțumim… · WaterNow Racines", docCompanies: "Companiile plantează copaci cu WaterNow",
      ids: {
        title: "WaterNow Racines și Plus",
        lead: "Un copac adevărat plantat în fiecare lună pe numele tău de Tree-Nation, cu certificat. Și un ajutor pentru Fântâna comună.",
        free: "Tot ce e util rămâne gratuit: harta, căutarea, ghidarea, hărțile offline, adăugarea de puncte, siguranța și accesibilitatea. Nicio funcție existentă nu devine cu plată.",
        racinesName: "Racines", plusName: "Plus",
        ri1: "1 copac plantat în fiecare lună de Tree-Nation", ri2: "Pădurea ta în aplicație, fiecare copac cu certificatul lui",
        ri3: "Insigna Racines, discretă, doar dacă vrei", ri4: "3 pictograme ale aplicației", ri5: "Partea ta pentru Fântâna comună",
        pi1: "2 copaci plantați în fiecare lună", pi2: "Tot ce are Racines", pi3: "Temele: harta, pinii, widgetul și toate pictogramele aplicației",
        pi4: "WaterNow Wrapped, în fiecare decembrie", pi5: "Extra pentru ture: diferență de nivel, segmente, export GPX cu opririle tale la apă",
        subscribe: "Abonează-te în aplicație", get: "Descarcă WaterNow",
        subNote: "Deocamdată pe Android; iPhone-ul urmează. Plată sigură prin Stripe și anulezi dintr-o atingere, oricând vrei.",
        extra: "Vrei să plantezi mai mult? Copaci în plus, câte unul sau la pachet, în aplicație.",
        moneyTitle: "Unde merg banii",
        moneyTrees: "Fiecare copac este plantat de Tree-Nation într-un proiect real de reîmpădurire, cu un certificat public.",
        moneyCommons: "10 % din marjă merge la Fântâna comună: comunitatea finanțează o stație de reumplere adevărată, în locul pe care îl alege.",
        moneyRest: "Restul ține WaterNow în viață: serverele, harta și funcțiile noi, fără reclame și fără trackere.",
        commonsLink: "Vezi Fântâna comună",
        reportTitle: "Bilanțul lunii", monthLabel: "Luna", projectsTitle: "Proiectele", certs: "Vezi certificatele pe Tree-Nation",
        thanksLink: "Mulțumim…", thanksSub: "Membrii care au ales să-și afișeze numele",
        companiesLink: "Companii", companiesSub: "Plantează copaci în număr mare cu WaterNow",
        thanksTitle: "Mulțumim…",
        thanksLead: "Membrii Racines și Plus care au ales să-și afișeze numele aici, în ordine alfabetică. Mulțumim că faceți să crească copaci și Fântâna comună.",
        thanksHow: "Ești membru? Îți poți afișa numele aici din ecranul Racines al aplicației.",
        back: "Racines și Plus",
        coTitle: "Plantează copaci cu WaterNow, ca firmă",
        coLead: "Copaci în număr mare, plantați de Tree-Nation în numele firmei tale, pentru echipa sau clienții tăi, cu certificatele lor.",
        howTitle: "Cum funcționează",
        step1: "Alegi câți copaci: 100, 500 sau mai mulți.", step2: "Stabilim prețul împreună: depinde de cantitate (la cerere).",
        step3: "Tree-Nation îi plantează; fiecare copac are certificatul lui public.", step4: "Dacă vrei, firma ta apare pe această pagină, cu sigla și copacii ei.",
        coPrice: "De exemplu: 500 de copaci. Preț la cerere.", coCommons: "10 % din marjă merge și la Fântâna comună.",
        contactTitle: "Scrie-ne", listTitle: "Plantează copaci cu WaterNow",
        foot: "Fără trackere, fără cookie-uri."
      },
      perMonth: "/ lună", perYear: function (s) { return "sau " + s + " pe an · 1 lună gratuită"; },
      planted: function (s, n) { return n === 1 ? "copac plantat" : "copaci plantați"; }, pending: "așteaptă plantarea", commonsFig: "pentru Fântâna comună",
      line: function (m, s, n) { return "Comunitatea a plantat " + (n === 1 ? "1 copac" : s + roDe(n) + " copaci") + " în " + m + "."; },
      pendingLine: function (m, s, n) { return "În " + m + ", " + (n === 1 ? "1 copac așteaptă" : s + roDe(n) + " copaci așteaptă") + " următoarea plantare: Tree-Nation îi plantează împreună, o dată pe lună."; },
      none: function (m) { return "Niciun copac în " + m + "."; },
      members: function (s, n) { return "Aproximativ " + s + roDe(n) + " membri Racines și Plus."; },
      total: function (s, n) { return "De la început: " + (n === 1 ? "1 copac plantat" : s + roDe(n) + " copaci plantați") + "."; },
      trees: function (s, n) { return n === 1 ? "1 copac" : s + roDe(n) + " copaci"; },
      soon: "Primul bilanț vine în curând.", soonText: "În fiecare lună, aici: copacii plantați de comunitate, proiectele și certificatele.",
      offline: "Bilanțul nu s-a putut încărca.", retry: "Încearcă din nou", maintenance: "WaterNow se actualizează. Această pagină revine în curând.",
      thanksSoon: "Pagina „Mulțumim…” se deschide în curând.", thanksEmpty: "Încă nu sunt nume.", thanksOffline: "Numele nu s-au putut încărca.",
      since: function (d) { return "din " + d; }, coEmpty: "Încă nu e afișată nicio firmă.", coOffline: "Lista nu s-a putut încărca.",
      contact: "Ca să plantezi copaci cu WaterNow, scrie-ne la {email}.",
      contactSoon: "Ca să plantezi copaci cu WaterNow, scrie-ne: adresa noastră de e-mail apare pe această pagină foarte curând.",
      firstTrees: "Primii copaci vor fi plantați la începutul lunii viitoare, pe data de 1.",
      docOk: "Mulțumim · WaterNow Racines", okTitle: "Mulțumim!", okOpen: "Deschide WaterNow ca să-ți vezi pădurea.", forestBtn: "Deschide Pădurea ta",
      okText: { subscription: "Abonamentul tău e activ. Copacii lunii acesteia vor fi plantați de Tree-Nation la începutul lunii viitoare, cu certificat.",
        trees: "Copacii tăi vor fi plantați de Tree-Nation la începutul lunii viitoare, cu certificat.",
        pack: "Pachetul tău de copaci va fi plantat de Tree-Nation la începutul lunii viitoare, cu certificat.",
        other: "Mulțumim că plantezi copaci cu WaterNow." },
      okReceipt: "Stripe îți trimite chitanța pe e-mail.", okManage: "Îți poți gestiona sau anula abonamentul dintr-o atingere din ecranul Racines al aplicației."
    }
  };

  var api = { STRINGS: STRINGS, PRICES: PRICES, LAUNCH: LAUNCH, APP_LINK: APP_LINK, report: report, thanks: thanks, companies: companies,
              monthParam: monthParam, months: months, monthName: monthName, money: money, link: link, logo: logo, email: email, country: country, roDe: roDe,
              checkoutKind: checkoutKind, FOREST_LINK: "waternow://forest" };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WNR = api;
})(this);

/*
 * « Fontaine commune » (docs/18_FONTAINE_COMMUNE.md): the plain parts of its public pages (fontaine/, fontaine/merci/,
 * f/ and the home page's entry), shared by the pages (window.WNF) and their node test (module.exports). Whatever the
 * server sends is checked here again: these return plain values, and the pages write them with textContent only.
 */
(function (root) {
  "use strict";
  var P = typeof module === "object" && module.exports ? require("./page-data.js") : root.WNP;

  var STATUSES = ["vote", "funding", "building", "built", "archived"]; // "draft" never leaves the admin RPCs
  var BUILDER_KINDS = ["contractor", "partner", "city", "obnl"];
  var BUDGET_KINDS = ["equipment", "installation", "permits", "maintenance", "fees", "other"];
  var TIERS = ["gold", "silver", "bronze"]; // the wall shows them in this order
  var MIN_CENTS = 200, MAX_CENTS = 1000000, MESSAGE_MAX = 140, NAME_MAX = 40; // commons-checkout cuts a name to 40
  var PRESETS = [500, 1000, 2500, 5000, 10000];

  function cents(v) { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 1e11 ? v : null; }
  function id(v) { return typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null; }
  function real(v) { return typeof v === "number" && isFinite(v) && v >= 0 ? v : null; }
  function iso(v) {
    var t = typeof v === "string" && v.length <= 40 ? Date.parse(v) : NaN;
    return isFinite(t) ? new Date(t).toISOString() : null;
  }
  function one(list, v) { return list.indexOf(v) >= 0 ? v : null; }

  /** A link a visitor may follow (builder, host, quote, sponsor): https only, no credentials; else null. */
  function link(v) {
    if (typeof v !== "string" || v.length > 500) return null;
    try {
      var u = new URL(v);
      return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
    } catch (e) { return null; }
  }

  /**
   * An image the page may load (cover, logos): only from WaterNow's own storage, its public bucket commons-media (section
   * 85 accepts no other address), so a page never calls a third party (no tracker by the back door) and the CSP's
   * img-src stays one origin. Else null: the page shows the sponsor's initial or the plain water banner.
   */
  function image(v, api, base) {
    if (typeof v !== "string" || v.length > 500 || typeof api !== "string") return null; // api "": the preview's same origin
    try {
      var u = new URL(v, base), a = new URL(api, base);
      return u.origin === a.origin && (u.protocol === "https:" || u.hostname === "127.0.0.1") && !u.username &&
        u.pathname.indexOf("/storage/v1/object/public/commons-media/") === 0 && !/\.\./.test(u.pathname) ? u.href : null;
    } catch (e) { return null; }
  }

  function place(s) {
    if (!s || typeof s !== "object") return null;
    var lat = s.lat, lon = s.lon;
    if (!(typeof lat === "number" && typeof lon === "number" && Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null;
    return { lat: lat, lon: lon, name: P.text(s.name, 80), address: P.text(s.address, 160) };
  }

  /** commons_list's entries and commons_project's / commons_fountain's answer, cleaned; null when it isn't one. */
  function project(o, api, base) {
    if (!o || typeof o !== "object" || Array.isArray(o) || id(o.id) === null || !one(STATUSES, o.status)) return null;
    var b = o.builder && typeof o.builder === "object" ? o.builder : null, h = o.host && typeof o.host === "object" ? o.host : null;
    var m = o.matching && typeof o.matching === "object" ? o.matching : null, v = o.vote && typeof o.vote === "object" ? o.vote : null;
    var im = o.impact && typeof o.impact === "object" ? o.impact : null;
    return {
      id: o.id, slug: P.text(o.slug, 48), title: P.text(o.title, 80), status: o.status, city: P.text(o.city, 60),
      goal: cents(o.goal_cents) || 0, raised: cents(o.raised_cents) || 0, matched: cents(o.matched_cents) || 0,
      donorsCount: cents(o.donors_count) || 0, cover: image(o.cover_url, api, base), site: place(o.chosen_site), endsAt: iso(o.ends_at),
      matching: m && P.text(m.org_name, 80) ? { org: P.text(m.org_name, 80), ratio: real(m.ratio) || 1, cap: cents(m.cap_cents) || 0,
        used: cents(m.used_cents) || 0, endsAt: iso(m.ends_at) } : null,
      description: P.text(o.description, 2000, true),
      builder: b && P.text(b.name, 80) ? { name: P.text(b.name, 80), kind: one(BUILDER_KINDS, b.kind), url: link(b.url), quote: cents(b.quote_cents),
        quoteDoc: link(b.quote_doc_url) } : null,
      host: h && P.text(h.name, 80) ? { name: P.text(h.name, 80), url: link(h.url) } : null,
      budget: (Array.isArray(o.budget) ? o.budget : []).filter(function (l) { return l && one(BUDGET_KINDS, l.kind) && cents(l.amount_cents) !== null; })
        .slice(0, 20).map(function (l) { return { kind: l.kind, label: P.text(l.label, 80), amount: l.amount_cents }; }),
      sites: (Array.isArray(o.sites) ? o.sites : []).map(function (s) {
        var p = place(s);
        return p && id(s.id) !== null ? { id: s.id, lat: p.lat, lon: p.lon, name: p.name, address: p.address, newly: real(s.newly_served),
          res10: real(s.residents_10min), demand: real(s.demand_searches), votes: cents(s.votes) } : null;
      }).filter(Boolean).slice(0, 5),
      vote: v ? { opensAt: iso(v.opens_at), closesAt: iso(v.closes_at), mine: id(v.my_site_id) } : null,
      donors: (Array.isArray(o.donors) ? o.donors : []).filter(function (d) { return d && typeof d === "object"; }).slice(0, 100).map(function (d) {
        return { name: P.text(d.name, NAME_MAX), amount: cents(d.amount_cents), message: P.text(d.message, MESSAGE_MAX), at: iso(d.at) };
      }),
      sponsors: (Array.isArray(o.sponsors) ? o.sponsors : []).filter(function (s) { return s && one(TIERS, s.tier) && P.text(s.name, 80); })
        .slice(0, 30).map(function (s) { return { name: P.text(s.name, 80), tier: s.tier, logo: image(s.logo_url, api, base), url: link(s.url) }; }),
      spotId: id(o.spot_id),
      impact: im ? { refills: cents(im.refills) || 0, bottles: cents(im.bottles) || 0, since: iso(im.since) } : null,
      rolledTo: id(o.rolled_to)
    };
  }

  /** The project the home page and a bare fontaine/ show: the one being funded, else the vote, else the one being built. */
  function current(list) {
    var ps = (Array.isArray(list) ? list : []).filter(Boolean);
    for (var i = 0; i < 3; i++) {
      var want = ["funding", "vote", "building"][i];
      for (var j = 0; j < ps.length; j++) if (ps[j].status === want) return ps[j];
    }
    return null;
  }

  /** Sponsors by tier, gold first; a tier without sponsors is left out. */
  function tiers(sponsors) {
    return TIERS.map(function (t) { return { tier: t, list: sponsors.filter(function (s) { return s.tier === t; }) }; })
      .filter(function (g) { return g.list.length; });
  }

  /** "1 840 $" / "$1,840" / "$1,840.50": Canadian dollars in [lang], cents only when there are some. */
  function money(c, lang) {
    var whole = c % 100 === 0;
    return new Intl.NumberFormat(lang, { style: "currency", currency: "CAD", currencyDisplay: "narrowSymbol",
      minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(c / 100);
  }

  /** part / whole in [0, 1]; 0 without a whole. */
  function share(part, whole) { return whole > 0 ? Math.max(0, Math.min(1, part / whole)) : 0; }

  /** A typed amount in dollars ("25", "25.5", "25,50", "1 000") as cents; null when it isn't one. */
  function amountCents(raw) {
    var s = String(raw == null ? "" : raw).replace(/[\s  $]/g, "").replace(",", ".");
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
    return Math.round(Number(s) * 100);
  }

  // Invisible characters a message could hide (zero-width, direction marks, BOM), on top of page-data's control set.
  var INVISIBLE = /[​-‏⁠-⁤﻿]/g;

  /**
   * The commons-checkout body for what the form holds ({project, amount (cents), monthly, name, anonymous, showAmount,
   * message}), or {error}: "amount", "name". A monthly gift goes to the fund (project_id null; the server's webhook
   * gives each payment to the project being funded then). The message is cut to 140 characters, cleaned.
   */
  function donation(f) {
    var a = f && f.amount;
    if (typeof a !== "number" || !Number.isSafeInteger(a) || a < MIN_CENTS || a > MAX_CENTS) return { error: "amount" };
    var anonymous = f.anonymous === true, name = anonymous ? "" : P.text(String(f.name || "").replace(INVISIBLE, ""), NAME_MAX);
    if (!anonymous && !name) return { error: "name" };
    var message = P.text(String(f.message || "").replace(INVISIBLE, ""), MESSAGE_MAX);
    return { body: {
      project_id: f.monthly === true ? null : id(f.project), amount_cents: a, monthly: f.monthly === true, name: anonymous ? null : name,
      anonymous: anonymous, show_amount: f.showAmount === true, message: message || null
    } };
  }

  /** commons-checkout's {url}: only a Stripe Checkout page is ever opened; else null. */
  function checkoutUrl(o) {
    var u = o && typeof o.url === "string" && o.url.length <= 2048 ? o.url : null;
    if (!u) return null;
    try {
      var x = new URL(u);
      return x.protocol === "https:" && x.hostname === "checkout.stripe.com" && !x.username ? x.href : null;
    } catch (e) { return null; }
  }

  /** "?p=<id>": the project's id, or null. */
  function projectParam(search) {
    if (typeof search !== "string" || search.length > 2048) return null;
    var v;
    try { v = new URLSearchParams(search).get("p"); } catch (e) { return null; }
    return v && /^[1-9][0-9]{0,15}$/.test(v) && Number.isSafeInteger(Number(v)) ? Number(v) : null;
  }

  /** "Open in WaterNow" for a project (the vote box, the home entry): waternow://commons/<id>; the app checks it again. */
  function appLink(projectId) { return id(projectId) === null ? null : "waternow://commons/" + projectId; }

  /** A letter for each candidate site: A, B, C… */
  function letter(i) { return String.fromCharCode(65 + i); }

  // Romanian puts "de" between a number and its noun from 20 on (20 de, 101, 120 de), as the app does.
  var roDe = function (n) { return n % 100 >= 20 || (n > 0 && n % 100 === 0) ? " de" : ""; };

  // One table per app language (WN.LANGS). Functions take the value already formatted (s) and, where a language needs
  // it, the number itself (n).
  var STRINGS = {
    en: {
      name: "The Community Fountain", doc: function (t) { return t + " · The Community Fountain"; }, demo: "Demo data",
      status: { vote: "Vote in progress", funding: "Fundraising", building: "Being built", built: "Built", archived: "Campaign ended" },
      lead: "Together, the WaterNow community funds a real bottle refill station, in a place it chooses.",
      none: "No project right now", noneText: "The next Community Fountain is being prepared. Come back soon.",
      gone: "This project isn't available", goneText: "It may have been removed, or the link is wrong.",
      badTitle: "Link incomplete", badText: "This link is damaged. Ask for it again.",
      offline: "Couldn't load the project.", retry: "Try again", maintenance: "WaterNow is being updated. The project will be back in a moment.",
      where: "Exactly where", candidates: "The candidate sites", chosen: "Chosen by the members",
      site: function (l) { return "Site " + l; },
      newly: function (s) { return s + " residents newly within a 5-minute walk"; },
      res10: function (s) { return s + " residents within a 10-minute walk"; },
      demand: function (s) { return s + " searches for water with no result nearby"; },
      votes: function (s, n) { return n === 1 ? "1 vote" : s + " votes"; },
      votesHidden: "Vote counts stay hidden until the vote closes.",
      voteTitle: "Vote in the app", voteText: "One vote per member, which you can change until the vote closes.",
      voteDates: function (a, b) { return "Open from " + a + " to " + b; },
      who: "Who builds it", builder: "Builder", host: "Host",
      kinds: { contractor: "Contractor", partner: "WaterNow partner", city: "City", obnl: "Non-profit" },
      quote: function (s) { return "Quote: " + s; }, quoteDoc: "See the quote",
      hostText: "The host owns the fountain, looks after it and keeps it open to everyone.",
      howMuch: "How much", raisedOf: function (a, b) { return a + " of " + b; },
      matchedPart: function (s) { return "including " + s + " matched"; },
      donorsCount: function (s, n) { return n === 1 ? "1 person gave" : s + " people gave"; },
      until: function (d) { return "Until " + d; },
      budget: "Detailed budget", total: "Total",
      budgetKinds: { equipment: "Equipment", installation: "Installation", permits: "Permits", maintenance: "Maintenance fund", fees: "Payment fees", other: "Other" },
      matching: function (org, x, cap, d) { return org + (x === 2 ? " doubles" : " multiplies by " + x) + " every gift, up to " + cap + (d ? ", until " + d : "") + "."; },
      matchingLeft: function (s) { return s + " of matching left"; },
      rollover: "If the goal isn't reached, the money stays in the Community Fountain fund and goes to the next project.",
      donors: "Donor wall", anonymous: "Anonymous", firstDonor: "No gifts yet. Yours can be the first.",
      sponsors: "Sponsors", tiers: { gold: "Gold", silver: "Silver", bronze: "Bronze" },
      give: "Give", amount: "Amount", other: "Other amount", otherHint: function (a, b) { return "From " + a + " to " + b; },
      once: "One time", monthly: "Monthly",
      monthlyNote: "A monthly gift goes to the Community Fountain fund: each month, it goes to the project being funded.",
      yourName: "Your name on the wall", anonymousLabel: "Give anonymously", showAmount: "Show the amount on the wall",
      message: "A short message (optional)", left: function (n) { return n === 1 ? "1 character left" : n + " characters left"; },
      giveBtn: function (s) { return "Give " + s; }, giveMonthlyBtn: function (s) { return "Give " + s + " a month"; },
      badAmount: function (a, b) { return "Choose an amount from " + a + " to " + b + "."; },
      badName: "Type your name, or give anonymously.",
      soon: "Donations open soon", soonText: "Payments aren't connected yet. Come back in a few days.",
      opening: "Opening the secure payment…", failed: "The payment couldn't start. Try again in a moment.",
      secure: "Secure payment by Stripe, in your browser: WaterNow never sees your card.", noTax: "This gift isn't tax-deductible.",
      errors: { form: "Something in the form didn't go through. Check it and try again.", project: "This project no longer takes gifts. Reload the page.",
        message: "Your message is too long: 140 characters at most.", origin: "Gifts only work from WaterNow's own website.", monthly: "Monthly gifts go to the Community Fountain fund only." },
      closed: { vote: "Donations open once the members have chosen the site.", building: "Fully funded. Thank you to everyone who gave!",
        built: "Built by the community. Thank you!", archived: "This campaign has ended: its money went to the next project." },
      nextProject: "See the next project",
      impact: "Since it opened", refills: function (s, n) { return n === 1 ? "1 refill" : s + " refills"; },
      bottles: function (s) { return "up to " + s + " bottles avoided"; },
      bottleNote: "Counted in 500 ml bottles: a refill doesn't always replace a bottle.",
      opened: function (d) { return "Open since " + d; }, fountainPage: "See the fountain's page", story: "The project's story", builtBy: "Built by the community",
      open: "Open in WaterNow", onMap: "See on the map", map: "Map of the fountain's site",
      notFountain: "This point isn't a Community Fountain", notFountainText: "It may not be built yet, or the link is wrong.",
      thanks: "Thank you!", thanksText: "Your gift is on its way. It will show on the wall in a moment.",
      thanksFund: "Thank you for giving to the Community Fountain fund.", back: "Back to the project",
      stopMonthly: "To stop your monthly gift, write to us. With a WaterNow account, it's also in the app: Profile, My gifts, “Manage my monthly gift”.", writeUs: "Write to us",
      share: "Share", copied: "Link copied", shareText: "Let's build a free water fountain together",
      getTitle: "No WaterNow yet?", getText: "Free drinking water near you, on a map the community keeps up to date.",
      get: "Get WaterNow", foot: "No trackers, no cookies."
    },
    fr: {
      name: "La Fontaine commune", doc: function (t) { return t + " · La Fontaine commune"; }, demo: "Données de démonstration",
      status: { vote: "Vote en cours", funding: "Collecte en cours", building: "En construction", built: "Construite", archived: "Campagne terminée" },
      lead: "Ensemble, la communauté WaterNow finance une vraie station de remplissage, à l'endroit qu'elle choisit.",
      none: "Pas de projet en ce moment", noneText: "La prochaine Fontaine commune se prépare. Reviens bientôt.",
      gone: "Ce projet n'est pas disponible", goneText: "Il a peut-être été retiré, ou le lien est erroné.",
      badTitle: "Lien incomplet", badText: "Ce lien est abîmé. Redemande-le.",
      offline: "Impossible de charger le projet.", retry: "Réessayer", maintenance: "WaterNow est en cours de mise à jour. Le projet revient dans un moment.",
      where: "Où exactement", candidates: "Les sites proposés", chosen: "Choisi par les membres",
      site: function (l) { return "Site " + l; },
      newly: function (s) { return s + " résidents de plus à moins de 5 minutes à pied"; },
      res10: function (s) { return s + " résidents à moins de 10 minutes à pied"; },
      demand: function (s) { return s + " recherches d'eau sans résultat tout près"; },
      votes: function (s, n) { return n <= 1 ? n + " vote" : s + " votes"; },
      votesHidden: "Le nombre de votes reste caché jusqu'à la fin du vote.",
      voteTitle: "Vote dans l'app", voteText: "Une voix par membre, que tu peux changer jusqu'à la fin du vote.",
      voteDates: function (a, b) { return "Ouvert du " + a + " au " + b; },
      who: "Qui la construit", builder: "Construction", host: "Hôte",
      kinds: { contractor: "Entrepreneur", partner: "Partenaire WaterNow", city: "Ville", obnl: "OBNL" },
      quote: function (s) { return "Soumission : " + s; }, quoteDoc: "Voir la soumission",
      hostText: "L'hôte possède la fontaine, l'entretient et la garde ouverte à tout le monde.",
      howMuch: "Combien", raisedOf: function (a, b) { return a + " sur " + b; },
      matchedPart: function (s) { return "dont " + s + " jumelés"; },
      donorsCount: function (s, n) { return n <= 1 ? n + " personne a donné" : s + " personnes ont donné"; },
      until: function (d) { return "Jusqu'au " + d; },
      budget: "Budget détaillé", total: "Total",
      budgetKinds: { equipment: "Équipement", installation: "Installation", permits: "Permis", maintenance: "Fonds d'entretien", fees: "Frais de paiement", other: "Autre" },
      matching: function (org, x, cap, d) { return org + (x === 2 ? " double" : " multiplie par " + x) + " chaque don, jusqu'à " + cap + (d ? ", jusqu'au " + d : "") + "."; },
      matchingLeft: function (s) { return "Encore " + s + " de jumelage"; },
      rollover: "Si l'objectif n'est pas atteint, l'argent reste dans le fonds de la Fontaine commune et va au prochain projet.",
      donors: "Mur des donateurs", anonymous: "Anonyme", firstDonor: "Pas encore de don. Le tien peut être le premier.",
      sponsors: "Commanditaires", tiers: { gold: "Or", silver: "Argent", bronze: "Bronze" },
      give: "Donner", amount: "Montant", other: "Autre montant", otherHint: function (a, b) { return "De " + a + " à " + b; },
      once: "Une fois", monthly: "Chaque mois",
      monthlyNote: "Un don mensuel va au fonds de la Fontaine commune : chaque mois, il va au projet en collecte.",
      yourName: "Ton nom sur le mur", anonymousLabel: "Donner en anonyme", showAmount: "Afficher le montant sur le mur",
      message: "Un petit mot (facultatif)", left: function (n) { return n <= 1 ? n + " caractère restant" : n + " caractères restants"; },
      giveBtn: function (s) { return "Donner " + s; }, giveMonthlyBtn: function (s) { return "Donner " + s + " par mois"; },
      badAmount: function (a, b) { return "Choisis un montant de " + a + " à " + b + "."; },
      badName: "Écris ton nom, ou donne en anonyme.",
      soon: "Les dons ouvrent bientôt", soonText: "Le paiement n'est pas encore branché. Reviens dans quelques jours.",
      opening: "Ouverture du paiement sécurisé…", failed: "Le paiement n'a pas pu démarrer. Réessaie dans un moment.",
      secure: "Paiement sécurisé par Stripe, dans ton navigateur : WaterNow ne voit jamais ta carte.", noTax: "Ce don n'est pas déductible d'impôt.",
      errors: { form: "Quelque chose dans le formulaire n'est pas passé. Vérifie-le et réessaie.", project: "Ce projet ne reçoit plus de dons. Recharge la page.",
        message: "Ton message est trop long : 140 caractères au maximum.", origin: "Les dons passent seulement par le site de WaterNow.", monthly: "Les dons mensuels vont seulement au fonds de la Fontaine commune." },
      closed: { vote: "Les dons ouvrent quand les membres auront choisi le site.", building: "Financée à 100 %. Merci à toutes les personnes qui ont donné !",
        built: "Construite par la communauté. Merci !", archived: "Cette campagne est terminée : son argent est allé au projet suivant." },
      nextProject: "Voir le projet suivant",
      impact: "Depuis son ouverture", refills: function (s, n) { return n <= 1 ? n + " remplissage" : s + " remplissages"; },
      bottles: function (s) { return "jusqu'à " + s + " bouteilles évitées"; },
      bottleNote: "Compté en bouteilles de 500 ml : un remplissage ne remplace pas toujours une bouteille.",
      opened: function (d) { return "Ouverte depuis le " + d; }, fountainPage: "Voir la page de la fontaine", story: "L'histoire du projet", builtBy: "Construite par la communauté",
      open: "Ouvrir dans WaterNow", onMap: "Voir sur la carte", map: "Carte du site de la fontaine",
      notFountain: "Ce point n'est pas une Fontaine commune", notFountainText: "Elle n'est peut-être pas encore construite, ou le lien est erroné.",
      thanks: "Merci !", thanksText: "Ton don est en route. Il apparaîtra sur le mur dans un moment.",
      thanksFund: "Merci pour ton don au fonds de la Fontaine commune.", back: "Retour au projet",
      stopMonthly: "Pour arrêter ton don mensuel, écris-nous. Avec un compte WaterNow, c'est aussi dans l'app : Profil, Mes dons, « Gérer mon don mensuel ».", writeUs: "Nous écrire",
      share: "Partager", copied: "Lien copié", shareText: "Construisons ensemble une fontaine d'eau gratuite",
      getTitle: "Pas encore WaterNow ?", getText: "De l'eau potable gratuite près de toi, sur une carte que la communauté tient à jour.",
      get: "Obtenir WaterNow", foot: "Aucun traceur, aucun cookie."
    },
    es: {
      name: "La Fuente común", doc: function (t) { return t + " · La Fuente común"; }, demo: "Datos de demostración",
      status: { vote: "Votación en curso", funding: "Recaudación en curso", building: "En construcción", built: "Construida", archived: "Campaña terminada" },
      lead: "Juntos, la comunidad WaterNow financia una estación de recarga de verdad, en el lugar que elige.",
      none: "No hay ningún proyecto ahora", noneText: "La próxima Fuente común se está preparando. Vuelve pronto.",
      gone: "Este proyecto no está disponible", goneText: "Puede que se haya retirado, o el enlace es incorrecto.",
      badTitle: "Enlace incompleto", badText: "Este enlace está dañado. Pídelo de nuevo.",
      offline: "No se pudo cargar el proyecto.", retry: "Reintentar", maintenance: "WaterNow se está actualizando. El proyecto volverá en un momento.",
      where: "Dónde exactamente", candidates: "Los lugares propuestos", chosen: "Elegido por los miembros",
      site: function (l) { return "Lugar " + l; },
      newly: function (s) { return s + " residentes más a menos de 5 minutos a pie"; },
      res10: function (s) { return s + " residentes a menos de 10 minutos a pie"; },
      demand: function (s) { return s + " búsquedas de agua sin resultado cerca"; },
      votes: function (s, n) { return n === 1 ? "1 voto" : s + " votos"; },
      votesHidden: "El número de votos queda oculto hasta el cierre de la votación.",
      voteTitle: "Vota en la app", voteText: "Un voto por miembro, que puedes cambiar hasta el cierre de la votación.",
      voteDates: function (a, b) { return "Abierta del " + a + " al " + b; },
      who: "Quién la construye", builder: "Construcción", host: "Anfitrión",
      kinds: { contractor: "Contratista", partner: "Socio de WaterNow", city: "Ciudad", obnl: "Organización sin fines de lucro" },
      quote: function (s) { return "Presupuesto: " + s; }, quoteDoc: "Ver el presupuesto",
      hostText: "El anfitrión es dueño de la fuente, la cuida y la mantiene abierta para todos.",
      howMuch: "Cuánto", raisedOf: function (a, b) { return a + " de " + b; },
      matchedPart: function (s) { return "incluidos " + s + " igualados"; },
      donorsCount: function (s, n) { return n === 1 ? "1 persona donó" : s + " personas donaron"; },
      until: function (d) { return "Hasta el " + d; },
      budget: "Presupuesto detallado", total: "Total",
      budgetKinds: { equipment: "Equipo", installation: "Instalación", permits: "Permisos", maintenance: "Fondo de mantenimiento", fees: "Comisiones de pago", other: "Otros" },
      matching: function (org, x, cap, d) { return org + (x === 2 ? " duplica" : " multiplica por " + x) + " cada donación, hasta " + cap + (d ? ", hasta el " + d : "") + "."; },
      matchingLeft: function (s) { return "Quedan " + s + " para igualar"; },
      rollover: "Si no se alcanza la meta, el dinero se queda en el fondo de la Fuente común y va al próximo proyecto.",
      donors: "Muro de donantes", anonymous: "Anónimo", firstDonor: "Aún no hay donaciones. La tuya puede ser la primera.",
      sponsors: "Patrocinadores", tiers: { gold: "Oro", silver: "Plata", bronze: "Bronce" },
      give: "Donar", amount: "Importe", other: "Otro importe", otherHint: function (a, b) { return "De " + a + " a " + b; },
      once: "Una vez", monthly: "Cada mes",
      monthlyNote: "Una donación mensual va al fondo de la Fuente común: cada mes, va al proyecto en recaudación.",
      yourName: "Tu nombre en el muro", anonymousLabel: "Donar de forma anónima", showAmount: "Mostrar el importe en el muro",
      message: "Un mensaje corto (opcional)", left: function (n) { return n === 1 ? "Queda 1 carácter" : "Quedan " + n + " caracteres"; },
      giveBtn: function (s) { return "Donar " + s; }, giveMonthlyBtn: function (s) { return "Donar " + s + " al mes"; },
      badAmount: function (a, b) { return "Elige un importe de " + a + " a " + b + "."; },
      badName: "Escribe tu nombre, o dona de forma anónima.",
      soon: "Las donaciones abren pronto", soonText: "El pago aún no está conectado. Vuelve en unos días.",
      opening: "Abriendo el pago seguro…", failed: "No se pudo iniciar el pago. Inténtalo de nuevo en un momento.",
      secure: "Pago seguro con Stripe, en tu navegador: WaterNow nunca ve tu tarjeta.", noTax: "Esta donación no es deducible de impuestos.",
      errors: { form: "Algo del formulario no se envió bien. Revísalo e inténtalo de nuevo.", project: "Este proyecto ya no recibe donaciones. Recarga la página.",
        message: "Tu mensaje es demasiado largo: 140 caracteres como máximo.", origin: "Las donaciones solo funcionan desde el sitio web de WaterNow.", monthly: "Las donaciones mensuales solo van al fondo de la Fuente común." },
      closed: { vote: "Las donaciones abren cuando los miembros hayan elegido el lugar.", building: "Financiada al 100 %. ¡Gracias a todas las personas que donaron!",
        built: "Construida por la comunidad. ¡Gracias!", archived: "Esta campaña terminó: su dinero fue al siguiente proyecto." },
      nextProject: "Ver el siguiente proyecto",
      impact: "Desde su apertura", refills: function (s, n) { return n === 1 ? "1 recarga" : s + " recargas"; },
      bottles: function (s) { return "hasta " + s + " botellas evitadas"; },
      bottleNote: "Contado en botellas de 500 ml: una recarga no siempre reemplaza una botella.",
      opened: function (d) { return "Abierta desde el " + d; }, fountainPage: "Ver la página de la fuente", story: "La historia del proyecto", builtBy: "Construida por la comunidad",
      open: "Abrir en WaterNow", onMap: "Ver en el mapa", map: "Mapa del lugar de la fuente",
      notFountain: "Este punto no es una Fuente común", notFountainText: "Puede que aún no esté construida, o el enlace es incorrecto.",
      thanks: "¡Gracias!", thanksText: "Tu donación va en camino. Aparecerá en el muro en un momento.",
      thanksFund: "Gracias por donar al fondo de la Fuente común.", back: "Volver al proyecto",
      stopMonthly: "Para detener tu donación mensual, escríbenos. Con una cuenta de WaterNow, también está en la app: Perfil, Mis donaciones, «Gestionar mi donación mensual».", writeUs: "Escríbenos",
      share: "Compartir", copied: "Enlace copiado", shareText: "Construyamos juntos una fuente de agua gratis",
      getTitle: "¿Aún no tienes WaterNow?", getText: "Agua potable gratis cerca de ti, en un mapa que la comunidad mantiene al día.",
      get: "Consigue WaterNow", foot: "Sin rastreadores ni cookies."
    },
    de: {
      name: "Der Gemeinschaftsbrunnen", doc: function (t) { return t + " · Der Gemeinschaftsbrunnen"; }, demo: "Demodaten",
      status: { vote: "Abstimmung läuft", funding: "Spendenaktion läuft", building: "Im Bau", built: "Gebaut", archived: "Aktion beendet" },
      lead: "Gemeinsam finanziert die WaterNow-Community eine echte Nachfüllstation, an einem Ort ihrer Wahl.",
      none: "Gerade kein Projekt", noneText: "Der nächste Gemeinschaftsbrunnen wird vorbereitet. Schau bald wieder vorbei.",
      gone: "Dieses Projekt ist nicht verfügbar", goneText: "Es wurde vielleicht entfernt, oder der Link ist falsch.",
      badTitle: "Link unvollständig", badText: "Dieser Link ist beschädigt. Lass ihn dir noch einmal schicken.",
      offline: "Das Projekt konnte nicht geladen werden.", retry: "Erneut versuchen", maintenance: "WaterNow wird gerade aktualisiert. Das Projekt ist gleich wieder da.",
      where: "Wo genau", candidates: "Die vorgeschlagenen Orte", chosen: "Von den Mitgliedern gewählt",
      site: function (l) { return "Ort " + l; },
      newly: function (s) { return s + " Anwohner neu in 5 Gehminuten"; },
      res10: function (s) { return s + " Anwohner in 10 Gehminuten"; },
      demand: function (s) { return s + " Suchen nach Wasser ohne Treffer in der Nähe"; },
      votes: function (s, n) { return n === 1 ? "1 Stimme" : s + " Stimmen"; },
      votesHidden: "Die Stimmenzahlen bleiben bis zum Ende der Abstimmung verborgen.",
      voteTitle: "Stimm in der App ab", voteText: "Eine Stimme pro Mitglied, die du bis zum Ende der Abstimmung ändern kannst.",
      voteDates: function (a, b) { return "Offen vom " + a + " bis " + b; },
      who: "Wer ihn baut", builder: "Bau", host: "Gastgeber",
      kinds: { contractor: "Bauunternehmen", partner: "WaterNow-Partner", city: "Stadt", obnl: "Gemeinnützige Organisation" },
      quote: function (s) { return "Angebot: " + s; }, quoteDoc: "Angebot ansehen",
      hostText: "Der Gastgeber besitzt den Brunnen, pflegt ihn und hält ihn für alle offen.",
      howMuch: "Wie viel", raisedOf: function (a, b) { return a + " von " + b; },
      matchedPart: function (s) { return "davon " + s + " verdoppelt"; },
      donorsCount: function (s, n) { return n === 1 ? "1 Person hat gespendet" : s + " Personen haben gespendet"; },
      until: function (d) { return "Bis " + d; },
      budget: "Detailliertes Budget", total: "Gesamt",
      budgetKinds: { equipment: "Ausstattung", installation: "Installation", permits: "Genehmigungen", maintenance: "Wartungsfonds", fees: "Zahlungsgebühren", other: "Sonstiges" },
      matching: function (org, x, cap, d) { return org + (x === 2 ? " verdoppelt jede Spende" : " vervielfacht jede Spende (×" + x + ")") + ", bis zu " + cap + (d ? ", bis " + d : "") + "."; },
      matchingLeft: function (s) { return "Noch " + s + " zum Verdoppeln"; },
      rollover: "Wird das Ziel nicht erreicht, bleibt das Geld im Fonds des Gemeinschaftsbrunnens und geht an das nächste Projekt.",
      donors: "Spenderwand", anonymous: "Anonym", firstDonor: "Noch keine Spende. Deine kann die erste sein.",
      sponsors: "Sponsoren", tiers: { gold: "Gold", silver: "Silber", bronze: "Bronze" },
      give: "Spenden", amount: "Betrag", other: "Anderer Betrag", otherHint: function (a, b) { return "Von " + a + " bis " + b; },
      once: "Einmalig", monthly: "Monatlich",
      monthlyNote: "Eine monatliche Spende geht in den Fonds des Gemeinschaftsbrunnens: Jeden Monat geht sie an das Projekt, für das gerade gesammelt wird.",
      yourName: "Dein Name auf der Wand", anonymousLabel: "Anonym spenden", showAmount: "Betrag auf der Wand zeigen",
      message: "Eine kurze Nachricht (freiwillig)", left: function (n) { return n === 1 ? "Noch 1 Zeichen" : "Noch " + n + " Zeichen"; },
      giveBtn: function (s) { return s + " spenden"; }, giveMonthlyBtn: function (s) { return s + " im Monat spenden"; },
      badAmount: function (a, b) { return "Wähl einen Betrag von " + a + " bis " + b + "."; },
      badName: "Gib deinen Namen ein, oder spende anonym.",
      soon: "Spenden sind bald möglich", soonText: "Die Zahlung ist noch nicht angebunden. Schau in ein paar Tagen wieder vorbei.",
      opening: "Sichere Zahlung wird geöffnet…", failed: "Die Zahlung konnte nicht starten. Versuch es gleich noch einmal.",
      secure: "Sichere Zahlung mit Stripe, in deinem Browser: WaterNow sieht deine Karte nie.", noTax: "Diese Spende ist nicht steuerlich absetzbar.",
      errors: { form: "Etwas im Formular hat nicht geklappt. Prüf es und versuch es noch einmal.", project: "Dieses Projekt nimmt keine Spenden mehr an. Lade die Seite neu.",
        message: "Deine Nachricht ist zu lang: höchstens 140 Zeichen.", origin: "Spenden gehen nur über die Website von WaterNow.", monthly: "Monatliche Spenden gehen nur in den Fonds des Gemeinschaftsbrunnens." },
      closed: { vote: "Spenden sind möglich, sobald die Mitglieder den Ort gewählt haben.", building: "Voll finanziert. Danke an alle, die gespendet haben!",
        built: "Von der Community gebaut. Danke!", archived: "Diese Aktion ist beendet: Ihr Geld ging an das nächste Projekt." },
      nextProject: "Zum nächsten Projekt",
      impact: "Seit der Eröffnung", refills: function (s, n) { return n === 1 ? "1 Nachfüllung" : s + " Nachfüllungen"; },
      bottles: function (s) { return "bis zu " + s + " vermiedene Flaschen"; },
      bottleNote: "Gezählt in 500-ml-Flaschen: Nicht jede Nachfüllung ersetzt eine Flasche.",
      opened: function (d) { return "Geöffnet seit " + d; }, fountainPage: "Zur Seite des Brunnens", story: "Die Geschichte des Projekts", builtBy: "Von der Community gebaut",
      open: "In WaterNow öffnen", onMap: "Auf der Karte ansehen", map: "Karte mit dem Ort des Brunnens",
      notFountain: "Dieser Ort ist kein Gemeinschaftsbrunnen", notFountainText: "Er ist vielleicht noch nicht gebaut, oder der Link ist falsch.",
      thanks: "Danke!", thanksText: "Deine Spende ist unterwegs. Sie erscheint gleich auf der Wand.",
      thanksFund: "Danke für deine Spende an den Fonds des Gemeinschaftsbrunnens.", back: "Zurück zum Projekt",
      stopMonthly: "Um deine monatliche Spende zu beenden, schreib uns. Mit einem WaterNow-Konto geht das auch in der App: Profil, Meine Spenden, „Meine monatliche Spende verwalten“.", writeUs: "Schreib uns",
      share: "Teilen", copied: "Link kopiert", shareText: "Lass uns gemeinsam einen kostenlosen Trinkbrunnen bauen",
      getTitle: "Noch kein WaterNow?", getText: "Kostenloses Trinkwasser in deiner Nähe, auf einer Karte, die die Community aktuell hält.",
      get: "WaterNow holen", foot: "Keine Tracker, keine Cookies."
    },
    pt: {
      name: "A Fonte comum", doc: function (t) { return t + " · A Fonte comum"; }, demo: "Dados de demonstração",
      status: { vote: "Votação em andamento", funding: "Arrecadação em andamento", building: "Em construção", built: "Construída", archived: "Campanha encerrada" },
      lead: "Juntos, a comunidade WaterNow financia uma estação de recarga de verdade, no lugar que escolher.",
      none: "Nenhum projeto no momento", noneText: "A próxima Fonte comum está sendo preparada. Volte em breve.",
      gone: "Este projeto não está disponível", goneText: "Ele pode ter sido removido, ou o link está errado.",
      badTitle: "Link incompleto", badText: "Este link está corrompido. Peça de novo.",
      offline: "Não foi possível carregar o projeto.", retry: "Tentar de novo", maintenance: "O WaterNow está sendo atualizado. O projeto volta daqui a pouco.",
      where: "Onde exatamente", candidates: "Os lugares propostos", chosen: "Escolhido pelos membros",
      site: function (l) { return "Lugar " + l; },
      newly: function (s) { return s + " moradores a mais a menos de 5 minutos a pé"; },
      res10: function (s) { return s + " moradores a menos de 10 minutos a pé"; },
      demand: function (s) { return s + " buscas por água sem resultado por perto"; },
      votes: function (s, n) { return n === 1 ? "1 voto" : s + " votos"; },
      votesHidden: "O número de votos fica oculto até o fim da votação.",
      voteTitle: "Vote no app", voteText: "Um voto por membro, que você pode mudar até o fim da votação.",
      voteDates: function (a, b) { return "Aberta de " + a + " a " + b; },
      who: "Quem constrói", builder: "Construção", host: "Anfitrião",
      kinds: { contractor: "Empreiteira", partner: "Parceiro do WaterNow", city: "Cidade", obnl: "Organização sem fins lucrativos" },
      quote: function (s) { return "Orçamento: " + s; }, quoteDoc: "Ver o orçamento",
      hostText: "O anfitrião é dono da fonte, cuida dela e a mantém aberta para todos.",
      howMuch: "Quanto", raisedOf: function (a, b) { return a + " de " + b; },
      matchedPart: function (s) { return "incluindo " + s + " dobrados"; },
      donorsCount: function (s, n) { return n === 1 ? "1 pessoa doou" : s + " pessoas doaram"; },
      until: function (d) { return "Até " + d; },
      budget: "Orçamento detalhado", total: "Total",
      budgetKinds: { equipment: "Equipamento", installation: "Instalação", permits: "Licenças", maintenance: "Fundo de manutenção", fees: "Taxas de pagamento", other: "Outros" },
      matching: function (org, x, cap, d) { return org + (x === 2 ? " dobra" : " multiplica por " + x) + " cada doação, até " + cap + (d ? ", até " + d : "") + "."; },
      matchingLeft: function (s) { return "Ainda " + s + " para dobrar"; },
      rollover: "Se a meta não for atingida, o dinheiro fica no fundo da Fonte comum e vai para o próximo projeto.",
      donors: "Mural de doadores", anonymous: "Anônimo", firstDonor: "Ainda não há doações. A sua pode ser a primeira.",
      sponsors: "Patrocinadores", tiers: { gold: "Ouro", silver: "Prata", bronze: "Bronze" },
      give: "Doar", amount: "Valor", other: "Outro valor", otherHint: function (a, b) { return "De " + a + " a " + b; },
      once: "Uma vez", monthly: "Todo mês",
      monthlyNote: "Uma doação mensal vai para o fundo da Fonte comum: todo mês, ela vai para o projeto em arrecadação.",
      yourName: "Seu nome no mural", anonymousLabel: "Doar como anônimo", showAmount: "Mostrar o valor no mural",
      message: "Uma mensagem curta (opcional)", left: function (n) { return n === 1 ? "Resta 1 caractere" : "Restam " + n + " caracteres"; },
      giveBtn: function (s) { return "Doar " + s; }, giveMonthlyBtn: function (s) { return "Doar " + s + " por mês"; },
      badAmount: function (a, b) { return "Escolha um valor de " + a + " a " + b + "."; },
      badName: "Digite seu nome, ou doe como anônimo.",
      soon: "As doações abrem em breve", soonText: "O pagamento ainda não está conectado. Volte em alguns dias.",
      opening: "Abrindo o pagamento seguro…", failed: "Não foi possível iniciar o pagamento. Tente de novo daqui a pouco.",
      secure: "Pagamento seguro com Stripe, no seu navegador: o WaterNow nunca vê o seu cartão.", noTax: "Esta doação não é dedutível do imposto de renda.",
      errors: { form: "Algo no formulário não foi enviado. Verifique e tente de novo.", project: "Este projeto não recebe mais doações. Recarregue a página.",
        message: "Sua mensagem é longa demais: no máximo 140 caracteres.", origin: "As doações só funcionam pelo site do WaterNow.", monthly: "As doações mensais vão só para o fundo da Fonte comum." },
      closed: { vote: "As doações abrem quando os membros escolherem o lugar.", building: "Financiada 100 %. Obrigado a todas as pessoas que doaram!",
        built: "Construída pela comunidade. Obrigado!", archived: "Esta campanha terminou: o dinheiro foi para o próximo projeto." },
      nextProject: "Ver o próximo projeto",
      impact: "Desde a inauguração", refills: function (s, n) { return n === 1 ? "1 recarga" : s + " recargas"; },
      bottles: function (s) { return "até " + s + " garrafas evitadas"; },
      bottleNote: "Contado em garrafas de 500 ml: uma recarga nem sempre substitui uma garrafa.",
      opened: function (d) { return "Aberta desde " + d; }, fountainPage: "Ver a página da fonte", story: "A história do projeto", builtBy: "Construída pela comunidade",
      open: "Abrir no WaterNow", onMap: "Ver no mapa", map: "Mapa do lugar da fonte",
      notFountain: "Este ponto não é uma Fonte comum", notFountainText: "Ela pode ainda não ter sido construída, ou o link está errado.",
      thanks: "Obrigado!", thanksText: "Sua doação está a caminho. Ela vai aparecer no mural daqui a pouco.",
      thanksFund: "Obrigado por doar para o fundo da Fonte comum.", back: "Voltar ao projeto",
      stopMonthly: "Para parar sua doação mensal, escreva para nós. Com uma conta WaterNow, também dá no app: Perfil, Minhas doações, “Gerenciar minha doação mensal”.", writeUs: "Escreva para nós",
      share: "Compartilhar", copied: "Link copiado", shareText: "Vamos construir juntos uma fonte de água grátis",
      getTitle: "Ainda não tem o WaterNow?", getText: "Água potável grátis perto de você, em um mapa que a comunidade mantém atualizado.",
      get: "Baixe o WaterNow", foot: "Sem rastreadores, sem cookies."
    },
    ja: {
      name: "みんなの給水所", doc: function (t) { return t + "・みんなの給水所"; }, demo: "デモデータ",
      status: { vote: "投票受付中", funding: "寄付受付中", building: "建設中", built: "完成", archived: "募集終了" },
      lead: "WaterNowのコミュニティが、みんなで選んだ場所に本物の給水ステーションを設置するための資金を集めます。",
      none: "現在のプロジェクトはありません", noneText: "次の「みんなの給水所」を準備中です。またお越しください。",
      gone: "このプロジェクトは利用できません", goneText: "削除されたか、リンクが正しくない可能性があります。",
      badTitle: "リンクが不完全です", badText: "このリンクは壊れています。もう一度送ってもらってください。",
      offline: "プロジェクトを読み込めませんでした。", retry: "再試行", maintenance: "WaterNowは現在アップデート中です。プロジェクトはまもなく表示されます。",
      where: "設置場所", candidates: "候補地", chosen: "メンバーが選んだ場所",
      site: function (l) { return "候補地 " + l; },
      newly: function (s) { return "徒歩5分圏内に新たに入る住民 " + s + "人"; },
      res10: function (s) { return "徒歩10分圏内の住民 " + s + "人"; },
      demand: function (s) { return "近くで見つからなかった給水スポット検索 " + s + "件"; },
      votes: function (s) { return s + "票"; },
      votesHidden: "投票数は投票終了まで非公開です。",
      voteTitle: "アプリで投票", voteText: "投票は1人1票で、投票終了まで変更できます。",
      voteDates: function (a, b) { return a + "から" + b + "まで受付"; },
      who: "建設するのは", builder: "施工", host: "設置先",
      kinds: { contractor: "施工業者", partner: "WaterNowパートナー", city: "自治体", obnl: "非営利団体" },
      quote: function (s) { return "見積額：" + s; }, quoteDoc: "見積書を見る",
      hostText: "給水所は設置先が所有・管理し、誰でも使えるように開放します。",
      howMuch: "費用", raisedOf: function (a, b) { return a + "／目標 " + b; },
      matchedPart: function (s) { return "うちマッチング寄付 " + s; },
      donorsCount: function (s) { return s + "人が寄付しました"; },
      until: function (d) { return d + "まで"; },
      budget: "予算の内訳", total: "合計",
      budgetKinds: { equipment: "設備", installation: "設置工事", permits: "許可申請", maintenance: "維持管理費", fees: "決済手数料", other: "その他" },
      matching: function (org, x, cap, d) { return org + "が" + (d ? d + "まで、" : "") + cap + "を上限に、すべての寄付を" + x + "倍にします。"; },
      matchingLeft: function (s) { return "マッチング残り " + s; },
      rollover: "目標に届かなかった場合、寄付金は「みんなの給水所」の基金に残り、次のプロジェクトに使われます。",
      donors: "寄付者の壁", anonymous: "匿名", firstDonor: "まだ寄付はありません。最初の1人になりませんか。",
      sponsors: "スポンサー", tiers: { gold: "ゴールド", silver: "シルバー", bronze: "ブロンズ" },
      give: "寄付する", amount: "金額", other: "その他の金額", otherHint: function (a, b) { return a + "〜" + b; },
      once: "1回のみ", monthly: "毎月",
      monthlyNote: "毎月の寄付は「みんなの給水所」の基金に入り、その月に寄付を募っているプロジェクトに使われます。",
      yourName: "壁に表示する名前", anonymousLabel: "匿名で寄付する", showAmount: "金額を壁に表示する",
      message: "ひとこと（任意）", left: function (n) { return "残り" + n + "文字"; },
      giveBtn: function (s) { return s + "を寄付"; }, giveMonthlyBtn: function (s) { return "毎月" + s + "を寄付"; },
      badAmount: function (a, b) { return a + "〜" + b + "の金額を選んでください。"; },
      badName: "名前を入力するか、匿名で寄付してください。",
      soon: "寄付はまもなく受付開始です", soonText: "決済はまだ接続されていません。数日後にまたお越しください。",
      opening: "安全な決済ページを開いています…", failed: "決済を開始できませんでした。しばらくしてからもう一度お試しください。",
      secure: "Stripeによる安全な決済で、ブラウザ内で完了します。WaterNowがカード情報を見ることはありません。", noTax: "この寄付は税控除の対象になりません。",
      errors: { form: "フォームの内容を送信できませんでした。確認してもう一度お試しください。", project: "このプロジェクトは現在寄付を受け付けていません。ページを再読み込みしてください。",
        message: "メッセージが長すぎます。140文字以内にしてください。", origin: "寄付はWaterNowのウェブサイトからのみ受け付けています。", monthly: "毎月の寄付は「みんなの給水所」の基金にのみ入ります。" },
      closed: { vote: "寄付は、メンバーが設置場所を選んだあとに受付を開始します。", building: "目標額に達しました。寄付してくださった皆さん、ありがとうございます！",
        built: "コミュニティの力で完成しました。ありがとうございます！", archived: "この募集は終了しました。寄付金は次のプロジェクトに使われます。" },
      nextProject: "次のプロジェクトを見る",
      impact: "設置以来", refills: function (s) { return "給水 " + s + "回"; },
      bottles: function (s) { return "最大" + s + "本のペットボトルを削減"; },
      bottleNote: "500 mlのボトル換算です。給水1回が必ずしもボトル1本の削減になるとは限りません。",
      opened: function (d) { return d + "から利用可能"; }, fountainPage: "給水所のページを見る", story: "プロジェクトのあゆみ", builtBy: "コミュニティの力で完成",
      open: "WaterNowで開く", onMap: "マップで見る", map: "給水所の場所のマップ",
      notFountain: "このスポットは「みんなの給水所」ではありません", notFountainText: "まだ完成していないか、リンクが正しくない可能性があります。",
      thanks: "ありがとうございます！", thanksText: "寄付を受け付けています。まもなく壁に表示されます。",
      thanksFund: "「みんなの給水所」の基金へのご寄付、ありがとうございます。", back: "プロジェクトに戻る",
      stopMonthly: "毎月の寄付をやめるには、ご連絡ください。WaterNowのアカウントがあれば、アプリの「プロフィール」→「寄付の履歴」→「毎月の寄付を管理」からも停止できます。", writeUs: "お問い合わせ",
      share: "共有", copied: "リンクをコピーしました", shareText: "みんなで無料の給水所をつくりましょう",
      getTitle: "WaterNowをまだ使っていませんか？", getText: "近くの無料の飲み水を、コミュニティが更新し続けるマップで探せます。",
      get: "WaterNowを入手", foot: "トラッカーもCookieも使っていません。"
    },
    ro: {
      name: "Fântâna comună", doc: function (t) { return t + " · Fântâna comună"; }, demo: "Date demonstrative",
      status: { vote: "Vot în desfășurare", funding: "Strângere de fonduri", building: "În construcție", built: "Construită", archived: "Campanie încheiată" },
      lead: "Împreună, comunitatea WaterNow finanțează o stație de reumplere adevărată, în locul pe care îl alege.",
      none: "Niciun proiect acum", noneText: "Următoarea Fântână comună este în pregătire. Revino în curând.",
      gone: "Acest proiect nu este disponibil", goneText: "Poate a fost eliminat, sau linkul este greșit.",
      badTitle: "Link incomplet", badText: "Acest link este deteriorat. Cere-l din nou.",
      offline: "Proiectul nu s-a putut încărca.", retry: "Încearcă din nou", maintenance: "WaterNow se actualizează. Proiectul revine în curând.",
      where: "Unde exact", candidates: "Locurile propuse", chosen: "Ales de membri",
      site: function (l) { return "Locul " + l; },
      newly: function (s, n) { return s + roDe(n) + " locuitori în plus la mai puțin de 5 minute de mers pe jos"; },
      res10: function (s, n) { return s + roDe(n) + " locuitori la mai puțin de 10 minute de mers pe jos"; },
      demand: function (s, n) { return s + roDe(n) + " căutări de apă fără rezultat în apropiere"; },
      votes: function (s, n) { return n === 1 ? "1 vot" : s + roDe(n) + " voturi"; },
      votesHidden: "Numărul de voturi rămâne ascuns până la încheierea votului.",
      voteTitle: "Votează în aplicație", voteText: "Un vot pentru fiecare membru, pe care îl poți schimba până la încheierea votului.",
      voteDates: function (a, b) { return "Deschis între " + a + " și " + b; },
      who: "Cine o construiește", builder: "Construcție", host: "Gazdă",
      kinds: { contractor: "Antreprenor", partner: "Partener WaterNow", city: "Oraș", obnl: "Organizație nonprofit" },
      quote: function (s) { return "Ofertă: " + s; }, quoteDoc: "Vezi oferta",
      hostText: "Gazda deține fântâna, o întreține și o ține deschisă pentru toată lumea.",
      howMuch: "Cât costă", raisedOf: function (a, b) { return a + " din " + b; },
      matchedPart: function (s) { return "din care " + s + " dublați"; },
      donorsCount: function (s, n) { return n === 1 ? "1 persoană a donat" : s + roDe(n) + " persoane au donat"; },
      until: function (d) { return "Până pe " + d; },
      budget: "Buget detaliat", total: "Total",
      budgetKinds: { equipment: "Echipament", installation: "Instalare", permits: "Autorizații", maintenance: "Fond de întreținere", fees: "Comisioane de plată", other: "Altele" },
      matching: function (org, x, cap, d) { return org + (x === 2 ? " dublează" : " înmulțește cu " + x) + " fiecare donație, până la " + cap + (d ? ", până pe " + d : "") + "."; },
      matchingLeft: function (s) { return "Mai sunt " + s + " de dublat"; },
      rollover: "Dacă obiectivul nu este atins, banii rămân în fondul Fântânii comune și merg la următorul proiect.",
      donors: "Peretele donatorilor", anonymous: "Anonim", firstDonor: "Nicio donație încă. A ta poate fi prima.",
      sponsors: "Sponsori", tiers: { gold: "Aur", silver: "Argint", bronze: "Bronz" },
      give: "Donează", amount: "Sumă", other: "Altă sumă", otherHint: function (a, b) { return "De la " + a + " la " + b; },
      once: "O dată", monthly: "Lunar",
      monthlyNote: "O donație lunară merge în fondul Fântânii comune: în fiecare lună, ea merge la proiectul pentru care se strâng bani.",
      yourName: "Numele tău pe perete", anonymousLabel: "Donează anonim", showAmount: "Arată suma pe perete",
      message: "Un mesaj scurt (opțional)", left: function (n) { return n === 1 ? "A mai rămas 1 caracter" : "Au mai rămas " + n + roDe(n) + " caractere"; },
      giveBtn: function (s) { return "Donează " + s; }, giveMonthlyBtn: function (s) { return "Donează " + s + " pe lună"; },
      badAmount: function (a, b) { return "Alege o sumă de la " + a + " la " + b + "."; },
      badName: "Scrie-ți numele, sau donează anonim.",
      soon: "Donațiile se deschid în curând", soonText: "Plata nu este conectată încă. Revino peste câteva zile.",
      opening: "Se deschide plata securizată…", failed: "Plata nu a putut porni. Încearcă din nou în curând.",
      secure: "Plată securizată prin Stripe, în browserul tău: WaterNow nu îți vede niciodată cardul.", noTax: "Această donație nu este deductibilă fiscal.",
      errors: { form: "Ceva din formular nu a trecut. Verifică-l și încearcă din nou.", project: "Acest proiect nu mai primește donații. Reîncarcă pagina.",
        message: "Mesajul tău este prea lung: cel mult 140 de caractere.", origin: "Donațiile funcționează doar de pe site-ul WaterNow.", monthly: "Donațiile lunare merg doar în fondul Fântânii comune." },
      closed: { vote: "Donațiile se deschid după ce membrii aleg locul.", building: "Finanțată 100 %. Mulțumim tuturor celor care au donat!",
        built: "Construită de comunitate. Mulțumim!", archived: "Această campanie s-a încheiat: banii ei au mers la următorul proiect." },
      nextProject: "Vezi următorul proiect",
      impact: "De la deschidere", refills: function (s, n) { return n === 1 ? "1 reumplere" : s + roDe(n) + " reumpleri"; },
      bottles: function (s, n) { return "până la " + s + roDe(n) + " sticle evitate"; },
      bottleNote: "Numărate în sticle de 500 ml: o reumplere nu înlocuiește întotdeauna o sticlă.",
      opened: function (d) { return "Deschisă din " + d; }, fountainPage: "Vezi pagina fântânii", story: "Povestea proiectului", builtBy: "Construită de comunitate",
      open: "Deschide în WaterNow", onMap: "Vezi pe hartă", map: "Harta locului fântânii",
      notFountain: "Acest punct nu este o Fântână comună", notFountainText: "Poate nu este construită încă, sau linkul este greșit.",
      thanks: "Mulțumim!", thanksText: "Donația ta este pe drum. Va apărea pe perete în curând.",
      thanksFund: "Mulțumim pentru donația ta la fondul Fântânii comune.", back: "Înapoi la proiect",
      stopMonthly: "Ca să oprești donația lunară, scrie-ne. Cu un cont WaterNow, poți face asta și în aplicație: Profil, Donațiile mele, „Gestionează donația mea lunară”.", writeUs: "Scrie-ne",
      share: "Distribuie", copied: "Link copiat", shareText: "Hai să construim împreună o fântână cu apă gratuită",
      getTitle: "Nu ai încă WaterNow?", getText: "Apă potabilă gratuită lângă tine, pe o hartă pe care comunitatea o ține la zi.",
      get: "Descarcă WaterNow", foot: "Fără trackere, fără cookie-uri."
    }
  };

  var api = {
    STATUSES: STATUSES, BUILDER_KINDS: BUILDER_KINDS, BUDGET_KINDS: BUDGET_KINDS, TIERS: TIERS, PRESETS: PRESETS,
    MIN_CENTS: MIN_CENTS, MAX_CENTS: MAX_CENTS, MESSAGE_MAX: MESSAGE_MAX, NAME_MAX: NAME_MAX,
    link: link, image: image, project: project, current: current, tiers: tiers, money: money, share: share, amountCents: amountCents,
    donation: donation, checkoutUrl: checkoutUrl, projectParam: projectParam, appLink: appLink, letter: letter, roDe: roDe, STRINGS: STRINGS
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WNF = api;
})(this);

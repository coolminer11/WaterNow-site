/*
 * WaterNow Statistics, private console: « Racines et Plus » for admins (docs/19_RACINES_ET_PLUS.md, section 90). Three
 * tabs over section 90's admin RPCs (admin + aal2, checked by the server; live Stripe data, test mode apart): the
 * overview (racines_admin_overview: subscribers by plan and period, MRR, paid this month, trees due / scheduled /
 * planted, the Fontaine commune's share; aggregates only, no subscriber is ever named), the monthly tree lots
 * (racines_admin_orders), and the companies (racines_admin_upsert_company, a logo uploaded to commons-media like the
 * Fontaine commune's sponsors) with their corporate trees (racines_admin_add_corporate_trees). The session, calls and
 * uploads are console.js's (window.WNCAPP); money is fontaine-data.js's, text cleaning page-data.js's. Text through
 * textContent only. Pure helpers shared with the node test (module.exports).
 */
(function (root) {
  "use strict";
  var node = typeof module === "object" && module.exports;
  var F = node ? require("../assets/fontaine-data.js") : root.WNF;
  var P = node ? require("../assets/page-data.js") : root.WNP;
  var PLANS = ["racines", "plus"], PERIODS = ["month", "year"], LOTS = ["open", "planted", "failed"];
  var TREES_MAX = 100000, AMOUNT_MAX = 100000000;
  // Section 85's pictures (commons_media_url_ok): the public bucket commons-media, its logos folder, JPEG, PNG or WebP, 2 MB.
  var LOGO_PATH = /^\/storage\/v1\/object\/public\/commons-media\/(covers|logos)\/[a-z0-9-]{1,80}\.(jpg|png|webp)$/;
  var MEDIA_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }, MEDIA_MAX = 2 * 1024 * 1024;

  function n(v) { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null; }
  function https(v) {
    try { var u = new URL(v); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch (e) { return null; }
  }
  function iso(v) { return typeof v === "string" && v.length <= 40 && isFinite(Date.parse(v)) ? v : null; }

  /** racines_admin_overview's answer, cleaned; null when it isn't one. `companies`: all of them, hidden ones too, with ids. */
  function overview(o) {
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    var s = o.subscribers && typeof o.subscribers === "object" ? o.subscribers : {}, rows = {};
    PLANS.forEach(function (p) { rows[p] = {}; PERIODS.forEach(function (q) { rows[p][q] = n(s[p] && s[p][q]) || 0; }); });
    var t = o.trees && typeof o.trees === "object" ? o.trees : {}, tm = o.test_mode && typeof o.test_mode === "object" ? o.test_mode : {};
    return {
      rows: rows, active: PLANS.reduce(function (a, p) { return a + rows[p].month + rows[p].year; }, 0),
      pastDue: n(o.past_due) || 0, canceling: n(o.canceling) || 0, mrr: n(o.mrr_cents) || 0, paid: n(o.paid_this_month_cents) || 0,
      trees: { due: n(t.due) || 0, scheduled: n(t.scheduled) || 0, planted: n(t.planted) || 0, canceled: n(t.canceled) || 0 },
      commons: n(o.commons_cents) || 0, orders: n(o.orders) || 0,
      test: { subscribers: n(tm.subscribers) || 0, trees: n(tm.pending_trees) || 0 },
      companies: companies(Array.isArray(o.companies) ? o.companies : [])
    };
  }

  function companies(list) {
    return list.filter(function (c) { return c && n(c.id) !== null && P.text(c.name, 120); }).map(function (c) {
      return { id: c.id, name: P.text(c.name, 120), url: typeof c.url === "string" ? c.url : "", logo_url: typeof c.logo_url === "string" ? c.logo_url : "",
               visible: c.visible === true, trees: n(c.trees), since: typeof c.since === "string" ? c.since.slice(0, 7) : null };
    });
  }

  /** racines_admin_orders's answer, cleaned: {lots (newest first, as sent), due: {live, test}}. */
  function orders(o) {
    var list = o && Array.isArray(o.orders) ? o.orders : [], d = o && o.due && typeof o.due === "object" ? o.due : {};
    return {
      due: { live: n(d.live) || 0, test: n(d.test) || 0 },
      lots: list.filter(function (x) { return x && n(x.id) !== null; }).slice(0, 100).map(function (x) {
        var pr = x.project && typeof x.project === "object" && P.text(x.project.name, 80) ? x.project : null;
        return { id: x.id, live: x.livemode !== false, status: LOTS.indexOf(x.status) >= 0 ? x.status : null, trees: n(x.trees) || 0, planted: n(x.planted) || 0,
                 project: pr ? { name: P.text(pr.name, 80), country: P.text(pr.country, 60), url: https(pr.url) } : null,
                 error: P.text(x.error, 200), createdAt: iso(x.created_at), plantedAt: iso(x.planted_at) };
      })
    };
  }

  /** A logo racines_admin_upsert_company takes: a commons-media file on WaterNow's own storage ([api]'s origin). */
  function logoOk(v, api, base) {
    try {
      var u = new URL(v, base), a = new URL(api || base, base);
      return u.origin === a.origin && (u.protocol === "https:" || u.hostname === "127.0.0.1") && !u.username && !u.search && LOGO_PATH.test(u.pathname);
    } catch (e) { return false; }
  }

  /**
   * The company form as racines_admin_upsert_company's p: {id (absent: a new one), name, url, logo_url, visible}, or
   * {error: "name" | "url" | "logo"}. A name of 2 to 120 characters, an https website, a commons-media logo (the server's
   * rules, said before the call).
   */
  function companyPayload(f, api, base) {
    var name = P.text(f && f.name, 120);
    if (Array.from(name).length < 2) return { error: "name" };
    var url = String(f.url || "").trim(), logo = String(f.logo || "").trim();
    if (url && (url.length > 500 || !https(url))) return { error: "url" };
    if (logo && !logoOk(logo, api, base)) return { error: "logo" };
    var p = { name: name, url: url || null, logo_url: logo || null, visible: f.visible === true };
    if (n(f.id)) p.id = f.id;
    return { p: p };
  }

  /** A typed amount in dollars ("1500", "1 500,50") as cents, or null. */
  function cents(raw) {
    var s = String(raw == null ? "" : raw).replace(/[\s  $]/g, "").replace(",", ".");
    return /^\d{1,7}(\.\d{1,2})?$/.test(s) ? Math.round(Number(s) * 100) : null;
  }

  /** This month in UTC ("YYYY-MM"), as the server counts months. */
  function thisMonth(now) { return (now || new Date()).toISOString().slice(0, 7); }

  /**
   * The corporate trees form as racines_admin_add_corporate_trees's p: {company_id, trees, amount_cents (paid outside
   * Stripe, 0 by default), note, month ("YYYY-MM-01", only when one is chosen: else the server takes this month)}, or
   * {error: "company" | "trees" | "amount" | "month"}. The month (the one whose report counts them) is this one or a past
   * one, so the trees always leave with next month's lot. ponytail: no future month (the RPC takes one); add it with its
   * own "leaves with the lot of …" words if a company prepays.
   */
  function treesPayload(f, now) {
    var id = Number(f && f.company), t = Number(String(f && f.trees || "").replace(/[\s  ]/g, ""));
    if (!Number.isSafeInteger(id) || id <= 0) return { error: "company" };
    if (!Number.isSafeInteger(t) || t < 1 || t > TREES_MAX) return { error: "trees" };
    var a = String(f.amount || "").trim() ? cents(f.amount) : 0;
    if (a === null || a > AMOUNT_MAX) return { error: "amount" };
    var m = String(f.month || "").trim();
    if (m && !(/^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m <= thisMonth(now))) return { error: "month" };
    var p = { company_id: id, trees: t, amount_cents: a, note: P.text(f.note, 500, true) };
    if (m) p.month = m + "-01";
    return { p: p };
  }

  /** Where an uploaded logo goes: "commons-media/logos/<name>-<rand>.<ext>", or {error: "type" | "size"}. */
  function logoPath(file, name, rand) {
    var ext = file && MEDIA_TYPES[file.type];
    if (!ext) return { error: "type" };
    if (!(file.size > 0 && file.size <= MEDIA_MAX)) return { error: "size" };
    var slug = String(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
    return { path: "commons-media/logos/" + (slug || "logo") + "-" + rand + "." + ext };
  }

  /** A write's answer: section 90 answers {result: 'ok', …} or {result: <reason>}. */
  function took(r) { return !!r && typeof r === "object" && r.result === "ok"; }

  // The console's 7 languages (docs/translations-glossary.md): French says "tu", Romanian writes ș ț with the comma below.
  var STRINGS = {
    en: {
      title: "Racines and Plus", lead: "Subscriptions, tree lots and companies. Real payments only (test mode apart); aggregates only: no subscriber is ever named.",
      unavailable: "Racines and Plus isn't on the server yet (section 90).", forbidden: "This account can't manage Racines and Plus.",
      refused: "The server refused this change.", saved: "Saved.", removed: "Removed.",
      tabs: { overview: "Overview", orders: "Tree lots", companies: "Companies" },
      active: "Active subscribers", pastDue: function (s) { return s + " with a payment past due"; }, canceling: function (s) { return s + " canceling at period end"; },
      mrr: "Monthly revenue", mrrSub: "annual plans counted at 1/12", paid: "Paid this month", paidSub: "successful real payments",
      due: "Trees waiting", dueSub: function (a, b) { return a + " scheduled (months to come) · " + b + " planted"; },
      commons: "Community Fountain share", commonsSub: "10% of the margin (estimate), to date",
      byPlan: "Subscribers by plan and period", plans: { racines: "Racines", plus: "Plus" }, periods: { month: "Monthly", year: "Annual" }, total: "Total",
      testNote: function (a, b) { return "Test mode (never counted): " + a + " subscribers, " + b + " trees waiting."; },
      ordersLead: "One lot on the 1st at 06:00 UTC: the trees of the months before are planted together at Tree-Nation, each with its certificate.",
      dueLine: function (a, b) { return "Waiting for the next lot: " + a + " real trees" + (b ? " · " + b + " test trees" : "") + "."; }, noOrders: "No lot yet.",
      cols: { id: "Lot", created: "Opened", trees: "Trees", planted: "Planted", status: "Status", project: "Project", plantedAt: "Planted on" },
      lots: { open: "Open", planted: "Planted", failed: "Failed" }, test: "test",
      companiesLead: "The companies shown on the website's Companies page, and the hidden ones. A logo goes to WaterNow's storage (commons-media).",
      noCompanies: "No company yet.",
      shown: "Shown", hidden: "Hidden", edit: "Edit", cancel: "Cancel", remove: "Remove", newCompany: "New company", editing: function (s) { return "Edit: " + s; },
      fName: "Name", fUrl: "Website (https)", fLogo: "Logo (WaterNow storage link)", upload: "Choose a picture", uploading: "Sending the picture…", uploaded: "Picture sent: save to keep it.",
      badFile: "A JPEG, PNG or WebP picture of 2 MB at most.", uploadFailed: "The picture couldn't be sent. Try again.",
      fVisible: "Show on the website", save: "Save",
      addTrees: "Add corporate trees", fCompany: "Company", fTrees: "Trees", fAmount: "Amount paid ($, outside Stripe)", fNote: "Note (invoice, order…)", fMonth: "Report month (empty: this month)", add: "Add the trees",
      added: function (s, k) { return k === 1 ? "1 tree added: it leaves with next month's lot." : s + " trees added: they leave with next month's lot."; },
      bad: { name: "Type the company's name (2 characters or more).", url: "The website must start with https://.", logo: "A logo comes from WaterNow's storage only: use “Choose a picture”.",
        trees: "From 1 to 100,000 trees.", company: "Choose a company.", amount: "Type an amount in dollars, or leave it empty.", month: "Choose this month or a past one (YYYY-MM)." },
      reasons: { in_use: "This company has already planted: hide it instead.", bad_name: "The server refused the name.", bad_url: "The server refused a link.",
        bad_trees: "From 1 to 100,000 trees.", bad_amount: "The server refused the amount.", bad_note: "The server refused the note.", not_found: "This company no longer exists." },
      trees: function (s, k) { return k === 1 ? "1 tree" : s + " trees"; }, since: function (d) { return "since " + d; }
    },
    fr: {
      title: "Racines et Plus", lead: "Abonnements, lots d'arbres et entreprises. Les vrais paiements seulement (le mode test à part) ; des agrégats : aucun abonné n'est jamais nommé.",
      unavailable: "Racines et Plus n'est pas encore sur le serveur (section 90).", forbidden: "Ce compte ne peut pas gérer Racines et Plus.",
      refused: "Le serveur a refusé ce changement.", saved: "Enregistré.", removed: "Retirée.",
      tabs: { overview: "Vue d'ensemble", orders: "Lots d'arbres", companies: "Entreprises" },
      active: "Abonnés actifs", pastDue: function (s) { return s + " avec un paiement en retard"; }, canceling: function (s) { return s + " qui annulent à la fin de la période"; },
      mrr: "Revenu mensuel", mrrSub: "les formules annuelles comptées au 1/12", paid: "Payé ce mois-ci", paidSub: "vrais paiements réussis",
      due: "Arbres en attente", dueSub: function (a, b) { return a + " prévus (mois à venir) · " + b + " plantés"; },
      commons: "Part de la Fontaine commune", commonsSub: "10 % de la marge (estimation), à ce jour",
      byPlan: "Abonnés par formule et par période", plans: { racines: "Racines", plus: "Plus" }, periods: { month: "Mensuel", year: "Annuel" }, total: "Total",
      testNote: function (a, b) { return "Mode test (jamais compté) : " + a + " abonnés, " + b + " arbres en attente."; },
      ordersLead: "Un lot le 1er à 06:00 UTC : les arbres des mois d'avant sont plantés ensemble chez Tree-Nation, chacun avec son certificat.",
      dueLine: function (a, b) { return "En attente du prochain lot : " + a + " vrais arbres" + (b ? " · " + b + " arbres de test" : "") + "."; }, noOrders: "Aucun lot pour l'instant.",
      cols: { id: "Lot", created: "Ouvert le", trees: "Arbres", planted: "Plantés", status: "État", project: "Projet", plantedAt: "Planté le" },
      lots: { open: "Ouvert", planted: "Planté", failed: "Échec" }, test: "test",
      companiesLead: "Les entreprises affichées sur la page Entreprises du site, et celles qui sont masquées. Un logo va dans le stockage WaterNow (commons-media).",
      noCompanies: "Aucune entreprise pour l'instant.",
      shown: "Affichée", hidden: "Masquée", edit: "Modifier", cancel: "Annuler", remove: "Retirer", newCompany: "Nouvelle entreprise", editing: function (s) { return "Modifier : " + s; },
      fName: "Nom", fUrl: "Site web (https)", fLogo: "Logo (lien du stockage WaterNow)", upload: "Choisir une image", uploading: "Envoi de l'image…", uploaded: "Image envoyée : enregistre pour la garder.",
      badFile: "Une image JPEG, PNG ou WebP de 2 Mo au plus.", uploadFailed: "L'image n'a pas pu être envoyée. Réessaie.",
      fVisible: "Afficher sur le site", save: "Enregistrer",
      addTrees: "Ajouter des arbres d'entreprise", fCompany: "Entreprise", fTrees: "Arbres", fAmount: "Montant payé ($, hors Stripe)", fNote: "Note (facture, commande…)", fMonth: "Mois du bilan (vide : ce mois-ci)", add: "Ajouter les arbres",
      added: function (s, k) { return k === 1 ? "1 arbre ajouté : il part avec le lot du mois prochain." : s + " arbres ajoutés : ils partent avec le lot du mois prochain."; },
      bad: { name: "Écris le nom de l'entreprise (2 caractères ou plus).", url: "Le site web doit commencer par https://.", logo: "Un logo vient seulement du stockage WaterNow : utilise « Choisir une image ».",
        trees: "De 1 à 100 000 arbres.", company: "Choisis une entreprise.", amount: "Écris un montant en dollars, ou laisse vide.", month: "Choisis ce mois-ci ou un mois passé (AAAA-MM)." },
      reasons: { in_use: "Cette entreprise a déjà planté : masque-la plutôt.", bad_name: "Le serveur a refusé le nom.", bad_url: "Le serveur a refusé un lien.",
        bad_trees: "De 1 à 100 000 arbres.", bad_amount: "Le serveur a refusé le montant.", bad_note: "Le serveur a refusé la note.", not_found: "Cette entreprise n'existe plus." },
      trees: function (s, k) { return k === 1 ? "1 arbre" : s + " arbres"; }, since: function (d) { return "depuis " + d; }
    },
    es: {
      title: "Racines y Plus", lead: "Suscripciones, lotes de árboles y empresas. Solo pagos reales (el modo de prueba aparte); datos agregados: nunca se nombra a ningún suscriptor.",
      unavailable: "Racines y Plus todavía no está en el servidor (sección 90).", forbidden: "Esta cuenta no puede gestionar Racines y Plus.",
      refused: "El servidor rechazó este cambio.", saved: "Guardado.", removed: "Eliminada.",
      tabs: { overview: "Resumen", orders: "Lotes de árboles", companies: "Empresas" },
      active: "Suscriptores activos", pastDue: function (s) { return s + " con un pago atrasado"; }, canceling: function (s) { return s + " que cancelan al final del periodo"; },
      mrr: "Ingresos mensuales", mrrSub: "los planes anuales cuentan 1/12", paid: "Pagado este mes", paidSub: "pagos reales completados",
      due: "Árboles en espera", dueSub: function (a, b) { return a + " previstos (meses próximos) · " + b + " plantados"; },
      commons: "Parte de la Fuente común", commonsSub: "el 10 % del margen (estimación), hasta hoy",
      byPlan: "Suscriptores por plan y periodo", plans: { racines: "Racines", plus: "Plus" }, periods: { month: "Mensual", year: "Anual" }, total: "Total",
      testNote: function (a, b) { return "Modo de prueba (nunca contado): " + a + " suscriptores, " + b + " árboles en espera."; },
      ordersLead: "Un lote el día 1 a las 06:00 UTC: los árboles de los meses anteriores se plantan juntos en Tree-Nation, cada uno con su certificado.",
      dueLine: function (a, b) { return "En espera del próximo lote: " + a + " árboles reales" + (b ? " · " + b + " árboles de prueba" : "") + "."; }, noOrders: "Todavía no hay lotes.",
      cols: { id: "Lote", created: "Abierto el", trees: "Árboles", planted: "Plantados", status: "Estado", project: "Proyecto", plantedAt: "Plantado el" },
      lots: { open: "Abierto", planted: "Plantado", failed: "Error" }, test: "prueba",
      companiesLead: "Las empresas que se muestran en la página Empresas del sitio y las ocultas. Un logotipo va al almacenamiento de WaterNow (commons-media).",
      noCompanies: "Todavía no hay empresas.",
      shown: "Visible", hidden: "Oculta", edit: "Editar", cancel: "Cancelar", remove: "Eliminar", newCompany: "Nueva empresa", editing: function (s) { return "Editar: " + s; },
      fName: "Nombre", fUrl: "Sitio web (https)", fLogo: "Logotipo (enlace del almacenamiento de WaterNow)", upload: "Elegir una imagen", uploading: "Enviando la imagen…", uploaded: "Imagen enviada: guarda para conservarla.",
      badFile: "Una imagen JPEG, PNG o WebP de 2 MB como máximo.", uploadFailed: "No se pudo enviar la imagen. Inténtalo de nuevo.",
      fVisible: "Mostrar en el sitio", save: "Guardar",
      addTrees: "Añadir árboles de empresa", fCompany: "Empresa", fTrees: "Árboles", fAmount: "Importe pagado ($, fuera de Stripe)", fNote: "Nota (factura, pedido…)", fMonth: "Mes del balance (vacío: este mes)", add: "Añadir los árboles",
      added: function (s, k) { return k === 1 ? "1 árbol añadido: sale con el lote del mes que viene." : s + " árboles añadidos: salen con el lote del mes que viene."; },
      bad: { name: "Escribe el nombre de la empresa (2 caracteres o más).", url: "El sitio web debe empezar por https://.", logo: "Un logotipo solo puede venir del almacenamiento de WaterNow: usa «Elegir una imagen».",
        trees: "De 1 a 100 000 árboles.", company: "Elige una empresa.", amount: "Escribe un importe en dólares, o déjalo vacío.", month: "Elige este mes o uno anterior (AAAA-MM)." },
      reasons: { in_use: "Esta empresa ya ha plantado: ocúltala en su lugar.", bad_name: "El servidor rechazó el nombre.", bad_url: "El servidor rechazó un enlace.",
        bad_trees: "De 1 a 100 000 árboles.", bad_amount: "El servidor rechazó el importe.", bad_note: "El servidor rechazó la nota.", not_found: "Esta empresa ya no existe." },
      trees: function (s, k) { return k === 1 ? "1 árbol" : s + " árboles"; }, since: function (d) { return "desde " + d; }
    },
    de: {
      title: "Racines und Plus", lead: "Abos, Baum-Chargen und Unternehmen. Nur echte Zahlungen (der Testmodus getrennt); nur Summen: Kein Abonnent wird je genannt.",
      unavailable: "Racines und Plus ist noch nicht auf dem Server (Abschnitt 90).", forbidden: "Dieses Konto kann Racines und Plus nicht verwalten.",
      refused: "Der Server hat diese Änderung abgelehnt.", saved: "Gespeichert.", removed: "Entfernt.",
      tabs: { overview: "Überblick", orders: "Baum-Chargen", companies: "Unternehmen" },
      active: "Aktive Abos", pastDue: function (s) { return s + " mit überfälliger Zahlung"; }, canceling: function (s) { return s + " kündigen zum Periodenende"; },
      mrr: "Monatlicher Umsatz", mrrSub: "Jahresabos zu 1/12 gezählt", paid: "Diesen Monat bezahlt", paidSub: "erfolgreiche echte Zahlungen",
      due: "Wartende Bäume", dueSub: function (a, b) { return a + " geplant (kommende Monate) · " + b + " gepflanzt"; },
      commons: "Anteil Gemeinschaftsbrunnen", commonsSub: "10 % der Marge (Schätzung), bisher",
      byPlan: "Abos nach Tarif und Zeitraum", plans: { racines: "Racines", plus: "Plus" }, periods: { month: "Monatlich", year: "Jährlich" }, total: "Gesamt",
      testNote: function (a, b) { return "Testmodus (nie gezählt): " + a + " Abos, " + b + " wartende Bäume."; },
      ordersLead: "Eine Charge am 1. um 06:00 UTC: Die Bäume der Vormonate werden gemeinsam bei Tree-Nation gepflanzt, jeder mit seinem Zertifikat.",
      dueLine: function (a, b) { return "Wartet auf die nächste Charge: " + a + " echte Bäume" + (b ? " · " + b + " Testbäume" : "") + "."; }, noOrders: "Noch keine Charge.",
      cols: { id: "Charge", created: "Eröffnet", trees: "Bäume", planted: "Gepflanzt", status: "Status", project: "Projekt", plantedAt: "Gepflanzt am" },
      lots: { open: "Offen", planted: "Gepflanzt", failed: "Fehlgeschlagen" }, test: "Test",
      companiesLead: "Die Unternehmen auf der Unternehmensseite der Website und die ausgeblendeten. Ein Logo kommt in den WaterNow-Speicher (commons-media).",
      noCompanies: "Noch keine Unternehmen.",
      shown: "Sichtbar", hidden: "Ausgeblendet", edit: "Bearbeiten", cancel: "Abbrechen", remove: "Entfernen", newCompany: "Neues Unternehmen", editing: function (s) { return "Bearbeiten: " + s; },
      fName: "Name", fUrl: "Website (https)", fLogo: "Logo (Link aus dem WaterNow-Speicher)", upload: "Bild auswählen", uploading: "Bild wird gesendet…", uploaded: "Bild gesendet: Speichern, um es zu behalten.",
      badFile: "Ein JPEG-, PNG- oder WebP-Bild mit höchstens 2 MB.", uploadFailed: "Das Bild konnte nicht gesendet werden. Versuch es noch einmal.",
      fVisible: "Auf der Website zeigen", save: "Speichern",
      addTrees: "Unternehmensbäume hinzufügen", fCompany: "Unternehmen", fTrees: "Bäume", fAmount: "Bezahlter Betrag ($, außerhalb von Stripe)", fNote: "Notiz (Rechnung, Bestellung…)", fMonth: "Berichtsmonat (leer: dieser Monat)", add: "Bäume hinzufügen",
      added: function (s, k) { return k === 1 ? "1 Baum hinzugefügt: Er geht mit der Charge des nächsten Monats." : s + " Bäume hinzugefügt: Sie gehen mit der Charge des nächsten Monats."; },
      bad: { name: "Gib den Namen des Unternehmens ein (mindestens 2 Zeichen).", url: "Die Website muss mit https:// beginnen.", logo: "Ein Logo kommt nur aus dem WaterNow-Speicher: Nutze „Bild auswählen“.",
        trees: "1 bis 100.000 Bäume.", company: "Wähle ein Unternehmen.", amount: "Gib einen Betrag in Dollar ein oder lass das Feld leer.", month: "Wähle diesen oder einen vergangenen Monat (JJJJ-MM)." },
      reasons: { in_use: "Dieses Unternehmen hat schon gepflanzt: Blende es stattdessen aus.", bad_name: "Der Server hat den Namen abgelehnt.", bad_url: "Der Server hat einen Link abgelehnt.",
        bad_trees: "1 bis 100.000 Bäume.", bad_amount: "Der Server hat den Betrag abgelehnt.", bad_note: "Der Server hat die Notiz abgelehnt.", not_found: "Dieses Unternehmen gibt es nicht mehr." },
      trees: function (s, k) { return k === 1 ? "1 Baum" : s + " Bäume"; }, since: function (d) { return "seit " + d; }
    },
    pt: {
      title: "Racines e Plus", lead: "Assinaturas, lotes de árvores e empresas. Só pagamentos reais (o modo de teste à parte); só dados agregados: nenhum assinante é nomeado.",
      unavailable: "O Racines e Plus ainda não está no servidor (seção 90).", forbidden: "Esta conta não pode gerenciar o Racines e Plus.",
      refused: "O servidor recusou esta alteração.", saved: "Salvo.", removed: "Removida.",
      tabs: { overview: "Visão geral", orders: "Lotes de árvores", companies: "Empresas" },
      active: "Assinantes ativos", pastDue: function (s) { return s + " com pagamento atrasado"; }, canceling: function (s) { return s + " cancelando no fim do período"; },
      mrr: "Receita mensal", mrrSub: "planos anuais contados a 1/12", paid: "Pago neste mês", paidSub: "pagamentos reais concluídos",
      due: "Árvores aguardando", dueSub: function (a, b) { return a + " previstas (próximos meses) · " + b + " plantadas"; },
      commons: "Parte da Fonte comum", commonsSub: "10% da margem (estimativa), até hoje",
      byPlan: "Assinantes por plano e período", plans: { racines: "Racines", plus: "Plus" }, periods: { month: "Mensal", year: "Anual" }, total: "Total",
      testNote: function (a, b) { return "Modo de teste (nunca contado): " + a + " assinantes, " + b + " árvores aguardando."; },
      ordersLead: "Um lote no dia 1 às 06:00 UTC: as árvores dos meses anteriores são plantadas juntas na Tree-Nation, cada uma com seu certificado.",
      dueLine: function (a, b) { return "Aguardando o próximo lote: " + a + " árvores reais" + (b ? " · " + b + " árvores de teste" : "") + "."; }, noOrders: "Nenhum lote ainda.",
      cols: { id: "Lote", created: "Aberto em", trees: "Árvores", planted: "Plantadas", status: "Status", project: "Projeto", plantedAt: "Plantado em" },
      lots: { open: "Aberto", planted: "Plantado", failed: "Falhou" }, test: "teste",
      companiesLead: "As empresas exibidas na página Empresas do site e as ocultas. Um logo vai para o armazenamento do WaterNow (commons-media).",
      noCompanies: "Nenhuma empresa ainda.",
      shown: "Exibida", hidden: "Oculta", edit: "Editar", cancel: "Cancelar", remove: "Remover", newCompany: "Nova empresa", editing: function (s) { return "Editar: " + s; },
      fName: "Nome", fUrl: "Site (https)", fLogo: "Logo (link do armazenamento do WaterNow)", upload: "Escolher uma imagem", uploading: "Enviando a imagem…", uploaded: "Imagem enviada: salve para mantê-la.",
      badFile: "Uma imagem JPEG, PNG ou WebP de até 2 MB.", uploadFailed: "Não foi possível enviar a imagem. Tente de novo.",
      fVisible: "Exibir no site", save: "Salvar",
      addTrees: "Adicionar árvores de empresa", fCompany: "Empresa", fTrees: "Árvores", fAmount: "Valor pago ($, fora da Stripe)", fNote: "Nota (fatura, pedido…)", fMonth: "Mês do balanço (vazio: este mês)", add: "Adicionar as árvores",
      added: function (s, k) { return k === 1 ? "1 árvore adicionada: ela sai com o lote do mês que vem." : s + " árvores adicionadas: elas saem com o lote do mês que vem."; },
      bad: { name: "Digite o nome da empresa (2 caracteres ou mais).", url: "O site deve começar com https://.", logo: "Um logo só pode vir do armazenamento do WaterNow: use “Escolher uma imagem”.",
        trees: "De 1 a 100.000 árvores.", company: "Escolha uma empresa.", amount: "Digite um valor em dólares, ou deixe vazio.", month: "Escolha este mês ou um anterior (AAAA-MM)." },
      reasons: { in_use: "Esta empresa já plantou: oculte-a em vez disso.", bad_name: "O servidor recusou o nome.", bad_url: "O servidor recusou um link.",
        bad_trees: "De 1 a 100.000 árvores.", bad_amount: "O servidor recusou o valor.", bad_note: "O servidor recusou a nota.", not_found: "Esta empresa não existe mais." },
      trees: function (s, k) { return k === 1 ? "1 árvore" : s + " árvores"; }, since: function (d) { return "desde " + d; }
    },
    ja: {
      title: "Racines と Plus", lead: "定期購入、木のロット、企業。実際の支払いのみ（テストモードは別）で、集計値のみです。登録者の名前は一切表示しません。",
      unavailable: "Racines と Plus はまだサーバーにありません（セクション90）。", forbidden: "このアカウントでは Racines と Plus を管理できません。",
      refused: "サーバーがこの変更を拒否しました。", saved: "保存しました。", removed: "削除しました。",
      tabs: { overview: "概要", orders: "木のロット", companies: "企業" },
      active: "有効な登録者", pastDue: function (s) { return "支払い遅延 " + s + "件"; }, canceling: function (s) { return "期間末に解約 " + s + "件"; },
      mrr: "月間収益", mrrSub: "年額プランは1/12で計算", paid: "今月の支払い", paidSub: "完了した実際の支払い",
      due: "植樹待ちの木", dueSub: function (a, b) { return "予定 " + a + "本（今後の月）・植樹済み " + b + "本"; },
      commons: "みんなの給水所への分", commonsSub: "利益の10%（概算、累計）",
      byPlan: "プラン・期間別の登録者", plans: { racines: "Racines", plus: "Plus" }, periods: { month: "月額", year: "年額" }, total: "合計",
      testNote: function (a, b) { return "テストモード（集計には含めません）：登録者 " + a + "人、植樹待ち " + b + "本。"; },
      ordersLead: "ロットは毎月1日 06:00 UTCです。前の月までの木をまとめてTree-Nationで植え、1本ごとに証明書を記録します。",
      dueLine: function (a, b) { return "次のロット待ち：実際の木 " + a + "本" + (b ? "・テストの木 " + b + "本" : "") + "。"; }, noOrders: "まだロットはありません。",
      cols: { id: "ロット", created: "開始日", trees: "本数", planted: "植樹済み", status: "状態", project: "プロジェクト", plantedAt: "植樹日" },
      lots: { open: "進行中", planted: "植樹済み", failed: "失敗" }, test: "テスト",
      companiesLead: "サイトの企業ページに掲載中の企業と、非表示の企業です。ロゴはWaterNowのストレージ（commons-media）に保存します。",
      noCompanies: "まだ企業はありません。",
      shown: "掲載中", hidden: "非表示", edit: "編集", cancel: "キャンセル", remove: "削除", newCompany: "新しい企業", editing: function (s) { return "編集：" + s; },
      fName: "名前", fUrl: "ウェブサイト（https）", fLogo: "ロゴ（WaterNowストレージのリンク）", upload: "画像を選ぶ", uploading: "画像を送信中…", uploaded: "画像を送信しました。保存すると反映されます。",
      badFile: "2 MB以下のJPEG、PNG、WebP画像を選んでください。", uploadFailed: "画像を送信できませんでした。もう一度お試しください。",
      fVisible: "サイトに掲載", save: "保存",
      addTrees: "企業の木を追加", fCompany: "企業", fTrees: "本数", fAmount: "支払額（$、Stripe以外）", fNote: "メモ（請求書、注文など）", fMonth: "報告の月（空欄：今月）", add: "木を追加",
      added: function (s) { return s + "本を追加しました。来月のロットで植えます。"; },
      bad: { name: "企業名を入力してください（2文字以上）。", url: "ウェブサイトは https:// で始めてください。", logo: "ロゴはWaterNowのストレージからのみ使えます。「画像を選ぶ」を使ってください。",
        trees: "1〜100,000本で入力してください。", company: "企業を選んでください。", amount: "金額をドルで入力するか、空欄のままにしてください。", month: "今月か過去の月を選んでください（YYYY-MM）。" },
      reasons: { in_use: "この企業はすでに植樹しています。代わりに非表示にしてください。", bad_name: "サーバーが名前を拒否しました。", bad_url: "サーバーがリンクを拒否しました。",
        bad_trees: "1〜100,000本で入力してください。", bad_amount: "サーバーが金額を拒否しました。", bad_note: "サーバーがメモを拒否しました。", not_found: "この企業はもうありません。" },
      trees: function (s) { return s + "本"; }, since: function (d) { return d + "から"; }
    },
    ro: {
      title: "Racines și Plus", lead: "Abonamente, loturi de copaci și firme. Doar plăți reale (modul de test separat); doar totaluri: niciun abonat nu e numit vreodată.",
      unavailable: "Racines și Plus nu e încă pe server (secțiunea 90).", forbidden: "Acest cont nu poate gestiona Racines și Plus.",
      refused: "Serverul a refuzat această modificare.", saved: "Salvat.", removed: "Eliminată.",
      tabs: { overview: "Privire de ansamblu", orders: "Loturi de copaci", companies: "Firme" },
      active: "Abonați activi", pastDue: function (s) { return s + " cu plata întârziată"; }, canceling: function (s) { return s + " care anulează la sfârșitul perioadei"; },
      mrr: "Venit lunar", mrrSub: "abonamentele anuale socotite la 1/12", paid: "Plătit luna aceasta", paidSub: "plăți reale reușite",
      due: "Copaci în așteptare", dueSub: function (a, b) { return a + " programați (lunile următoare) · " + b + " plantați"; },
      commons: "Partea Fântânii comune", commonsSub: "10 % din marjă (estimare), până acum",
      byPlan: "Abonați pe formulă și perioadă", plans: { racines: "Racines", plus: "Plus" }, periods: { month: "Lunar", year: "Anual" }, total: "Total",
      testNote: function (a, b) { return "Mod de test (niciodată socotit): " + a + " abonați, " + b + " copaci în așteptare."; },
      ordersLead: "Un lot pe 1, la 06:00 UTC: copacii lunilor dinainte sunt plantați împreună la Tree-Nation, fiecare cu certificatul lui.",
      dueLine: function (a, b) { return "În așteptarea lotului următor: " + a + " copaci reali" + (b ? " · " + b + " copaci de test" : "") + "."; }, noOrders: "Încă niciun lot.",
      cols: { id: "Lot", created: "Deschis pe", trees: "Copaci", planted: "Plantați", status: "Stare", project: "Proiect", plantedAt: "Plantat pe" },
      lots: { open: "Deschis", planted: "Plantat", failed: "Eșuat" }, test: "test",
      companiesLead: "Firmele afișate pe pagina Companii a site-ului și cele ascunse. O siglă merge în stocarea WaterNow (commons-media).",
      noCompanies: "Încă nicio firmă.",
      shown: "Afișată", hidden: "Ascunsă", edit: "Modifică", cancel: "Anulează", remove: "Elimină", newCompany: "Firmă nouă", editing: function (s) { return "Modifică: " + s; },
      fName: "Nume", fUrl: "Site web (https)", fLogo: "Siglă (link din stocarea WaterNow)", upload: "Alege o imagine", uploading: "Se trimite imaginea…", uploaded: "Imagine trimisă: salvează ca s-o păstrezi.",
      badFile: "O imagine JPEG, PNG sau WebP de cel mult 2 MB.", uploadFailed: "Imaginea nu s-a putut trimite. Încearcă din nou.",
      fVisible: "Afișează pe site", save: "Salvează",
      addTrees: "Adaugă copaci de firmă", fCompany: "Firmă", fTrees: "Copaci", fAmount: "Sumă plătită ($, în afara Stripe)", fNote: "Notă (factură, comandă…)", fMonth: "Luna bilanțului (gol: luna aceasta)", add: "Adaugă copacii",
      added: function (s, k) { return k === 1 ? "1 copac adăugat: pleacă cu lotul lunii viitoare." : s + roDe(k) + " copaci adăugați: pleacă cu lotul lunii viitoare."; },
      bad: { name: "Scrie numele firmei (cel puțin 2 caractere).", url: "Site-ul trebuie să înceapă cu https://.", logo: "O siglă vine doar din stocarea WaterNow: folosește „Alege o imagine”.",
        trees: "Între 1 și 100.000 de copaci.", company: "Alege o firmă.", amount: "Scrie o sumă în dolari sau lasă gol.", month: "Alege luna aceasta sau una trecută (AAAA-LL)." },
      reasons: { in_use: "Această firmă a plantat deja: ascunde-o în schimb.", bad_name: "Serverul a refuzat numele.", bad_url: "Serverul a refuzat un link.",
        bad_trees: "Între 1 și 100.000 de copaci.", bad_amount: "Serverul a refuzat suma.", bad_note: "Serverul a refuzat nota.", not_found: "Această firmă nu mai există." },
      trees: function (s, k) { return k === 1 ? "1 copac" : s + roDe(k) + " copaci"; }, since: function (d) { return "din " + d; }
    }
  };
  function roDe(k) { return k % 100 >= 20 || (k > 0 && k % 100 === 0) ? " de" : ""; }

  var api = { STRINGS: STRINGS, overview: overview, orders: orders, companyPayload: companyPayload, treesPayload: treesPayload, logoPath: logoPath,
              took: took, thisMonth: thisMonth, TREES_MAX: TREES_MAX };
  if (node) { module.exports = api; return; }

  // ---- The page ----
  var A = root.WNCAPP;
  if (!A || !F || !P) return;
  var T = STRINGS[A.lang] || STRINGS.en, lang = A.lang;
  var nf = new Intl.NumberFormat(lang);
  var monthFmt = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric", timeZone: "UTC" });
  var dayFmt = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" });
  var money = function (c) { return F.money(c, lang); };
  var month = function (m) { return monthFmt.format(Date.parse(m + "-01T00:00:00Z")); };
  function el(tag, cls, t) { var e = document.createElement(tag); if (cls) e.className = cls; if (t != null) e.textContent = t; return e; }
  function clear(x) { while (x.firstChild) x.removeChild(x.firstChild); return x; }
  function btn(parent, t, cls) { var b = el("button", cls || "ghost", t); b.type = "button"; parent.appendChild(b); return b; }
  var uid = 0;
  function field(parent, label, type, value, attrs) {
    var id = "rc" + (++uid), l = el("label", "field", label), i = el(type === "select" ? "select" : "input", "input");
    l.htmlFor = id; i.id = id;
    if (type !== "select") i.type = type;
    Object.keys(attrs || {}).forEach(function (k) { i.setAttribute(k, attrs[k]); });
    if (value != null && type !== "select") i.value = value;
    var w = el("div", "rc-f"); w.appendChild(l); w.appendChild(i); parent.appendChild(w);
    return i;
  }
  function waiting(b, on) { if (on) b.setAttribute("aria-disabled", "true"); else b.removeAttribute("aria-disabled"); }
  function isWaiting(b) { return b.getAttribute("aria-disabled") === "true"; }

  var box = document.getElementById("racines"), tab = "overview", ov = null, lots = null, edit = null, msg = null, last = null, inited = false;
  function say(t, cls) { last = t ? [t, cls] : null; if (msg) { msg.textContent = t || ""; msg.className = "msg" + (cls ? " " + cls : ""); } }
  function fatal(e) {
    if (e.status === 401) { A.lost(); return true; }
    if (e.code === "WNMFA") { A.showMfa(); return true; }
    return false;
  }
  function list() { return ov ? ov.companies : []; }

  async function load() {
    try {
      var r = await Promise.all([A.rpc("racines_admin_overview", {}), A.rpc("racines_admin_orders", {})]);
      ov = overview(r[0]) || overview({}); lots = orders(r[1]);
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

  /** One write (p as jsonb): the answer when the server took it, else null; the line under the tab says why not. */
  async function write(name, p, b) {
    if (isWaiting(b)) return null;
    waiting(b, true);
    try {
      var r = await A.rpc(name, { p: p });
      if (!took(r)) {
        var why = r && typeof r.result === "string" ? r.result : "";
        say(T.reasons[why] || T.refused + (why ? " (" + P.text(why, 40) + ")" : ""), "err");
        return null;
      }
      return r;
    } catch (e) {
      if (fatal(e)) return null;
      say(e.code === "42501" || e.status === 403 ? T.forbidden : T.refused, "err");
      return null;
    } finally { waiting(b, false); }
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
    ["overview", "orders", "companies"].forEach(function (k) {
      var b = btn(tabs, T.tabs[k], "");
      b.setAttribute("aria-pressed", String(k === tab));
      b.addEventListener("click", function () { tab = k; last = null; render(); });
    });
    box.appendChild(tabs);
    var body = el("div", "rc-body");
    ({ overview: overviewTab, orders: ordersTab, companies: companiesTab })[tab](body);
    box.appendChild(body);
    msg = el("p", "msg");
    msg.setAttribute("role", "status");
    box.appendChild(msg);
    if (last) say(last[0], last[1]);
  }

  function kpi(parent, label, value, sub) {
    var k = el("div", "kpi card");
    k.appendChild(el("div", "l", label));
    k.appendChild(el("div", "v", value));
    if (sub) k.appendChild(el("div", "s", sub));
    parent.appendChild(k);
  }

  function overviewTab(b) {
    var k = el("div", "kpis rc-kpis");
    kpi(k, T.active, nf.format(ov.active), [ov.pastDue ? T.pastDue(nf.format(ov.pastDue), ov.pastDue) : "", ov.canceling ? T.canceling(nf.format(ov.canceling), ov.canceling) : ""].filter(Boolean).join(" · "));
    kpi(k, T.mrr, money(ov.mrr), T.mrrSub);
    kpi(k, T.paid, money(ov.paid), T.paidSub);
    kpi(k, T.due, nf.format(ov.trees.due), T.dueSub(nf.format(ov.trees.scheduled), nf.format(ov.trees.planted)));
    kpi(k, T.commons, money(ov.commons), T.commonsSub);
    b.appendChild(k);
    b.appendChild(el("h3", "rc-h3", T.byPlan));
    var t = el("table", "rc-table"), hr = el("tr");
    [""].concat(PERIODS.map(function (p) { return T.periods[p]; }), [T.total]).forEach(function (h, i) { var th = el("th", i ? "n" : null, h); th.scope = "col"; hr.appendChild(th); });
    var thead = el("thead"); thead.appendChild(hr); t.appendChild(thead);
    var tb = el("tbody"), tot = { month: 0, year: 0 };
    PLANS.forEach(function (p) {
      var tr = el("tr"), th = el("th", null, T.plans[p]), r = ov.rows[p];
      th.scope = "row"; tr.appendChild(th);
      PERIODS.forEach(function (q) { tr.appendChild(el("td", "n", nf.format(r[q]))); tot[q] += r[q]; });
      tr.appendChild(el("td", "n", nf.format(r.month + r.year)));
      tb.appendChild(tr);
    });
    var tr = el("tr", "rc-total"), th = el("th", null, T.total);
    th.scope = "row"; tr.appendChild(th);
    PERIODS.forEach(function (q) { tr.appendChild(el("td", "n", nf.format(tot[q]))); });
    tr.appendChild(el("td", "n", nf.format(tot.month + tot.year)));
    tb.appendChild(tr);
    t.appendChild(tb);
    b.appendChild(t);
    if (ov.test.subscribers || ov.test.trees) b.appendChild(el("p", "note", T.testNote(nf.format(ov.test.subscribers), nf.format(ov.test.trees))));
  }

  function ordersTab(b) {
    b.appendChild(el("p", "muted small rc-lead", T.ordersLead));
    b.appendChild(el("p", "rc-due", T.dueLine(nf.format(lots.due.live), lots.due.test ? nf.format(lots.due.test) : "")));
    if (!lots.lots.length) { b.appendChild(el("p", "note", T.noOrders)); return; }
    var wrap = el("div", "rc-scroll"), t = el("table", "rc-table"), hr = el("tr");
    ["id", "created", "trees", "planted", "status", "project", "plantedAt"].forEach(function (c) {
      var th = el("th", c === "trees" || c === "planted" ? "n" : null, T.cols[c]); th.scope = "col"; hr.appendChild(th);
    });
    var thead = el("thead"); thead.appendChild(hr); t.appendChild(thead);
    var tb = el("tbody");
    lots.lots.forEach(function (o) {
      var tr = el("tr");
      tr.appendChild(el("td", "rc-ref", "#" + o.id));
      tr.appendChild(el("td", null, o.createdAt ? dayFmt.format(new Date(o.createdAt)) : "—"));
      tr.appendChild(el("td", "n", nf.format(o.trees)));
      tr.appendChild(el("td", "n", nf.format(o.planted)));
      var st = el("td");
      st.appendChild(el("span", "chip rc-" + (o.status || "unknown"), o.status ? T.lots[o.status] : "—"));
      if (!o.live) st.appendChild(el("span", "chip rc-test", T.test));
      tr.appendChild(st);
      var pj = el("td", "rc-wrap");
      if (o.project) {
        var name = o.project.url ? el("a", null, o.project.name) : el("span", null, o.project.name);
        if (o.project.url) { name.href = o.project.url; name.rel = "noopener noreferrer"; name.target = "_blank"; }
        pj.appendChild(name);
        if (o.project.country) pj.appendChild(el("span", "muted", " · " + o.project.country));
      }
      if (o.error) pj.appendChild(el("span", "rc-error", (o.project ? " · " : "") + o.error));
      if (!o.project && !o.error) pj.textContent = "—";
      tr.appendChild(pj);
      tr.appendChild(el("td", null, o.plantedAt ? dayFmt.format(new Date(o.plantedAt)) : "—"));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    wrap.appendChild(t);
    b.appendChild(wrap);
  }

  function companiesTab(b) {
    b.appendChild(el("p", "muted small rc-lead", T.companiesLead));
    var grid = el("div", "rc-grid"), side = el("div"), main = el("div", "rc-forms"), cos = list();
    if (!cos.length) side.appendChild(el("p", "note", T.noCompanies));
    else {
      var ul = el("ul", "rc-list");
      cos.forEach(function (c) {
        var li = el("li"), top = el("div", "rc-item-top");
        top.appendChild(el("b", null, c.name));
        top.appendChild(el("span", "chip " + (c.visible ? "rc-shown" : "rc-hidden"), c.visible ? T.shown : T.hidden));
        li.appendChild(top);
        var facts = [c.trees !== null ? T.trees(nf.format(c.trees), c.trees) : "", c.since ? T.since(month(c.since)) : ""].filter(Boolean).join(" · ");
        if (facts) li.appendChild(el("span", "muted small", facts));
        var e = btn(li, T.edit, "ghost small-btn");
        e.setAttribute("aria-pressed", String(!!edit && edit.id === c.id));
        e.addEventListener("click", function () { edit = c; last = null; render(); });
        ul.appendChild(li);
      });
      side.appendChild(ul);
    }
    btn(side, T.newCompany, "ghost rc-new").addEventListener("click", function () { edit = null; last = null; render(); });
    grid.appendChild(side);

    // The company's editor: a new one, or the one being edited.
    var c0 = edit || {}, f = el("div", "rc-form");
    f.appendChild(el("h3", "rc-h3", edit ? T.editing(edit.name) : T.newCompany));
    var name = field(f, T.fName, "text", c0.name || "", { maxlength: "120", autocomplete: "off" });
    var url = field(f, T.fUrl, "url", c0.url || "", { spellcheck: "false", placeholder: "https://" });
    var logo = field(f, T.fLogo, "url", c0.logo_url || "", { spellcheck: "false" });
    // « Choisir une image »: a JPEG, PNG or WebP of 2 MB at most into commons-media (admins in aal2: the bucket's policies).
    var row = el("div", "rc-pic"), pick = el("input"), up = btn(row, T.upload, "ghost small-btn");
    pick.type = "file"; pick.accept = "image/jpeg,image/png,image/webp"; pick.hidden = true;
    row.appendChild(pick);
    logo.parentNode.appendChild(row);
    up.addEventListener("click", function () { if (!isWaiting(up)) pick.click(); });
    pick.addEventListener("change", async function () {
      var file = pick.files && pick.files[0];
      pick.value = "";
      if (!file) return;
      var m = logoPath(file, name.value, Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
      if (m.error) { say(T.badFile, "err"); return; }
      waiting(up, true);
      say(T.uploading);
      try { logo.value = await A.upload(m.path, file); say(T.uploaded, "ok"); }
      catch (e) { if (e.status === 401) { A.lost(); return; } say(e.status === 413 || /mime|type|large|size/i.test(String(e.code || "")) ? T.badFile : T.uploadFailed, "err"); }
      finally { waiting(up, false); }
    });
    var vl = el("label", "rc-check"), vis = el("input");
    vis.type = "checkbox"; vis.checked = edit ? c0.visible : true;
    vl.appendChild(vis); vl.appendChild(el("span", null, T.fVisible));
    f.appendChild(vl);
    var acts = el("div", "rc-acts"), save = btn(acts, T.save, "primary");
    if (edit) {
      btn(acts, T.cancel).addEventListener("click", function () { edit = null; last = null; render(); });
      var rm = btn(acts, T.remove, "ghost rc-danger");
      rm.addEventListener("click", async function () {
        if (!(await write("racines_admin_upsert_company", { id: edit.id, delete: true }, rm))) return;
        edit = null; say(T.removed, "ok"); await load();
      });
    }
    f.appendChild(acts);
    save.addEventListener("click", async function () {
      var pl = companyPayload({ id: c0.id, name: name.value, url: url.value, logo: logo.value, visible: vis.checked }, A.api, location.href);
      if (pl.error) { say(T.bad[pl.error], "err"); ({ name: name, url: url, logo: logo })[pl.error].focus(); return; }
      if (!(await write("racines_admin_upsert_company", pl.p, save))) return;
      edit = null; say(T.saved, "ok"); await load();
    });
    main.appendChild(f);

    // Corporate trees: real, pending, of this month (or a past one: the report that counts them); they leave with next
    // month's lot.
    var g = el("div", "rc-form");
    g.appendChild(el("h3", "rc-h3", T.addTrees));
    var co = field(g, T.fCompany, "select");
    var none = el("option", null, "—"); none.value = ""; co.appendChild(none);
    cos.forEach(function (c) { var o = el("option", null, c.name); o.value = String(c.id); co.appendChild(o); });
    if (edit) co.value = String(edit.id);
    var trees = field(g, T.fTrees, "number", "", { min: "1", max: String(TREES_MAX), step: "1", inputmode: "numeric" });
    var amount = field(g, T.fAmount, "text", "", { inputmode: "decimal", autocomplete: "off", maxlength: "12" });
    var note = field(g, T.fNote, "text", "", { maxlength: "500", autocomplete: "off" });
    // A month input (a text box where the browser has none: the placeholder shows the shape).
    var mon = field(g, T.fMonth, "month", "", { max: thisMonth(), placeholder: thisMonth() });
    var acts2 = el("div", "rc-acts"), add = btn(acts2, T.add, "primary");
    g.appendChild(acts2);
    add.addEventListener("click", async function () {
      var pl = treesPayload({ company: co.value, trees: trees.value, amount: amount.value, note: note.value, month: mon.value });
      if (pl.error) { say(T.bad[pl.error], "err"); ({ company: co, trees: trees, amount: amount, month: mon })[pl.error].focus(); return; }
      if (!(await write("racines_admin_add_corporate_trees", pl.p, add))) return;
      say(T.added(nf.format(pl.p.trees), pl.p.trees), "ok"); await load();
    });
    main.appendChild(g);
    grid.appendChild(main);
    b.appendChild(grid);
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
  if (A.demo) root.WNC_RACINES = { open: function (t, id) { tab = t || tab; edit = list().filter(function (c) { return c.id === id; })[0] || null; last = null; render(); } };
})(this);

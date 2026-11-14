/*
 * WaterNow Statistics, private console: « Fontaine commune » for admins (docs/18_FONTAINE_COMMUNE.md). Every change goes
 * through section 85's admin RPCs (admin + aal2, checked by the server): the projects (drafts included), their 3
 * candidate sites (picked on the console's map, their figures from the fountain simulator, sim-core.js), the budget,
 * sponsors and matching, the status steps, the donations (hide a message) and the plaque's QR code (a sheet to print or
 * save as PDF). The page's session and calls are console.js's (window.WNCAPP), the map and the simulator's area
 * simulator.js's (window.WNC_PAGE, window.WNC_AREA). Text through textContent only. Pure helpers shared with the node
 * test (module.exports).
 */
(function (root) {
  "use strict";
  var node = typeof module === "object" && module.exports;
  var F = node ? require("../assets/fontaine-data.js") : root.WNF;
  // The plaque is printed once and stays on the wall: its QR code always opens the public site, never a preview's.
  var SITE = "https://coolminer11.github.io/WaterNow-site/";
  var STATUSES = ["draft", "vote", "funding", "building", "built", "archived"];
  var SITES = 3;

  /** The fountain's public page, the plaque's QR code: f/?s=<spotId>; null for anything that isn't a point id. */
  function plaqueUrl(spot) {
    return typeof spot === "number" && Number.isSafeInteger(spot) && spot > 0 ? SITE + "f/?s=" + spot : null;
  }

  /**
   * The steps an admin can take from [status], forward only as section 85's set_status allows them: a draft opens its
   * vote or goes straight to funding; a vote or a fundraiser can be archived (the server rolls the money over).
   */
  function nextSteps(status) {
    return ({ draft: ["vote", "funding"], vote: ["funding", "archived"], funding: ["building", "archived"], building: ["built"] })[status] || [];
  }

  /**
   * A candidate site's figures from the simulator's area [A] (simulator.js's WNC_AREA.get(), with sim-core [S]):
   * residents newly within a 5-minute walk (no point today within that ring), residents within 10 minutes, searches
   * with no result within 10 minutes. The same sums as the simulator's own panel for one spot.
   */
  function siteFigures(S, A, lat, lon) {
    var c = [{ x: A.P.x(lon), y: A.P.y(lat) }];
    return {
      newly_served: Math.round(S.newly(A.S, A.dist("water"), c, S.R[0]).pop),
      residents_10min: Math.round(S.within(A.S, c, S.R[1])),
      demand_searches: Math.round(S.within(A.S, c, S.R[1], A.demand))
    };
  }

  /**
   * Section 89 deletes a project only while none of its gifts is real: every donation's Stripe id starts with "demo_"
   * (a project with no gift at all goes too). The server checks again ('real_donations', 'linked').
   */
  function deletable(p) {
    return !!p && typeof p.id === "number" && !p.fund && (Array.isArray(p.donations) ? p.donations : []).every(function (d) {
      return !!d && typeof d.stripe_object_id === "string" && d.stripe_object_id.indexOf("demo_") === 0;
    });
  }

  /** "Bibliothèque du Faubourg" → "bibliotheque-du-faubourg" (section 85's slug: a-z0-9 and hyphens, 48 at most). */
  function slugOf(t) {
    return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")
      .slice(0, 48).replace(/^-+|-+$/g, "");
  }

  // Section 85's pictures: the public bucket commons-media, JPEG, PNG or WebP, 2 MB at most (the bucket enforces both).
  var MEDIA_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }, MEDIA_MAX = 2 * 1024 * 1024;
  /**
   * Where a picture [file] goes: "commons-media/<folder>/<slug of tag>-<rand>.<ext>" (folder "covers" or "logos": the
   * names section 85's policies and commons_media_url_ok accept, a-z0-9-), or {error: "type" | "size"}.
   */
  function mediaPath(folder, file, tag, rand) {
    var ext = file && MEDIA_TYPES[file.type];
    if (!ext) return { error: "type" };
    if (!(file.size > 0 && file.size <= MEDIA_MAX)) return { error: "size" };
    return { path: "commons-media/" + folder + "/" + ((slugOf(tag) || "image").slice(0, 40).replace(/-+$/, "")) + "-" + rand + "." + ext };
  }

  function num(v) { var n = typeof v === "number" ? v : Number(String(v == null ? "" : v).replace(/\s/g, "").replace(",", ".")); return isFinite(n) ? n : null; }
  function txt(v, max) { return typeof v === "string" ? Array.from(v.replace(/\s+/g, " ").trim()).slice(0, max).join("") : ""; }

  /** The sites' rows as commons_admin_set_sites wants them, or {error: row number}: a name and a real position each. */
  function sitesPayload(rows) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], lat = num(r.lat), lon = num(r.lon);
      var empty = !txt(r.name, 80) && r.lat === "" && r.lon === "";
      if (empty) continue;
      if (!txt(r.name, 80) || lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { error: i + 1 };
      var fig = function (v) { var n = num(v); return n === null || v === "" ? null : Math.max(0, Math.round(n)); };
      out.push({ name: txt(r.name, 80), address: txt(r.address, 160), lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6,
                 newly_served: fig(r.newly), residents_10min: fig(r.res10), demand_searches: fig(r.demand) });
    }
    return { sites: out };
  }

  /** The budget's rows as commons_admin_set_budget wants them, or {error: row number}. Amounts typed in dollars. */
  function budgetPayload(rows) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], c = F.amountCents(r.amount);
      if (!txt(r.label, 80) && r.amount === "") continue;
      if (F.BUDGET_KINDS.indexOf(r.kind) < 0 || c === null) return { error: i + 1 };
      out.push({ kind: r.kind, label: txt(r.label, 80), amount_cents: c });
    }
    return { lines: out };
  }

  /** "2026-11-30T04:59:00Z" → the value of an <input type="datetime-local"> in this browser's time, and back (null when empty). */
  function toLocal(iso) {
    var t = typeof iso === "string" ? Date.parse(iso) : NaN;
    if (!isFinite(t)) return "";
    var d = new Date(t - new Date(t).getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  }
  function fromLocal(v) { var t = v ? Date.parse(v) : NaN; return isFinite(t) ? new Date(t).toISOString() : null; }

  var roDe = F.roDe;
  // The console's 7 languages (docs/translations-glossary.md): French says "tu", Romanian writes ș ț with the comma below.
  var STRINGS = {
    en: {
      title: "Community Fountain", lead: "Projects, candidate sites, budget, sponsors and donations. Every change goes through the server's checks.",
      newProject: "New project", noProjects: "No project yet.", unavailable: "The Community Fountain isn't on the server yet (section 85).",
      tabs: { project: "Project", sites: "Sites", budget: "Budget", sponsors: "Sponsors", participants: "Participants", bids: "Bids", status: "Status", donations: "Donations", plaque: "Plaque" },
      status: { draft: "Draft", vote: "Vote", funding: "Fundraising", building: "Building", built: "Built", archived: "Archived" },
      donors: function (s, n) { return n === 1 ? "1 donor" : s + " donors"; },
      fTitle: "Title", fSlug: "Short address (slug)", fCity: "City", fDescription: "Description", fGoal: "Goal ($)",
      fCover: "Cover picture (WaterNow storage link)", fEnds: "Campaign ends", fBuilder: "Builder", fKind: "Kind", fBuilderUrl: "Builder's website",
      fQuote: "Quote ($)", fQuoteDoc: "Quote document (link)", fHost: "Host", fHostUrl: "Host's website", fVoteOpens: "Vote opens", fVoteCloses: "Vote closes",
      save: "Save", saved: "Saved.", refused: "The server refused this change.", check: function (f) { return "Check: " + f + "."; },
      sitesLead: "Three sites proposed by the data. Pick each one on the map (above), then fill its figures from the simulator.",
      site: function (l) { return "Site " + l; }, name: "Name", address: "Address", lat: "Latitude", lon: "Longitude",
      newly: "Newly served (5 min)", res10: "Residents (10 min)", demand: "Searches, no result",
      pick: "Pick on the map", picking: "Click the map where the site is…", fill: "Fill from the simulator", filling: "Computing…",
      filled: "Figures filled from the simulator.", badRow: function (n) { return "Check row " + n + "."; },
      simNo: "The simulator can't compute here (no population loaded for this area, or a partner's view): type the figures.",
      kind: "Kind", label: "Label", amount: "Amount ($)", addLine: "Add a line", remove: "Remove", total: "Total", vsGoal: function (a, b) { return "Total " + a + " · goal " + b; },
      tier: "Tier", logo: "Logo (WaterNow storage link)", link: "Link", addSponsor: "Add the sponsor", sponsorsNow: "Sponsors",
      matching: "Matching campaign", org: "Organisation", ratio: "Ratio (1 = doubled)", cap: "Cap ($)", starts: "Starts", ends: "Ends",
      saveMatching: "Save the matching", statusNow: function (s) { return "Status: " + s; },
      step: { vote: "Open the vote", funding: "Start fundraising with this site", building: "Mark as being built", built: "Mark as built and link the point", archived: "Archive and roll the money over" },
      winner: "Winning site", spot: "WaterNow point id", rollNote: "The server moves what it raised to the project being funded (else the vote), else to the fund.", fundTitle: "Community fund", fundLine: function (s, n) { return s + " · " + (n === 1 ? "1 gift" : n + " gifts"); }, forbidden: "This account can't do that: admins with their second factor only.", refunded: "refunded", matchedTag: function (s) { return "+ " + s + " matched"; }, optional: "optional",
      confirm: function (s) { return "Change the status to « " + s + " »? The members see it at once."; }, noStep: "No step left for this project.",
      donLead: "Full details for receipts. Hiding a message keeps the gift on the wall without its words.",
      anonymous: "Anonymous", monthly: "monthly", shown: "amount shown", hidden: "message hidden", hide: "Hide the message", unhide: "Show the message",
      noDonations: "No donation yet.",
      plaqueLead: "A sheet to print or save as PDF: its QR code opens the fountain's page.", needSpot: "Link the WaterNow point first (Status).",
      plaque: "Open the plaque", print: "Print or save as PDF", close: "Close", builtBy: "Built by the community", with: "With the support of",
      scan: "Scan: who gave, and the bottles saved since it opened.",
      upload: "Choose a picture", uploading: "Sending the picture…", uploaded: "Picture sent. Save to keep it.",
      badFile: "A JPEG, PNG or WebP picture, 2 MB at most.", uploadFailed: "The picture couldn't be sent. Try again.",
      edit: "Edit", cancel: "Cancel", saveSponsor: "Save the sponsor", newCampaign: "New campaign",
      campaign: { past: "Ended", active: "Running", upcoming: "To come" },
      inUse: "A gift already used this campaign: it stays (end it earlier instead).",
      badUrl: "Pictures come from WaterNow's storage only: use “Choose a picture”.",
      del: "Delete", delNote: "For a demonstration or test project only (no real gift): it goes with its sites, votes, budget, sponsors and demo gifts.",
      delConfirm: function (s) { return "Delete « " + s + " » for good? This can't be undone."; }, deleted: "Project deleted.",
      realGifts: "This project holds real gifts: it stays (archive it instead).", linked: "Money moved between this project and another one: it stays."
    },
    fr: {
      title: "Fontaine commune", lead: "Projets, sites proposés, budget, commanditaires et dons. Chaque changement passe par les vérifications du serveur.",
      newProject: "Nouveau projet", noProjects: "Pas encore de projet.", unavailable: "La Fontaine commune n'est pas encore sur le serveur (section 85).",
      tabs: { project: "Projet", sites: "Sites", budget: "Budget", sponsors: "Commanditaires", participants: "Intervenants", bids: "Soumissions", status: "Statut", donations: "Dons", plaque: "Plaque" },
      status: { draft: "Brouillon", vote: "Vote", funding: "Collecte", building: "Construction", built: "Construite", archived: "Archivée" },
      donors: function (s, n) { return n <= 1 ? n + " donateur" : s + " donateurs"; },
      fTitle: "Titre", fSlug: "Adresse courte (slug)", fCity: "Ville", fDescription: "Description", fGoal: "Objectif ($)",
      fCover: "Photo de couverture (lien du stockage WaterNow)", fEnds: "Fin de la campagne", fBuilder: "Construction", fKind: "Type", fBuilderUrl: "Site web de l'entreprise",
      fQuote: "Soumission ($)", fQuoteDoc: "Document de la soumission (lien)", fHost: "Hôte", fHostUrl: "Site web de l'hôte", fVoteOpens: "Ouverture du vote", fVoteCloses: "Fin du vote",
      save: "Enregistrer", saved: "Enregistré.", refused: "Le serveur a refusé ce changement.", check: function (f) { return "Vérifie : " + f + "."; },
      sitesLead: "Trois sites proposés par les données. Choisis chacun sur la carte (plus haut), puis remplis ses chiffres avec le simulateur.",
      site: function (l) { return "Site " + l; }, name: "Nom", address: "Adresse", lat: "Latitude", lon: "Longitude",
      newly: "Nouveaux desservis (5 min)", res10: "Résidents (10 min)", demand: "Recherches sans résultat",
      pick: "Choisir sur la carte", picking: "Clique sur la carte à l'endroit du site…", fill: "Remplir avec le simulateur", filling: "Calcul…",
      filled: "Chiffres remplis par le simulateur.", badRow: function (n) { return "Vérifie la ligne " + n + "."; },
      simNo: "Le simulateur ne peut pas calculer ici (pas de population chargée pour cette zone, ou la vue d'un partenaire) : écris les chiffres.",
      kind: "Type", label: "Libellé", amount: "Montant ($)", addLine: "Ajouter une ligne", remove: "Retirer", total: "Total", vsGoal: function (a, b) { return "Total " + a + " · objectif " + b; },
      tier: "Niveau", logo: "Logo (lien du stockage WaterNow)", link: "Lien", addSponsor: "Ajouter le commanditaire", sponsorsNow: "Commanditaires",
      matching: "Campagne de jumelage", org: "Organisme", ratio: "Ratio (1 = doublé)", cap: "Plafond ($)", starts: "Début", ends: "Fin",
      saveMatching: "Enregistrer le jumelage", statusNow: function (s) { return "Statut : " + s; },
      step: { vote: "Ouvrir le vote", funding: "Lancer la collecte avec ce site", building: "Passer en construction", built: "Marquer construite et lier le point", archived: "Archiver et reporter l'argent" },
      winner: "Site gagnant", spot: "Identifiant du point WaterNow", rollNote: "Le serveur passe ce qui a été amassé au projet en collecte (sinon au vote), sinon au fonds.", fundTitle: "Fonds commun", fundLine: function (s, n) { return s + " · " + (n <= 1 ? n + " don" : n + " dons"); }, forbidden: "Ce compte ne peut pas faire ça : seulement les admins avec leur deuxième facteur.", refunded: "remboursé", matchedTag: function (s) { return "+ " + s + " jumelés"; }, optional: "facultatif",
      confirm: function (s) { return "Passer le statut à « " + s + " » ? Les membres le voient tout de suite."; }, noStep: "Plus d'étape pour ce projet.",
      donLead: "Tous les détails pour les reçus. Masquer un message garde le don sur le mur, sans ses mots.",
      anonymous: "Anonyme", monthly: "mensuel", shown: "montant affiché", hidden: "message masqué", hide: "Masquer le message", unhide: "Afficher le message",
      noDonations: "Pas encore de don.",
      plaqueLead: "Une feuille à imprimer ou à enregistrer en PDF : son code QR ouvre la page de la fontaine.", needSpot: "Lie d'abord le point WaterNow (Statut).",
      plaque: "Ouvrir la plaque", print: "Imprimer ou enregistrer en PDF", close: "Fermer", builtBy: "Construite par la communauté", with: "Avec le soutien de",
      scan: "Scanne : qui a donné, et les bouteilles évitées depuis l'ouverture.",
      upload: "Choisir une image", uploading: "Envoi de l'image…", uploaded: "Image envoyée. Enregistre pour la garder.",
      badFile: "Une image JPEG, PNG ou WebP, 2 Mo au plus.", uploadFailed: "Impossible d'envoyer l'image. Réessaie.",
      edit: "Modifier", cancel: "Annuler", saveSponsor: "Enregistrer le commanditaire", newCampaign: "Nouvelle campagne",
      campaign: { past: "Terminée", active: "En cours", upcoming: "À venir" },
      inUse: "Un don a déjà utilisé cette campagne : elle reste (termine-la plus tôt à la place).",
      badUrl: "Les images viennent seulement du stockage WaterNow : utilise « Choisir une image ».",
      del: "Supprimer", delNote: "Seulement pour un projet de démonstration ou de test (aucun vrai don) : il part avec ses sites, ses votes, son budget, ses commanditaires et ses dons de démonstration.",
      delConfirm: function (s) { return "Supprimer « " + s + " » pour de bon ? C'est impossible à annuler."; }, deleted: "Projet supprimé.",
      realGifts: "Ce projet a de vrais dons : il reste (archive-le plutôt).", linked: "De l'argent est passé entre ce projet et un autre : il reste."
    },
    es: {
      title: "Fuente común", lead: "Proyectos, lugares propuestos, presupuesto, patrocinadores y donaciones. Cada cambio pasa por las verificaciones del servidor.",
      newProject: "Nuevo proyecto", noProjects: "Aún no hay proyectos.", unavailable: "La Fuente común aún no está en el servidor (sección 85).",
      tabs: { project: "Proyecto", sites: "Lugares", budget: "Presupuesto", sponsors: "Patrocinadores", participants: "Participantes", bids: "Ofertas", status: "Estado", donations: "Donaciones", plaque: "Placa" },
      status: { draft: "Borrador", vote: "Votación", funding: "Recaudación", building: "Construcción", built: "Construida", archived: "Archivada" },
      donors: function (s, n) { return n === 1 ? "1 donante" : s + " donantes"; },
      fTitle: "Título", fSlug: "Dirección corta (slug)", fCity: "Ciudad", fDescription: "Descripción", fGoal: "Meta ($)",
      fCover: "Foto de portada (enlace del almacenamiento de WaterNow)", fEnds: "Fin de la campaña", fBuilder: "Construcción", fKind: "Tipo", fBuilderUrl: "Sitio web de la empresa",
      fQuote: "Presupuesto de obra ($)", fQuoteDoc: "Documento del presupuesto (enlace)", fHost: "Anfitrión", fHostUrl: "Sitio web del anfitrión", fVoteOpens: "Apertura de la votación", fVoteCloses: "Cierre de la votación",
      save: "Guardar", saved: "Guardado.", refused: "El servidor rechazó este cambio.", check: function (f) { return "Revisa: " + f + "."; },
      sitesLead: "Tres lugares propuestos por los datos. Elige cada uno en el mapa (arriba) y luego rellena sus cifras con el simulador.",
      site: function (l) { return "Lugar " + l; }, name: "Nombre", address: "Dirección", lat: "Latitud", lon: "Longitud",
      newly: "Nuevos atendidos (5 min)", res10: "Residentes (10 min)", demand: "Búsquedas sin resultado",
      pick: "Elegir en el mapa", picking: "Haz clic en el mapa donde está el lugar…", fill: "Rellenar con el simulador", filling: "Calculando…",
      filled: "Cifras rellenadas por el simulador.", badRow: function (n) { return "Revisa la fila " + n + "."; },
      simNo: "El simulador no puede calcular aquí (sin población cargada para esta zona, o la vista de un socio): escribe las cifras.",
      kind: "Tipo", label: "Concepto", amount: "Importe ($)", addLine: "Añadir una línea", remove: "Quitar", total: "Total", vsGoal: function (a, b) { return "Total " + a + " · meta " + b; },
      tier: "Nivel", logo: "Logo (enlace del almacenamiento de WaterNow)", link: "Enlace", addSponsor: "Añadir el patrocinador", sponsorsNow: "Patrocinadores",
      matching: "Campaña de igualación", org: "Organización", ratio: "Proporción (1 = duplicado)", cap: "Tope ($)", starts: "Inicio", ends: "Fin",
      saveMatching: "Guardar la igualación", statusNow: function (s) { return "Estado: " + s; },
      step: { vote: "Abrir la votación", funding: "Iniciar la recaudación con este lugar", building: "Pasar a construcción", built: "Marcar como construida y vincular el punto", archived: "Archivar y traspasar el dinero" },
      winner: "Lugar ganador", spot: "Id del punto de WaterNow", rollNote: "El servidor pasa lo recaudado al proyecto en recaudación (si no, a la votación); si no, al fondo.", fundTitle: "Fondo común", fundLine: function (s, n) { return s + " · " + (n === 1 ? "1 donación" : n + " donaciones"); }, forbidden: "Esta cuenta no puede hacer eso: solo admins con su segundo factor.", refunded: "reembolsada", matchedTag: function (s) { return "+ " + s + " igualados"; }, optional: "opcional",
      confirm: function (s) { return "¿Cambiar el estado a « " + s + " »? Los miembros lo ven al instante."; }, noStep: "No quedan pasos para este proyecto.",
      donLead: "Todos los detalles para los recibos. Ocultar un mensaje mantiene la donación en el muro, sin sus palabras.",
      anonymous: "Anónimo", monthly: "mensual", shown: "importe visible", hidden: "mensaje oculto", hide: "Ocultar el mensaje", unhide: "Mostrar el mensaje",
      noDonations: "Aún no hay donaciones.",
      plaqueLead: "Una hoja para imprimir o guardar en PDF: su código QR abre la página de la fuente.", needSpot: "Vincula primero el punto de WaterNow (Estado).",
      plaque: "Abrir la placa", print: "Imprimir o guardar en PDF", close: "Cerrar", builtBy: "Construida por la comunidad", with: "Con el apoyo de",
      scan: "Escanea: quién donó y las botellas evitadas desde su apertura.",
      upload: "Elegir una imagen", uploading: "Enviando la imagen…", uploaded: "Imagen enviada. Guarda para conservarla.",
      badFile: "Una imagen JPEG, PNG o WebP, de 2 MB como máximo.", uploadFailed: "No se pudo enviar la imagen. Inténtalo de nuevo.",
      edit: "Editar", cancel: "Cancelar", saveSponsor: "Guardar el patrocinador", newCampaign: "Nueva campaña",
      campaign: { past: "Terminada", active: "En curso", upcoming: "Próxima" },
      inUse: "Una donación ya usó esta campaña: se queda (termínala antes en su lugar).",
      badUrl: "Las imágenes solo vienen del almacenamiento de WaterNow: usa «Elegir una imagen».",
      del: "Eliminar", delNote: "Solo para un proyecto de demostración o de prueba (sin donaciones reales): se va con sus lugares, votos, presupuesto, patrocinadores y donaciones de demostración.",
      delConfirm: function (s) { return "¿Eliminar « " + s + " » para siempre? No se puede deshacer."; }, deleted: "Proyecto eliminado.",
      realGifts: "Este proyecto tiene donaciones reales: se queda (archívalo en su lugar).", linked: "Hubo dinero entre este proyecto y otro: se queda."
    },
    de: {
      title: "Gemeinschaftsbrunnen", lead: "Projekte, vorgeschlagene Orte, Budget, Sponsoren und Spenden. Jede Änderung geht durch die Prüfungen des Servers.",
      newProject: "Neues Projekt", noProjects: "Noch kein Projekt.", unavailable: "Der Gemeinschaftsbrunnen ist noch nicht auf dem Server (Abschnitt 85).",
      tabs: { project: "Projekt", sites: "Orte", budget: "Budget", sponsors: "Sponsoren", participants: "Beteiligte", bids: "Angebote", status: "Status", donations: "Spenden", plaque: "Tafel" },
      status: { draft: "Entwurf", vote: "Abstimmung", funding: "Spendenaktion", building: "Im Bau", built: "Gebaut", archived: "Archiviert" },
      donors: function (s, n) { return n === 1 ? "1 Spender" : s + " Spender"; },
      fTitle: "Titel", fSlug: "Kurzadresse (Slug)", fCity: "Stadt", fDescription: "Beschreibung", fGoal: "Ziel ($)",
      fCover: "Titelbild (Link zum WaterNow-Speicher)", fEnds: "Ende der Aktion", fBuilder: "Bau", fKind: "Art", fBuilderUrl: "Website des Unternehmens",
      fQuote: "Angebot ($)", fQuoteDoc: "Angebotsdokument (Link)", fHost: "Gastgeber", fHostUrl: "Website des Gastgebers", fVoteOpens: "Abstimmung beginnt", fVoteCloses: "Abstimmung endet",
      save: "Speichern", saved: "Gespeichert.", refused: "Der Server hat diese Änderung abgelehnt.", check: function (f) { return "Prüfe: " + f + "."; },
      sitesLead: "Drei Orte, von den Daten vorgeschlagen. Wähl jeden auf der Karte (oben) und füll dann seine Zahlen mit dem Simulator aus.",
      site: function (l) { return "Ort " + l; }, name: "Name", address: "Adresse", lat: "Breitengrad", lon: "Längengrad",
      newly: "Neu versorgt (5 Min.)", res10: "Anwohner (10 Min.)", demand: "Suchen ohne Treffer",
      pick: "Auf der Karte wählen", picking: "Klick auf der Karte auf den Ort…", fill: "Mit dem Simulator ausfüllen", filling: "Wird berechnet…",
      filled: "Zahlen vom Simulator ausgefüllt.", badRow: function (n) { return "Prüfe Zeile " + n + "."; },
      simNo: "Der Simulator kann hier nicht rechnen (keine Bevölkerung für dieses Gebiet geladen, oder die Ansicht eines Partners): Gib die Zahlen ein.",
      kind: "Art", label: "Bezeichnung", amount: "Betrag ($)", addLine: "Zeile hinzufügen", remove: "Entfernen", total: "Gesamt", vsGoal: function (a, b) { return "Gesamt " + a + " · Ziel " + b; },
      tier: "Stufe", logo: "Logo (Link zum WaterNow-Speicher)", link: "Link", addSponsor: "Sponsor hinzufügen", sponsorsNow: "Sponsoren",
      matching: "Verdopplungsaktion", org: "Organisation", ratio: "Verhältnis (1 = verdoppelt)", cap: "Obergrenze ($)", starts: "Beginn", ends: "Ende",
      saveMatching: "Verdopplung speichern", statusNow: function (s) { return "Status: " + s; },
      step: { vote: "Abstimmung öffnen", funding: "Spendenaktion mit diesem Ort starten", building: "Auf „Im Bau“ setzen", built: "Als gebaut markieren und Ort verknüpfen", archived: "Archivieren und Geld übertragen" },
      winner: "Gewählter Ort", spot: "ID des WaterNow-Orts", rollNote: "Der Server überträgt das Gesammelte an das laufende Spendenprojekt (sonst an die Abstimmung), sonst in den Fonds.", fundTitle: "Gemeinsamer Fonds", fundLine: function (s, n) { return s + " · " + (n === 1 ? "1 Spende" : n + " Spenden"); }, forbidden: "Dieses Konto darf das nicht: nur Admins mit ihrem zweiten Faktor.", refunded: "erstattet", matchedTag: function (s) { return "+ " + s + " verdoppelt"; }, optional: "freiwillig",
      confirm: function (s) { return "Status auf „" + s + "“ setzen? Die Mitglieder sehen es sofort."; }, noStep: "Für dieses Projekt gibt es keinen Schritt mehr.",
      donLead: "Alle Angaben für die Belege. Eine ausgeblendete Nachricht lässt die Spende ohne ihre Worte auf der Wand.",
      anonymous: "Anonym", monthly: "monatlich", shown: "Betrag sichtbar", hidden: "Nachricht ausgeblendet", hide: "Nachricht ausblenden", unhide: "Nachricht zeigen",
      noDonations: "Noch keine Spende.",
      plaqueLead: "Ein Blatt zum Drucken oder als PDF: Sein QR-Code öffnet die Seite des Brunnens.", needSpot: "Verknüpf zuerst den WaterNow-Ort (Status).",
      plaque: "Tafel öffnen", print: "Drucken oder als PDF speichern", close: "Schließen", builtBy: "Von der Community gebaut", with: "Mit Unterstützung von",
      scan: "Scannen: Wer gespendet hat, und die seit der Eröffnung vermiedenen Flaschen.",
      upload: "Bild auswählen", uploading: "Bild wird gesendet…", uploaded: "Bild gesendet. Speichere, um es zu behalten.",
      badFile: "Ein JPEG-, PNG- oder WebP-Bild, höchstens 2 MB.", uploadFailed: "Das Bild konnte nicht gesendet werden. Versuch es noch einmal.",
      edit: "Bearbeiten", cancel: "Abbrechen", saveSponsor: "Sponsor speichern", newCampaign: "Neue Aktion",
      campaign: { past: "Beendet", active: "Läuft", upcoming: "Geplant" },
      inUse: "Eine Spende hat diese Aktion schon genutzt: Sie bleibt (beende sie stattdessen früher).",
      badUrl: "Bilder kommen nur aus dem WaterNow-Speicher: Nutze „Bild auswählen“.",
      del: "Löschen", delNote: "Nur für ein Demo- oder Testprojekt (keine echte Spende): Es verschwindet mit seinen Orten, Stimmen, dem Budget, den Sponsoren und den Demo-Spenden.",
      delConfirm: function (s) { return "„" + s + "“ endgültig löschen? Das lässt sich nicht rückgängig machen."; }, deleted: "Projekt gelöscht.",
      realGifts: "Dieses Projekt hat echte Spenden: Es bleibt (archiviere es stattdessen).", linked: "Zwischen diesem und einem anderen Projekt wurde Geld übertragen: Es bleibt."
    },
    pt: {
      title: "Fonte comum", lead: "Projetos, lugares propostos, orçamento, patrocinadores e doações. Cada mudança passa pelas verificações do servidor.",
      newProject: "Novo projeto", noProjects: "Nenhum projeto ainda.", unavailable: "A Fonte comum ainda não está no servidor (seção 85).",
      tabs: { project: "Projeto", sites: "Lugares", budget: "Orçamento", sponsors: "Patrocinadores", participants: "Participantes", bids: "Propostas", status: "Status", donations: "Doações", plaque: "Placa" },
      status: { draft: "Rascunho", vote: "Votação", funding: "Arrecadação", building: "Em construção", built: "Construída", archived: "Arquivada" },
      donors: function (s, n) { return n === 1 ? "1 doador" : s + " doadores"; },
      fTitle: "Título", fSlug: "Endereço curto (slug)", fCity: "Cidade", fDescription: "Descrição", fGoal: "Meta ($)",
      fCover: "Foto de capa (link do armazenamento do WaterNow)", fEnds: "Fim da campanha", fBuilder: "Construção", fKind: "Tipo", fBuilderUrl: "Site da empresa",
      fQuote: "Orçamento da obra ($)", fQuoteDoc: "Documento do orçamento (link)", fHost: "Anfitrião", fHostUrl: "Site do anfitrião", fVoteOpens: "Abertura da votação", fVoteCloses: "Fim da votação",
      save: "Salvar", saved: "Salvo.", refused: "O servidor recusou esta mudança.", check: function (f) { return "Verifique: " + f + "."; },
      sitesLead: "Três lugares propostos pelos dados. Escolha cada um no mapa (acima) e depois preencha os números com o simulador.",
      site: function (l) { return "Lugar " + l; }, name: "Nome", address: "Endereço", lat: "Latitude", lon: "Longitude",
      newly: "Novos atendidos (5 min)", res10: "Moradores (10 min)", demand: "Buscas sem resultado",
      pick: "Escolher no mapa", picking: "Clique no mapa onde fica o lugar…", fill: "Preencher com o simulador", filling: "Calculando…",
      filled: "Números preenchidos pelo simulador.", badRow: function (n) { return "Verifique a linha " + n + "."; },
      simNo: "O simulador não consegue calcular aqui (sem população carregada para esta área, ou a visão de um parceiro): digite os números.",
      kind: "Tipo", label: "Descrição", amount: "Valor ($)", addLine: "Adicionar uma linha", remove: "Remover", total: "Total", vsGoal: function (a, b) { return "Total " + a + " · meta " + b; },
      tier: "Nível", logo: "Logo (link do armazenamento do WaterNow)", link: "Link", addSponsor: "Adicionar o patrocinador", sponsorsNow: "Patrocinadores",
      matching: "Campanha de doação em dobro", org: "Organização", ratio: "Proporção (1 = em dobro)", cap: "Teto ($)", starts: "Início", ends: "Fim",
      saveMatching: "Salvar a campanha", statusNow: function (s) { return "Status: " + s; },
      step: { vote: "Abrir a votação", funding: "Iniciar a arrecadação com este lugar", building: "Passar para construção", built: "Marcar como construída e vincular o ponto", archived: "Arquivar e transferir o dinheiro" },
      winner: "Lugar vencedor", spot: "Id do ponto do WaterNow", rollNote: "O servidor passa o que foi arrecadado para o projeto em arrecadação (senão, para a votação); senão, para o fundo.", fundTitle: "Fundo comum", fundLine: function (s, n) { return s + " · " + (n === 1 ? "1 doação" : n + " doações"); }, forbidden: "Esta conta não pode fazer isso: só admins com o segundo fator.", refunded: "reembolsada", matchedTag: function (s) { return "+ " + s + " em dobro"; }, optional: "opcional",
      confirm: function (s) { return "Mudar o status para “" + s + "”? Os membros veem na hora."; }, noStep: "Não há mais etapas para este projeto.",
      donLead: "Todos os detalhes para os recibos. Ocultar uma mensagem mantém a doação no mural, sem as palavras.",
      anonymous: "Anônimo", monthly: "mensal", shown: "valor visível", hidden: "mensagem oculta", hide: "Ocultar a mensagem", unhide: "Mostrar a mensagem",
      noDonations: "Nenhuma doação ainda.",
      plaqueLead: "Uma folha para imprimir ou salvar em PDF: o código QR abre a página da fonte.", needSpot: "Vincule primeiro o ponto do WaterNow (Status).",
      plaque: "Abrir a placa", print: "Imprimir ou salvar em PDF", close: "Fechar", builtBy: "Construída pela comunidade", with: "Com o apoio de",
      scan: "Escaneie: quem doou e as garrafas evitadas desde a inauguração.",
      upload: "Escolher uma imagem", uploading: "Enviando a imagem…", uploaded: "Imagem enviada. Salve para mantê-la.",
      badFile: "Uma imagem JPEG, PNG ou WebP, de no máximo 2 MB.", uploadFailed: "Não foi possível enviar a imagem. Tente de novo.",
      edit: "Editar", cancel: "Cancelar", saveSponsor: "Salvar o patrocinador", newCampaign: "Nova campanha",
      campaign: { past: "Encerrada", active: "Em andamento", upcoming: "A seguir" },
      inUse: "Uma doação já usou esta campanha: ela fica (encerre-a mais cedo em vez disso).",
      badUrl: "As imagens vêm só do armazenamento do WaterNow: use “Escolher uma imagem”.",
      del: "Excluir", delNote: "Só para um projeto de demonstração ou de teste (nenhuma doação real): ele sai com seus lugares, votos, orçamento, patrocinadores e doações de demonstração.",
      delConfirm: function (s) { return "Excluir “" + s + "” de vez? Não dá para desfazer."; }, deleted: "Projeto excluído.",
      realGifts: "Este projeto tem doações reais: ele fica (arquive-o em vez disso).", linked: "Houve dinheiro entre este projeto e outro: ele fica."
    },
    ja: {
      title: "みんなの給水所", lead: "プロジェクト、候補地、予算、スポンサー、寄付を管理します。すべての変更はサーバーで確認されます。",
      newProject: "新しいプロジェクト", noProjects: "プロジェクトはまだありません。", unavailable: "「みんなの給水所」はまだサーバーにありません（セクション85）。",
      tabs: { project: "プロジェクト", sites: "候補地", budget: "予算", sponsors: "スポンサー", participants: "関係者", bids: "入札", status: "ステータス", donations: "寄付", plaque: "銘板" },
      status: { draft: "下書き", vote: "投票", funding: "寄付受付", building: "建設中", built: "完成", archived: "アーカイブ" },
      donors: function (s) { return "寄付者 " + s + "人"; },
      fTitle: "タイトル", fSlug: "短縮アドレス（スラッグ）", fCity: "都市", fDescription: "説明", fGoal: "目標額（$）",
      fCover: "カバー写真（WaterNowストレージのリンク）", fEnds: "募集終了日", fBuilder: "施工", fKind: "種類", fBuilderUrl: "施工業者のウェブサイト",
      fQuote: "見積額（$）", fQuoteDoc: "見積書（リンク）", fHost: "設置先", fHostUrl: "設置先のウェブサイト", fVoteOpens: "投票開始", fVoteCloses: "投票終了",
      save: "保存", saved: "保存しました。", refused: "サーバーがこの変更を拒否しました。", check: function (f) { return "確認してください：" + f + "。"; },
      sitesLead: "データが提案する3つの候補地です。上のマップでそれぞれを選び、シミュレーターで数値を入力します。",
      site: function (l) { return "候補地 " + l; }, name: "名前", address: "住所", lat: "緯度", lon: "経度",
      newly: "新たに対象（5分）", res10: "住民（10分）", demand: "結果なしの検索",
      pick: "マップで選ぶ", picking: "候補地の場所をマップでクリックしてください…", fill: "シミュレーターで入力", filling: "計算中…",
      filled: "シミュレーターで数値を入力しました。", badRow: function (n) { return n + "行目を確認してください。"; },
      simNo: "ここではシミュレーターで計算できません（この地域の人口データがないか、パートナーの表示です）。数値を入力してください。",
      kind: "種類", label: "内容", amount: "金額（$）", addLine: "行を追加", remove: "削除", total: "合計", vsGoal: function (a, b) { return "合計 " + a + "・目標額 " + b; },
      tier: "ランク", logo: "ロゴ（WaterNowストレージのリンク）", link: "リンク", addSponsor: "スポンサーを追加", sponsorsNow: "スポンサー",
      matching: "マッチング寄付", org: "団体", ratio: "倍率（1 = 2倍）", cap: "上限（$）", starts: "開始", ends: "終了",
      saveMatching: "マッチングを保存", statusNow: function (s) { return "ステータス：" + s; },
      step: { vote: "投票を開始", funding: "この候補地で寄付受付を開始", building: "建設中にする", built: "完成にしてスポットを紐付け", archived: "アーカイブして寄付金を繰り越し" },
      winner: "選ばれた候補地", spot: "WaterNowスポットのID", rollNote: "集まった寄付金は、サーバーが寄付受付中のプロジェクト（なければ投票中のプロジェクト）、それもなければ基金に移します。", fundTitle: "共通基金", fundLine: function (s, n) { return s + "・寄付 " + n + "件"; }, forbidden: "このアカウントでは実行できません。2段階認証を済ませた管理者のみです。", refunded: "返金済み", matchedTag: function (s) { return "マッチング +" + s; }, optional: "任意",
      confirm: function (s) { return "ステータスを「" + s + "」に変更しますか？メンバーにすぐ表示されます。"; }, noStep: "このプロジェクトに残りのステップはありません。",
      donLead: "領収書のための詳細です。メッセージを非表示にしても、寄付は壁に残ります。",
      anonymous: "匿名", monthly: "毎月", shown: "金額表示", hidden: "メッセージ非表示", hide: "メッセージを非表示", unhide: "メッセージを表示",
      noDonations: "寄付はまだありません。",
      plaqueLead: "印刷またはPDF保存用のシートです。QRコードで給水所のページが開きます。", needSpot: "先にWaterNowスポットを紐付けてください（ステータス）。",
      plaque: "銘板を開く", print: "印刷またはPDFで保存", close: "閉じる", builtBy: "コミュニティの力で完成", with: "協賛",
      scan: "スキャンして、寄付者と設置以来削減したボトルを見る。",
      upload: "画像を選ぶ", uploading: "画像を送信中…", uploaded: "画像を送信しました。保存すると反映されます。",
      badFile: "JPEG、PNG、WebPの画像（2MBまで）にしてください。", uploadFailed: "画像を送信できませんでした。もう一度お試しください。",
      edit: "編集", cancel: "キャンセル", saveSponsor: "スポンサーを保存", newCampaign: "新しいキャンペーン",
      campaign: { past: "終了", active: "実施中", upcoming: "予定" },
      inUse: "このキャンペーンはすでに寄付に使われているため削除できません（代わりに早めに終了してください）。",
      badUrl: "画像はWaterNowのストレージのものだけ使えます。「画像を選ぶ」を使ってください。",
      del: "削除", delNote: "デモまたはテスト用のプロジェクト（実際の寄付なし）だけを削除できます。候補地、投票、予算、スポンサー、デモの寄付も一緒に削除されます。",
      delConfirm: function (s) { return "「" + s + "」を完全に削除しますか？元に戻せません。"; }, deleted: "プロジェクトを削除しました。",
      realGifts: "このプロジェクトには実際の寄付があるため残ります（代わりにアーカイブしてください）。", linked: "このプロジェクトと別のプロジェクトの間で寄付金が移動しているため残ります。"
    },
    ro: {
      title: "Fântâna comună", lead: "Proiecte, locuri propuse, buget, sponsori și donații. Fiecare schimbare trece prin verificările serverului.",
      newProject: "Proiect nou", noProjects: "Niciun proiect încă.", unavailable: "Fântâna comună nu este încă pe server (secțiunea 85).",
      tabs: { project: "Proiect", sites: "Locuri", budget: "Buget", sponsors: "Sponsori", participants: "Participanți", bids: "Oferte", status: "Stare", donations: "Donații", plaque: "Placă" },
      status: { draft: "Ciornă", vote: "Vot", funding: "Strângere de fonduri", building: "În construcție", built: "Construită", archived: "Arhivată" },
      donors: function (s, n) { return n === 1 ? "1 donator" : s + roDe(n) + " donatori"; },
      fTitle: "Titlu", fSlug: "Adresă scurtă (slug)", fCity: "Oraș", fDescription: "Descriere", fGoal: "Obiectiv ($)",
      fCover: "Fotografie de copertă (link din stocarea WaterNow)", fEnds: "Sfârșitul campaniei", fBuilder: "Construcție", fKind: "Tip", fBuilderUrl: "Site-ul firmei",
      fQuote: "Ofertă ($)", fQuoteDoc: "Documentul ofertei (link)", fHost: "Gazdă", fHostUrl: "Site-ul gazdei", fVoteOpens: "Începutul votului", fVoteCloses: "Sfârșitul votului",
      save: "Salvează", saved: "Salvat.", refused: "Serverul a refuzat această schimbare.", check: function (f) { return "Verifică: " + f + "."; },
      sitesLead: "Trei locuri propuse de date. Alege-l pe fiecare pe hartă (mai sus), apoi completează cifrele cu simulatorul.",
      site: function (l) { return "Locul " + l; }, name: "Nume", address: "Adresă", lat: "Latitudine", lon: "Longitudine",
      newly: "Deserviți nou (5 min)", res10: "Locuitori (10 min)", demand: "Căutări fără rezultat",
      pick: "Alege pe hartă", picking: "Fă clic pe hartă unde este locul…", fill: "Completează cu simulatorul", filling: "Se calculează…",
      filled: "Cifre completate de simulator.", badRow: function (n) { return "Verifică rândul " + n + "."; },
      simNo: "Simulatorul nu poate calcula aici (nicio populație încărcată pentru această zonă, sau vederea unui partener): scrie cifrele.",
      kind: "Tip", label: "Denumire", amount: "Sumă ($)", addLine: "Adaugă un rând", remove: "Elimină", total: "Total", vsGoal: function (a, b) { return "Total " + a + " · obiectiv " + b; },
      tier: "Nivel", logo: "Logo (link din stocarea WaterNow)", link: "Link", addSponsor: "Adaugă sponsorul", sponsorsNow: "Sponsori",
      matching: "Campanie de dublare", org: "Organizație", ratio: "Raport (1 = dublat)", cap: "Plafon ($)", starts: "Început", ends: "Sfârșit",
      saveMatching: "Salvează dublarea", statusNow: function (s) { return "Stare: " + s; },
      step: { vote: "Deschide votul", funding: "Pornește strângerea de fonduri cu acest loc", building: "Trece în construcție", built: "Marchează construită și leagă punctul", archived: "Arhivează și mută banii" },
      winner: "Locul câștigător", spot: "Id-ul punctului WaterNow", rollNote: "Serverul mută ce s-a strâns la proiectul pentru care se strâng bani (altfel la vot), altfel în fond.", fundTitle: "Fond comun", fundLine: function (s, n) { return s + " · " + (n === 1 ? "1 donație" : n + roDe(n) + " donații"); }, forbidden: "Acest cont nu poate face asta: doar adminii cu al doilea factor.", refunded: "rambursată", matchedTag: function (s) { return "+ " + s + " dublați"; }, optional: "opțional",
      confirm: function (s) { return "Schimbi starea în „" + s + "”? Membrii o văd imediat."; }, noStep: "Nu mai este niciun pas pentru acest proiect.",
      donLead: "Toate detaliile pentru chitanțe. Un mesaj ascuns păstrează donația pe perete, fără cuvintele ei.",
      anonymous: "Anonim", monthly: "lunar", shown: "sumă afișată", hidden: "mesaj ascuns", hide: "Ascunde mesajul", unhide: "Arată mesajul",
      noDonations: "Nicio donație încă.",
      plaqueLead: "O foaie de tipărit sau de salvat ca PDF: codul QR deschide pagina fântânii.", needSpot: "Leagă mai întâi punctul WaterNow (Stare).",
      plaque: "Deschide placa", print: "Tipărește sau salvează ca PDF", close: "Închide", builtBy: "Construită de comunitate", with: "Cu sprijinul",
      scan: "Scanează: cine a donat și sticlele evitate de la deschidere.",
      upload: "Alege o imagine", uploading: "Se trimite imaginea…", uploaded: "Imagine trimisă. Salvează ca s-o păstrezi.",
      badFile: "O imagine JPEG, PNG sau WebP, de cel mult 2 MB.", uploadFailed: "Imaginea nu a putut fi trimisă. Încearcă din nou.",
      edit: "Editează", cancel: "Anulează", saveSponsor: "Salvează sponsorul", newCampaign: "Campanie nouă",
      campaign: { past: "Încheiată", active: "În desfășurare", upcoming: "Urmează" },
      inUse: "O donație a folosit deja această campanie: rămâne (încheie-o mai devreme în schimb).",
      badUrl: "Imaginile vin doar din stocarea WaterNow: folosește „Alege o imagine”.",
      del: "Șterge", delNote: "Doar pentru un proiect demonstrativ sau de test (nicio donație reală): pleacă împreună cu locurile, voturile, bugetul, sponsorii și donațiile demonstrative.",
      delConfirm: function (s) { return "Ștergi definitiv „" + s + "”? Nu se poate anula."; }, deleted: "Proiect șters.",
      realGifts: "Acest proiect are donații reale: rămâne (arhivează-l în schimb).", linked: "Între acest proiect și altul s-au mutat bani: rămâne."
    }
  };

  var api = { STRINGS: STRINGS, STATUSES: STATUSES, SITE: SITE, plaqueUrl: plaqueUrl, nextSteps: nextSteps, siteFigures: siteFigures, slugOf: slugOf,
              sitesPayload: sitesPayload, budgetPayload: budgetPayload, toLocal: toLocal, fromLocal: fromLocal, mediaPath: mediaPath, deletable: deletable };
  if (node) { module.exports = api; return; }

  // ---- The page ----
  var A = root.WNCAPP, P = root.WNC_PAGE;
  if (!A || !P || !F) return;
  var T = STRINGS[A.lang] || STRINGS.en, lang = A.lang;
  var $ = function (id) { return document.getElementById(id); };
  var nf = new Intl.NumberFormat(lang);
  var fmt = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  var money = function (c) { return F.money(c, lang); };
  function el(tag, cls, t) { var e = document.createElement(tag); if (cls) e.className = cls; if (t != null) e.textContent = t; return e; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function btn(parent, t, cls) { var b = el("button", cls || "ghost", t); b.type = "button"; parent.appendChild(b); return b; }
  var uid = 0;
  /** A labelled field; [type] "select" takes its [options] as [value, label] pairs. */
  function field(parent, label, type, value, attrs, options) {
    var id = "fc" + (++uid), l = el("label", "field", label), i = el(type === "textarea" ? "textarea" : type === "select" ? "select" : "input", "input");
    l.htmlFor = id; i.id = id;
    if (type !== "textarea" && type !== "select") i.type = type;
    Object.keys(attrs || {}).forEach(function (k) { i.setAttribute(k, attrs[k]); });
    (options || []).forEach(function (o) { var op = el("option", null, o[1]); op.value = o[0]; i.appendChild(op); });
    if (value != null && !(type === "select" && value === "")) i.value = value; // a select left as it comes: its first option
    var w = el("div", "fc-f"); w.appendChild(l); w.appendChild(i); parent.appendChild(w);
    return i;
  }
  function waiting(b, on) { if (on) b.setAttribute("aria-disabled", "true"); else b.removeAttribute("aria-disabled"); }
  function isWaiting(b) { return b.getAttribute("aria-disabled") === "true"; }
  /**
   * A picture's field (a cover, a logo): its address, and « Choisir une image », which sends a JPEG, PNG or WebP of 2 MB
   * at most to commons-media (admins in aal2 only: the bucket's policies) and fills the address in; Save keeps it.
   */
  function picture(parent, label, value, folder, tag) {
    var input = field(parent, label, "url", value || "", { spellcheck: "false" });
    var row = el("div", "fc-pic"), pick = el("input"), prev = el("img", "fc-pic-prev hidden");
    pick.type = "file"; pick.accept = "image/jpeg,image/png,image/webp"; pick.hidden = true; prev.alt = "";
    var b = btn(row, T.upload, "ghost small-btn");
    row.appendChild(pick); row.appendChild(prev);
    input.parentNode.appendChild(row);
    b.addEventListener("click", function () { if (!isWaiting(b)) pick.click(); });
    pick.addEventListener("change", async function () {
      var f = pick.files && pick.files[0];
      pick.value = "";
      if (!f) return;
      var m = mediaPath(folder, f, tag(), Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
      if (m.error) { say(T.badFile, "err"); return; }
      waiting(b, true);
      say(T.uploading);
      try {
        input.value = await A.upload(m.path, f);
        prev.src = URL.createObjectURL(f); // blob: (the console's img-src): the picture as sent
        prev.classList.remove("hidden");
        say(T.uploaded, "ok");
      } catch (e) {
        if (e.status === 401) { A.lost(); return; }
        var c = String(e.code || "");
        say(e.status === 403 || /security|unauthori/i.test(c) ? T.forbidden : e.status === 413 || /mime|type|large|size/i.test(c) ? T.badFile : T.uploadFailed, "err");
      } finally { waiting(b, false); }
    });
    return input;
  }

  var box = $("fontaine"), list = [], fund = null, sel = null, tab = "project", msg = null, inited = false, last = null;
  /**
   * One admin RPC (section 85: writes answer {result: 'ok' | <reason>}): the answer when the server took it, else false;
   * the line under the editor says so, or why not (the reason, a missing second factor, a forbidden account).
   */
  async function call(name, args, b, reasons) {
    if (b && isWaiting(b)) return false;
    if (b) waiting(b, true);
    try {
      var r = await A.rpc(name, args);
      if (!r || r.result !== "ok") {
        var why = r && ((reasons || {})[r.result] || ({ in_use: T.inUse, bad_url: T.badUrl, real_donations: T.realGifts, linked: T.linked })[r.result]);
        say(why || T.refused + (r && typeof r.result === "string" ? " (" + txt(r.result, 40) + ")" : ""), "err");
        return false;
      }
      say(T.saved, "ok");
      return r;
    } catch (e) {
      if (e.status === 401) { A.lost(); return false; }
      if (e.code === "WNMFA") { A.showMfa(); return false; }
      say(e.code === "42501" || e.status === 403 ? T.forbidden : T.refused, "err");
      return false;
    } finally { if (b) waiting(b, false); }
  }
  // The line under the editor survives the redraw that follows a save (load → render).
  function say(t, cls) { last = t ? [t, cls] : null; if (msg) { msg.textContent = t || ""; msg.className = "msg" + (cls ? " " + cls : ""); } }

  // « Constructeurs » (builders.js, section 92): the last entry of the list, and two tabs per project, drawn with this kit.
  var BUILDERS = { builders: true };
  var B = root.WNC_BUILDERS ? root.WNC_BUILDERS({ A: A, T: T, lang: lang, el: el, btn: btn, field: field, picture: picture, call: call, say: say,
    clear: clear, money: money, nf: nf, render: function () { render(); }, reload: function (id) { return load(id); } }) : null;

  async function load(keepId) {
    try {
      if (B) await B.load();
      var r = await A.rpc("commons_admin_list", {});
      var ps = r && Array.isArray(r.projects) ? r.projects : [];
      list = ps.filter(function (p) { return p && typeof p.id === "number" && STATUSES.indexOf(p.status) >= 0; });
      fund = r && r.fund && typeof r.fund === "object" ? { id: null, fund: true, title: T.fundTitle, status: "funding",
        balance: Number(r.fund.balance_cents) || 0, donations: Array.isArray(r.fund.donations) ? r.fund.donations : [] } : null;
    } catch (e) {
      if (e.status === 401) { A.lost(); return; }
      if (e.code === "WNMFA") { A.showMfa(); return; }
      clear(box);
      box.appendChild(el("h2", null, T.title));
      box.appendChild(el("p", "note", e.status === 404 ? T.unavailable : e.code === "42501" ? T.forbidden : T.refused));
      box.classList.remove("hidden");
      return;
    }
    if (sel && sel.fund) sel = fund;
    else if (sel === BUILDERS) sel = B ? BUILDERS : null;
    else sel = list.filter(function (p) { return p.id === keepId; })[0] || sel && list.filter(function (p) { return p.id === sel.id; })[0] || list[0] || null;
    render();
  }

  function render() {
    clear(box);
    box.classList.remove("hidden");
    var head = el("div", "card-head"), hl = el("div");
    hl.appendChild(el("h2", null, T.title));
    hl.appendChild(el("p", "muted small", T.lead));
    head.appendChild(hl);
    btn(head, T.newProject).addEventListener("click", function () { sel = { id: null, status: "draft", title: "", budget: [], sites: [], sponsors: [], donations: [] }; tab = "project"; last = null; render(); });
    box.appendChild(head);
    var grid = el("div", "fc-grid"), side = el("div", "fc-list"), main = el("div", "fc-main");
    if (!list.length) side.appendChild(el("p", "note", T.noProjects));
    list.forEach(function (p) {
      var b = btn(side, "", "fc-item");
      b.setAttribute("aria-pressed", String(!!sel && sel.id === p.id));
      var top = el("span", "fc-item-top");
      top.appendChild(el("b", null, p.title || "—"));
      top.appendChild(el("span", "chip fc-" + p.status, T.status[p.status]));
      b.appendChild(top);
      // raised_cents already holds the matched part and the money moved in (section 85's money rules).
      b.appendChild(el("span", "muted small", [p.city, money(p.raised_cents || 0) + " / " + money(p.goal_cents || 0), T.donors(nf.format(p.donors_count || 0), p.donors_count || 0)].filter(Boolean).join(" · ")));
      b.addEventListener("click", function () { sel = p; last = null; render(); });
    });
    // The fund (gifts to no project, monthly gifts while nothing is funded): its balance and its donations for receipts.
    if (fund) {
      var fb = btn(side, "", "fc-item fc-fund");
      fb.setAttribute("aria-pressed", String(!!sel && !!sel.fund));
      fb.appendChild(el("b", null, T.fundTitle));
      fb.appendChild(el("span", "muted small", T.fundLine(money(fund.balance), fund.donations.length)));
      fb.addEventListener("click", function () { sel = fund; tab = "donations"; last = null; render(); });
    }
    if (B) {
      var bb = btn(side, "", "fc-item fc-builders");
      bb.setAttribute("aria-pressed", String(sel === BUILDERS));
      bb.appendChild(el("b", null, B.T.title));
      bb.appendChild(el("span", "muted small", B.T.side(B.pending())));
      bb.addEventListener("click", function () { sel = BUILDERS; last = null; render(); });
    }
    grid.appendChild(side);
    if (sel === BUILDERS) B.view(main);
    else if (sel) editor(main);
    grid.appendChild(main);
    box.appendChild(grid);
    msg = el("p", "msg");
    msg.setAttribute("role", "status");
    box.appendChild(msg);
    if (last) say(last[0], last[1]);
    pins();
  }

  function editor(main) {
    var tabs = el("div", "tabs fc-tabs");
    tabs.setAttribute("role", "group");
    var names = sel.fund ? ["donations"] : sel.id ? ["project", "sites", "budget", "sponsors"].concat(B ? ["participants", "bids"] : [], ["status", "donations", "plaque"]) : ["project"];
    if (names.indexOf(tab) < 0) tab = names[0];
    names.forEach(function (n) {
      var b = btn(tabs, T.tabs[n], "");
      b.setAttribute("aria-pressed", String(n === tab));
      b.addEventListener("click", function () { tab = n; picking = -1; last = null; render(); });
    });
    main.appendChild(tabs);
    var body = el("div", "fc-body");
    ({ project: projectTab, sites: sitesTab, budget: budgetTab, sponsors: sponsorsTab, status: statusTab, donations: donationsTab, plaque: plaqueTab,
       participants: function (x) { B.participants(x, sel); }, bids: function (x) { B.bids(x, sel); } })[tab](body);
    main.appendChild(body);
  }

  // ---- Project ----
  function projectTab(b) {
    var p = sel, bd = p.builder || {}, h = p.host || {}, v = p.vote || {};
    var g1 = el("div", "fc-cols");
    var title = field(g1, T.fTitle, "text", p.title || "", { maxlength: "80" });
    var slug = field(g1, T.fSlug, "text", p.slug || "", { maxlength: "48", pattern: "[a-z0-9]+(-[a-z0-9]+)*", spellcheck: "false" });
    var city = field(g1, T.fCity, "text", p.city || "", { maxlength: "60" });
    var goal = field(g1, T.fGoal, "text", p.goal_cents != null ? String(p.goal_cents / 100) : "", { inputmode: "decimal" });
    var ends = field(g1, T.fEnds, "datetime-local", toLocal(p.ends_at));
    var cover = picture(g1, T.fCover, p.cover_url, "covers", function () { return p.slug || title.value; });
    b.appendChild(g1);
    var desc = field(b, T.fDescription, "textarea", p.description || "", { maxlength: "2000" });
    desc.classList.add("fc-text");
    var g2 = el("div", "fc-cols");
    var bname = field(g2, T.fBuilder, "text", bd.name || "", { maxlength: "80" });
    var bkind = field(g2, T.fKind, "select", bd.kind || "contractor", null, F.BUILDER_KINDS.map(function (k) { return [k, F.STRINGS[lang].kinds[k]]; }));
    var burl = field(g2, T.fBuilderUrl, "url", bd.url || "", { spellcheck: "false" });
    var quote = field(g2, T.fQuote, "text", bd.quote_cents != null ? String(bd.quote_cents / 100) : "", { inputmode: "decimal" });
    var qdoc = field(g2, T.fQuoteDoc, "url", bd.quote_doc_url || "", { spellcheck: "false" });
    var hname = field(g2, T.fHost, "text", h.name || "", { maxlength: "80" });
    var hurl = field(g2, T.fHostUrl, "url", h.url || "", { spellcheck: "false" });
    var vo = field(g2, T.fVoteOpens, "datetime-local", toLocal(v.opens_at));
    var vc = field(g2, T.fVoteCloses, "datetime-local", toLocal(v.closes_at));
    b.appendChild(g2);
    var save = btn(b, T.save, "primary fc-save");
    save.addEventListener("click", async function () {
      var g = F.amountCents(goal.value), q = quote.value.trim() ? F.amountCents(quote.value) : null;
      if (!txt(title.value, 80)) { say(T.check(T.fTitle), "err"); title.focus(); return; }
      if (g === null) { say(T.check(T.fGoal), "err"); goal.focus(); return; }
      if (quote.value.trim() && q === null) { say(T.check(T.fQuote), "err"); quote.focus(); return; }
      if (!slug.value) slug.value = slugOf(title.value); // the page's short address, from the title when left empty
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug.value)) { say(T.check(T.fSlug), "err"); slug.focus(); return; }
      // Section 85's keys (an upsert merges: these are all the form holds); vote dates top-level.
      var r = await call("commons_admin_upsert_project", { p: {
        id: p.id, title: txt(title.value, 80), slug: slug.value, city: txt(city.value, 60), description: desc.value.trim().slice(0, 2000),
        goal_cents: g, ends_at: fromLocal(ends.value), cover_url: cover.value.trim() || null,
        builder: txt(bname.value, 80) ? { name: txt(bname.value, 80), kind: bkind.value, url: burl.value.trim() || null, quote_cents: q, quote_doc_url: qdoc.value.trim() || null } : null,
        host: txt(hname.value, 80) ? { name: txt(hname.value, 80), url: hurl.value.trim() || null } : null,
        vote_opens_at: fromLocal(vo.value), vote_closes_at: fromLocal(vc.value)
      } }, save);
      if (r) await load(typeof r.id === "number" ? r.id : p.id);
    });
  }

  // ---- Sites: 3 candidates, picked on the console's map, their figures from the simulator ----
  var picking = -1, siteRows = [], markers = [];
  function sitesTab(b) {
    b.appendChild(el("p", "muted small", T.sitesLead));
    var rows = (sel.sites || []).slice(0, SITES).map(function (s) {
      return { id: s.id || null, name: s.name || "", address: s.address || "", lat: s.lat != null ? String(s.lat) : "", lon: s.lon != null ? String(s.lon) : "",
               newly: s.newly_served != null ? String(s.newly_served) : "", res10: s.residents_10min != null ? String(s.residents_10min) : "",
               demand: s.demand_searches != null ? String(s.demand_searches) : "" };
    });
    while (rows.length < SITES) rows.push({ id: null, name: "", address: "", lat: "", lon: "", newly: "", res10: "", demand: "" });
    siteRows = rows;
    rows.forEach(function (r, i) {
      var card = el("div", "fc-site"), h = el("div", "fc-site-h");
      h.appendChild(el("span", "fc-letter", F.letter(i)));
      h.appendChild(el("b", null, T.site(F.letter(i))));
      var pick = btn(h, picking === i ? T.picking : T.pick, "ghost small-btn");
      pick.setAttribute("aria-pressed", String(picking === i));
      pick.addEventListener("click", function () { picking = picking === i ? -1 : i; render(); });
      card.appendChild(h);
      var g = el("div", "fc-cols");
      [["name", T.name, "text"], ["address", T.address, "text"], ["lat", T.lat, "text"], ["lon", T.lon, "text"],
       ["newly", T.newly, "text"], ["res10", T.res10, "text"], ["demand", T.demand, "text"]].forEach(function (f) {
        var inp = field(g, f[1], f[2], r[f[0]], f[0] === "name" || f[0] === "address" ? { maxlength: f[0] === "name" ? "80" : "160" } : { inputmode: "decimal" });
        inp.addEventListener("input", function () { r[f[0]] = inp.value; if (f[0] === "lat" || f[0] === "lon") pins(); });
      });
      card.appendChild(g);
      b.appendChild(card);
    });
    var acts = el("div", "fc-acts");
    var fill = btn(acts, T.fill);
    fill.addEventListener("click", function () { fillFigures(fill); });
    var save = btn(acts, T.save, "primary fc-save");
    save.addEventListener("click", async function () {
      var out = sitesPayload(siteRows);
      if (out.error) { say(T.badRow(out.error), "err"); return; }
      if (await call("commons_admin_set_sites", { p_project: sel.id, p_sites: out.sites }, save)) await load(sel.id);
    });
    b.appendChild(acts);
  }
  // The sites on the console's map: a lettered pin each, dragged to move it (only while the Sites tab is open).
  function pins() {
    markers.forEach(function (m) { m.remove(); });
    markers = [];
    var gl = P.map();
    if (!gl || !root.maplibregl || tab !== "sites" || !sel || sel === BUILDERS) return;
    siteRows.forEach(function (r, i) {
      var lat = Number(r.lat), lon = Number(r.lon);
      if (r.lat === "" || r.lon === "" || !(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return;
      var e = el("div", "fc-pin", F.letter(i));
      var m = new root.maplibregl.Marker({ element: e, draggable: true, anchor: "bottom" }).setLngLat([lon, lat]).addTo(gl);
      m.on("dragend", function () { var ll = m.getLngLat().wrap(); setSite(i, ll.lat, ll.lng); });
      markers.push(m);
    });
  }
  function setSite(i, lat, lon) {
    siteRows[i].lat = String(Math.round(lat * 1e6) / 1e6);
    siteRows[i].lon = String(Math.round(lon * 1e6) / 1e6);
    sel.sites = siteRows.map(function (r) {
      return { id: r.id, name: r.name, address: r.address, lat: r.lat === "" ? null : Number(r.lat), lon: r.lon === "" ? null : Number(r.lon),
               newly_served: r.newly === "" ? null : Number(r.newly), residents_10min: r.res10 === "" ? null : Number(r.res10),
               demand_searches: r.demand === "" ? null : Number(r.demand) };
    });
    render();
  }
  // A click on the map while a site waits for its place: the site goes there (the console doesn't open a cell then).
  var before = P.claim;
  P.claim = function (e) {
    if (picking >= 0 && tab === "sites") {
      var ll = e.lngLat.wrap(), i = picking;
      picking = -1;
      setSite(i, ll.lat, ll.lng);
      return true;
    }
    return before ? before(e) : false;
  };
  // Each site's figures, from the simulator's area around it (the map moves to each site, at zoom 14, in turn).
  async function fillFigures(b) {
    if (isWaiting(b)) return;
    var area = root.WNC_AREA, S = root.WNS, gl = P.map();
    if (!area || !S || !gl) { say(T.simNo, "err"); return; }
    waiting(b, true);
    say(T.filling);
    var done = 0, view = { center: gl.getCenter(), zoom: gl.getZoom() };
    try {
      for (var i = 0; i < siteRows.length; i++) {
        var r = siteRows[i], lat = Number(r.lat), lon = Number(r.lon);
        if (r.lat === "" || r.lon === "" || !(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) continue;
        gl.jumpTo({ center: [lon, lat], zoom: 14 });
        var a = await area.get();
        if (!a || !a.S) { say(T.simNo, "err"); break; }
        var f = siteFigures(S, a, lat, lon);
        r.newly = String(f.newly_served); r.res10 = String(f.residents_10min); r.demand = String(f.demand_searches);
        done++;
      }
    } catch (e) { say(T.simNo, "err"); }
    waiting(b, false);
    if (done) {
      sel.sites = siteRows.map(function (x) { return { id: x.id, name: x.name, address: x.address, lat: x.lat === "" ? null : Number(x.lat), lon: x.lon === "" ? null : Number(x.lon),
        newly_served: x.newly === "" ? null : Number(x.newly), residents_10min: x.res10 === "" ? null : Number(x.res10), demand_searches: x.demand === "" ? null : Number(x.demand) }; });
      var pts = siteRows.filter(function (x) { return x.lat !== "" && x.lon !== ""; });
      if (pts.length > 1 && root.maplibregl) {
        var bb = new root.maplibregl.LngLatBounds();
        pts.forEach(function (x) { bb.extend([Number(x.lon), Number(x.lat)]); });
        gl.fitBounds(bb, { padding: 80, maxZoom: 15, duration: 0 });
      } else gl.jumpTo(view);
      render();
      say(T.filled, "ok");
    }
  }

  // ---- Budget ----
  function budgetTab(b) {
    var rows = (sel.budget || []).map(function (l) { return { kind: l.kind, label: l.label || "", amount: String((l.amount_cents || 0) / 100) }; });
    if (!rows.length) rows.push({ kind: "equipment", label: "", amount: "" });
    var wrap = el("div", "fc-budget"), totalEl = el("p", "fc-total");
    function total() {
      var s = rows.reduce(function (t, r) { return t + (F.amountCents(r.amount) || 0); }, 0);
      totalEl.textContent = T.vsGoal(money(s), money(sel.goal_cents || 0));
    }
    function draw() {
      clear(wrap);
      rows.forEach(function (r, i) {
        var row = el("div", "fc-line");
        var k = field(row, T.kind, "select", r.kind, null, F.BUDGET_KINDS.map(function (x) { return [x, F.STRINGS[lang].budgetKinds[x]]; }));
        var l = field(row, T.label, "text", r.label, { maxlength: "80" });
        var a = field(row, T.amount, "text", r.amount, { inputmode: "decimal" });
        k.addEventListener("change", function () { r.kind = k.value; });
        l.addEventListener("input", function () { r.label = l.value; });
        a.addEventListener("input", function () { r.amount = a.value; total(); });
        btn(row, T.remove, "ghost small-btn").addEventListener("click", function () { rows.splice(i, 1); draw(); total(); });
        wrap.appendChild(row);
      });
    }
    draw();
    b.appendChild(wrap);
    total();
    b.appendChild(totalEl);
    var acts = el("div", "fc-acts");
    btn(acts, T.addLine).addEventListener("click", function () { rows.push({ kind: "other", label: "", amount: "" }); draw(); });
    var save = btn(acts, T.save, "primary fc-save");
    save.addEventListener("click", async function () {
      var out = budgetPayload(rows);
      if (out.error) { say(T.badRow(out.error), "err"); return; }
      if (await call("commons_admin_set_budget", { p_project: sel.id, p_lines: out.lines }, save)) await load(sel.id);
    });
    b.appendChild(acts);
  }

  // ---- Sponsors and matching: each by its id (commons_admin_list sends them), edited in the form or removed ----
  var spEdit = null, mEdit = null; // {pid, item}: the sponsor or the campaign in the form, for that project only
  var dayFmt = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" });
  function sponsorsTab(b) {
    var editing = spEdit && spEdit.pid === sel.id ? spEdit.item : null;
    var ul = el("ul", "fc-sponsors");
    (sel.sponsors || []).forEach(function (s) {
      var li = el("li");
      li.appendChild(el("span", "chip fc-tier-" + s.tier, F.STRINGS[lang].tiers[s.tier] || s.tier));
      li.appendChild(el("b", null, s.name));
      if (s.logo_url) li.appendChild(el("span", "muted tiny fc-url", s.logo_url));
      if (typeof s.id === "number") {
        btn(li, T.edit, "ghost small-btn").addEventListener("click", function () { spEdit = { pid: sel.id, item: s }; last = null; render(); });
        var rm = btn(li, T.remove, "ghost small-btn");
        rm.addEventListener("click", async function () {
          if (await call("commons_admin_upsert_sponsor", { p: { id: s.id, delete: true } }, rm)) { spEdit = null; await load(sel.id); }
        });
      }
      ul.appendChild(li);
    });
    if ((sel.sponsors || []).length) { b.appendChild(el("h3", "fc-h3", T.sponsorsNow)); b.appendChild(ul); }
    var s0 = editing || {}, g = el("div", "fc-cols");
    var name = field(g, T.name, "text", s0.name || "", { maxlength: "80" });
    var tier = field(g, T.tier, "select", s0.tier || "bronze", null, F.TIERS.map(function (t) { return [t, F.STRINGS[lang].tiers[t]]; }));
    var logo = picture(g, T.logo, s0.logo_url, "logos", function () { return name.value; });
    var link = field(g, T.link, "url", s0.url || "", { spellcheck: "false" });
    b.appendChild(g);
    var acts = el("div", "fc-acts");
    var add = btn(acts, editing ? T.saveSponsor : T.addSponsor, "primary fc-save");
    if (editing) btn(acts, T.cancel).addEventListener("click", function () { spEdit = null; last = null; render(); });
    b.appendChild(acts);
    add.addEventListener("click", async function () {
      if (!txt(name.value, 80)) { say(T.check(T.name), "err"); name.focus(); return; }
      // An edit merges by its id (section 85); a field left empty clears it.
      var body = { name: txt(name.value, 80), tier: tier.value, logo_url: logo.value.trim() || null, url: link.value.trim() || null };
      if (editing) body.id = editing.id; else { body.id = null; body.project_id = sel.id; }
      if (await call("commons_admin_upsert_sponsor", { p: body }, add)) { spEdit = null; await load(sel.id); }
    });

    // Every campaign (past, running, to come), newest start first; an older server sends only the running one.
    b.appendChild(el("h3", "fc-h3", T.matching));
    var ms = Array.isArray(sel.matchings) ? sel.matchings : sel.matching ? [sel.matching] : [];
    var mEditing = mEdit && mEdit.pid === sel.id ? mEdit.item : null;
    if (ms.length) {
      var ml = el("ul", "fc-sponsors");
      ms.forEach(function (c) {
        var li = el("li"), now = Date.now(), st = Date.parse(c.starts_at), en = Date.parse(c.ends_at);
        var state = en <= now ? "past" : st > now ? "upcoming" : "active";
        li.appendChild(el("span", "chip fc-" + ({ past: "archived", active: "funding", upcoming: "vote" })[state], T.campaign[state]));
        li.appendChild(el("b", null, c.org_name));
        li.appendChild(el("span", "muted small", ["× " + nf.format(Math.round((1 + Number(c.ratio || 0)) * 100) / 100),
          money(c.used_cents || 0) + " / " + money(c.cap_cents || 0),
          (isFinite(st) ? dayFmt.format(new Date(st)) : "") + " – " + (isFinite(en) ? dayFmt.format(new Date(en)) : "")].join(" · ")));
        if (typeof c.id === "number") {
          btn(li, T.edit, "ghost small-btn").addEventListener("click", function () { mEdit = { pid: sel.id, item: c }; last = null; render(); });
          var rm = btn(li, T.remove, "ghost small-btn"); // only while no gift used it (the server says in_use otherwise)
          rm.addEventListener("click", async function () {
            if (await call("commons_admin_upsert_matching", { p: { id: c.id, delete: true } }, rm)) { mEdit = null; await load(sel.id); }
          });
        }
        ml.appendChild(li);
      });
      b.appendChild(ml);
    }
    var m = mEditing || {};
    b.appendChild(el("p", "muted small", mEditing ? mEditing.org_name : T.newCampaign));
    var g2 = el("div", "fc-cols");
    var org = field(g2, T.org, "text", m.org_name || "", { maxlength: "80" });
    var ratio = field(g2, T.ratio, "text", m.ratio != null ? String(m.ratio) : "1", { inputmode: "decimal" });
    var cap = field(g2, T.cap, "text", m.cap_cents != null ? String(m.cap_cents / 100) : "", { inputmode: "decimal" });
    var st = field(g2, T.starts, "datetime-local", toLocal(m.starts_at));
    var en = field(g2, T.ends, "datetime-local", toLocal(m.ends_at));
    b.appendChild(g2);
    var acts2 = el("div", "fc-acts");
    var save = btn(acts2, T.saveMatching, "primary fc-save");
    if (mEditing) btn(acts2, T.cancel).addEventListener("click", function () { mEdit = null; last = null; render(); });
    b.appendChild(acts2);
    save.addEventListener("click", async function () {
      var c = F.amountCents(cap.value), r = num(ratio.value);
      if (!txt(org.value, 80)) { say(T.check(T.org), "err"); org.focus(); return; }
      if (r === null || r < 0.01 || r > 5) { say(T.check(T.ratio), "err"); ratio.focus(); return; } // section 85: 0.01 to 5
      if (c === null || c < 100) { say(T.check(T.cap), "err"); cap.focus(); return; }
      if (!en.value) { say(T.check(T.ends), "err"); en.focus(); return; }
      var body = { org_name: txt(org.value, 80), ratio: r, cap_cents: c, ends_at: fromLocal(en.value) };
      if (mEditing) body.id = mEditing.id; else body.project_id = sel.id;
      if (st.value) body.starts_at = fromLocal(st.value); // left out: now (a new campaign), unchanged (an edit)
      if (await call("commons_admin_upsert_matching", { p: body }, save)) { mEdit = null; await load(sel.id); }
    });
  }

  // ---- Status: one step at a time ----
  function statusTab(b) {
    b.appendChild(el("p", "fc-now", T.statusNow(T.status[sel.status])));
    var steps = nextSteps(sel.status);
    if (!steps.length) b.appendChild(el("p", "note", T.noStep));
    steps.forEach(function (s) {
      var row = el("div", "fc-step"), extra = null;
      // Funding after a vote needs the chosen site (the votes show to admins at any time); from a draft it's optional.
      var needSite = s === "funding" && sel.status === "vote";
      if (s === "funding" && (sel.sites || []).length) {
        extra = field(row, T.winner + (needSite ? "" : " (" + T.optional + ")"), "select", "", null, (needSite ? [] : [["", "—"]]).concat(
          (sel.sites || []).filter(function (x) { return typeof x.id === "number"; }).map(function (x, i) {
            return [String(x.id), F.letter(i) + " · " + x.name + (x.votes != null ? " (" + F.STRINGS[lang].votes(nf.format(x.votes), x.votes) + ")" : "")]; })));
      } else if (s === "built") {
        extra = field(row, T.spot, "text", sel.spot_id ? String(sel.spot_id) : "", { inputmode: "numeric", maxlength: "16" });
      } else if (s === "archived") {
        row.appendChild(el("p", "muted small fc-roll", T.rollNote)); // section 85 moves the money itself and sets rolled_to
      }
      var go = btn(row, T.step[s], s === "archived" ? "ghost fc-danger" : "primary fc-save");
      go.addEventListener("click", async function () {
        if (needSite && !(extra && extra.value)) { say(T.check(T.winner), "err"); return; }
        var spot = s === "built" ? Number(extra.value) : null;
        if (s === "built" && !(Number.isSafeInteger(spot) && spot > 0)) { say(T.check(T.spot), "err"); extra.focus(); return; }
        if (!root.confirm(T.confirm(T.status[s]))) return;
        var ok = await call("commons_admin_set_status", { p_project: sel.id, p_status: s, p_site: s === "funding" && extra && extra.value ? Number(extra.value) : null }, go);
        if (ok && s === "built") ok = await call("commons_admin_link_spot", { p_project: sel.id, p_spot: spot }, go);
        if (ok) await load(sel.id);
      });
      b.appendChild(row);
    });
    // Section 89: a demonstration or test project (no real gift) goes in one click, after a confirmation.
    if (deletable(sel)) {
      var drow = el("div", "fc-step fc-delete");
      drow.appendChild(el("p", "muted small", T.delNote));
      var del = btn(drow, T.del, "ghost fc-danger");
      del.addEventListener("click", async function () {
        if (!root.confirm(T.delConfirm(sel.title || "—"))) return;
        var r = await call("commons_admin_delete_project", { p_id: sel.id }, del);
        if (!r) return;
        // Section 92: its bids' PDFs (commons-bids) go through Storage, SQL can't delete files; refused, they stay (private) and the line says so.
        var files = (Array.isArray(r.bid_files) ? r.bid_files : []).filter(function (f) { return typeof f === "string" && /^\d+\/\d+-[a-z0-9-]{1,80}\.pdf$/.test(f); });
        var left = false;
        if (files.length) await A.remove("commons-bids", files).catch(function (e) { if (e.status === 401) A.lost(); left = true; });
        sel = null; say(left && B ? B.T.filesLeft : T.deleted, left ? "err" : "ok"); await load(null);
      });
      b.appendChild(drow);
    }
  }

  // ---- Donations: full details for receipts, a message hidden or shown again ----
  function donationsTab(b) {
    b.appendChild(el("p", "muted small", T.donLead));
    var ds = Array.isArray(sel.donations) ? sel.donations : [];
    if (!ds.length) { b.appendChild(el("p", "note", T.noDonations)); return; }
    var t = el("table", "fc-don");
    ds.forEach(function (d) {
      var tr = el("tr", d.hidden ? "is-hidden" : null), who = el("td"), what = el("td");
      who.appendChild(el("b", null, d.anonymous || !d.name ? T.anonymous + (d.name ? " (" + d.name + ")" : "") : d.name));
      who.appendChild(el("span", "muted tiny", d.at ? fmt.format(new Date(d.at)) : ""));
      tr.appendChild(who);
      tr.appendChild(el("td", "n", money(d.amount_cents || 0)));
      var tags = [d.matched_cents ? T.matchedTag(money(d.matched_cents)) : "", d.monthly ? T.monthly : "", d.show_amount ? T.shown : "",
                  d.hidden ? T.hidden : "", d.refunded_at || d.status === "refunded" ? T.refunded : ""].filter(Boolean).join(" · ");
      if (d.refunded_at || d.status === "refunded") tr.classList.add("is-refunded");
      if (d.message) what.appendChild(el("span", "fc-msg", d.message));
      if (tags) what.appendChild(el("span", "muted tiny", tags));
      tr.appendChild(what);
      var act = el("td");
      if (d.message && typeof d.id === "number") {
        var h = btn(act, d.hidden ? T.unhide : T.hide, "ghost small-btn");
        h.addEventListener("click", async function () { if (await call("commons_admin_hide_donation", { p_id: d.id, p_hidden: !d.hidden }, h)) await load(sel.fund ? null : sel.id); });
      }
      tr.appendChild(act);
      t.appendChild(tr);
    });
    var wrap = el("div", "fc-scroll");
    wrap.appendChild(t);
    b.appendChild(wrap);
  }

  // ---- The plaque: the QR code to the fountain's page, its name, « Construite par la communauté », the sponsors ----
  function qr(text) {
    var q = root.qrcodegen.QrCode.encodeText(text, root.qrcodegen.QrCode.Ecc.QUARTILE), n = q.size + 8, d = "";
    for (var y = 0; y < q.size; y++) for (var x = 0; x < q.size; x++) if (q.getModule(x, y)) d += "M" + (x + 4) + " " + (y + 4) + "h1v1h-1z";
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 " + n + " " + n);
    s.setAttribute("class", "pl-qr");
    s.setAttribute("role", "img");
    s.setAttribute("aria-label", text);
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    s.appendChild(path);
    return s;
  }
  function plaqueTab(b) {
    b.appendChild(el("p", "muted small", T.plaqueLead));
    var url = plaqueUrl(sel.spot_id);
    if (!url) { b.appendChild(el("p", "note", T.needSpot)); return; }
    b.appendChild(el("p", "fc-url", url));
    btn(b, T.plaque, "primary fc-save").addEventListener("click", function () { plaque(url); });
  }
  function plaque(url) {
    var rep = $("plaque"), sheet = el("div", "sheet plaque-sheet"), bar = el("div", "bar"), last = document.activeElement;
    clear(rep);
    rep.setAttribute("aria-label", T.tabs.plaque);
    function close() { rep.classList.add("hidden"); clear(rep); document.body.classList.remove("modal", "fc-printing"); document.removeEventListener("keydown", key); if (last) last.focus(); }
    function key(e) { if (e.key === "Escape") close(); }
    btn(bar, T.print).addEventListener("click", function () { root.print(); });
    var x = btn(bar, T.close);
    x.addEventListener("click", close);
    sheet.appendChild(bar);
    var brand = el("div", "pl-brand");
    brand.appendChild(el("span", "mark"));
    brand.appendChild(el("span", null, "WaterNow"));
    sheet.appendChild(brand);
    sheet.appendChild(el("p", "pl-eyebrow", F.STRINGS[lang].name));
    sheet.appendChild(el("h1", "pl-name", sel.title || F.STRINGS[lang].name));
    sheet.appendChild(el("p", "pl-built", T.builtBy));
    sheet.appendChild(qr(url));
    sheet.appendChild(el("p", "pl-scan", T.scan));
    sheet.appendChild(el("p", "pl-url", url.replace(/^https:\/\//, "")));
    var sp = (sel.sponsors || []).slice().sort(function (a, c) { return F.TIERS.indexOf(a.tier) - F.TIERS.indexOf(c.tier); });
    if (sp.length) {
      var s = el("div", "pl-sponsors");
      s.appendChild(el("p", "pl-with", T.with));
      s.appendChild(el("p", "pl-names", sp.map(function (z) { return z.name; }).join(" · ")));
      sheet.appendChild(s);
    }
    if (A.demo) sheet.appendChild(el("p", "pl-demo", A.T.demo));
    rep.appendChild(sheet);
    rep.classList.remove("hidden");
    document.body.classList.add("modal", "fc-printing");
    document.addEventListener("keydown", key);
    x.focus();
  }

  // Admins only (the server checks again); once the console has drawn its first figures.
  function start() {
    if (inited || !A.admin || !A.admin()) return;
    inited = true;
    load(null);
  }
  document.addEventListener("wnc:render", start);
  // On a fast connection the first figures can be drawn before this script loads: catch up.
  if (root.WNC_PAGE && root.WNC_PAGE.data && root.WNC_PAGE.data()) start();
  if (A.demo) root.WNC_FONTAINE = { open: function (id, t) { sel = list.filter(function (p) { return p.id === id; })[0] || sel; tab = t || tab; last = null; render(); }, plaque: function () { plaque(plaqueUrl(sel.spot_id)); }, fill: function () { return fillFigures(el("button")); } };
})(this);

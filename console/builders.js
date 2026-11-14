/*
 * WaterNow Statistics, private console: the Fontaine commune's builders, roles and bids (docs/18_FONTAINE_COMMUNE.md,
 * « Constructeurs et intervenants (section 92) »), for admins. Drawn inside fontaine.js's card, with its kit (session,
 * fields, picture upload, calls, message line): the « Constructeurs » entry of its list (the cards with filters, a card's
 * form, RBQ and insurance verified by the team, publish or hide, members' claims and pending edits with their diff),
 * and two tabs per project: its participants (carrier, builder, host) and its bids (the PDF through a signed link from
 * the private bucket commons-bids, « Choisir », « Décliner »). Every change goes through section 92's admin RPCs
 * (admin + aal2, checked by the server). Text through textContent only. Pure helpers shared with the node test.
 */
(function (root) {
  "use strict";
  var node = typeof module === "object" && module.exports;
  var F = node ? require("../assets/fontaine-data.js") : root.WNF;
  var KINDS = ["contractor", "obnl", "city"], ROLES = ["carrier", "builder", "host"];
  var STATUSES = ["draft", "pending", "approved", "hidden"], BID_STATUSES = ["submitted", "chosen", "declined", "withdrawn"];
  var BADGES = ["verified", "tier_1", "tier_5", "tier_10", "city_partner"];
  // What an edit sent from the app may change (commons_builder_edit's keys), in this order in its diff.
  var FIELDS = ["name", "kind", "region", "founded", "website", "about", "logo_url", "rbq_number", "insurance_until"];

  function txt(v, max) { return typeof v === "string" ? Array.from(v.replace(/\s+/g, " ").trim()).slice(0, max).join("") : ""; }
  function https(v) { try { var u = new URL(v); return u.protocol === "https:" && !u.username && !u.password; } catch (e) { return false; } }

  /** "5678123401", "5678 1234 01" or "5678-1234-01" → "5678-1234-01" (an RBQ licence number: 10 digits); null otherwise. */
  function rbqOf(v) {
    var d = String(v == null ? "" : v).replace(/[\s-]/g, "");
    return /^\d{10}$/.test(d) ? d.slice(0, 4) + "-" + d.slice(4, 8) + "-" + d.slice(8) : null;
  }

  /** « Vérifié »: the team checked the RBQ licence, and the insurance still runs on [today] ("YYYY-MM-DD"). */
  function verified(b, today) {
    return !!b && !!rbqOf(b.rbq_number) && !!b.rbq_verified_at && typeof b.insurance_until === "string" && b.insurance_until.slice(0, 10) >= today;
  }

  /** The card's form as commons_admin_upsert_builder's p (id null: a new card), or {error: the field to fix}. */
  function builderPayload(f, year) {
    var name = txt(f.name, 120), founded = f.founded === "" || f.founded == null ? null : Number(f.founded), site = String(f.website || "").trim();
    if (Array.from(name).length < 2) return { error: "name" };
    if (KINDS.indexOf(f.kind) < 0) return { error: "kind" };
    if (founded !== null && !(Number.isInteger(founded) && founded >= 1800 && founded <= year)) return { error: "founded" };
    if (site && !https(site)) return { error: "website" };
    return { p: { id: typeof f.id === "number" ? f.id : null, name: name, kind: f.kind, region: txt(f.region, 60) || null, founded: founded,
                  website: site || null, about: String(f.about || "").trim().slice(0, 2000) || null, logo_url: String(f.logo_url || "").trim() || null } };
  }

  /** What a pending edit [changes] on the card [cur]: [{key, from, to}] for each public field it sets to something else. */
  function diff(cur, changes) {
    var norm = function (v) { return v == null ? "" : String(v).trim(); };
    return FIELDS.filter(function (k) { return !!changes && Object.prototype.hasOwnProperty.call(changes, k) && norm(changes[k]) !== norm(cur && cur[k]); })
      .map(function (k) { return { key: k, from: cur ? cur[k] : null, to: changes[k] }; });
  }

  /** The cards the filters keep ({q, status, kind, region}, "" for all), by region (none last) then name, as the app lists them. */
  function filterBuilders(list, f, lang) {
    var fold = function (s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); };
    var q = fold(txt(f.q, 60)), col = new Intl.Collator(lang, { sensitivity: "base" });
    return list.filter(function (b) {
      return (!f.status || b.status === f.status) && (!f.kind || b.kind === f.kind) && (!f.region || (b.region || "") === f.region) && (!q || fold(b.name).indexOf(q) >= 0);
    }).sort(function (a, b) { return (!a.region) - (!b.region) || col.compare(a.region || "", b.region || "") || col.compare(a.name, b.name); });
  }

  /** A bid's PDF in the private bucket ("commons-bids/" in front or not) as "commons-bids/<name>.pdf" to sign, or null. */
  function pdfPath(v) {
    var s = typeof v === "string" ? v.replace(/^commons-bids\//, "") : "";
    return /^[A-Za-z0-9_-][A-Za-z0-9_./-]{0,200}\.pdf$/.test(s) && !/\.\.|\/\//.test(s) ? "commons-bids/" + s : null;
  }

  var roDe = F.roDe;
  // The console's 7 languages (docs/translations-glossary.md): French says "tu" and « courriel », Romanian writes ș ț.
  var STRINGS = {
    en: {
      title: "Builders", lead: "Contractors, non-profits and cities of the Community Fountain. A public card changes only once the team approves it.",
      side: function (n) { return n ? (n === 1 ? "1 request to approve" : n + " requests to approve") : "Cards, claims and edits"; },
      unavailable: "Builders aren't on the server yet (section 92).", loading: "Loading…",
      views: { cards: "Cards", claims: "Claims", edits: "Edits" },
      newCard: "New card", search: "Search a name", all: "All", fStatus: "Status", fKind: "Kind", fRegion: "Region",
      status: { draft: "Draft", pending: "Waiting", approved: "Published", hidden: "Hidden" }, noCards: "No card matches these filters.",
      fountains: function (s, n) { return n === 1 ? "1 fountain built" : s + " fountains built"; },
      badges: { verified: "Verified", tier_1: "First fountain", tier_5: "5 fountains", tier_10: "10 fountains", city_partner: "City partner" },
      back: "All cards", name: "Name", kind: "Kind", region: "Region served", founded: "Founded (year)", website: "Website", about: "About", logo: "Logo",
      verifyTitle: "RBQ licence and insurance",
      verifyNote: "Look the licence up in the RBQ's register and read the insurance certificate before you mark the card verified.",
      rbq: "RBQ licence number", insurance: "Insurance valid until", preview: "Once verified, the card shows:", noBadge: "no badge",
      verifiedOn: function (d) { return "Verified by the team on " + d + "."; },
      expired: function (d) { return "The insurance ended on " + d + ": no badge until it is renewed."; }, notVerified: "Not verified yet.",
      verify: "Mark verified today", unverify: "Remove the verification", badRbq: "An RBQ licence number has 10 digits: 1234-5678-01.",
      publish: "Publish the card", hide: "Hide the card", show: "Show the card again",
      publishConfirm: function (s) { return "Publish « " + s + " »? It shows in the app's directory at once."; },
      hideConfirm: function (s) { return "Hide « " + s + " »? It leaves the app's directory and the projects' pages at once."; },
      managers: function (s) { return "Managed from the app by " + s + "."; },
      noManager: "Nobody manages this card yet: a builder can claim it from the app.",
      claimsLead: "A member asks to manage a card, or proposes a new one. Check who they are (a call, the company's e-mail) before you approve.",
      noClaims: "No claim waiting.",
      claims: function (s) { return "Claims « " + s + " »"; }, proposes: function (s) { return "Proposes a new card: « " + s + " »"; },
      openCard: "Open the card", approve: "Approve", refuse: "Refuse",
      approveClaim: function (w, s) { return "Let " + w + " manage « " + s + " »? Their edits will still wait for your approval."; },
      editsLead: "Changes to a public card, sent from the app. Nothing shows until you approve them. A new RBQ number clears the verification (check it again); a new insurance date counts as checked by your approval.", noEdits: "No edit waiting.",
      field: "Field", now: "Now", proposed: "Proposed", empty: "(empty)", same: "Nothing would change on the card.",
      approveEdit: function (s) { return "Publish these changes to « " + s + " »? The members see them at once."; },
      filesLeft: "Project deleted. Its bid PDFs couldn't be removed from storage: remove them in Supabase (commons-bids).",
      note: "Note for the member (optional)", revoke: function (w) { return "Remove " + w + "'s access"; },
      revokeConfirm: function (w, s) { return "Remove " + w + "'s access to « " + s + " »? They can't edit it any more; the card stays."; },
      partLead: "Who carries, builds and hosts this project. Each one shows on the project's page in the app and opens its card.",
      roles: { carrier: "Carrier", builder: "Builder", host: "Host" },
      noParticipants: "No participant yet.", card: "Card", role: "Role", add: "Add the participant",
      needCards: "Create a card first (Builders, at the bottom of the list).",
      bidsLead: "While the project is in vote or fundraising, the region's verified builders send a price, a delay and a PDF. Only you choose.",
      noBids: "No bid yet.", builder: "Builder", amount: "Amount", delay: "Delay", received: "Received", pdfCol: "PDF",
      days: function (s, n) { return n === 1 ? "1 day" : s + " days"; },
      bidStatus: { submitted: "Submitted", chosen: "Chosen", declined: "Declined", withdrawn: "Withdrawn" },
      pdf: "Open the PDF", pdfLink: "PDF (private link, 5 min)", pdfFailed: "The PDF couldn't be opened. Try again.", noPdf: "No PDF",
      choose: "Choose", decline: "Decline",
      chooseConfirm: function (s, a) { return "Choose the bid of « " + s + " » (" + a + ")? " + s + " becomes the project's public builder; one budget line « Chosen bid » (" + a + ") replaces the equipment and installation lines, and the project's other bids are declined. The members see it at once."; },
      declineConfirm: function (s) { return "Decline the bid of « " + s + " »? The builder sees it in the app."; },
      reasons: { closed: "This project can't take a choice any more: a bid is already chosen, or it isn't in vote, fundraising or building.", not_verified: "This builder isn't verified any more (RBQ and insurance): check its card first.", not_approved: "This builder's card isn't published.",
                 not_submitted: "This bid was already decided or withdrawn. Reload the page.", not_pending: "This request was already decided. Reload the page.", builder_taken: "This project already has a builder: remove it first.", chosen_bid: "The builder of the chosen bid stays.",
                 bad_rbq: "An RBQ licence number has 10 digits: 1234-5678-01.", bad_date: "Check the insurance date.", bad_note: "The note is too long (300 characters at most).", not_found: "It's not there any more. Reload the page." }
    },
    fr: {
      title: "Constructeurs", lead: "Entrepreneurs, OBNL et villes de la Fontaine commune. Une fiche publique change seulement quand l'équipe l'approuve.",
      side: function (n) { return n ? (n === 1 ? "1 demande à approuver" : n + " demandes à approuver") : "Fiches, réclamations et modifications"; },
      unavailable: "Les constructeurs ne sont pas encore sur le serveur (section 92).", loading: "Chargement…",
      views: { cards: "Fiches", claims: "Réclamations", edits: "Modifications" },
      newCard: "Nouvelle fiche", search: "Chercher un nom", all: "Tous", fStatus: "Statut", fKind: "Type", fRegion: "Région",
      status: { draft: "Brouillon", pending: "En attente", approved: "Publiée", hidden: "Masquée" }, noCards: "Aucune fiche ne correspond à ces filtres.",
      fountains: function (s, n) { return n <= 1 ? n + " fontaine construite" : s + " fontaines construites"; },
      badges: { verified: "Vérifié", tier_1: "1re fontaine", tier_5: "5 fontaines", tier_10: "10 fontaines", city_partner: "Partenaire de la ville" },
      back: "Toutes les fiches", name: "Nom", kind: "Type", region: "Région desservie", founded: "Fondée en (année)", website: "Site web", about: "Présentation", logo: "Logo",
      verifyTitle: "Licence RBQ et assurance",
      verifyNote: "Cherche la licence dans le registre de la RBQ et lis le certificat d'assurance avant de marquer la fiche vérifiée.",
      rbq: "Numéro de licence RBQ", insurance: "Assurance valide jusqu'au", preview: "Une fois vérifiée, la fiche affiche :", noBadge: "aucun badge",
      verifiedOn: function (d) { return "Vérifiée par l'équipe le " + d + "."; },
      expired: function (d) { return "L'assurance a pris fin le " + d + " : pas de badge tant qu'elle n'est pas renouvelée."; }, notVerified: "Pas encore vérifiée.",
      verify: "Marquer vérifiée aujourd'hui", unverify: "Retirer la vérification", badRbq: "Un numéro de licence RBQ a 10 chiffres : 1234-5678-01.",
      publish: "Publier la fiche", hide: "Masquer la fiche", show: "Afficher la fiche de nouveau",
      publishConfirm: function (s) { return "Publier « " + s + " » ? Elle apparaît tout de suite dans l'annuaire de l'app."; },
      hideConfirm: function (s) { return "Masquer « " + s + " » ? Elle quitte tout de suite l'annuaire de l'app et les pages des projets."; },
      managers: function (s) { return "Gérée depuis l'app par " + s + "."; },
      noManager: "Personne ne gère encore cette fiche : un constructeur peut la réclamer depuis l'app.",
      claimsLead: "Un membre demande à gérer une fiche, ou en propose une nouvelle. Vérifie qui c'est (un appel, le courriel de l'entreprise) avant d'approuver.",
      noClaims: "Aucune réclamation en attente.",
      claims: function (s) { return "Réclame « " + s + " »"; }, proposes: function (s) { return "Propose une nouvelle fiche : « " + s + " »"; },
      openCard: "Ouvrir la fiche", approve: "Approuver", refuse: "Refuser",
      approveClaim: function (w, s) { return "Laisser " + w + " gérer « " + s + " » ? Ses modifications attendront quand même ton approbation."; },
      editsLead: "Des changements à une fiche publique, envoyés depuis l'app. Rien n'apparaît avant ton approbation. Un nouveau numéro RBQ efface la vérification (vérifie-le de nouveau) ; une nouvelle date d'assurance compte comme vérifiée par ton approbation.", noEdits: "Aucune modification en attente.",
      field: "Champ", now: "Maintenant", proposed: "Proposé", empty: "(vide)", same: "Rien ne changerait sur la fiche.",
      approveEdit: function (s) { return "Publier ces changements sur « " + s + " » ? Les membres les voient tout de suite."; },
      filesLeft: "Projet supprimé. Ses PDF de soumission n'ont pas pu être effacés du stockage : efface-les dans Supabase (commons-bids).",
      note: "Note pour le membre (facultatif)", revoke: function (w) { return "Retirer l'accès : " + w; },
      revokeConfirm: function (w, s) { return "Retirer l'accès à « " + s + " » pour " + w + " ? Cette personne ne pourra plus la modifier ; la fiche reste."; },
      partLead: "Qui porte, construit et héberge ce projet. Chacun apparaît sur la page du projet dans l'app et ouvre sa fiche.",
      roles: { carrier: "Porteur", builder: "Constructeur", host: "Hôte" },
      noParticipants: "Pas encore d'intervenant.", card: "Fiche", role: "Rôle", add: "Ajouter l'intervenant",
      needCards: "Crée d'abord une fiche (Constructeurs, en bas de la liste).",
      bidsLead: "Pendant le vote ou la collecte, les constructeurs vérifiés de la région envoient un prix, un délai et un PDF. C'est toi qui choisis.",
      noBids: "Pas encore de soumission.", builder: "Constructeur", amount: "Montant", delay: "Délai", received: "Reçue le", pdfCol: "PDF",
      days: function (s, n) { return n <= 1 ? n + " jour" : s + " jours"; },
      bidStatus: { submitted: "Déposée", chosen: "Retenue", declined: "Déclinée", withdrawn: "Retirée" },
      pdf: "Ouvrir le PDF", pdfLink: "PDF (lien privé, 5 min)", pdfFailed: "Impossible d'ouvrir le PDF. Réessaie.", noPdf: "Pas de PDF",
      choose: "Choisir", decline: "Décliner",
      chooseConfirm: function (s, a) { return "Choisir la soumission de « " + s + " » (" + a + ") ? " + s + " devient le constructeur public du projet ; une ligne « Soumission retenue » (" + a + ") remplace les lignes équipement et installation du budget, et les autres soumissions du projet sont déclinées. Les membres le voient tout de suite."; },
      declineConfirm: function (s) { return "Décliner la soumission de « " + s + " » ? Le constructeur le voit dans l'app."; },
      reasons: { closed: "Ce projet ne peut plus retenir de soumission : une est déjà retenue, ou il n'est plus en vote, en collecte ou en construction.", not_verified: "Ce constructeur n'est plus vérifié (RBQ et assurance) : vérifie d'abord sa fiche.", not_approved: "La fiche de ce constructeur n'est pas publiée.",
                 not_submitted: "Cette soumission est déjà décidée ou retirée. Recharge la page.", not_pending: "Cette demande est déjà décidée. Recharge la page.", builder_taken: "Ce projet a déjà un constructeur : retire-le d'abord.", chosen_bid: "Le constructeur de la soumission retenue reste.",
                 bad_rbq: "Un numéro de licence RBQ a 10 chiffres : 1234-5678-01.", bad_date: "Vérifie la date de l'assurance.", bad_note: "La note est trop longue (300 caractères au plus).", not_found: "Ce n'est plus là. Recharge la page." }
    },
    es: {
      title: "Constructores", lead: "Contratistas, organizaciones sin fines de lucro y ciudades de la Fuente común. Una ficha pública solo cambia cuando el equipo la aprueba.",
      side: function (n) { return n ? (n === 1 ? "1 solicitud por aprobar" : n + " solicitudes por aprobar") : "Fichas, reclamaciones y cambios"; },
      unavailable: "Los constructores aún no están en el servidor (sección 92).", loading: "Cargando…",
      views: { cards: "Fichas", claims: "Reclamaciones", edits: "Cambios" },
      newCard: "Nueva ficha", search: "Buscar un nombre", all: "Todos", fStatus: "Estado", fKind: "Tipo", fRegion: "Región",
      status: { draft: "Borrador", pending: "En espera", approved: "Publicada", hidden: "Oculta" }, noCards: "Ninguna ficha coincide con estos filtros.",
      fountains: function (s, n) { return n === 1 ? "1 fuente construida" : s + " fuentes construidas"; },
      badges: { verified: "Verificado", tier_1: "1.ª fuente", tier_5: "5 fuentes", tier_10: "10 fuentes", city_partner: "Socio de la ciudad" },
      back: "Todas las fichas", name: "Nombre", kind: "Tipo", region: "Región atendida", founded: "Fundada en (año)", website: "Sitio web", about: "Presentación", logo: "Logo",
      verifyTitle: "Licencia RBQ y seguro",
      verifyNote: "Busca la licencia en el registro de la RBQ y lee el certificado de seguro antes de marcar la ficha como verificada.",
      rbq: "Número de licencia RBQ", insurance: "Seguro válido hasta", preview: "Una vez verificada, la ficha muestra:", noBadge: "ninguna insignia",
      verifiedOn: function (d) { return "Verificada por el equipo el " + d + "."; },
      expired: function (d) { return "El seguro terminó el " + d + ": sin insignia hasta que se renueve."; }, notVerified: "Aún no verificada.",
      verify: "Marcar como verificada hoy", unverify: "Quitar la verificación", badRbq: "Un número de licencia RBQ tiene 10 cifras: 1234-5678-01.",
      publish: "Publicar la ficha", hide: "Ocultar la ficha", show: "Mostrar la ficha de nuevo",
      publishConfirm: function (s) { return "¿Publicar « " + s + " »? Aparece al instante en el directorio de la app."; },
      hideConfirm: function (s) { return "¿Ocultar « " + s + " »? Sale al instante del directorio de la app y de las páginas de los proyectos."; },
      managers: function (s) { return "Gestionada desde la app por " + s + "."; },
      noManager: "Nadie gestiona esta ficha todavía: un constructor puede reclamarla desde la app.",
      claimsLead: "Un miembro pide gestionar una ficha o propone una nueva. Comprueba quién es (una llamada, el correo de la empresa) antes de aprobar.",
      noClaims: "No hay reclamaciones en espera.",
      claims: function (s) { return "Reclama « " + s + " »"; }, proposes: function (s) { return "Propone una nueva ficha: « " + s + " »"; },
      openCard: "Abrir la ficha", approve: "Aprobar", refuse: "Rechazar",
      approveClaim: function (w, s) { return "¿Dejar que " + w + " gestione « " + s + " »? Sus cambios seguirán esperando tu aprobación."; },
      editsLead: "Cambios a una ficha pública, enviados desde la app. Nada aparece antes de tu aprobación. Un nuevo número RBQ borra la verificación (verifícalo de nuevo); una nueva fecha de seguro cuenta como verificada con tu aprobación.", noEdits: "No hay cambios en espera.",
      field: "Campo", now: "Ahora", proposed: "Propuesto", empty: "(vacío)", same: "Nada cambiaría en la ficha.",
      approveEdit: function (s) { return "¿Publicar estos cambios en « " + s + " »? Los miembros los ven al instante."; },
      filesLeft: "Proyecto eliminado. No se pudieron borrar sus PDF de ofertas del almacenamiento: bórralos en Supabase (commons-bids).",
      note: "Nota para el miembro (opcional)", revoke: function (w) { return "Quitar el acceso de " + w; },
      revokeConfirm: function (w, s) { return "¿Quitar el acceso de " + w + " a « " + s + " »? Ya no podrá modificarla; la ficha se queda."; },
      partLead: "Quién impulsa, construye y acoge este proyecto. Cada uno aparece en la página del proyecto en la app y abre su ficha.",
      roles: { carrier: "Impulsor", builder: "Constructor", host: "Anfitrión" },
      noParticipants: "Aún no hay participantes.", card: "Ficha", role: "Rol", add: "Añadir el participante",
      needCards: "Crea primero una ficha (Constructores, al final de la lista).",
      bidsLead: "Durante la votación o la recaudación, los constructores verificados de la región envían un precio, un plazo y un PDF. Solo tú eliges.",
      noBids: "Aún no hay ofertas.", builder: "Constructor", amount: "Importe", delay: "Plazo", received: "Recibida", pdfCol: "PDF",
      days: function (s, n) { return n === 1 ? "1 día" : s + " días"; },
      bidStatus: { submitted: "Enviada", chosen: "Elegida", declined: "Descartada", withdrawn: "Retirada" },
      pdf: "Abrir el PDF", pdfLink: "PDF (enlace privado, 5 min)", pdfFailed: "No se pudo abrir el PDF. Inténtalo de nuevo.", noPdf: "Sin PDF",
      choose: "Elegir", decline: "Descartar",
      chooseConfirm: function (s, a) { return "¿Elegir la oferta de « " + s + " » (" + a + ")? " + s + " pasa a ser el constructor público del proyecto; una línea « Oferta elegida » (" + a + ") reemplaza las líneas de equipo e instalación del presupuesto, y las demás ofertas del proyecto quedan descartadas. Los miembros lo ven al instante."; },
      declineConfirm: function (s) { return "¿Descartar la oferta de « " + s + " »? El constructor lo ve en la app."; },
      reasons: { closed: "Este proyecto ya no puede elegir: ya hay una oferta elegida, o no está en votación, recaudación ni construcción.", not_verified: "Este constructor ya no está verificado (RBQ y seguro): revisa primero su ficha.", not_approved: "La ficha de este constructor no está publicada.",
                 not_submitted: "Esta oferta ya está decidida o retirada. Recarga la página.", not_pending: "Esta solicitud ya está decidida. Recarga la página.", builder_taken: "Este proyecto ya tiene un constructor: quítalo primero.", chosen_bid: "El constructor de la oferta elegida se queda.",
                 bad_rbq: "Un número de licencia RBQ tiene 10 cifras: 1234-5678-01.", bad_date: "Revisa la fecha del seguro.", bad_note: "La nota es demasiado larga (300 caracteres como máximo).", not_found: "Ya no está. Recarga la página." }
    },
    de: {
      title: "Baupartner", lead: "Bauunternehmen, gemeinnützige Organisationen und Städte des Gemeinschaftsbrunnens. Ein öffentliches Profil ändert sich erst, wenn das Team zustimmt.",
      side: function (n) { return n ? (n === 1 ? "1 Anfrage zu prüfen" : n + " Anfragen zu prüfen") : "Profile, Ansprüche und Änderungen"; },
      unavailable: "Die Baupartner sind noch nicht auf dem Server (Abschnitt 92).", loading: "Wird geladen…",
      views: { cards: "Profile", claims: "Ansprüche", edits: "Änderungen" },
      newCard: "Neues Profil", search: "Namen suchen", all: "Alle", fStatus: "Status", fKind: "Art", fRegion: "Region",
      status: { draft: "Entwurf", pending: "Wartet", approved: "Veröffentlicht", hidden: "Ausgeblendet" }, noCards: "Kein Profil passt zu diesen Filtern.",
      fountains: function (s, n) { return n === 1 ? "1 Brunnen gebaut" : s + " Brunnen gebaut"; },
      badges: { verified: "Geprüft", tier_1: "Erster Brunnen", tier_5: "5 Brunnen", tier_10: "10 Brunnen", city_partner: "Partner der Stadt" },
      back: "Alle Profile", name: "Name", kind: "Art", region: "Einsatzgebiet", founded: "Gegründet (Jahr)", website: "Website", about: "Vorstellung", logo: "Logo",
      verifyTitle: "RBQ-Lizenz und Versicherung",
      verifyNote: "Schlag die Lizenz im Register der RBQ nach und lies den Versicherungsnachweis, bevor du das Profil als geprüft markierst.",
      rbq: "RBQ-Lizenznummer", insurance: "Versicherung gültig bis", preview: "Nach der Prüfung zeigt das Profil:", noBadge: "kein Abzeichen",
      verifiedOn: function (d) { return "Vom Team geprüft am " + d + "."; },
      expired: function (d) { return "Die Versicherung ist am " + d + " abgelaufen: kein Abzeichen, bis sie erneuert ist."; }, notVerified: "Noch nicht geprüft.",
      verify: "Heute als geprüft markieren", unverify: "Prüfung entfernen", badRbq: "Eine RBQ-Lizenznummer hat 10 Ziffern: 1234-5678-01.",
      publish: "Profil veröffentlichen", hide: "Profil ausblenden", show: "Profil wieder zeigen",
      publishConfirm: function (s) { return "„" + s + "“ veröffentlichen? Es erscheint sofort im Verzeichnis der App."; },
      hideConfirm: function (s) { return "„" + s + "“ ausblenden? Es verschwindet sofort aus dem Verzeichnis der App und von den Projektseiten."; },
      managers: function (s) { return "In der App verwaltet von " + s + "."; },
      noManager: "Noch niemand verwaltet dieses Profil: Ein Betrieb kann es in der App beanspruchen.",
      claimsLead: "Ein Mitglied möchte ein Profil verwalten oder schlägt ein neues vor. Prüf vor der Zustimmung, wer es ist (ein Anruf, die E-Mail-Adresse des Betriebs).",
      noClaims: "Kein Anspruch offen.",
      claims: function (s) { return "Beansprucht „" + s + "“"; }, proposes: function (s) { return "Schlägt ein neues Profil vor: „" + s + "“"; },
      openCard: "Profil öffnen", approve: "Zustimmen", refuse: "Ablehnen",
      approveClaim: function (w, s) { return w + " „" + s + "“ verwalten lassen? Die Änderungen warten trotzdem auf deine Zustimmung."; },
      editsLead: "Änderungen an einem öffentlichen Profil, aus der App gesendet. Nichts erscheint vor deiner Zustimmung. Eine neue RBQ-Nummer hebt die Prüfung auf (prüf sie erneut); ein neues Versicherungsdatum gilt mit deiner Zustimmung als geprüft.", noEdits: "Keine Änderung offen.",
      field: "Feld", now: "Jetzt", proposed: "Vorgeschlagen", empty: "(leer)", same: "Am Profil würde sich nichts ändern.",
      approveEdit: function (s) { return "Diese Änderungen an „" + s + "“ veröffentlichen? Die Mitglieder sehen sie sofort."; },
      filesLeft: "Projekt gelöscht. Seine Angebots-PDFs ließen sich nicht aus dem Speicher löschen: Lösch sie in Supabase (commons-bids).",
      note: "Notiz für das Mitglied (freiwillig)", revoke: function (w) { return w + " den Zugang entziehen"; },
      revokeConfirm: function (w, s) { return w + " den Zugang zu „" + s + "“ entziehen? Änderungen sind dann nicht mehr möglich; das Profil bleibt."; },
      partLead: "Wer dieses Projekt trägt, baut und beherbergt. Alle erscheinen auf der Projektseite in der App und öffnen ihr Profil.",
      roles: { carrier: "Träger", builder: "Bauunternehmen", host: "Gastgeber" },
      noParticipants: "Noch keine Beteiligten.", card: "Profil", role: "Rolle", add: "Beteiligten hinzufügen",
      needCards: "Leg zuerst ein Profil an (Baupartner, unten in der Liste).",
      bidsLead: "Während der Abstimmung oder der Spendenaktion senden geprüfte Betriebe der Region einen Preis, eine Frist und ein PDF. Nur du wählst.",
      noBids: "Noch kein Angebot.", builder: "Betrieb", amount: "Betrag", delay: "Frist", received: "Eingegangen", pdfCol: "PDF",
      days: function (s, n) { return n === 1 ? "1 Tag" : s + " Tage"; },
      bidStatus: { submitted: "Eingereicht", chosen: "Gewählt", declined: "Abgesagt", withdrawn: "Zurückgezogen" },
      pdf: "PDF öffnen", pdfLink: "PDF (privater Link, 5 Min.)", pdfFailed: "Das PDF ließ sich nicht öffnen. Versuch es noch einmal.", noPdf: "Kein PDF",
      choose: "Wählen", decline: "Absagen",
      chooseConfirm: function (s, a) { return "Das Angebot von „" + s + "“ (" + a + ") wählen? " + s + " wird das öffentliche Bauunternehmen des Projekts; eine Budgetzeile „Gewähltes Angebot“ (" + a + ") ersetzt die Zeilen Ausstattung und Installation, und die anderen Angebote des Projekts werden abgesagt. Die Mitglieder sehen es sofort."; },
      declineConfirm: function (s) { return "Dem Angebot von „" + s + "“ absagen? Der Betrieb sieht es in der App."; },
      reasons: { closed: "Für dieses Projekt kann nichts mehr gewählt werden: Ein Angebot ist schon gewählt, oder es ist weder in Abstimmung, Spendenaktion noch im Bau.", not_verified: "Dieser Betrieb ist nicht mehr geprüft (RBQ und Versicherung): Prüf zuerst sein Profil.", not_approved: "Das Profil dieses Betriebs ist nicht veröffentlicht.",
                 not_submitted: "Über dieses Angebot ist schon entschieden, oder es wurde zurückgezogen. Lade die Seite neu.", not_pending: "Über diese Anfrage ist schon entschieden. Lade die Seite neu.", builder_taken: "Dieses Projekt hat schon ein Bauunternehmen: Entferne es zuerst.", chosen_bid: "Das Bauunternehmen des gewählten Angebots bleibt.",
                 bad_rbq: "Eine RBQ-Lizenznummer hat 10 Ziffern: 1234-5678-01.", bad_date: "Prüf das Versicherungsdatum.", bad_note: "Die Notiz ist zu lang (höchstens 300 Zeichen).", not_found: "Das ist nicht mehr da. Lade die Seite neu." }
    },
    pt: {
      title: "Construtores", lead: "Empreiteiras, organizações sem fins lucrativos e cidades da Fonte comum. Uma ficha pública só muda quando a equipe aprova.",
      side: function (n) { return n ? (n === 1 ? "1 pedido para aprovar" : n + " pedidos para aprovar") : "Fichas, reivindicações e alterações"; },
      unavailable: "Os construtores ainda não estão no servidor (seção 92).", loading: "Carregando…",
      views: { cards: "Fichas", claims: "Reivindicações", edits: "Alterações" },
      newCard: "Nova ficha", search: "Buscar um nome", all: "Todos", fStatus: "Status", fKind: "Tipo", fRegion: "Região",
      status: { draft: "Rascunho", pending: "Aguardando", approved: "Publicada", hidden: "Oculta" }, noCards: "Nenhuma ficha corresponde a estes filtros.",
      fountains: function (s, n) { return n === 1 ? "1 fonte construída" : s + " fontes construídas"; },
      badges: { verified: "Verificado", tier_1: "1ª fonte", tier_5: "5 fontes", tier_10: "10 fontes", city_partner: "Parceiro da cidade" },
      back: "Todas as fichas", name: "Nome", kind: "Tipo", region: "Região atendida", founded: "Fundada em (ano)", website: "Site", about: "Apresentação", logo: "Logo",
      verifyTitle: "Licença RBQ e seguro",
      verifyNote: "Procure a licença no registro da RBQ e leia o certificado de seguro antes de marcar a ficha como verificada.",
      rbq: "Número da licença RBQ", insurance: "Seguro válido até", preview: "Depois de verificada, a ficha mostra:", noBadge: "nenhum selo",
      verifiedOn: function (d) { return "Verificada pela equipe em " + d + "."; },
      expired: function (d) { return "O seguro terminou em " + d + ": sem selo até ser renovado."; }, notVerified: "Ainda não verificada.",
      verify: "Marcar como verificada hoje", unverify: "Remover a verificação", badRbq: "Um número de licença RBQ tem 10 dígitos: 1234-5678-01.",
      publish: "Publicar a ficha", hide: "Ocultar a ficha", show: "Mostrar a ficha de novo",
      publishConfirm: function (s) { return "Publicar “" + s + "”? Ela aparece na hora no diretório do app."; },
      hideConfirm: function (s) { return "Ocultar “" + s + "”? Ela sai na hora do diretório do app e das páginas dos projetos."; },
      managers: function (s) { return "Gerenciada pelo app por " + s + "."; },
      noManager: "Ninguém gerencia esta ficha ainda: um construtor pode reivindicá-la pelo app.",
      claimsLead: "Um membro pede para gerenciar uma ficha ou propõe uma nova. Confira quem é (uma ligação, o e-mail da empresa) antes de aprovar.",
      noClaims: "Nenhuma reivindicação aguardando.",
      claims: function (s) { return "Reivindica “" + s + "”"; }, proposes: function (s) { return "Propõe uma nova ficha: “" + s + "”"; },
      openCard: "Abrir a ficha", approve: "Aprovar", refuse: "Recusar",
      approveClaim: function (w, s) { return "Deixar " + w + " gerenciar “" + s + "”? As alterações continuarão aguardando a sua aprovação."; },
      editsLead: "Alterações em uma ficha pública, enviadas pelo app. Nada aparece antes da sua aprovação. Um novo número RBQ apaga a verificação (verifique de novo); uma nova data de seguro conta como verificada pela sua aprovação.", noEdits: "Nenhuma alteração aguardando.",
      field: "Campo", now: "Agora", proposed: "Proposto", empty: "(vazio)", same: "Nada mudaria na ficha.",
      approveEdit: function (s) { return "Publicar estas alterações em “" + s + "”? Os membros veem na hora."; },
      filesLeft: "Projeto excluído. Os PDFs das propostas não puderam ser apagados do armazenamento: apague-os no Supabase (commons-bids).",
      note: "Nota para o membro (opcional)", revoke: function (w) { return "Remover o acesso de " + w; },
      revokeConfirm: function (w, s) { return "Remover o acesso de " + w + " a “" + s + "”? Essa pessoa não poderá mais alterá-la; a ficha fica."; },
      partLead: "Quem promove, constrói e acolhe este projeto. Cada um aparece na página do projeto no app e abre a sua ficha.",
      roles: { carrier: "Promotor", builder: "Construtor", host: "Anfitrião" },
      noParticipants: "Nenhum participante ainda.", card: "Ficha", role: "Papel", add: "Adicionar o participante",
      needCards: "Crie primeiro uma ficha (Construtores, no fim da lista).",
      bidsLead: "Durante a votação ou a arrecadação, os construtores verificados da região enviam um preço, um prazo e um PDF. Só você escolhe.",
      noBids: "Nenhuma proposta ainda.", builder: "Construtor", amount: "Valor", delay: "Prazo", received: "Recebida", pdfCol: "PDF",
      days: function (s, n) { return n === 1 ? "1 dia" : s + " dias"; },
      bidStatus: { submitted: "Enviada", chosen: "Escolhida", declined: "Recusada", withdrawn: "Retirada" },
      pdf: "Abrir o PDF", pdfLink: "PDF (link privado, 5 min)", pdfFailed: "Não foi possível abrir o PDF. Tente de novo.", noPdf: "Sem PDF",
      choose: "Escolher", decline: "Recusar",
      chooseConfirm: function (s, a) { return "Escolher a proposta de “" + s + "” (" + a + ")? " + s + " passa a ser o construtor público do projeto; uma linha “Proposta escolhida” (" + a + ") substitui as linhas de equipamento e instalação do orçamento, e as outras propostas do projeto são recusadas. Os membros veem na hora."; },
      declineConfirm: function (s) { return "Recusar a proposta de “" + s + "”? O construtor vê isso no app."; },
      reasons: { closed: "Este projeto não pode mais escolher: já há uma proposta escolhida, ou ele não está em votação, arrecadação nem construção.", not_verified: "Este construtor não está mais verificado (RBQ e seguro): confira primeiro a ficha dele.", not_approved: "A ficha deste construtor não está publicada.",
                 not_submitted: "Esta proposta já foi decidida ou retirada. Recarregue a página.", not_pending: "Este pedido já foi decidido. Recarregue a página.", builder_taken: "Este projeto já tem um construtor: remova-o primeiro.", chosen_bid: "O construtor da proposta escolhida fica.",
                 bad_rbq: "Um número de licença RBQ tem 10 dígitos: 1234-5678-01.", bad_date: "Verifique a data do seguro.", bad_note: "A nota é longa demais (no máximo 300 caracteres).", not_found: "Isso não está mais lá. Recarregue a página." }
    },
    ja: {
      title: "施工者", lead: "「みんなの給水所」に関わる施工業者、非営利団体、自治体です。公開プロフィールは、チームが承認したときだけ変わります。",
      side: function (n) { return n ? "承認待ち " + n + "件" : "プロフィール・申請・変更"; },
      unavailable: "施工者の機能はまだサーバーにありません（セクション92）。", loading: "読み込み中…",
      views: { cards: "プロフィール", claims: "管理申請", edits: "変更" },
      newCard: "新しいプロフィール", search: "名前で検索", all: "すべて", fStatus: "ステータス", fKind: "種類", fRegion: "地域",
      status: { draft: "下書き", pending: "承認待ち", approved: "公開中", hidden: "非表示" }, noCards: "条件に合うプロフィールはありません。",
      fountains: function (s) { return "完成した給水所 " + s + "か所"; },
      badges: { verified: "確認済み", tier_1: "初めての給水所", tier_5: "給水所5か所", tier_10: "給水所10か所", city_partner: "自治体のパートナー" },
      back: "すべてのプロフィール", name: "名前", kind: "種類", region: "対応地域", founded: "設立年", website: "ウェブサイト", about: "紹介文", logo: "ロゴ",
      verifyTitle: "RBQライセンスと保険",
      verifyNote: "確認済みにする前に、RBQの登録簿でライセンスを調べ、保険証書を確認してください。",
      rbq: "RBQライセンス番号", insurance: "保険の有効期限", preview: "確認後、プロフィールに表示：", noBadge: "バッジなし",
      verifiedOn: function (d) { return d + "にチームが確認しました。"; },
      expired: function (d) { return "保険は" + d + "に切れました。更新されるまでバッジは表示されません。"; }, notVerified: "まだ確認していません。",
      verify: "今日の日付で確認済みにする", unverify: "確認を取り消す", badRbq: "RBQライセンス番号は10桁です（1234-5678-01）。",
      publish: "プロフィールを公開", hide: "プロフィールを非表示", show: "プロフィールを再表示",
      publishConfirm: function (s) { return "「" + s + "」を公開しますか？アプリの名簿にすぐ表示されます。"; },
      hideConfirm: function (s) { return "「" + s + "」を非表示にしますか？アプリの名簿とプロジェクトのページからすぐに消えます。"; },
      managers: function (s) { return "アプリで管理している人：" + s; },
      noManager: "このプロフィールはまだ誰も管理していません。施工者はアプリから管理を申請できます。",
      claimsLead: "メンバーがプロフィールの管理を申請するか、新しいプロフィールを提案しています。承認の前に本人確認をしてください（電話、会社のメールアドレスなど）。",
      noClaims: "承認待ちの申請はありません。",
      claims: function (s) { return "「" + s + "」の管理を申請"; }, proposes: function (s) { return "新しいプロフィールを提案：「" + s + "」"; },
      openCard: "プロフィールを開く", approve: "承認", refuse: "却下",
      approveClaim: function (w, s) { return w + "さんに「" + s + "」の管理を任せますか？変更内容は引き続きあなたの承認が必要です。"; },
      editsLead: "アプリから送られた公開プロフィールの変更です。承認するまで何も表示されません。RBQ番号が変わると確認は取り消されます（もう一度確認してください）。保険の新しい期限は、あなたの承認で確認済みになります。", noEdits: "承認待ちの変更はありません。",
      field: "項目", now: "現在", proposed: "提案", empty: "（空欄）", same: "プロフィールに変わるところはありません。",
      approveEdit: function (s) { return "「" + s + "」にこの変更を公開しますか？メンバーにすぐ表示されます。"; },
      filesLeft: "プロジェクトを削除しました。入札のPDFはストレージから削除できませんでした。Supabase（commons-bids）で削除してください。",
      note: "メンバーへのメモ（任意）", revoke: function (w) { return w + "さんの管理権限を外す"; },
      revokeConfirm: function (w, s) { return w + "さんの「" + s + "」の管理権限を外しますか？今後は編集できなくなります。プロフィールは残ります。"; },
      partLead: "このプロジェクトを推進・施工・受け入れする団体です。それぞれアプリのプロジェクトページに表示され、プロフィールを開けます。",
      roles: { carrier: "推進団体", builder: "施工", host: "設置先" },
      noParticipants: "関係者はまだいません。", card: "プロフィール", role: "役割", add: "関係者を追加",
      needCards: "先にプロフィールを作成してください（リスト下の「施工者」）。",
      bidsLead: "投票中または寄付受付中に、地域の確認済み施工者が価格、工期、PDFを送ります。選ぶのはあなただけです。",
      noBids: "入札はまだありません。", builder: "施工者", amount: "金額", delay: "工期", received: "受付日", pdfCol: "PDF",
      days: function (s) { return s + "日"; },
      bidStatus: { submitted: "提出済み", chosen: "採用", declined: "不採用", withdrawn: "取り下げ" },
      pdf: "PDFを開く", pdfLink: "PDF（非公開リンク、5分間）", pdfFailed: "PDFを開けませんでした。もう一度お試しください。", noPdf: "PDFなし",
      choose: "採用する", decline: "不採用にする",
      chooseConfirm: function (s, a) { return "「" + s + "」の入札（" + a + "）を採用しますか？" + s + "がプロジェクトの公開施工者になり、予算の設備と設置の行は「採用された入札」（" + a + "）の1行に置き換わります。ほかの入札は不採用になります。メンバーにすぐ表示されます。"; },
      declineConfirm: function (s) { return "「" + s + "」の入札を不採用にしますか？施工者にはアプリで表示されます。"; },
      reasons: { closed: "このプロジェクトでは採用できません。すでに入札が採用されているか、投票中・寄付受付中・建設中ではありません。", not_verified: "この施工者は確認済みではなくなりました（RBQと保険）。先にプロフィールを確認してください。", not_approved: "この施工者のプロフィールは公開されていません。",
                 not_submitted: "この入札はすでに決定済みか、取り下げられています。ページを再読み込みしてください。", not_pending: "この申請はすでに決定済みです。ページを再読み込みしてください。", builder_taken: "このプロジェクトにはすでに施工者がいます。先に外してください。", chosen_bid: "採用された入札の施工者は外せません。",
                 bad_rbq: "RBQライセンス番号は10桁です（1234-5678-01）。", bad_date: "保険の期限を確認してください。", bad_note: "メモが長すぎます（300文字まで）。", not_found: "見つかりません。ページを再読み込みしてください。" }
    },
    ro: {
      title: "Constructori", lead: "Antreprenori, organizații nonprofit și orașe ale Fântânii comune. O fișă publică se schimbă doar după ce echipa o aprobă.",
      side: function (n) { return n ? (n === 1 ? "1 cerere de aprobat" : n + roDe(n) + " cereri de aprobat") : "Fișe, revendicări și modificări"; },
      unavailable: "Constructorii nu sunt încă pe server (secțiunea 92).", loading: "Se încarcă…",
      views: { cards: "Fișe", claims: "Revendicări", edits: "Modificări" },
      newCard: "Fișă nouă", search: "Caută un nume", all: "Toate", fStatus: "Stare", fKind: "Tip", fRegion: "Regiune",
      status: { draft: "Ciornă", pending: "În așteptare", approved: "Publicată", hidden: "Ascunsă" }, noCards: "Nicio fișă nu se potrivește cu aceste filtre.",
      fountains: function (s, n) { return n === 1 ? "1 fântână construită" : s + roDe(n) + " fântâni construite"; },
      badges: { verified: "Verificat", tier_1: "Prima fântână", tier_5: "5 fântâni", tier_10: "10 fântâni", city_partner: "Partener al orașului" },
      back: "Toate fișele", name: "Nume", kind: "Tip", region: "Regiunea deservită", founded: "Fondată în (anul)", website: "Site web", about: "Prezentare", logo: "Logo",
      verifyTitle: "Licența RBQ și asigurarea",
      verifyNote: "Caută licența în registrul RBQ și citește certificatul de asigurare înainte să marchezi fișa ca verificată.",
      rbq: "Numărul licenței RBQ", insurance: "Asigurare valabilă până la", preview: "După verificare, fișa afișează:", noBadge: "nicio insignă",
      verifiedOn: function (d) { return "Verificată de echipă pe " + d + "."; },
      expired: function (d) { return "Asigurarea s-a încheiat pe " + d + ": nicio insignă până nu e reînnoită."; }, notVerified: "Încă neverificată.",
      verify: "Marchează ca verificată azi", unverify: "Elimină verificarea", badRbq: "Un număr de licență RBQ are 10 cifre: 1234-5678-01.",
      publish: "Publică fișa", hide: "Ascunde fișa", show: "Arată din nou fișa",
      publishConfirm: function (s) { return "Publici „" + s + "”? Apare imediat în anuarul aplicației."; },
      hideConfirm: function (s) { return "Ascunzi „" + s + "”? Dispare imediat din anuarul aplicației și de pe paginile proiectelor."; },
      managers: function (s) { return "Gestionată din aplicație de " + s + "."; },
      noManager: "Nimeni nu gestionează încă această fișă: un constructor o poate revendica din aplicație.",
      claimsLead: "Un membru cere să gestioneze o fișă sau propune una nouă. Verifică cine este (un apel, adresa de e-mail a firmei) înainte să aprobi.",
      noClaims: "Nicio revendicare în așteptare.",
      claims: function (s) { return "Revendică „" + s + "”"; }, proposes: function (s) { return "Propune o fișă nouă: „" + s + "”"; },
      openCard: "Deschide fișa", approve: "Aprobă", refuse: "Refuză",
      approveClaim: function (w, s) { return "Lași ca " + w + " să gestioneze „" + s + "”? Modificările vor aștepta în continuare aprobarea ta."; },
      editsLead: "Schimbări la o fișă publică, trimise din aplicație. Nimic nu apare înainte de aprobarea ta. Un număr RBQ nou șterge verificarea (verifică-l din nou); o dată nouă a asigurării contează ca verificată prin aprobarea ta.", noEdits: "Nicio modificare în așteptare.",
      field: "Câmp", now: "Acum", proposed: "Propus", empty: "(gol)", same: "Nimic nu s-ar schimba pe fișă.",
      approveEdit: function (s) { return "Publici aceste schimbări pe „" + s + "”? Membrii le văd imediat."; },
      filesLeft: "Proiect șters. PDF-urile ofertelor nu au putut fi șterse din stocare: șterge-le în Supabase (commons-bids).",
      note: "Notă pentru membru (opțional)", revoke: function (w) { return "Retrage accesul pentru " + w; },
      revokeConfirm: function (w, s) { return "Retragi accesul pentru " + w + " la „" + s + "”? Nu va mai putea face modificări; fișa rămâne."; },
      partLead: "Cine poartă, construiește și găzduiește acest proiect. Fiecare apare pe pagina proiectului în aplicație și își deschide fișa.",
      roles: { carrier: "Inițiator", builder: "Constructor", host: "Gazdă" },
      noParticipants: "Niciun participant încă.", card: "Fișă", role: "Rol", add: "Adaugă participantul",
      needCards: "Creează mai întâi o fișă (Constructori, la capătul listei).",
      bidsLead: "În timpul votului sau al strângerii de fonduri, constructorii verificați din regiune trimit un preț, un termen și un PDF. Doar tu alegi.",
      noBids: "Nicio ofertă încă.", builder: "Constructor", amount: "Sumă", delay: "Termen", received: "Primită", pdfCol: "PDF",
      days: function (s, n) { return n === 1 ? "1 zi" : s + roDe(n) + " zile"; },
      bidStatus: { submitted: "Trimisă", chosen: "Aleasă", declined: "Refuzată", withdrawn: "Retrasă" },
      pdf: "Deschide PDF-ul", pdfLink: "PDF (link privat, 5 min)", pdfFailed: "PDF-ul nu a putut fi deschis. Încearcă din nou.", noPdf: "Fără PDF",
      choose: "Alege", decline: "Refuză oferta",
      chooseConfirm: function (s, a) { return "Alegi oferta „" + s + "” (" + a + ")? " + s + " devine constructorul public al proiectului; un rând „Ofertă aleasă” (" + a + ") înlocuiește rândurile de echipament și instalare din buget, iar celelalte oferte ale proiectului sunt refuzate. Membrii văd imediat."; },
      declineConfirm: function (s) { return "Refuzi oferta „" + s + "”? Constructorul vede asta în aplicație."; },
      reasons: { closed: "Acest proiect nu mai poate alege: o ofertă este deja aleasă sau nu mai este în vot, în strângere de fonduri ori în construcție.", not_verified: "Acest constructor nu mai este verificat (RBQ și asigurare): verifică întâi fișa lui.", not_approved: "Fișa acestui constructor nu este publicată.",
                 not_submitted: "Această ofertă a fost deja decisă sau retrasă. Reîncarcă pagina.", not_pending: "Această cerere a fost deja decisă. Reîncarcă pagina.", builder_taken: "Acest proiect are deja un constructor: elimină-l întâi.", chosen_bid: "Constructorul ofertei alese rămâne.",
                 bad_rbq: "Un număr de licență RBQ are 10 cifre: 1234-5678-01.", bad_date: "Verifică data asigurării.", bad_note: "Nota este prea lungă (cel mult 300 de caractere).", not_found: "Nu mai este acolo. Reîncarcă pagina." }
    }
  };

  var api = { STRINGS: STRINGS, KINDS: KINDS, ROLES: ROLES, STATUSES: STATUSES, BID_STATUSES: BID_STATUSES, BADGES: BADGES, FIELDS: FIELDS,
              rbqOf: rbqOf, verified: verified, builderPayload: builderPayload, diff: diff, filterBuilders: filterBuilders, pdfPath: pdfPath };
  if (node) { module.exports = api; return; }

  /**
   * fontaine.js hands its kit K {A, T, lang, el, btn, field, picture, call, say, clear, money, nf, render, reload} and
   * draws what this returns: view(main) for its list's « Constructeurs » entry, participants(body, p) and bids(body, p)
   * as two tabs of a project; load() with its own load, pending() for the entry's line.
   */
  root.WNC_BUILDERS = function (K) {
    var A = K.A, lang = K.lang, T = STRINGS[lang] || STRINGS.en, FT = K.T, KT = (F.STRINGS[lang] || F.STRINGS.en).kinds;
    var el = K.el, btn = K.btn, field = K.field, clear = K.clear;
    var data = null, tab = "cards", openId = null, flt = { q: "", status: "", kind: "", region: "" }, bids = {};
    var dayFmt = new Intl.DateTimeFormat(lang, { day: "numeric", month: "long", year: "numeric" });
    // A day ("2027-06-30") reads as that day everywhere at noon UTC; a timestamp as the browser's day.
    function day(v) { var t = typeof v === "string" ? Date.parse(v.length === 10 ? v + "T12:00:00Z" : v) : NaN; return isFinite(t) ? dayFmt.format(new Date(t)) : ""; }
    function today() { var d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
    function rows(v, ok, key) { return Array.isArray(v) ? v.filter(function (x) { return x && typeof x[key || "id"] === "number" && (!ok || ok(x)); }) : []; }
    function byId(id) { return data ? data.builders.filter(function (b) { return b.id === id; })[0] || null : null; }
    function regions() {
      var seen = {};
      (data ? data.builders : []).forEach(function (b) { if (b.region) seen[b.region] = 1; });
      return Object.keys(seen).sort(new Intl.Collator(lang).compare);
    }
    function chip(cls, t) { return el("span", "chip " + cls, t); }
    function badges(list) {
      var w = el("span", "bc-badges");
      (Array.isArray(list) ? list : []).filter(function (k) { return BADGES.indexOf(k) >= 0; }).forEach(function (k) { w.appendChild(chip("bc-badge bc-" + k, T.badges[k])); });
      return w.firstChild ? w : null;
    }
    function go(next) { K.say(""); next(); K.render(); }
    async function again() { await load(); K.render(); }

    async function load() {
      try {
        var r = await A.rpc("commons_admin_builders", {});
        data = { builders: rows(r && r.builders, function (b) { return typeof b.name === "string" && STATUSES.indexOf(b.status) >= 0; }),
                 claims: rows(r && r.claims, null, "claim_id"), edits: rows(r && r.edits, null, "edit_id") };
      } catch (e) {
        if (e.status === 401) { A.lost(); return; }
        if (e.code === "WNMFA") { A.showMfa(); return; }
        data = { off: e.status === 404 ? T.unavailable : e.code === "42501" || e.status === 403 ? FT.forbidden : FT.refused, builders: [], claims: [], edits: [] };
      }
    }
    function pending() { return data && !data.off ? data.claims.length + data.edits.length : 0; }

    // ---- The « Constructeurs » entry: three tabs ----
    function view(main) {
      main.appendChild(el("p", "muted small bc-lead", T.lead));
      if (!data || data.off) { main.appendChild(el("p", "note", data ? data.off : T.loading)); return; }
      var tabs = el("div", "tabs fc-tabs");
      tabs.setAttribute("role", "group");
      [["cards", T.views.cards], ["claims", T.views.claims + (data.claims.length ? " (" + data.claims.length + ")" : "")],
       ["edits", T.views.edits + (data.edits.length ? " (" + data.edits.length + ")" : "")]].forEach(function (x) {
        var b = btn(tabs, x[1], "");
        b.setAttribute("aria-pressed", String(tab === x[0]));
        b.addEventListener("click", function () { go(function () { tab = x[0]; openId = null; }); });
      });
      main.appendChild(tabs);
      var body = el("div", "fc-body");
      ({ cards: cards, claims: claims, edits: edits })[tab](body);
      main.appendChild(body);
    }

    function cards(body) {
      var open = openId === "new" ? {} : openId != null ? byId(openId) : null;
      if (open) { editor(body, open); return; }
      var top = el("div", "fc-acts bc-top");
      btn(top, T.newCard).addEventListener("click", function () { go(function () { openId = "new"; }); });
      body.appendChild(top);
      var bar = el("div", "bc-filters");
      var q = field(bar, T.search, "search", flt.q, { maxlength: "60", spellcheck: "false" });
      var st = field(bar, T.fStatus, "select", flt.status, null, [["", T.all]].concat(STATUSES.map(function (s) { return [s, T.status[s]]; })));
      var kd = field(bar, T.fKind, "select", flt.kind, null, [["", T.all]].concat(KINDS.map(function (k) { return [k, KT[k]]; })));
      var rg = field(bar, T.fRegion, "select", flt.region, null, [["", T.all]].concat(regions().map(function (r) { return [r, r]; })));
      body.appendChild(bar);
      var list = el("div", "bc-list");
      body.appendChild(list);
      // Only the list redraws as the filters change: the search keeps its focus and what's typed.
      function draw() {
        clear(list);
        var shown = filterBuilders(data.builders, flt, lang);
        if (!shown.length) list.appendChild(el("p", "note", T.noCards));
        shown.forEach(function (b) {
          var r = btn(list, "", "fc-item bc-row"), head = el("span", "fc-item-top"), n = Number(b.fountains_count) || 0;
          head.appendChild(el("b", null, b.name));
          head.appendChild(chip("bc-" + b.status, T.status[b.status]));
          r.appendChild(head);
          r.appendChild(el("span", "muted small", [KT[b.kind], b.region, T.fountains(K.nf.format(n), n)].filter(Boolean).join(" · ")));
          var bs = badges(b.badges);
          if (bs) r.appendChild(bs);
          r.addEventListener("click", function () { go(function () { openId = b.id; }); });
        });
      }
      q.addEventListener("input", function () { flt.q = q.value; draw(); });
      [[st, "status"], [kd, "kind"], [rg, "region"]].forEach(function (x) { x[0].addEventListener("change", function () { flt[x[1]] = x[0].value; draw(); }); });
      draw();
    }

    // ---- A card: its public fields, then (once saved) the team's verification and its status ----
    function editor(body, b) {
      btn(body, T.back, "ghost small-btn bc-back").addEventListener("click", function () { go(function () { openId = null; }); });
      body.appendChild(el("h3", "bc-h", b.id != null ? b.name : T.newCard));
      var year = new Date().getFullYear(), g = el("div", "fc-cols");
      var name = field(g, T.name, "text", b.name || "", { maxlength: "120" });
      var kind = field(g, T.kind, "select", b.kind || "contractor", null, KINDS.map(function (k) { return [k, KT[k]]; }));
      var region = field(g, T.region, "text", b.region || "", { maxlength: "60", list: "bcRegions" });
      var dl = el("datalist");
      dl.id = "bcRegions"; // the regions already written: one spelling each, for the app's « par région »
      regions().forEach(function (r) { var o = el("option"); o.value = r; dl.appendChild(o); });
      g.appendChild(dl);
      var founded = field(g, T.founded, "number", b.founded != null ? String(b.founded) : "", { min: "1800", max: String(year), step: "1", inputmode: "numeric" });
      var site = field(g, T.website, "url", b.website || "", { spellcheck: "false", placeholder: "https://" });
      var logo = K.picture(g, T.logo, b.logo_url, "logos", function () { return name.value; });
      body.appendChild(g);
      var about = field(body, T.about, "textarea", b.about || "", { maxlength: "2000" });
      about.classList.add("fc-text");
      var acts = el("div", "fc-acts"), save = btn(acts, FT.save, "primary fc-save");
      body.appendChild(acts);
      save.addEventListener("click", async function () {
        var out = builderPayload({ id: b.id, name: name.value, kind: kind.value, region: region.value, founded: founded.value, website: site.value, about: about.value, logo_url: logo.value }, year);
        if (out.error) {
          var f = ({ name: [T.name, name], kind: [T.kind, kind], founded: [T.founded, founded], website: [T.website, site] })[out.error];
          K.say(FT.check(f[0]), "err"); f[1].focus(); return;
        }
        var r = await K.call("commons_admin_upsert_builder", { p: out.p }, save, T.reasons);
        if (r) { if (typeof r.id === "number") openId = r.id; await again(); }
      });
      if (b.id == null) return;
      verification(body, b);
      statusRow(body, b);
    }

    // The team checks the RBQ licence and the insurance: the « Vérifié » badge, previewed as the card will show it.
    function verification(body, b) {
      var box = el("div", "bc-box");
      box.appendChild(el("h3", "bc-h", T.verifyTitle));
      box.appendChild(el("p", "muted small", T.verifyNote));
      box.appendChild(el("p", "bc-state", b.rbq_verified_at ? (verified(b, today()) ? T.verifiedOn(day(b.rbq_verified_at)) : T.expired(day(b.insurance_until))) : T.notVerified));
      var g = el("div", "fc-cols");
      var rbq = field(g, T.rbq, "text", b.rbq_number || "", { inputmode: "numeric", maxlength: "14", placeholder: "1234-5678-01", spellcheck: "false", autocomplete: "off" });
      var ins = field(g, T.insurance, "date", typeof b.insurance_until === "string" ? b.insurance_until.slice(0, 10) : "");
      box.appendChild(g);
      var prev = el("p", "bc-preview");
      box.appendChild(prev);
      function draw() {
        clear(prev);
        prev.appendChild(el("span", "muted small", T.preview));
        prev.appendChild(verified({ rbq_number: rbq.value, rbq_verified_at: "now", insurance_until: ins.value }, today())
          ? chip("bc-badge bc-verified", T.badges.verified) : el("span", "muted small", T.noBadge));
      }
      rbq.addEventListener("input", draw);
      ins.addEventListener("input", draw);
      ins.addEventListener("change", draw);
      draw();
      var acts = el("div", "fc-acts"), ok = btn(acts, T.verify, "primary fc-save small-btn");
      ok.addEventListener("click", async function () {
        var n = rbqOf(rbq.value);
        if (!n) { K.say(T.badRbq, "err"); rbq.focus(); return; }
        if (!(ins.value >= today())) { K.say(FT.check(T.insurance), "err"); ins.focus(); return; }
        // Section 92: the check is the upsert's rbq_verified (true: verified now, by this admin).
        if (await K.call("commons_admin_upsert_builder", { p: { id: b.id, rbq_number: n, insurance_until: ins.value, rbq_verified: true } }, ok, T.reasons)) await again();
      });
      if (b.rbq_verified_at) {
        var off = btn(acts, T.unverify, "ghost small-btn fc-danger");
        off.addEventListener("click", async function () {
          if (await K.call("commons_admin_upsert_builder", { p: { id: b.id, rbq_verified: false } }, off, T.reasons)) await again();
        });
      }
      box.appendChild(acts);
      body.appendChild(box);
    }

    // Published or hidden (a draft or a proposed card goes public once published), and who manages it from the app: an
    // approved claim each, revoked by refusing it (commons_admin_builder_decide).
    function statusRow(body, b) {
      var row = el("div", "fc-step bc-status"), info = el("div", "bc-status-info");
      info.appendChild(chip("bc-" + b.status, T.status[b.status]));
      var ms = (Array.isArray(b.managers) ? b.managers : []).filter(function (m) { return m && m.status === "approved" && typeof m.claim_id === "number"; });
      info.appendChild(el("p", "muted small", ms.length ? T.managers(ms.map(function (m) { return m.name || "—"; }).join(", ")) : T.noManager));
      ms.forEach(function (m) {
        var rv = btn(info, T.revoke(m.name || "—"), "ghost small-btn fc-danger");
        rv.addEventListener("click", function () { decide("claim", m.claim_id, false, rv, null, T.revokeConfirm(m.name || "—", b.name)); });
      });
      row.appendChild(info);
      var next = b.status === "approved" ? "hidden" : "approved";
      var act = btn(row, b.status === "approved" ? T.hide : b.status === "hidden" ? T.show : T.publish, next === "hidden" ? "ghost fc-danger" : "primary fc-save");
      act.addEventListener("click", async function () {
        if (!root.confirm((next === "hidden" ? T.hideConfirm : T.publishConfirm)(b.name))) return;
        if (await K.call("commons_admin_upsert_builder", { p: { id: b.id, status: next } }, act, T.reasons)) await again();
      });
      body.appendChild(row);
    }

    // A claim or an edit approved or refused, with the note the member reads (300 characters at most); [ask]: a confirmation first.
    async function decide(kind, id, yes, b, note, ask) {
      if (ask && !root.confirm(ask)) return;
      var n = note ? note.value.trim().slice(0, 300) : "";
      if (await K.call("commons_admin_builder_decide", { p_kind: kind, p_id: id, p_approve: yes, p_note: n || null }, b, T.reasons)) await again();
    }
    function verdict(item, kind, id, ask) {
      var note = field(item, T.note, "text", "", { maxlength: "300" });
      var acts = el("div", "fc-acts");
      var yes = btn(acts, T.approve, "primary fc-save small-btn"), no = btn(acts, T.refuse, "ghost small-btn fc-danger");
      yes.addEventListener("click", function () { decide(kind, id, true, yes, note, ask); });
      no.addEventListener("click", function () { decide(kind, id, false, no, note, null); });
      item.appendChild(acts);
      return acts;
    }

    // ---- Claims: a member asks to manage a card (or proposed a new one: builder_status « pending ») ----
    function claims(body) {
      body.appendChild(el("p", "muted small", T.claimsLead));
      if (!data.claims.length) { body.appendChild(el("p", "note", T.noClaims)); return; }
      data.claims.forEach(function (c) {
        var b = byId(c.builder_id), nm = c.builder_name || (b && b.name) || "—", who = c.name || "—";
        var item = el("div", "bc-item");
        item.appendChild(el("b", "bc-item-title", c.builder_status === "pending" ? T.proposes(nm) : T.claims(nm)));
        item.appendChild(el("p", "muted small", [c.name, day(c.at)].filter(Boolean).join(" · ")));
        if (b) item.appendChild(el("p", "small", [KT[b.kind], b.region, b.website, b.rbq_number && "RBQ " + b.rbq_number].filter(Boolean).join(" · ")));
        var acts = verdict(item, "claim", c.claim_id, T.approveClaim(who, nm));
        if (b) btn(acts, T.openCard, "ghost small-btn").addEventListener("click", function () { go(function () { tab = "cards"; openId = b.id; }); });
        body.appendChild(item);
      });
    }

    // ---- Edits: each pending change as a diff against the published card ----
    var LABEL = { name: "name", kind: "kind", region: "region", founded: "founded", website: "website", about: "about", logo_url: "logo", rbq_number: "rbq", insurance_until: "insurance" };
    function shown(k, v) {
      if (v == null || String(v).trim() === "") return T.empty;
      return k === "kind" ? KT[v] || String(v) : k === "insurance_until" ? day(String(v).slice(0, 10)) || String(v) : String(v);
    }
    function edits(body) {
      body.appendChild(el("p", "muted small", T.editsLead));
      if (!data.edits.length) { body.appendChild(el("p", "note", T.noEdits)); return; }
      data.edits.forEach(function (e) {
        var b = byId(e.builder_id), nm = (b && b.name) || e.builder_name || "—", d = diff(b, e.changes);
        var item = el("div", "bc-item");
        item.appendChild(el("b", "bc-item-title", nm));
        item.appendChild(el("p", "muted small", [e.name, day(e.at)].filter(Boolean).join(" · ")));
        if (!d.length) item.appendChild(el("p", "note", T.same));
        else {
          var t = el("table", "bc-diff"), hr = el("tr");
          [T.field, T.now, T.proposed].forEach(function (h) { var th = el("th", null, h); th.scope = "col"; hr.appendChild(th); });
          var thead = el("thead"); thead.appendChild(hr); t.appendChild(thead);
          var tb = el("tbody");
          d.forEach(function (x) {
            var tr = el("tr"), th = el("th", null, T[LABEL[x.key]]), was = el("td"), now = el("td"), url = x.key === "logo_url" ? " fc-url" : "";
            th.scope = "row";
            was.appendChild(el(x.from == null || String(x.from).trim() === "" ? "span" : "del", "bc-was" + url, shown(x.key, x.from)));
            now.appendChild(el("ins", "bc-new" + url, shown(x.key, x.to)));
            tr.appendChild(th); tr.appendChild(was); tr.appendChild(now);
            tb.appendChild(tr);
          });
          t.appendChild(tb);
          var wrap = el("div", "fc-scroll");
          wrap.appendChild(t);
          item.appendChild(wrap);
        }
        verdict(item, "edit", e.edit_id, T.approveEdit(nm));
        body.appendChild(item);
      });
    }

    // ---- A project's participants: carrier, builder, host (commons_admin_list sends them with each project) ----
    function participants(body, p) {
      body.appendChild(el("p", "muted small", T.partLead));
      if (!data || data.off) { body.appendChild(el("p", "note", data ? data.off : T.loading)); return; }
      var ps = (Array.isArray(p.participants) ? p.participants : []).filter(function (x) { return x && typeof x.builder_id === "number" && ROLES.indexOf(x.role) >= 0; })
        .sort(function (a, c) { return ROLES.indexOf(a.role) - ROLES.indexOf(c.role); });
      if (!ps.length) body.appendChild(el("p", "note", T.noParticipants));
      else {
        var ul = el("ul", "fc-sponsors bc-parts");
        ps.forEach(function (x) {
          var b = byId(x.builder_id), li = el("li");
          li.appendChild(chip("bc-role", T.roles[x.role]));
          li.appendChild(el("b", null, x.name || (b && b.name) || "—"));
          var kind = x.kind || (b && b.kind);
          if (kind && KT[kind]) li.appendChild(el("span", "muted small", KT[kind]));
          var st = x.status || (b && b.status); // commons_admin_list sends the card's status; the app shows approved cards only
          if (STATUSES.indexOf(st) >= 0 && st !== "approved") li.appendChild(chip("bc-" + st, T.status[st]));
          var rm = btn(li, FT.remove, "ghost small-btn");
          rm.addEventListener("click", async function () {
            if (await K.call("commons_admin_set_participant", { p_project: p.id, p_builder: x.builder_id, p_role: x.role, p_remove: true }, rm, T.reasons)) await K.reload(p.id);
          });
          ul.appendChild(li);
        });
        body.appendChild(ul);
      }
      var choices = data.builders.filter(function (b) { return b.status !== "hidden"; }).sort(function (a, c) { return a.name.localeCompare(c.name, lang); });
      if (!choices.length) { body.appendChild(el("p", "note", T.needCards)); return; }
      var g = el("div", "fc-cols");
      var who = field(g, T.card, "select", "", null, choices.map(function (b) {
        return [String(b.id), [b.name, KT[b.kind], b.status !== "approved" ? T.status[b.status] : ""].filter(Boolean).join(" · ")];
      }));
      var role = field(g, T.role, "select", "builder", null, ROLES.map(function (r) { return [r, T.roles[r]]; }));
      body.appendChild(g);
      var acts = el("div", "fc-acts"), add = btn(acts, T.add, "primary fc-save");
      body.appendChild(acts);
      add.addEventListener("click", async function () {
        if (await K.call("commons_admin_set_participant", { p_project: p.id, p_builder: Number(who.value), p_role: role.value, p_remove: false }, add, T.reasons)) await K.reload(p.id);
      });
    }

    // ---- A project's bids: read when the tab opens, the PDF through a signed link, « Choisir » or « Décliner » ----
    async function fetchBids(pid) {
      try {
        var r = await A.rpc("commons_admin_bids", { p_project: pid });
        bids[pid] = rows(Array.isArray(r) ? r : r && r.bids, function (x) { return BID_STATUSES.indexOf(x.status) >= 0; });
      } catch (e) {
        if (e.status === 401) { A.lost(); return; }
        if (e.code === "WNMFA") { delete bids[pid]; A.showMfa(); return; }
        bids[pid] = e.status === 404 ? T.unavailable : e.code === "42501" || e.status === 403 ? FT.forbidden : FT.refused;
      }
      K.render();
    }
    function bidsTab(body, p) {
      body.appendChild(el("p", "muted small", T.bidsLead));
      if (!(p.id in bids)) { bids[p.id] = null; fetchBids(p.id); }
      var list = bids[p.id];
      if (!Array.isArray(list)) { body.appendChild(el("p", "note", list || T.loading)); return; }
      if (!list.length) { body.appendChild(el("p", "note", T.noBids)); return; }
      var chosen = list.some(function (x) { return x.status === "chosen"; });
      var t = el("table", "fc-don bc-bids"), hr = el("tr"), thead = el("thead"), tb = el("tbody");
      var heads = [T.builder, T.amount, T.delay, T.fStatus, T.received, T.pdfCol, ""];
      heads.forEach(function (h, i) { var th = el("th", i === 1 || i === 2 ? "n" : null, h); th.scope = "col"; hr.appendChild(th); });
      thead.appendChild(hr); t.appendChild(thead);
      // Each cell carries its column's name: a phone shows the rows stacked, with the names (builders.css).
      function td(tr, i, cls, text) { var c = el("td", cls, text); if (heads[i]) c.setAttribute("data-label", heads[i]); tr.appendChild(c); return c; }
      list.forEach(function (x) {
        var b = byId(x.builder_id), nm = x.builder_name || (b && b.name) || "—", tr = el("tr", x.status === "declined" || x.status === "withdrawn" ? "is-refunded" : null);
        var who = td(tr, 0, "bc-who");
        who.appendChild(el("b", null, nm));
        if (x.region) who.appendChild(el("span", "muted small", x.region)); // shown, never enforced (section 92)
        if (x.verified === true || (x.verified == null && b && verified(b, today()))) who.appendChild(chip("bc-badge bc-verified", T.badges.verified));
        td(tr, 1, "n", K.money(Number(x.amount_cents) || 0));
        td(tr, 2, "n", T.days(K.nf.format(Number(x.delay_days) || 0), Number(x.delay_days) || 0));
        td(tr, 3).appendChild(chip("bc-bid-" + x.status, T.bidStatus[x.status]));
        td(tr, 4, "muted small", day(x.at));
        var pc = td(tr, 5), path = pdfPath(x.pdf_path);
        if (!path) pc.appendChild(el("span", "muted small", T.noPdf));
        else {
          var pb = btn(pc, T.pdf, "ghost small-btn");
          pb.addEventListener("click", async function () {
            if (pb.getAttribute("aria-disabled") === "true") return;
            pb.setAttribute("aria-disabled", "true");
            try {
              var a = el("a", "ghost small-btn bc-pdf", T.pdfLink);
              a.href = await A.signed(path, 300); // the private bucket: a link for 5 minutes, signed for this admin
              a.target = "_blank";
              a.rel = "noopener noreferrer";
              pc.replaceChild(a, pb);
              a.click();
            } catch (e) {
              if (e.status === 401) { A.lost(); return; }
              K.say(T.pdfFailed, "err");
            } finally { pb.removeAttribute("aria-disabled"); }
          });
        }
        var act = td(tr, 6, "bc-acts");
        if (x.status === "submitted") {
          if (!chosen) {
            var yes = btn(act, T.choose, "primary fc-save small-btn");
            yes.addEventListener("click", async function () {
              if (!root.confirm(T.chooseConfirm(nm, K.money(Number(x.amount_cents) || 0)))) return;
              if (await K.call("commons_admin_choose_bid", { p_bid: x.id }, yes, T.reasons)) { delete bids[p.id]; await K.reload(p.id); }
            });
          }
          var no = btn(act, T.decline, "ghost small-btn fc-danger");
          no.addEventListener("click", async function () {
            if (!root.confirm(T.declineConfirm(nm))) return;
            if (await K.call("commons_admin_decline_bid", { p_bid: x.id }, no, T.reasons)) { delete bids[p.id]; K.render(); }
          });
        }
        tb.appendChild(tr);
      });
      t.appendChild(tb);
      var wrap = el("div", "fc-scroll");
      wrap.appendChild(t);
      body.appendChild(wrap);
    }

    return { T: T, load: load, pending: pending, view: view, participants: participants, bids: bidsTab };
  };
})(this);

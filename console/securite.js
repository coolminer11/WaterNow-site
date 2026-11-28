/*
 * WaterNow Statistics, private console: « Sécurité » for admins (the shield, sections 101-102,
 * docs/migrations/2026-11-24_bouclier_core.sql and _content.sql).
 * The threat level (global and per zone) and its history, the signature setting, the shield's active answers with their
 * reasons and an Undo, the queue of held content (approve / reject), rollback of a member's or a place's changes, the
 * nightly campaigns (neutralize / dismiss), the highest scores and the logs' integrity check. Admin holding « switches »
 * (Emergency switches) in an aal2 session, checked by the server; every write lands in admin_log and the action chain.
 * The session and calls are console.js's (window.WNCAPP). Text through textContent only. Pure helpers shared with the
 * node test (module.exports).
 */
(function (root) {
  "use strict";
  var node = typeof module === "object" && module.exports;
  var ISO = /^\d{4}-\d{2}-\d{2}T/, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var ENTITIES = ["user", "device", "ip", "asn", "cell", "key", "global", "zone", "spot", "held", "campaign", "action"];
  var ACTIONS = ["slow", "challenge", "summary", "mirror", "block", "pending", "shadow", "pause", "feature_off", "level", "enforce",
                 "undo", "rollback", "approve", "reject", "note"];
  var KINDS = ["spot", "spot_edit", "review", "photo", "check", "report", "closure", "idea", "suggestion"];
  var HOLDS = ["shadow", "pending", "delay"];
  var MODES = ["off", "log", "writes", "all"];
  var CAMPAIGNS = ["shared_device", "network_swarm", "risky_cluster", "scraper", "account_cluster"];
  var CSTATUS = ["open", "neutralized", "dismissed"];

  function when(v) { return typeof v === "string" && ISO.test(v) && !isNaN(Date.parse(v)) ? v : null; }
  function int(v, lo, hi) { return typeof v === "number" && Number.isSafeInteger(v) && v >= lo && v <= hi ? v : null; }
  function str(v, max) { return typeof v === "string" ? v.slice(0, max) : ""; }
  /** A whole number typed in a field, within [lo, hi], or null. */
  function intIn(text, lo, hi) {
    var s = String(text == null ? "" : text).trim();
    return /^\d{1,7}$/.test(s) ? int(Number(s), lo, hi) : null;
  }
  function uuid(text) { var s = String(text == null ? "" : text).trim().toLowerCase(); return UUID.test(s) ? s : null; }
  /** A place id typed in a field (13 digits at most), or null. */
  function pointId(text) { var s = String(text == null ? "" : text).trim(); return /^\d{1,16}$/.test(s) && Number.isSafeInteger(Number(s)) ? Number(s) : null; }

  /** Why the shield acted, in a few words: the rule ("why"), a score, the first reason. */
  function reasonText(r) {
    if (!r || typeof r !== "object") return "";
    var bits = [];
    if (typeof r.why === "string") bits.push(r.why.slice(0, 40));
    if (typeof r.score === "number") bits.push(String(Math.round(r.score)));
    if (typeof r.level === "number") bits.push("L" + r.level);
    if (typeof r.mode === "string") bits.push(r.mode.slice(0, 10));
    if (Array.isArray(r.top) && r.top[0] && typeof r.top[0].k === "string") bits.push(r.top[0].k.slice(0, 40));
    if (typeof r.campaign === "number") bits.push("#" + r.campaign);
    return bits.join(" · ");
  }

  function action(a) {
    if (!a || !Number.isSafeInteger(a.id) || ENTITIES.indexOf(a.entity_type) < 0 || ACTIONS.indexOf(a.action) < 0) return null;
    return { id: a.id, entity: a.entity_type, entityId: str(a.entity_id, 64), action: a.action, reason: reasonText(a.reason),
             created_at: when(a.created_at), expires_at: when(a.expires_at),
             by: a.created_by === "shield" ? "shield" : "admin", undone: !!when(a.undone_at) };
  }

  /** sec_admin_status's answer, cleaned (anything malformed dropped). */
  function status(o) {
    o = o && typeof o === "object" ? o : {};
    var zones = [];
    if (o.zone_levels && typeof o.zone_levels === "object") {
      Object.keys(o.zone_levels).forEach(function (k) {
        var z = o.zone_levels[k];
        if (/^z\d{1,7}$/.test(k) && z && int(z.level, 0, 4) != null) zones.push({ zone: k, level: z.level, until: when(z.until) });
      });
    }
    return {
      level: int(o.level, 0, 4) == null ? 0 : o.level,
      until: when(o.level_until),
      zones: zones,
      enforce: MODES.indexOf(o.enforce_signatures) >= 0 ? o.enforce_signatures : "log",
      setting: MODES.indexOf(o.enforce_setting) >= 0 ? o.enforce_setting : (MODES.indexOf(o.enforce_signatures) >= 0 ? o.enforce_signatures : "log"),
      share: typeof o.signed_share === "number" && o.signed_share >= 0 && o.signed_share <= 1 ? Math.round(o.signed_share * 100) : null,
      actions: (Array.isArray(o.active_actions) ? o.active_actions : []).map(action).filter(Boolean),
      history: (Array.isArray(o.history) ? o.history : []).map(action).filter(Boolean),
      pending: (Array.isArray(o.pending) ? o.pending : []).filter(function (p) {
        return p && Number.isSafeInteger(p.id) && KINDS.indexOf(p.kind) >= 0 && HOLDS.indexOf(p.hold) >= 0;
      }).map(function (p) {
        return { id: p.id, kind: p.kind, hold: p.hold, user: UUID.test(p.user_id || "") ? p.user_id : null, created_at: when(p.created_at),
                 summary: str(p.summary, 120) };
      }),
      campaigns: (Array.isArray(o.campaigns) ? o.campaigns : []).filter(function (c) {
        return c && Number.isSafeInteger(c.id) && CAMPAIGNS.indexOf(c.kind) >= 0 && CSTATUS.indexOf(c.status) >= 0;
      }).map(function (c) {
        var ev = c.evidence && typeof c.evidence === "object" ? c.evidence : {};
        return { id: c.id, kind: c.kind, status: c.status, size: int(c.size, 0, 1e6) || 0, first_at: when(c.first_at), last_at: when(c.last_at),
                 events: int(ev.events, 0, 1e9) || 0 };
      }),
      geo: (o.options && Array.isArray(o.options.geo_block) ? o.options.geo_block : []).filter(function (c) { return typeof c === "string" && /^[A-Z]{2}$/.test(c); }),
      risk: (Array.isArray(o.risk_top) ? o.risk_top : []).filter(function (r) {
        return r && ["user", "device", "ip", "asn", "cell"].indexOf(r.type) >= 0 && int(r.score, 0, 100) != null;
      }).map(function (r) {
        return { type: r.type, id: str(r.id, 64), score: r.score,
                 why: Array.isArray(r.reasons) && r.reasons[0] && typeof r.reasons[0].k === "string" ? r.reasons[0].k.slice(0, 40) : "" };
      })
    };
  }

  /** The tone of a level's chip. */
  function tone(level) { return level >= 3 ? "bad" : level === 2 ? "warn" : level === 1 ? "watch" : "ok"; }
  /** Undo makes sense for the answers still in force (never for decisions, notes, undos). */
  function undoable(a) { return !a.undone && ["undo", "note", "rollback", "approve", "reject"].indexOf(a.action) < 0; }

  // The console's 7 languages (docs/translations-glossary.md): French says "tu", Romanian writes ș ț, Japanese never あなた.
  var STRINGS = {
    en: {
      colon: ": ", title: "Security (Bouclier)", lead: "The shield watches for attacks and answers by itself; every answer expires and can be undone here. It can pause admins too (an hour at most, the owner told); every change here asks a fresh code.",
      unavailable: "The shield isn't on the server yet (sections 101-102).", forbidden: "This account can't manage security (it needs Emergency switches).",
      refused: "The server refused this change.", done: "Done.", level: "Threat level", untilT: function (t) { return "until " + t; }, noUntil: "until changed",
      levels: { 0: "Calm", 1: "Watch", 2: "Alert", 3: "Attack", 4: "Siege" },
      levelHelp: { 0: "Nothing unusual.", 1: "Logged and summarized.", 2: "Tighter limits for new accounts, SMS off, anti-robot challenge.",
                   3: "New accounts read-only; writes of low-trust accounts wait for review.", 4: "The whole app read-only except admins; sign-ups closed." },
      zones: "Zones", setLevel: "Set the level", minutes: "Minutes (0 = until changed)", apply: "Apply",
      confirmSiege: "Siege: the whole app becomes read-only for everyone but admins. Continue?",
      enforcement: "Signatures", modes: { off: "Off", log: "Log only", writes: "Required for writes", all: "Required everywhere" },
      enforceHelp: "Old app versions never sign: keep « Log only » until the minimum version signs.",
      share: function (p) { return p + " % of the last day's writes were signed"; }, confirmEnforce: "App versions that don't sign won't be able to write. Continue?",
      history: "History (30 days)", actions: "Active answers", noActions: "No active answer.", undo: "Undo",
      by: { shield: "by the shield", admin: "by an admin" }, ends: function (t) { return "ends " + t; },
      entities: { user: "Member", device: "Phone", ip: "Network", asn: "Provider", cell: "Area", key: "Key", global: "Everywhere", zone: "Zone",
                  spot: "Place", held: "Held item", campaign: "Campaign", action: "Answer" },
      names: { slow: "Slowed down", challenge: "Anti-robot challenge", summary: "Summary data only", mirror: "Mirror (fake data)", block: "Blocked",
               pending: "Writes held", shadow: "Shadow mode", pause: "Paused", feature_off: "Feature off", level: "Level", enforce: "Signatures",
               undo: "Undo", rollback: "Rollback", approve: "Approved", reject: "Rejected", note: "Note" },
      pending: "Waiting for review", noPending: "Nothing waiting.", approve: "Approve", reject: "Reject",
      kinds: { spot: "New place", spot_edit: "Place edit", review: "Review", photo: "Photo", check: "Check", report: "Report",
               closure: "Road works report", idea: "Idea", suggestion: "Correction" },
      holds: { shadow: "Shadow", pending: "Pending", delay: "Delayed" },
      rollback: "Roll back", rollbackLead: "Reverts changes to places while nobody changed them since; conflicts are reported, never overwritten.",
      member: "Member id", point: "Place id", hours: "Hours (1-720)", rollbackMember: "Roll back the member", rollbackPoint: "Roll back the place",
      confirmRollback: "Revert these changes?", rolled: function (n, c) { return n + " changes reverted, " + c + " conflicts"; },
      badInput: "Check the fields.", campaigns: "Campaigns", noCampaigns: "No campaign in 30 days.", neutralize: "Neutralize", dismiss: "Dismiss",
      confirmNeutralize: "Shadow these accounts and block their network or phone for 72 h? Each answer can be undone.",
      ckinds: { shared_device: "One phone, several accounts", network_swarm: "New accounts behind one network", risky_cluster: "Risky accounts together",
                scraper: "Scraper", account_cluster: "Tight cluster of new accounts" },
      cstatus: { open: "Open", neutralized: "Neutralized", dismissed: "Dismissed" }, size: function (n) { return n + " accounts"; },
      risk: "Highest scores", noRisk: "No notable score.", chain: "Check the logs' integrity", chainOk: "Both logs are intact.", chainBad: "A log was altered: tell the owner.",
      fresh: "Enter a fresh code from your authenticator app to confirm this change.", freshGo: "Confirm", freshWrong: "Wrong or expired code.",
      geo: "Forbidden countries", geoLead: "Two-letter codes, separated by commas. Hong Kong (HK), Macau (MO) and Taiwan (TW) are not in the default list (KP, RU, CN).",
      geoSave: "Save the list", geoNone: "none",
      reveal: "Reveal an identity", revealLead: "E-mails and names are kept encrypted and shown masked. Each reveal is logged and the owner is told: write why.",
      revealKinds: { partner_email: "Partner e-mail (partner id)", event_name: "Registration name (registration id)", donor_name: "Donor name (donation id)", member_email: "Member e-mail (member id)" },
      revealRef: "Id", revealReason: "Reason (10 characters or more)", revealGo: "Reveal",
      breakGlass: "Break-glass: lift every action on my account", breakDone: function (n) { return n + " action(s) lifted."; }
    },
    fr: {
      colon: " : ", title: "Sécurité (Bouclier)", lead: "Le bouclier guette les attaques et répond tout seul ; chaque réponse expire et s'annule ici. Il peut aussi mettre un admin en pause (une heure au plus, le propriétaire prévenu) ; chaque changement ici demande un code frais.",
      unavailable: "Le bouclier n'est pas encore sur le serveur (sections 101-102).", forbidden: "Ce compte ne peut pas gérer la sécurité (il faut « Interrupteurs d'urgence »).",
      refused: "Le serveur a refusé cette modification.", done: "C'est fait.", level: "Niveau de menace", untilT: function (t) { return "jusqu'au " + t; }, noUntil: "jusqu'à nouvel ordre",
      levels: { 0: "Calme", 1: "Attention", 2: "Alerte", 3: "Attaque", 4: "Siège" },
      levelHelp: { 0: "Rien d'inhabituel.", 1: "Journal et résumé.", 2: "Limites resserrées pour les nouveaux comptes, SMS coupés, défi anti-robot.",
                   3: "Nouveaux comptes en lecture seule ; écritures des comptes peu fiables en attente.", 4: "Toute l'app en lecture seule sauf les admins ; inscriptions fermées." },
      zones: "Zones", setLevel: "Changer le niveau", minutes: "Minutes (0 = jusqu'à nouvel ordre)", apply: "Appliquer",
      confirmSiege: "Siège : toute l'app passe en lecture seule, sauf pour les admins. Continuer ?",
      enforcement: "Signatures", modes: { off: "Coupées", log: "Journal seulement", writes: "Exigées pour écrire", all: "Exigées partout" },
      enforceHelp: "Les anciennes versions de l'app ne signent pas : garde « Journal seulement » jusqu'à ce que la version minimale signe.",
      share: function (p) { return p + " % des écritures du dernier jour étaient signées"; }, confirmEnforce: "Les versions de l'app qui ne signent pas ne pourront plus écrire. Continuer ?",
      history: "Historique (30 jours)", actions: "Réponses actives", noActions: "Aucune réponse active.", undo: "Annuler",
      by: { shield: "par le bouclier", admin: "par un admin" }, ends: function (t) { return "fin " + t; },
      entities: { user: "Membre", device: "Téléphone", ip: "Réseau", asn: "Fournisseur", cell: "Secteur", key: "Clé", global: "Partout", zone: "Zone",
                  spot: "Lieu", held: "Contenu retenu", campaign: "Campagne", action: "Réponse" },
      names: { slow: "Ralenti", challenge: "Défi anti-robot", summary: "Données résumées", mirror: "Miroir (fausses données)", block: "Bloqué",
               pending: "Écritures en attente", shadow: "Mode ombre", pause: "En pause", feature_off: "Fonction coupée", level: "Niveau", enforce: "Signatures",
               undo: "Annulation", rollback: "Retour arrière", approve: "Approuvé", reject: "Refusé", note: "Note" },
      pending: "En attente de vérification", noPending: "Rien en attente.", approve: "Approuver", reject: "Refuser",
      kinds: { spot: "Nouveau lieu", spot_edit: "Modification d'un lieu", review: "Avis", photo: "Photo", check: "Vérification", report: "Signalement",
               closure: "Signalement de travaux", idea: "Idée", suggestion: "Correction" },
      holds: { shadow: "Ombre", pending: "En attente", delay: "Différé" },
      rollback: "Retour arrière", rollbackLead: "Annule les modifications de lieux tant que personne ne les a changés depuis ; les conflits sont signalés, jamais écrasés.",
      member: "Identifiant du membre", point: "Identifiant du lieu", hours: "Heures (1-720)", rollbackMember: "Annuler ce membre", rollbackPoint: "Annuler ce lieu",
      confirmRollback: "Annuler ces modifications ?", rolled: function (n, c) { return n + " modifications annulées, " + c + " conflits"; },
      badInput: "Vérifie les champs.", campaigns: "Campagnes", noCampaigns: "Aucune campagne en 30 jours.", neutralize: "Neutraliser", dismiss: "Écarter",
      confirmNeutralize: "Passer ces comptes en mode ombre et bloquer leur réseau ou leur téléphone 72 h ? Chaque réponse s'annule.",
      ckinds: { shared_device: "Un téléphone, plusieurs comptes", network_swarm: "Nouveaux comptes derrière un même réseau", risky_cluster: "Comptes à risque ensemble",
                scraper: "Aspirateur de données", account_cluster: "Groupe serré de nouveaux comptes" },
      cstatus: { open: "Ouverte", neutralized: "Neutralisée", dismissed: "Écartée" }, size: function (n) { return n + " comptes"; },
      risk: "Scores les plus hauts", noRisk: "Aucun score notable.", chain: "Vérifier l'intégrité des journaux", chainOk: "Les deux journaux sont intacts.",
      chainBad: "Un journal a été modifié : préviens le propriétaire.",
      fresh: "Entre un code frais de ton app d'authentification pour confirmer ce changement.", freshGo: "Confirmer", freshWrong: "Code erroné ou expiré.",
      geo: "Pays interdits", geoLead: "Codes de deux lettres, séparés par des virgules. Hong Kong (HK), Macao (MO) et Taïwan (TW) ne sont pas dans la liste par défaut (KP, RU, CN).",
      geoSave: "Enregistrer la liste", geoNone: "aucun",
      reveal: "Révéler une identité", revealLead: "Les courriels et les noms sont gardés chiffrés et affichés masqués. Chaque révélation est journalisée et le propriétaire est prévenu : écris pourquoi.",
      revealKinds: { partner_email: "Courriel d'un partenaire (n° du partenaire)", event_name: "Nom d'une inscription (n° de l'inscription)", donor_name: "Nom d'un donateur (n° du don)", member_email: "Courriel d'un membre (id du membre)" },
      revealRef: "N°", revealReason: "Raison (10 caractères ou plus)", revealGo: "Révéler",
      breakGlass: "Bris de glace : lever toutes les actions sur mon compte", breakDone: function (n) { return n + " action(s) levée(s)."; }
    },
    es: {
      colon: ": ", title: "Seguridad (Bouclier)", lead: "El escudo vigila los ataques y responde solo; cada respuesta caduca y se puede deshacer aquí. También puede pausar a un administrador (una hora como máximo, con aviso al propietario); cada cambio aquí pide un código nuevo.",
      unavailable: "El escudo aún no está en el servidor (secciones 101-102).", forbidden: "Esta cuenta no puede gestionar la seguridad (necesita «Interruptores de emergencia»).",
      refused: "El servidor rechazó este cambio.", done: "Hecho.", level: "Nivel de amenaza", untilT: function (t) { return "hasta " + t; }, noUntil: "hasta nuevo aviso",
      levels: { 0: "Calma", 1: "Atención", 2: "Alerta", 3: "Ataque", 4: "Asedio" },
      levelHelp: { 0: "Nada inusual.", 1: "Registro y resumen.", 2: "Límites más estrictos para cuentas nuevas, SMS cortados, desafío antirrobot.",
                   3: "Cuentas nuevas en solo lectura; las escrituras de cuentas poco fiables esperan revisión.", 4: "Toda la app en solo lectura salvo los administradores; registros cerrados." },
      zones: "Zonas", setLevel: "Cambiar el nivel", minutes: "Minutos (0 = hasta nuevo aviso)", apply: "Aplicar",
      confirmSiege: "Asedio: toda la app pasa a solo lectura, salvo para los administradores. ¿Continuar?",
      enforcement: "Firmas", modes: { off: "Desactivadas", log: "Solo registro", writes: "Exigidas para escribir", all: "Exigidas en todo" },
      enforceHelp: "Las versiones antiguas de la app no firman: deja «Solo registro» hasta que la versión mínima firme.",
      share: function (p) { return "el " + p + " % de las escrituras del último día estaban firmadas"; }, confirmEnforce: "Las versiones de la app que no firman ya no podrán escribir. ¿Continuar?",
      history: "Historial (30 días)", actions: "Respuestas activas", noActions: "Ninguna respuesta activa.", undo: "Deshacer",
      by: { shield: "por el escudo", admin: "por un administrador" }, ends: function (t) { return "termina " + t; },
      entities: { user: "Miembro", device: "Teléfono", ip: "Red", asn: "Proveedor", cell: "Área", key: "Clave", global: "En todas partes", zone: "Zona",
                  spot: "Lugar", held: "Contenido retenido", campaign: "Campaña", action: "Respuesta" },
      names: { slow: "Ralentizado", challenge: "Desafío antirrobot", summary: "Solo datos resumidos", mirror: "Espejo (datos falsos)", block: "Bloqueado",
               pending: "Escrituras en espera", shadow: "Modo sombra", pause: "En pausa", feature_off: "Función cortada", level: "Nivel", enforce: "Firmas",
               undo: "Deshecho", rollback: "Reversión", approve: "Aprobado", reject: "Rechazado", note: "Nota" },
      pending: "En espera de revisión", noPending: "Nada en espera.", approve: "Aprobar", reject: "Rechazar",
      kinds: { spot: "Lugar nuevo", spot_edit: "Cambio de un lugar", review: "Reseña", photo: "Foto", check: "Comprobación", report: "Denuncia",
               closure: "Aviso de obras", idea: "Idea", suggestion: "Corrección" },
      holds: { shadow: "Sombra", pending: "En espera", delay: "Diferido" },
      rollback: "Revertir", rollbackLead: "Revierte los cambios en lugares mientras nadie los haya cambiado después; los conflictos se indican, nunca se sobrescriben.",
      member: "Id del miembro", point: "Id del lugar", hours: "Horas (1-720)", rollbackMember: "Revertir al miembro", rollbackPoint: "Revertir el lugar",
      confirmRollback: "¿Revertir estos cambios?", rolled: function (n, c) { return n + " cambios revertidos, " + c + " conflictos"; },
      badInput: "Revisa los campos.", campaigns: "Campañas", noCampaigns: "Ninguna campaña en 30 días.", neutralize: "Neutralizar", dismiss: "Descartar",
      confirmNeutralize: "¿Poner estas cuentas en modo sombra y bloquear su red o teléfono 72 h? Cada respuesta se puede deshacer.",
      ckinds: { shared_device: "Un teléfono, varias cuentas", network_swarm: "Cuentas nuevas tras una misma red", risky_cluster: "Cuentas de riesgo juntas",
                scraper: "Extractor de datos", account_cluster: "Grupo compacto de cuentas nuevas" },
      cstatus: { open: "Abierta", neutralized: "Neutralizada", dismissed: "Descartada" }, size: function (n) { return n + " cuentas"; },
      risk: "Puntuaciones más altas", noRisk: "Ninguna puntuación notable.", chain: "Comprobar la integridad de los registros", chainOk: "Ambos registros están intactos.",
      chainBad: "Se alteró un registro: avisa al propietario.",
      fresh: "Escribe un código nuevo de tu app de autenticación para confirmar este cambio.", freshGo: "Confirmar", freshWrong: "Código incorrecto o caducado.",
      geo: "Países prohibidos", geoLead: "Códigos de dos letras, separados por comas. Hong Kong (HK), Macao (MO) y Taiwán (TW) no están en la lista por defecto (KP, RU, CN).",
      geoSave: "Guardar la lista", geoNone: "ninguno",
      reveal: "Revelar una identidad", revealLead: "Los correos y los nombres se guardan cifrados y se muestran enmascarados. Cada revelación queda registrada y se avisa al propietario: escribe por qué.",
      revealKinds: { partner_email: "Correo de un socio (n.º del socio)", event_name: "Nombre de una inscripción (n.º de la inscripción)", donor_name: "Nombre de un donante (n.º de la donación)", member_email: "Correo de un miembro (id del miembro)" },
      revealRef: "N.º", revealReason: "Motivo (10 caracteres o más)", revealGo: "Revelar",
      breakGlass: "Romper el cristal: levantar todas las acciones sobre mi cuenta", breakDone: function (n) { return n + " acción(es) levantada(s)."; }
    },
    de: {
      colon: ": ", title: "Sicherheit (Bouclier)", lead: "Der Schutzschild erkennt Angriffe und reagiert selbst; jede Reaktion läuft ab und lässt sich hier rückgängig machen. Er kann auch Admins pausieren (höchstens eine Stunde, der Inhaber wird benachrichtigt); jede Änderung hier verlangt einen frischen Code.",
      unavailable: "Der Schutzschild ist noch nicht auf dem Server (Abschnitte 101-102).", forbidden: "Dieses Konto kann die Sicherheit nicht verwalten (es braucht „Notschalter“).",
      refused: "Der Server hat diese Änderung abgelehnt.", done: "Erledigt.", level: "Bedrohungsstufe", untilT: function (t) { return "bis " + t; }, noUntil: "bis auf Weiteres",
      levels: { 0: "Ruhig", 1: "Achtung", 2: "Alarm", 3: "Angriff", 4: "Belagerung" },
      levelHelp: { 0: "Nichts Ungewöhnliches.", 1: "Protokoll und Zusammenfassung.", 2: "Strengere Grenzen für neue Konten, SMS aus, Anti-Bot-Prüfung.",
                   3: "Neue Konten nur lesend; Schreibvorgänge wenig vertrauenswürdiger Konten warten auf Prüfung.", 4: "Die ganze App nur lesend außer für Admins; Registrierung geschlossen." },
      zones: "Zonen", setLevel: "Stufe ändern", minutes: "Minuten (0 = bis auf Weiteres)", apply: "Anwenden",
      confirmSiege: "Belagerung: Die ganze App wird für alle außer Admins schreibgeschützt. Fortfahren?",
      enforcement: "Signaturen", modes: { off: "Aus", log: "Nur protokollieren", writes: "Zum Schreiben nötig", all: "Überall nötig" },
      enforceHelp: "Alte App-Versionen signieren nie: Lass „Nur protokollieren“, bis die Mindestversion signiert.",
      share: function (p) { return p + " % der Schreibvorgänge des letzten Tages waren signiert"; }, confirmEnforce: "App-Versionen ohne Signatur können dann nicht mehr schreiben. Fortfahren?",
      history: "Verlauf (30 Tage)", actions: "Aktive Reaktionen", noActions: "Keine aktive Reaktion.", undo: "Rückgängig",
      by: { shield: "vom Schutzschild", admin: "von einem Admin" }, ends: function (t) { return "endet " + t; },
      entities: { user: "Mitglied", device: "Telefon", ip: "Netz", asn: "Anbieter", cell: "Gebiet", key: "Schlüssel", global: "Überall", zone: "Zone",
                  spot: "Ort", held: "Zurückgehaltener Inhalt", campaign: "Kampagne", action: "Reaktion" },
      names: { slow: "Verlangsamt", challenge: "Anti-Bot-Prüfung", summary: "Nur zusammengefasste Daten", mirror: "Spiegel (falsche Daten)", block: "Gesperrt",
               pending: "Schreiben zurückgehalten", shadow: "Schattenmodus", pause: "Pausiert", feature_off: "Funktion aus", level: "Stufe", enforce: "Signaturen",
               undo: "Rückgängig", rollback: "Zurückgesetzt", approve: "Freigegeben", reject: "Abgelehnt", note: "Notiz" },
      pending: "Wartet auf Prüfung", noPending: "Nichts wartet.", approve: "Freigeben", reject: "Ablehnen",
      kinds: { spot: "Neuer Ort", spot_edit: "Änderung eines Orts", review: "Bewertung", photo: "Foto", check: "Prüfung", report: "Meldung",
               closure: "Baustellen-Meldung", idea: "Idee", suggestion: "Korrektur" },
      holds: { shadow: "Schatten", pending: "Wartend", delay: "Verzögert" },
      rollback: "Zurücksetzen", rollbackLead: "Setzt Änderungen an Orten zurück, solange niemand sie seither geändert hat; Konflikte werden gemeldet, nie überschrieben.",
      member: "Mitglieds-ID", point: "Orts-ID", hours: "Stunden (1-720)", rollbackMember: "Mitglied zurücksetzen", rollbackPoint: "Ort zurücksetzen",
      confirmRollback: "Diese Änderungen zurücksetzen?", rolled: function (n, c) { return n + " Änderungen zurückgesetzt, " + c + " Konflikte"; },
      badInput: "Prüf die Felder.", campaigns: "Kampagnen", noCampaigns: "Keine Kampagne in 30 Tagen.", neutralize: "Neutralisieren", dismiss: "Verwerfen",
      confirmNeutralize: "Diese Konten in den Schattenmodus versetzen und ihr Netz oder Telefon 72 h sperren? Jede Reaktion lässt sich rückgängig machen.",
      ckinds: { shared_device: "Ein Telefon, mehrere Konten", network_swarm: "Neue Konten hinter einem Netz", risky_cluster: "Riskante Konten zusammen",
                scraper: "Daten-Abgreifer", account_cluster: "Enge Gruppe neuer Konten" },
      cstatus: { open: "Offen", neutralized: "Neutralisiert", dismissed: "Verworfen" }, size: function (n) { return n + " Konten"; },
      risk: "Höchste Werte", noRisk: "Kein auffälliger Wert.", chain: "Unversehrtheit der Protokolle prüfen", chainOk: "Beide Protokolle sind unversehrt.",
      chainBad: "Ein Protokoll wurde verändert: Sag es dem Inhaber.",
      fresh: "Gib einen frischen Code aus deiner Authenticator-App ein, um diese Änderung zu bestätigen.", freshGo: "Bestätigen", freshWrong: "Falscher oder abgelaufener Code.",
      geo: "Gesperrte Länder", geoLead: "Zweistellige Codes, durch Kommas getrennt. Hongkong (HK), Macau (MO) und Taiwan (TW) stehen nicht auf der Standardliste (KP, RU, CN).",
      geoSave: "Liste speichern", geoNone: "keine",
      reveal: "Eine Identität aufdecken", revealLead: "E-Mail-Adressen und Namen werden verschlüsselt gespeichert und maskiert angezeigt. Jedes Aufdecken wird protokolliert und der Inhaber benachrichtigt: Schreib den Grund.",
      revealKinds: { partner_email: "E-Mail eines Partners (Partner-Nr.)", event_name: "Name einer Anmeldung (Anmelde-Nr.)", donor_name: "Name einer spendenden Person (Spenden-Nr.)", member_email: "E-Mail eines Mitglieds (Mitglieds-ID)" },
      revealRef: "Nr.", revealReason: "Grund (mindestens 10 Zeichen)", revealGo: "Aufdecken",
      breakGlass: "Notfallzugang: alle Maßnahmen gegen mein Konto aufheben", breakDone: function (n) { return n + " Maßnahme(n) aufgehoben."; }
    },
    pt: {
      colon: ": ", title: "Segurança (Bouclier)", lead: "O escudo vigia os ataques e responde sozinho; cada resposta expira e pode ser desfeita aqui. Ele também pode pausar um administrador (uma hora no máximo, com aviso ao proprietário); cada mudança aqui pede um código novo.",
      unavailable: "O escudo ainda não está no servidor (seções 101-102).", forbidden: "Esta conta não pode gerenciar a segurança (precisa de \"Interruptores de emergência\").",
      refused: "O servidor recusou esta alteração.", done: "Feito.", level: "Nível de ameaça", untilT: function (t) { return "até " + t; }, noUntil: "até nova ordem",
      levels: { 0: "Calmo", 1: "Atenção", 2: "Alerta", 3: "Ataque", 4: "Cerco" },
      levelHelp: { 0: "Nada fora do comum.", 1: "Registro e resumo.", 2: "Limites mais rígidos para contas novas, SMS desligado, desafio antirrobô.",
                   3: "Contas novas só leitura; as gravações de contas pouco confiáveis aguardam revisão.", 4: "O app inteiro só leitura, exceto para administradores; cadastros fechados." },
      zones: "Zonas", setLevel: "Mudar o nível", minutes: "Minutos (0 = até nova ordem)", apply: "Aplicar",
      confirmSiege: "Cerco: o app inteiro fica só leitura para todos, exceto administradores. Continuar?",
      enforcement: "Assinaturas", modes: { off: "Desligadas", log: "Só registro", writes: "Exigidas para gravar", all: "Exigidas em tudo" },
      enforceHelp: "As versões antigas do app não assinam: mantenha \"Só registro\" até que a versão mínima assine.",
      share: function (p) { return p + " % das gravações do último dia estavam assinadas"; }, confirmEnforce: "As versões do app que não assinam não poderão mais gravar. Continuar?",
      history: "Histórico (30 dias)", actions: "Respostas ativas", noActions: "Nenhuma resposta ativa.", undo: "Desfazer",
      by: { shield: "pelo escudo", admin: "por um administrador" }, ends: function (t) { return "termina " + t; },
      entities: { user: "Membro", device: "Telefone", ip: "Rede", asn: "Provedor", cell: "Área", key: "Chave", global: "Em todo lugar", zone: "Zona",
                  spot: "Local", held: "Conteúdo retido", campaign: "Campanha", action: "Resposta" },
      names: { slow: "Desacelerado", challenge: "Desafio antirrobô", summary: "Só dados resumidos", mirror: "Espelho (dados falsos)", block: "Bloqueado",
               pending: "Gravações retidas", shadow: "Modo sombra", pause: "Pausado", feature_off: "Função desligada", level: "Nível", enforce: "Assinaturas",
               undo: "Desfeito", rollback: "Reversão", approve: "Aprovado", reject: "Recusado", note: "Nota" },
      pending: "Aguardando revisão", noPending: "Nada aguardando.", approve: "Aprovar", reject: "Recusar",
      kinds: { spot: "Local novo", spot_edit: "Alteração de um local", review: "Avaliação", photo: "Foto", check: "Verificação", report: "Denúncia",
               closure: "Aviso de obras", idea: "Ideia", suggestion: "Correção" },
      holds: { shadow: "Sombra", pending: "Aguardando", delay: "Adiado" },
      rollback: "Reverter", rollbackLead: "Desfaz as alterações em locais enquanto ninguém as mudou depois; os conflitos são indicados, nunca sobrescritos.",
      member: "Id do membro", point: "Id do local", hours: "Horas (1-720)", rollbackMember: "Reverter o membro", rollbackPoint: "Reverter o local",
      confirmRollback: "Reverter estas alterações?", rolled: function (n, c) { return n + " alterações revertidas, " + c + " conflitos"; },
      badInput: "Confira os campos.", campaigns: "Campanhas", noCampaigns: "Nenhuma campanha em 30 dias.", neutralize: "Neutralizar", dismiss: "Descartar",
      confirmNeutralize: "Colocar estas contas em modo sombra e bloquear a rede ou o telefone delas por 72 h? Cada resposta pode ser desfeita.",
      ckinds: { shared_device: "Um telefone, várias contas", network_swarm: "Contas novas atrás de uma mesma rede", risky_cluster: "Contas de risco juntas",
                scraper: "Coletor de dados", account_cluster: "Grupo fechado de contas novas" },
      cstatus: { open: "Aberta", neutralized: "Neutralizada", dismissed: "Descartada" }, size: function (n) { return n + " contas"; },
      risk: "Pontuações mais altas", noRisk: "Nenhuma pontuação notável.", chain: "Verificar a integridade dos registros", chainOk: "Os dois registros estão intactos.",
      chainBad: "Um registro foi alterado: avise o proprietário.",
      fresh: "Digite um código novo do seu app autenticador para confirmar esta mudança.", freshGo: "Confirmar", freshWrong: "Código errado ou expirado.",
      geo: "Países proibidos", geoLead: "Códigos de duas letras, separados por vírgulas. Hong Kong (HK), Macau (MO) e Taiwan (TW) não estão na lista padrão (KP, RU, CN).",
      geoSave: "Salvar a lista", geoNone: "nenhum",
      reveal: "Revelar uma identidade", revealLead: "E-mails e nomes ficam guardados criptografados e aparecem mascarados. Cada revelação é registrada e o proprietário é avisado: escreva o motivo.",
      revealKinds: { partner_email: "E-mail de um parceiro (n.º do parceiro)", event_name: "Nome de uma inscrição (n.º da inscrição)", donor_name: "Nome de um doador (n.º da doação)", member_email: "E-mail de um membro (id do membro)" },
      revealRef: "N.º", revealReason: "Motivo (10 caracteres ou mais)", revealGo: "Revelar",
      breakGlass: "Quebra-vidro: suspender todas as ações sobre minha conta", breakDone: function (n) { return n + " ação(ões) suspensa(s)."; }
    },
    ja: {
      colon: "：", title: "セキュリティ（Bouclier）", lead: "シールドが攻撃を監視し、自動で対応します。どの対応も期限付きで、ここで取り消せます。管理者も一時停止できます（最長1時間、オーナーに通知）。ここでの変更には毎回新しいコードが必要です。",
      unavailable: "シールドはまだサーバーにありません（セクション101-102）。", forbidden: "このアカウントではセキュリティを管理できません（「緊急スイッチ」の権限が必要です）。",
      refused: "サーバーがこの変更を拒否しました。", done: "完了しました。", level: "脅威レベル", untilT: function (t) { return t + "まで"; }, noUntil: "変更するまで",
      levels: { 0: "平穏", 1: "注意", 2: "警戒", 3: "攻撃", 4: "包囲" },
      levelHelp: { 0: "異常はありません。", 1: "記録と要約。", 2: "新規アカウントの制限を強化、SMS停止、ボット対策チャレンジ。",
                   3: "新規アカウントは閲覧のみ。信頼の低いアカウントの書き込みは確認待ち。", 4: "管理者以外はアプリ全体が閲覧のみ。新規登録停止。" },
      zones: "ゾーン", setLevel: "レベルを変更", minutes: "分（0 = 変更するまで）", apply: "適用",
      confirmSiege: "包囲：管理者以外はアプリ全体が閲覧のみになります。続けますか？",
      enforcement: "署名", modes: { off: "オフ", log: "記録のみ", writes: "書き込みに必須", all: "すべてに必須" },
      enforceHelp: "古いバージョンのアプリは署名しません。最低バージョンが署名するまで「記録のみ」のままにしてください。",
      share: function (p) { return "直近1日の書き込みの" + p + "%が署名済み"; }, confirmEnforce: "署名しないバージョンのアプリは書き込めなくなります。続けますか？",
      history: "履歴（30日）", actions: "有効な対応", noActions: "有効な対応はありません。", undo: "取り消す",
      by: { shield: "シールドによる", admin: "管理者による" }, ends: function (t) { return t + "に終了"; },
      entities: { user: "メンバー", device: "端末", ip: "ネットワーク", asn: "プロバイダー", cell: "地域", key: "キー", global: "全体", zone: "ゾーン",
                  spot: "場所", held: "保留中のコンテンツ", campaign: "キャンペーン", action: "対応" },
      names: { slow: "低速化", challenge: "ボット対策チャレンジ", summary: "要約データのみ", mirror: "ミラー（偽データ）", block: "ブロック",
               pending: "書き込み保留", shadow: "シャドーモード", pause: "一時停止", feature_off: "機能停止", level: "レベル", enforce: "署名",
               undo: "取り消し", rollback: "ロールバック", approve: "承認", reject: "却下", note: "メモ" },
      pending: "確認待ち", noPending: "確認待ちはありません。", approve: "承認", reject: "却下",
      kinds: { spot: "新しい場所", spot_edit: "場所の編集", review: "レビュー", photo: "写真", check: "確認", report: "報告",
               closure: "工事の報告", idea: "アイデア", suggestion: "修正" },
      holds: { shadow: "シャドー", pending: "保留", delay: "延期" },
      rollback: "ロールバック", rollbackLead: "その後誰も変更していない場所の変更を元に戻します。競合は報告され、上書きされることはありません。",
      member: "メンバーID", point: "場所ID", hours: "時間（1-720）", rollbackMember: "メンバーを元に戻す", rollbackPoint: "場所を元に戻す",
      confirmRollback: "これらの変更を元に戻しますか？", rolled: function (n, c) { return n + "件を元に戻しました、競合" + c + "件"; },
      badInput: "入力内容を確認してください。", campaigns: "キャンペーン", noCampaigns: "30日間キャンペーンはありません。", neutralize: "無力化", dismiss: "却下",
      confirmNeutralize: "これらのアカウントをシャドーモードにし、ネットワークまたは端末を72時間ブロックしますか？各対応は取り消せます。",
      ckinds: { shared_device: "1台の端末に複数アカウント", network_swarm: "同じネットワークの新規アカウント群", risky_cluster: "リスクの高いアカウント群",
                scraper: "データ収集ボット", account_cluster: "新規アカウントの密集グループ" },
      cstatus: { open: "未対応", neutralized: "無力化済み", dismissed: "却下済み" }, size: function (n) { return n + "アカウント"; },
      risk: "最も高いスコア", noRisk: "目立ったスコアはありません。", chain: "ログの完全性を確認", chainOk: "両方のログは改ざんされていません。",
      chainBad: "ログが改ざんされました。オーナーに連絡してください。",
      fresh: "この変更を確定するには、認証アプリの新しいコードを入力してください。", freshGo: "確定", freshWrong: "コードが違うか、期限切れです。",
      geo: "利用禁止の国", geoLead: "2文字のコードをカンマで区切って入力します。香港（HK）、マカオ（MO）、台湾（TW）は既定のリスト（KP、RU、CN）に含まれません。",
      geoSave: "リストを保存", geoNone: "なし",
      reveal: "本人情報を表示", revealLead: "メールアドレスと名前は暗号化して保管され、伏せ字で表示されます。表示するたびに記録され、オーナーに通知されます。理由を書いてください。",
      revealKinds: { partner_email: "パートナーのメール（パートナー番号）", event_name: "申込者の名前（申込番号）", donor_name: "寄付者の名前（寄付番号）", member_email: "メンバーのメール（メンバーID）" },
      revealRef: "番号", revealReason: "理由（10文字以上）", revealGo: "表示する",
      breakGlass: "緊急解除：自分のアカウントへの措置をすべて解除", breakDone: function (n) { return n + "件の措置を解除しました。"; }
    },
    ro: {
      colon: ": ", title: "Securitate (Bouclier)", lead: "Scutul urmărește atacurile și răspunde singur; fiecare răspuns expiră și poate fi anulat aici. Poate pune și un administrator pe pauză (cel mult o oră, cu anunțarea proprietarului); fiecare schimbare de aici cere un cod nou.",
      unavailable: "Scutul nu este încă pe server (secțiunile 101-102).", forbidden: "Acest cont nu poate gestiona securitatea (îi trebuie „Întrerupătoare de urgență”).",
      refused: "Serverul a refuzat această modificare.", done: "Gata.", level: "Nivel de amenințare", untilT: function (t) { return "până la " + t; }, noUntil: "până la noi ordine",
      levels: { 0: "Calm", 1: "Atenție", 2: "Alertă", 3: "Atac", 4: "Asediu" },
      levelHelp: { 0: "Nimic neobișnuit.", 1: "Jurnal și rezumat.", 2: "Limite mai stricte pentru conturile noi, SMS oprit, provocare anti-robot.",
                   3: "Conturile noi doar citesc; scrierile conturilor de încredere scăzută așteaptă verificare.", 4: "Toată aplicația doar în citire, cu excepția administratorilor; înscrieri închise." },
      zones: "Zone", setLevel: "Schimbă nivelul", minutes: "Minute (0 = până la noi ordine)", apply: "Aplică",
      confirmSiege: "Asediu: toată aplicația trece în citire pentru toți, cu excepția administratorilor. Continui?",
      enforcement: "Semnături", modes: { off: "Oprite", log: "Doar jurnal", writes: "Cerute pentru scriere", all: "Cerute peste tot" },
      enforceHelp: "Versiunile vechi ale aplicației nu semnează: păstrează „Doar jurnal” până când versiunea minimă semnează.",
      share: function (p) { return p + " % din scrierile ultimei zile au fost semnate"; }, confirmEnforce: "Versiunile aplicației care nu semnează nu vor mai putea scrie. Continui?",
      history: "Istoric (30 de zile)", actions: "Răspunsuri active", noActions: "Niciun răspuns activ.", undo: "Anulează",
      by: { shield: "de scut", admin: "de un administrator" }, ends: function (t) { return "se termină " + t; },
      entities: { user: "Membru", device: "Telefon", ip: "Rețea", asn: "Furnizor", cell: "Zonă mică", key: "Cheie", global: "Peste tot", zone: "Zonă",
                  spot: "Loc", held: "Conținut reținut", campaign: "Campanie", action: "Răspuns" },
      names: { slow: "Încetinit", challenge: "Provocare anti-robot", summary: "Doar date rezumate", mirror: "Oglindă (date false)", block: "Blocat",
               pending: "Scrieri reținute", shadow: "Mod umbră", pause: "În pauză", feature_off: "Funcție oprită", level: "Nivel", enforce: "Semnături",
               undo: "Anulare", rollback: "Revenire", approve: "Aprobat", reject: "Respins", note: "Notă" },
      pending: "În așteptarea verificării", noPending: "Nimic în așteptare.", approve: "Aprobă", reject: "Respinge",
      kinds: { spot: "Loc nou", spot_edit: "Modificarea unui loc", review: "Recenzie", photo: "Fotografie", check: "Verificare", report: "Semnalare",
               closure: "Semnalare de lucrări", idea: "Idee", suggestion: "Corectură" },
      holds: { shadow: "Umbră", pending: "În așteptare", delay: "Amânat" },
      rollback: "Revenire", rollbackLead: "Anulează modificările locurilor cât timp nimeni nu le-a schimbat de atunci; conflictele sunt semnalate, niciodată suprascrise.",
      member: "Id-ul membrului", point: "Id-ul locului", hours: "Ore (1-720)", rollbackMember: "Anulează membrul", rollbackPoint: "Anulează locul",
      confirmRollback: "Anulezi aceste modificări?", rolled: function (n, c) { return n + " modificări anulate, " + c + " conflicte"; },
      badInput: "Verifică câmpurile.", campaigns: "Campanii", noCampaigns: "Nicio campanie în 30 de zile.", neutralize: "Neutralizează", dismiss: "Respinge",
      confirmNeutralize: "Treci aceste conturi în mod umbră și blochezi rețeaua sau telefonul lor 72 h? Fiecare răspuns poate fi anulat.",
      ckinds: { shared_device: "Un telefon, mai multe conturi", network_swarm: "Conturi noi în spatele aceleiași rețele", risky_cluster: "Conturi riscante împreună",
                scraper: "Colector de date", account_cluster: "Grup strâns de conturi noi" },
      cstatus: { open: "Deschisă", neutralized: "Neutralizată", dismissed: "Respinsă" }, size: function (n) { return n + " conturi"; },
      risk: "Cele mai mari scoruri", noRisk: "Niciun scor notabil.", chain: "Verifică integritatea jurnalelor", chainOk: "Ambele jurnale sunt intacte.",
      chainBad: "Un jurnal a fost modificat: anunță proprietarul.",
      fresh: "Introdu un cod nou din aplicația de autentificare ca să confirmi această schimbare.", freshGo: "Confirmă", freshWrong: "Cod greșit sau expirat.",
      geo: "Țări interzise", geoLead: "Coduri din două litere, separate prin virgulă. Hong Kong (HK), Macao (MO) și Taiwan (TW) nu sunt în lista implicită (KP, RU, CN).",
      geoSave: "Salvează lista", geoNone: "niciuna",
      reveal: "Dezvăluie o identitate", revealLead: "Adresele de e-mail și numele sunt păstrate criptate și afișate mascat. Fiecare dezvăluire e înregistrată și proprietarul e anunțat: scrie de ce.",
      revealKinds: { partner_email: "E-mailul unui partener (nr. partenerului)", event_name: "Numele unei înscrieri (nr. înscrierii)", donor_name: "Numele unui donator (nr. donației)", member_email: "E-mailul unui membru (id-ul membrului)" },
      revealRef: "Nr.", revealReason: "Motiv (cel puțin 10 caractere)", revealGo: "Dezvăluie",
      breakGlass: "Spargerea geamului: ridică toate acțiunile asupra contului meu", breakDone: function (n) { return n + " acțiune(i) ridicată(e)."; }
    }
  };

  var REVEAL = ["partner_email", "event_name", "donor_name", "member_email"];
  var api = { REVEAL: REVEAL, STRINGS: STRINGS, status: status, reasonText: reasonText, intIn: intIn, uuid: uuid, pointId: pointId, tone: tone, undoable: undoable,
              KINDS: KINDS, HOLDS: HOLDS, MODES: MODES, CAMPAIGNS: CAMPAIGNS, CSTATUS: CSTATUS, ENTITIES: ENTITIES, ACTIONS: ACTIONS };
  if (node) { module.exports = api; return; }

  // ---- The page ----
  var A = root.WNCAPP;
  if (!A) return;
  var T = STRINGS[A.lang] || STRINGS.en, nf = new Intl.NumberFormat(A.lang);
  var fmt = new Intl.DateTimeFormat(A.lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  function el(tag, cls, t) { var e = document.createElement(tag); if (cls) e.className = cls; if (t != null) e.textContent = t; return e; }
  function clear(x) { while (x.firstChild) x.removeChild(x.firstChild); return x; }
  function btn(parent, t, cls) { var b = el("button", cls || "ghost small-btn", t); b.type = "button"; parent.appendChild(b); return b; }
  function day(s) { return s ? fmt.format(new Date(s)) : "—"; }
  function field(parent, label, attrs) {
    var w = el("label", "sec-field sec-" + ((attrs && attrs.type) || "text")), i = el("input");
    w.appendChild(el("span", "muted small", label));
    Object.keys(attrs || {}).forEach(function (k) { i.setAttribute(k, attrs[k]); });
    w.appendChild(i);
    parent.appendChild(w);
    return i;
  }
  function pick(parent, label, values, names, current) {
    var w = el("label", "sec-field sec-select"), s = el("select");
    w.appendChild(el("span", "muted small", label));
    values.forEach(function (v) { var o = el("option", null, names[v]); o.value = String(v); if (String(v) === String(current)) o.selected = true; s.appendChild(o); });
    w.appendChild(s);
    parent.appendChild(w);
    return s;
  }
  function section(t) { var s = el("div", "sec-block"); s.appendChild(el("h3", null, t)); box.appendChild(s); return s; }

  var box = document.getElementById("securite"), st = null, msg = null, inited = false, busy = false;
  function say(t, cls) { if (msg) { msg.textContent = t || ""; msg.className = "msg" + (cls ? " " + cls : ""); } }
  function fatal(e) {
    if (e.status === 401) { A.lost(); return true; }
    if (e.code === "WNMFA") { A.showMfa(); return true; }
    return false;
  }
  function denied(e) { return e.code === "42501" || e.status === 403; }

  async function load() {
    try {
      st = status(await A.rpc("sec_admin_status", {}));
    } catch (e) {
      if (fatal(e)) return;
      clear(box);
      box.appendChild(el("h2", null, T.title));
      box.appendChild(el("p", "note", e.status === 404 ? T.unavailable : denied(e) ? T.forbidden : T.refused));
      box.classList.remove("hidden");
      return;
    }
    render();
  }

  // One write, then the card again; [after] (optional) words the answer.
  async function act(name, args, after) {
    if (busy) return;
    busy = true;
    try {
      var out = await A.rpc(name, args);
      if (!out || out.result !== "ok") { say(T.refused, "err"); return; }
      await load();
      say(after ? after(out) : T.done, "ok");
    } catch (e) {
      if (e.code === "WNTOTP") { busy = false; fresh(function () { act(name, args, after); }); return; }
      if (!fatal(e)) say(denied(e) ? T.forbidden : T.refused, "err");
    } finally { busy = false; }
  }

  // Section 105: a shield change wants a code verified in the last 5 minutes; asked here, then [again] runs once more.
  function fresh(again) {
    var old = document.getElementById("sec-fresh");
    if (old) old.parentNode.removeChild(old);
    var f = el("div", "sec-form sec-fresh");
    f.id = "sec-fresh";
    f.setAttribute("role", "group");
    f.appendChild(el("p", "small", T.fresh));
    var i = field(f, T.fresh, { type: "text", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "7" });
    var go = btn(f, T.freshGo);
    go.addEventListener("click", async function () {
      var d = String(i.value).replace(/\D/g, "").slice(0, 6);
      if (d.length !== 6) { say(T.freshWrong, "err"); return; }
      var r = await A.freshCode(d).catch(function () { return "failed"; });
      if (r !== "ok") { say(T.freshWrong, "err"); i.value = ""; i.focus(); return; }
      f.parentNode.removeChild(f);
      again();
    });
    box.insertBefore(f, box.children[1] || null);
    i.focus();
  }

  function actionLine(ul, a, withUndo) {
    var li = el("li"), top = el("div", "rc-item-top");
    top.appendChild(el("b", null, (T.names[a.action] || a.action) + " · " + (T.entities[a.entity] || a.entity) + (a.entityId && a.entityId !== "*" ? " " + a.entityId.slice(0, 12) : "")));
    top.appendChild(el("span", "chip" + (a.by === "shield" ? " sec-watch" : ""), T.by[a.by]));
    li.appendChild(top);
    var meta = [day(a.created_at)];
    if (a.expires_at) meta.push(T.ends(day(a.expires_at)));
    if (a.reason) meta.push(a.reason);
    li.appendChild(el("div", "muted small", meta.join(" · ")));
    if (withUndo && undoable(a)) btn(li, T.undo).addEventListener("click", function () { act("sec_admin_undo", { p_action_id: a.id }); });
    ul.appendChild(li);
  }

  function render() {
    clear(box);
    box.classList.remove("hidden");
    var head = el("div", "card-head"), hl = el("div");
    hl.appendChild(el("h2", null, T.title));
    hl.appendChild(el("p", "muted small", T.lead));
    head.appendChild(hl);
    box.appendChild(head);

    // The level, its zones, the setting.
    var lv = section(T.level), now = el("div", "sec-level");
    now.appendChild(el("span", "chip sec-" + tone(st.level), st.level + " · " + T.levels[st.level]));
    now.appendChild(el("span", "muted small", st.until ? T.untilT(day(st.until)) : st.level > 0 ? T.noUntil : ""));
    lv.appendChild(now);
    lv.appendChild(el("p", "muted small", T.levelHelp[st.level]));
    if (st.zones.length) {
      lv.appendChild(el("p", "muted small", T.zones + T.colon + st.zones.map(function (z) { return z.zone + " " + z.level + " · " + T.levels[z.level]; }).join(", ")));
    }
    var form = el("div", "sec-form");
    var lsel = pick(form, T.setLevel, [0, 1, 2, 3, 4], T.levels, st.level);
    var mins = field(form, T.minutes, { type: "number", min: "0", max: "43200", value: "60", inputmode: "numeric" });
    btn(form, T.apply, "ghost small-btn").addEventListener("click", function () {
      var level = intIn(lsel.value, 0, 4), m = intIn(mins.value, 0, 43200);
      if (level == null || m == null) { say(T.badInput, "err"); return; }
      if (level === 4 && !root.confirm(T.confirmSiege)) return;
      act("sec_admin_set_level", { p_level: level, p_minutes: m });
    });
    lv.appendChild(form);

    var en = section(T.enforcement);
    en.appendChild(el("p", "muted small", T.enforceHelp + (st.share != null ? " " + T.share(nf.format(st.share)) + "." : "")));
    var eform = el("div", "sec-form"), esel = pick(eform, T.enforcement, MODES, T.modes, st.setting);
    btn(eform, T.apply, "ghost small-btn").addEventListener("click", function () {
      var mode = esel.value;
      if (MODES.indexOf(mode) < 0) return;
      if ((mode === "writes" || mode === "all") && !root.confirm(T.confirmEnforce)) return;
      act("sec_admin_set_enforcement", { p_mode: mode });
    });
    en.appendChild(eform);

    // The shield's answers in force, then the history of levels.
    var ac = section(T.actions);
    var live = st.actions.filter(function (a) { return a.action !== "level" || a.entity !== "global"; });
    if (!live.length) ac.appendChild(el("p", "note", T.noActions));
    else { var ul = el("ul", "rc-list"); live.forEach(function (a) { actionLine(ul, a, true); }); ac.appendChild(ul); }
    if (st.history.length) {
      var hi = section(T.history), hul = el("ul", "rc-list");
      st.history.forEach(function (a) { actionLine(hul, a, true); });
      hi.appendChild(hul);
    }

    // Held content.
    var pe = section(T.pending);
    if (!st.pending.length) pe.appendChild(el("p", "note", T.noPending));
    else {
      var pul = el("ul", "rc-list");
      st.pending.forEach(function (p) {
        var li = el("li"), top = el("div", "rc-item-top");
        top.appendChild(el("b", null, T.kinds[p.kind]));
        top.appendChild(el("span", "chip sec-" + (p.hold === "shadow" ? "bad" : p.hold === "pending" ? "warn" : "watch"), T.holds[p.hold]));
        li.appendChild(top);
        if (p.summary) li.appendChild(el("div", "small", p.summary));
        li.appendChild(el("div", "muted small", day(p.created_at) + (p.user ? " · " + p.user.slice(0, 8) : "")));
        var row = el("div", "rc-acts");
        btn(row, T.approve).addEventListener("click", function () { act("sec_admin_pending_decide", { p_id: p.id, p_approve: true }); });
        btn(row, T.reject, "ghost small-btn rc-danger").addEventListener("click", function () { act("sec_admin_pending_decide", { p_id: p.id, p_approve: false }); });
        li.appendChild(row);
        pul.appendChild(li);
      });
      pe.appendChild(pul);
    }

    // Rollback.
    var rb = section(T.rollback);
    rb.appendChild(el("p", "muted small", T.rollbackLead));
    var rf = el("div", "sec-form");
    var who = field(rf, T.member, { type: "text", autocomplete: "off", spellcheck: "false", maxlength: "36" });
    var wh = field(rf, T.hours, { type: "number", min: "1", max: "720", value: "24", inputmode: "numeric" });
    btn(rf, T.rollbackMember, "ghost small-btn rc-danger").addEventListener("click", function () {
      var u = uuid(who.value), h = intIn(wh.value, 1, 720);
      if (!u || h == null) { say(T.badInput, "err"); return; }
      if (!root.confirm(T.confirmRollback)) return;
      act("sec_admin_rollback", { p_user_id: u, p_hours: h }, function (o) { return T.rolled(nf.format(o.reverted || 0), nf.format(o.conflicts || 0)); });
    });
    rb.appendChild(rf);
    var pf = el("div", "sec-form");
    var pid = field(pf, T.point, { type: "text", autocomplete: "off", inputmode: "numeric", maxlength: "16" });
    var ph = field(pf, T.hours, { type: "number", min: "1", max: "720", value: "24", inputmode: "numeric" });
    btn(pf, T.rollbackPoint, "ghost small-btn rc-danger").addEventListener("click", function () {
      var p = pointId(pid.value), h = intIn(ph.value, 1, 720);
      if (p == null || h == null) { say(T.badInput, "err"); return; }
      if (!root.confirm(T.confirmRollback)) return;
      act("sec_admin_rollback_point", { p_spot_id: p, p_hours: h }, function (o) { return T.rolled(nf.format(o.reverted || 0), nf.format(o.conflicts || 0)); });
    });
    rb.appendChild(pf);

    // Campaigns.
    var ca = section(T.campaigns);
    if (!st.campaigns.length) ca.appendChild(el("p", "note", T.noCampaigns));
    else {
      var cul = el("ul", "rc-list");
      st.campaigns.forEach(function (c) {
        var li = el("li"), top = el("div", "rc-item-top");
        top.appendChild(el("b", null, T.ckinds[c.kind]));
        top.appendChild(el("span", "chip" + (c.status === "open" ? " sec-warn" : ""), T.cstatus[c.status]));
        li.appendChild(top);
        li.appendChild(el("div", "muted small", T.size(nf.format(c.size)) + " · " + day(c.first_at) + " → " + day(c.last_at)));
        if (c.status === "open") {
          var row = el("div", "rc-acts");
          btn(row, T.neutralize, "ghost small-btn rc-danger").addEventListener("click", function () {
            if (root.confirm(T.confirmNeutralize)) act("sec_admin_campaign_decide", { p_id: c.id, p_neutralize: true });
          });
          btn(row, T.dismiss).addEventListener("click", function () { act("sec_admin_campaign_decide", { p_id: c.id, p_neutralize: false }); });
          li.appendChild(row);
        }
        cul.appendChild(li);
      });
      ca.appendChild(cul);
    }

    // Section 105: forbidden countries (a fresh code each change), an identity reveal, the owner's break-glass.
    var ge = section(T.geo);
    ge.appendChild(el("p", "muted small", T.geoLead));
    var gf = el("div", "sec-form");
    var gl = field(gf, T.geo, { type: "text", autocomplete: "off", spellcheck: "false", maxlength: "200", value: st.geo.length ? st.geo.join(", ") : "" });
    gl.setAttribute("placeholder", T.geoNone);
    btn(gf, T.geoSave, "ghost small-btn").addEventListener("click", function () {
      var list = String(gl.value).toUpperCase().split(/[\s,;]+/).filter(Boolean);
      if (list.some(function (c) { return !/^[A-Z]{2}$/.test(c); }) || list.length > 60) { say(T.badInput, "err"); return; }
      act("sec_admin_set_geo", { p_countries: list });
    });
    ge.appendChild(gf);
    var rv = section(T.reveal);
    rv.appendChild(el("p", "muted small", T.revealLead));
    var rvf = el("div", "sec-form");
    var rk = pick(rvf, T.reveal, REVEAL, T.revealKinds, "partner_email");
    var rr = field(rvf, T.revealRef, { type: "text", autocomplete: "off", spellcheck: "false", maxlength: "36" });
    var rw = field(rvf, T.revealReason, { type: "text", autocomplete: "off", maxlength: "300" });
    var shown = el("p", "small sec-revealed");
    btn(rvf, T.revealGo, "ghost small-btn").addEventListener("click", function reveal() {
      var kind = rk.value, ref = String(rr.value).trim(), why = String(rw.value).trim();
      if (REVEAL.indexOf(kind) < 0 || !ref || why.length < 10) { say(T.badInput, "err"); return; }
      A.rpc("sec_admin_reveal_identity", { p_kind: kind, p_ref: ref, p_reason: why }).then(function (o) {
        shown.textContent = o && o.result === "ok" ? String(o.value) : "";
        say(o && o.result === "ok" ? T.done : T.refused, o && o.result === "ok" ? "ok" : "err");
      }).catch(function (e) {
        if (e.code === "WNTOTP") { fresh(reveal); return; }
        if (!fatal(e)) say(denied(e) ? T.forbidden : T.refused, "err");
      });
    });
    rv.appendChild(rvf);
    rv.appendChild(shown);
    if (A.owner && A.owner()) {
      btn(rv, T.breakGlass, "ghost small-btn rc-danger").addEventListener("click", function () {
        act("sec_break_glass", {}, function (o) { return T.breakDone(nf.format(o.lifted || 0)); });
      });
    }

    // Highest scores, the logs' integrity.
    var rk = section(T.risk);
    if (!st.risk.length) rk.appendChild(el("p", "note", T.noRisk));
    else {
      var rul = el("ul", "rc-list");
      st.risk.forEach(function (r) {
        var li = el("li"), top = el("div", "rc-item-top");
        top.appendChild(el("b", null, T.entities[r.type] + " " + r.id.slice(0, 12)));
        top.appendChild(el("span", "chip sec-" + (r.score >= 80 ? "bad" : r.score >= 60 ? "warn" : "watch"), nf.format(r.score)));
        li.appendChild(top);
        if (r.why) li.appendChild(el("div", "muted small", r.why));
        rul.appendChild(li);
      });
      rk.appendChild(rul);
    }
    var cr = el("div", "rc-acts");
    btn(cr, T.chain).addEventListener("click", async function () {
      try {
        var o = await A.rpc("sec_admin_chain_check", {});
        var ok = o && o.sec_actions && o.sec_actions.ok === true && o.admin_log && o.admin_log.ok === true;
        say(ok ? T.chainOk : T.chainBad, ok ? "ok" : "err");
      } catch (e) { if (!fatal(e)) say(denied(e) ? T.forbidden : T.refused, "err"); }
    });
    rk.appendChild(cr);

    msg = el("p", "msg");
    msg.setAttribute("role", "status");
    box.appendChild(msg);
  }

  // Admins (the server asks « switches » and the second factor again); once the console has drawn its first figures.
  function start() {
    if (inited || !A.admin || !A.admin()) return;
    inited = true;
    load();
  }
  document.addEventListener("wnc:render", start);
  if (root.WNC_PAGE && root.WNC_PAGE.data && root.WNC_PAGE.data()) start();
})(this);

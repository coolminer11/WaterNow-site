/*
 * WaterNow Statistics, private console: « Travaux » for admins (section 100, docs/migrations/2026-11-21_closure_reports.sql).
 * The members' road works reports, newest first (closure_reports_admin_list: kind, place, dates, "still there" and "it's
 * gone" counts, how many reports the same account made in 30 days, never who), each hidden, shown again or deleted
 * (closure_reports_admin_set). Admin holding remove_content + aal2, checked by the server; every write in admin_log.
 * The session and calls are console.js's (window.WNCAPP). Text through textContent only; the photo opens in a new tab
 * (the page's img-src stays 'self'). Pure helpers shared with the node test (module.exports).
 */
(function (root) {
  "use strict";
  var node = typeof module === "object" && module.exports;
  var KINDS = ["street", "sidewalk", "bike", "narrow"], STATUSES = ["pending", "live", "hidden", "gone", "ended"];
  var ISO = /^\d{4}-\d{2}-\d{2}T/;

  function n(v) { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : 0; }
  function when(v) { return typeof v === "string" && ISO.test(v) && !isNaN(Date.parse(v)) ? v : null; }

  /** closure_reports_admin_list's answer, cleaned: [{id, kind, lat, lon, created_at, until, status, here, gone, recent, photo}]. */
  function reports(o, api) {
    var list = o && Array.isArray(o.reports) ? o.reports : [];
    var photos = String(api || "") + "/storage/v1/object/public/spot-photos/";
    return list.filter(function (r) {
      return r && Number.isSafeInteger(r.id) && r.id > 0 && KINDS.indexOf(r.kind) >= 0 && STATUSES.indexOf(r.status) >= 0
        && typeof r.lat === "number" && Math.abs(r.lat) <= 90 && typeof r.lon === "number" && Math.abs(r.lon) <= 180;
    }).map(function (r) {
      return { id: r.id, kind: r.kind, lat: r.lat, lon: r.lon, created_at: when(r.created_at), until: when(r.until), status: r.status,
               here: n(r.here), gone: n(r.gone), recent: n(r.reporter_recent),
               photo: typeof r.photo === "string" && r.photo.indexOf(photos) === 0 && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(r.photo.slice(photos.length)) ? r.photo : null };
    });
  }

  /** Where it is, on OpenStreetMap (a new tab). */
  function mapLink(lat, lon) {
    var a = lat.toFixed(5), b = lon.toFixed(5);
    return "https://www.openstreetmap.org/?mlat=" + a + "&mlon=" + b + "#map=18/" + a + "/" + b;
  }

  /** The actions a report offers: hide or show, and delete. */
  function actions(r) { return [r.status === "hidden" ? "show" : "hide", "delete"]; }

  // The console's 7 languages (docs/translations-glossary.md): French says "tu", Romanian writes ș ț, Japanese never あなた.
  var STRINGS = {
    en: {
      title: "Road works reports", lead: "What members reported, newest first. Others see a report once a second member confirms it; it ends on its date, 7 days after the last confirmation, or after two \"it's gone\". Nobody's identity is shown here.",
      unavailable: "Reports aren't on the server yet (section 100).", forbidden: "This account can't moderate reports (it needs Remove content).", refused: "The server refused this change.",
      none: "No report yet.", hide: "Hide", show: "Show again", "delete": "Delete", confirmDelete: "Delete this report for good? Its photo goes too.", done: "Done.",
      photo: "Photo", map: "Map", kinds: { street: "Street closed", sidewalk: "Sidewalk closed", bike: "Bike path closed", narrow: "Works narrowing the way" },
      statuses: { pending: "Waiting for confirmation", live: "Live", hidden: "Hidden", gone: "Gone", ended: "Ended" },
      counts: function (h, g) { return h + " still there · " + g + " gone"; }, recent: function (k) { return k + " reports by this account in 30 days"; },
      dates: function (a, b) { return a + " → " + b; }
    },
    fr: {
      title: "Signalements de travaux", lead: "Ce que les membres ont signalé, du plus récent au plus ancien. Les autres voient un signalement dès qu'un deuxième membre le confirme ; il prend fin à sa date, 7 jours après la dernière confirmation, ou après deux « c'est fini ». Aucune identité n'apparaît ici.",
      unavailable: "Les signalements ne sont pas encore sur le serveur (section 100).", forbidden: "Ce compte ne peut pas modérer les signalements (il faut « Retirer du contenu »).", refused: "Le serveur a refusé cette modification.",
      none: "Aucun signalement pour l'instant.", hide: "Masquer", show: "Réafficher", "delete": "Supprimer", confirmDelete: "Supprimer ce signalement pour de bon ? Sa photo part aussi.", done: "C'est fait.",
      photo: "Photo", map: "Carte", kinds: { street: "Rue fermée", sidewalk: "Trottoir fermé", bike: "Piste cyclable fermée", narrow: "Travaux qui rétrécissent le passage" },
      statuses: { pending: "En attente de confirmation", live: "Visible", hidden: "Masqué", gone: "Terminé", ended: "Expiré" },
      counts: function (h, g) { return h + " toujours là · " + g + " c'est fini"; }, recent: function (k) { return k + " signalements de ce compte en 30 jours"; },
      dates: function (a, b) { return a + " → " + b; }
    },
    es: {
      title: "Avisos de obras", lead: "Lo que avisaron los miembros, del más reciente al más antiguo. Los demás ven un aviso cuando otro miembro lo confirma; termina en su fecha, 7 días después de la última confirmación o tras dos «ya no están». Aquí no aparece la identidad de nadie.",
      unavailable: "Los avisos aún no están en el servidor (sección 100).", forbidden: "Esta cuenta no puede moderar avisos (necesita «Quitar contenido»).", refused: "El servidor rechazó este cambio.",
      none: "Aún no hay avisos.", hide: "Ocultar", show: "Volver a mostrar", "delete": "Eliminar", confirmDelete: "¿Eliminar este aviso para siempre? Su foto también se borra.", done: "Hecho.",
      photo: "Foto", map: "Mapa", kinds: { street: "Calle cerrada", sidewalk: "Acera cerrada", bike: "Carril bici cerrado", narrow: "Obras que estrechan el paso" },
      statuses: { pending: "Pendiente de confirmación", live: "Visible", hidden: "Oculto", gone: "Terminado", ended: "Vencido" },
      counts: function (h, g) { return h + " siguen ahí · " + g + " ya no están"; }, recent: function (k) { return k + " avisos de esta cuenta en 30 días"; },
      dates: function (a, b) { return a + " → " + b; }
    },
    de: {
      title: "Baustellen-Meldungen", lead: "Was Mitglieder gemeldet haben, die neuesten zuerst. Andere sehen eine Meldung, sobald ein zweites Mitglied sie bestätigt; sie endet an ihrem Datum, 7 Tage nach der letzten Bestätigung oder nach zwei „Weg“. Hier wird niemandes Identität gezeigt.",
      unavailable: "Die Meldungen sind noch nicht auf dem Server (Abschnitt 100).", forbidden: "Dieses Konto kann Meldungen nicht moderieren (es braucht „Inhalte entfernen“).", refused: "Der Server hat diese Änderung abgelehnt.",
      none: "Noch keine Meldung.", hide: "Ausblenden", show: "Wieder zeigen", "delete": "Löschen", confirmDelete: "Diese Meldung endgültig löschen? Ihr Foto wird auch gelöscht.", done: "Erledigt.",
      photo: "Foto", map: "Karte", kinds: { street: "Straße gesperrt", sidewalk: "Gehweg gesperrt", bike: "Radweg gesperrt", narrow: "Baustelle verengt den Weg" },
      statuses: { pending: "Wartet auf Bestätigung", live: "Sichtbar", hidden: "Ausgeblendet", gone: "Vorbei", ended: "Abgelaufen" },
      counts: function (h, g) { return h + " noch da · " + g + " weg"; }, recent: function (k) { return k + " Meldungen dieses Kontos in 30 Tagen"; },
      dates: function (a, b) { return a + " → " + b; }
    },
    pt: {
      title: "Avisos de obras", lead: "O que os membros avisaram, do mais recente ao mais antigo. Os outros veem um aviso assim que um segundo membro o confirma; ele termina na data dele, 7 dias após a última confirmação ou depois de dois \"acabaram\". Nenhuma identidade aparece aqui.",
      unavailable: "Os avisos ainda não estão no servidor (seção 100).", forbidden: "Esta conta não pode moderar avisos (precisa de \"Remover conteúdo\").", refused: "O servidor recusou esta alteração.",
      none: "Nenhum aviso ainda.", hide: "Ocultar", show: "Mostrar de novo", "delete": "Excluir", confirmDelete: "Excluir este aviso de vez? A foto também será apagada.", done: "Feito.",
      photo: "Foto", map: "Mapa", kinds: { street: "Rua fechada", sidewalk: "Calçada fechada", bike: "Ciclovia fechada", narrow: "Obras estreitando a passagem" },
      statuses: { pending: "Aguardando confirmação", live: "Visível", hidden: "Oculto", gone: "Encerrado", ended: "Expirado" },
      counts: function (h, g) { return h + " continuam · " + g + " acabaram"; }, recent: function (k) { return k + " avisos desta conta em 30 dias"; },
      dates: function (a, b) { return a + " → " + b; }
    },
    ja: {
      title: "工事の報告", lead: "ユーザーが報告した工事（新しい順）。2人目が確認すると他の人にも表示され、終了日、最後の確認から7日後、または「終わった」が2件で終了します。ここには誰の身元も表示されません。",
      unavailable: "報告はまだサーバーにありません（セクション100）。", forbidden: "このアカウントでは報告を管理できません（「コンテンツの削除」の権限が必要です）。", refused: "サーバーがこの変更を拒否しました。",
      none: "まだ報告はありません。", hide: "非表示にする", show: "再表示する", "delete": "削除", confirmDelete: "この報告を完全に削除しますか？写真も削除されます。", done: "完了しました。",
      photo: "写真", map: "地図", kinds: { street: "道路通行止め", sidewalk: "歩道通行止め", bike: "自転車道通行止め", narrow: "工事で道が狭くなっている" },
      statuses: { pending: "確認待ち", live: "表示中", hidden: "非表示", gone: "終了", ended: "期限切れ" },
      counts: function (h, g) { return "まだ続いている" + h + "件 · 終わった" + g + "件"; }, recent: function (k) { return "このアカウントの30日間の報告：" + k + "件"; },
      dates: function (a, b) { return a + " → " + b; }
    },
    ro: {
      title: "Semnalări de lucrări", lead: "Ce au semnalat membrii, de la cele mai noi. Ceilalți văd o semnalare după ce o confirmă un al doilea membru; se încheie la data ei, la 7 zile după ultima confirmare sau după două „nu mai sunt”. Aici nu apare identitatea nimănui.",
      unavailable: "Semnalările nu sunt încă pe server (secțiunea 100).", forbidden: "Acest cont nu poate modera semnalările (îi trebuie „Elimină conținut”).", refused: "Serverul a refuzat această modificare.",
      none: "Încă nicio semnalare.", hide: "Ascunde", show: "Afișează din nou", "delete": "Șterge", confirmDelete: "Ștergi definitiv această semnalare? Se șterge și fotografia.", done: "Gata.",
      photo: "Fotografie", map: "Hartă", kinds: { street: "Stradă închisă", sidewalk: "Trotuar închis", bike: "Pistă de biciclete închisă", narrow: "Lucrări care îngustează trecerea" },
      statuses: { pending: "În așteptarea confirmării", live: "Vizibilă", hidden: "Ascunsă", gone: "Încheiată", ended: "Expirată" },
      counts: function (h, g) { return h + " mai sunt · " + g + " nu mai sunt"; }, recent: function (k) { return k + " semnalări ale acestui cont în 30 de zile"; },
      dates: function (a, b) { return a + " → " + b; }
    }
  };

  var api = { STRINGS: STRINGS, reports: reports, mapLink: mapLink, actions: actions, KINDS: KINDS, STATUSES: STATUSES };
  if (node) { module.exports = api; return; }

  // ---- The page ----
  var A = root.WNCAPP;
  if (!A) return;
  var T = STRINGS[A.lang] || STRINGS.en, nf = new Intl.NumberFormat(A.lang);
  var fmt = new Intl.DateTimeFormat(A.lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  function el(tag, cls, t) { var e = document.createElement(tag); if (cls) e.className = cls; if (t != null) e.textContent = t; return e; }
  function clear(x) { while (x.firstChild) x.removeChild(x.firstChild); return x; }
  function btn(parent, t, cls) { var b = el("button", cls || "ghost small-btn", t); b.type = "button"; parent.appendChild(b); return b; }
  function link(parent, t, href) { var a = el("a", null, t); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; parent.appendChild(a); return a; }
  function day(s) { return s ? fmt.format(new Date(s)) : "—"; }

  var box = document.getElementById("travaux"), list = [], msg = null, inited = false, busy = false;
  function say(t, cls) { if (msg) { msg.textContent = t || ""; msg.className = "msg" + (cls ? " " + cls : ""); } }
  function fatal(e) {
    if (e.status === 401) { A.lost(); return true; }
    if (e.code === "WNMFA") { A.showMfa(); return true; }
    return false;
  }

  async function load() {
    try {
      list = reports(await A.rpc("closure_reports_admin_list", {}), A.api);
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

  async function act(r, action) {
    if (busy || (action === "delete" && !root.confirm(T.confirmDelete))) return;
    busy = true;
    try {
      var out = await A.rpc("closure_reports_admin_set", { p_id: r.id, p_action: action });
      if (!out || out.result !== "ok") { say(T.refused, "err"); return; }
      await load();
      say(T.done, "ok");
    } catch (e) {
      if (!fatal(e)) say(e.code === "42501" || e.status === 403 ? T.forbidden : T.refused, "err");
    } finally { busy = false; }
  }

  function render() {
    clear(box);
    box.classList.remove("hidden");
    var head = el("div", "card-head"), hl = el("div");
    hl.appendChild(el("h2", null, T.title));
    hl.appendChild(el("p", "muted small", T.lead));
    head.appendChild(hl);
    box.appendChild(head);
    if (!list.length) box.appendChild(el("p", "note", T.none));
    else {
      var ul = el("ul", "rc-list");
      list.forEach(function (r) {
        var li = el("li"), top = el("div", "rc-item-top");
        top.appendChild(el("b", null, T.kinds[r.kind]));
        top.appendChild(el("span", "chip " + (r.status === "live" ? "rc-shown" : "rc-hidden"), T.statuses[r.status]));
        li.appendChild(top);
        li.appendChild(el("div", "muted small", T.dates(day(r.created_at), day(r.until)) + " · " + T.counts(nf.format(r.here), nf.format(r.gone))));
        li.appendChild(el("div", "muted small", T.recent(nf.format(r.recent))));
        var row = el("div", "rc-acts");
        link(row, T.map, mapLink(r.lat, r.lon));
        if (r.photo) link(row, T.photo, r.photo);
        actions(r).forEach(function (a) { btn(row, T[a], a === "delete" ? "ghost small-btn rc-danger" : null).addEventListener("click", function () { act(r, a); }); });
        li.appendChild(row);
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    msg = el("p", "msg");
    msg.setAttribute("role", "status");
    box.appendChild(msg);
  }

  // Admins (the server asks remove_content and the second factor again); once the console has drawn its first figures.
  function start() {
    if (inited || !A.admin || !A.admin()) return;
    inited = true;
    load();
  }
  document.addEventListener("wnc:render", start);
  if (root.WNC_PAGE && root.WNC_PAGE.data && root.WNC_PAGE.data()) start();
})(this);

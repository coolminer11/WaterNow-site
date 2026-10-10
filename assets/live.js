/*
 * The live location page (live/), and its link check shared with the node test (module.exports).
 * The share's token comes from the URL fragment (#t=...), which browsers never send to a server. A link can come
 * from anyone: it may only ever make this page talk to WaterNow's own server, with WaterNow's public key.
 */
(function (root) {
  "use strict";
  // The only server this page posts to (also pinned by the page's CSP connect-src, next to the map's tile server).
  var SERVER = "https://pkqsvlbiznrqxfckaxll.supabase.co";
  // Public by design, as on the share pages (s/app.js): the server's RLS and grants are what protect the data.
  var PUBLISHABLE_KEY = "sb_publishable_Jw6cnMgupaVxupvltvUlPQ_mvwpiNVE";

  /**
   * {endpoint, token} from "#t=..", else {error: "incomplete"}. Links from builds up to 1.51 also carry u (server) and
   * k (key): k is ignored, and a u naming any other server gives {error: "server"}: posting there would put a
   * stranger's endpoint (and the viewer's IP) behind this trusted page.
   */
  function parseLiveParams(hash) {
    var p;
    try { p = new URLSearchParams(String(hash || "").replace(/^#/, "")); } catch (e) { return { error: "incomplete" }; }
    var base = p.get("u"), token = p.get("t") || "";
    if (!/^[A-Za-z0-9_-]{22,64}$/.test(token)) return { error: "incomplete" };
    if (base !== null && base.replace(/\/+$/, "") !== SERVER) return { error: "server" };
    return { endpoint: SERVER + "/rest/v1/rpc/get_live_share", token: token };
  }

  /**
   * One table per app language (spot-params.js's WN.LANGS). `text` keys are element ids; the English in the HTML is
   * the no-JS fallback. Functions get the sharer's name, the destination or a relative time ("3 minutes ago").
   */
  var STRINGS = {
    en: {
      doc: "WaterNow Live",
      text: { title: "Live location", status: "Loading…", stopLabel: "Next water stop", etaLabel: "ETA", speedLabel: "Speed" },
      map: "Map with the shared position", offline: "Offline",
      serverTitle: "Link not recognized", serverText: "This link doesn't lead to WaterNow's server, so nothing was loaded. Ask for a new link from the WaterNow app.",
      invalidTitle: "Invalid link", invalidText: "This live location link is incomplete. Ask for a new one.",
      endedTitle: "Sharing ended", endedText: "This live location was stopped or has expired.",
      unreachable: "Can't reach the server, retrying…", someone: "Someone", justNow: "just now",
      maintenance: "WaterNow is being updated · retrying",
      live: function (name) { return name + " · live"; },
      onTheWay: function (name) { return name + " is on the way"; },
      to: function (dest) { return "To " + dest; },
      updated: function (when) { return "Updated " + when; },
      retrying: function (when) { return "Retrying · " + when; }
    },
    fr: {
      doc: "WaterNow en direct",
      text: { title: "Position en direct", status: "Chargement…", stopLabel: "Prochain point d'eau", etaLabel: "Arrivée", speedLabel: "Vitesse" },
      map: "Carte avec la position partagée", offline: "Hors ligne",
      serverTitle: "Lien non reconnu", serverText: "Ce lien ne mène pas au serveur de WaterNow, donc rien n'a été chargé. Demande un nouveau lien depuis l'app WaterNow.",
      invalidTitle: "Lien invalide", invalidText: "Ce lien de position en direct est incomplet. Demandes-en un nouveau.",
      endedTitle: "Partage terminé", endedText: "Cette position en direct a été arrêtée ou a expiré.",
      unreachable: "Serveur injoignable, nouvel essai…", someone: "Quelqu'un", justNow: "à l'instant",
      maintenance: "WaterNow est en cours de mise à jour · nouvel essai",
      live: function (name) { return name + " · en direct"; },
      onTheWay: function (name) { return name + " est en route"; },
      to: function (dest) { return "Vers " + dest; },
      updated: function (when) { return "Mis à jour " + when; },
      retrying: function (when) { return "Nouvel essai · " + when; }
    },
    es: {
      doc: "WaterNow en vivo",
      text: { title: "Ubicación en tiempo real", status: "Cargando…", stopLabel: "Próximo punto de agua", etaLabel: "Llegada", speedLabel: "Velocidad" },
      map: "Mapa con la posición compartida", offline: "Sin conexión",
      serverTitle: "Enlace no reconocido", serverText: "Este enlace no lleva al servidor de WaterNow, así que no se ha cargado nada. Pide un enlace nuevo desde la app WaterNow.",
      invalidTitle: "Enlace no válido", invalidText: "Este enlace de ubicación en tiempo real está incompleto. Pide uno nuevo.",
      endedTitle: "Ya no se comparte", endedText: "Esta ubicación en tiempo real se ha detenido o ha caducado.",
      unreachable: "No se puede conectar con el servidor, reintentando…", someone: "Alguien", justNow: "ahora mismo",
      maintenance: "WaterNow se está actualizando · reintentando",
      live: function (name) { return name + " · en vivo"; },
      onTheWay: function (name) { return name + " está en camino"; },
      to: function (dest) { return "Hacia " + dest; },
      updated: function (when) { return "Actualizado " + when; },
      retrying: function (when) { return "Reintentando · " + when; }
    },
    de: {
      doc: "WaterNow Live",
      text: { title: "Live-Standort", status: "Wird geladen…", stopLabel: "Nächste Wasserstelle", etaLabel: "Ankunft", speedLabel: "Tempo" },
      map: "Karte mit der geteilten Position", offline: "Offline",
      serverTitle: "Link nicht erkannt", serverText: "Dieser Link führt nicht zum Server von WaterNow, deshalb wurde nichts geladen. Lass dir in der WaterNow-App einen neuen Link schicken.",
      invalidTitle: "Ungültiger Link", invalidText: "Dieser Link zum Live-Standort ist unvollständig. Lass dir einen neuen schicken.",
      endedTitle: "Teilen beendet", endedText: "Dieser Live-Standort wurde beendet oder ist abgelaufen.",
      unreachable: "Server nicht erreichbar, neuer Versuch…", someone: "Jemand", justNow: "gerade eben",
      maintenance: "WaterNow wird gerade aktualisiert · neuer Versuch",
      live: function (name) { return name + " · live"; },
      onTheWay: function (name) { return name + " ist unterwegs"; },
      to: function (dest) { return "Ziel: " + dest; },
      updated: function (when) { return "Aktualisiert " + when; },
      retrying: function (when) { return "Neuer Versuch · " + when; }
    },
    pt: {
      doc: "WaterNow ao vivo",
      text: { title: "Localização em tempo real", status: "Carregando…", stopLabel: "Próximo ponto de água", etaLabel: "Chegada", speedLabel: "Velocidade" },
      map: "Mapa com a posição compartilhada", offline: "Offline",
      serverTitle: "Link não reconhecido", serverText: "Este link não leva ao servidor do WaterNow, então nada foi carregado. Peça um novo link pelo app WaterNow.",
      invalidTitle: "Link inválido", invalidText: "Este link de localização em tempo real está incompleto. Peça um novo.",
      endedTitle: "Compartilhamento encerrado", endedText: "Esta localização em tempo real foi interrompida ou expirou.",
      unreachable: "Não foi possível conectar ao servidor, tentando de novo…", someone: "Alguém", justNow: "agora mesmo",
      maintenance: "O WaterNow está sendo atualizado · tentando de novo",
      live: function (name) { return name + " · ao vivo"; },
      onTheWay: function (name) { return name + " está a caminho"; },
      to: function (dest) { return "Destino: " + dest; },
      updated: function (when) { return "Atualizado " + when; },
      retrying: function (when) { return "Tentando de novo · " + when; }
    },
    ja: {
      doc: "WaterNow ライブ",
      text: { title: "ライブ位置情報", status: "読み込み中…", stopLabel: "次の給水スポット", etaLabel: "到着予定", speedLabel: "速度" },
      map: "共有された位置を表示する地図", offline: "オフライン",
      serverTitle: "リンクを認識できません", serverText: "このリンクはWaterNowのサーバーにつながっていないため、何も読み込んでいません。WaterNowアプリから新しいリンクを送ってもらってください。",
      invalidTitle: "無効なリンク", invalidText: "このライブ位置情報のリンクは不完全です。新しいリンクを送ってもらってください。",
      endedTitle: "共有が終了しました", endedText: "このライブ位置情報は停止されたか、有効期限が切れました。",
      unreachable: "サーバーに接続できません。再試行中…", someone: "誰か", justNow: "たった今",
      maintenance: "WaterNowはアップデート中です · 再試行中",
      live: function (name) { return name + " · ライブ"; },
      onTheWay: function (name) { return name + "が移動中です"; },
      to: function (dest) { return "目的地：" + dest; },
      updated: function (when) { return "更新：" + when; },
      retrying: function (when) { return "再試行中 · " + when; }
    }
  };

  if (typeof module === "object" && module.exports) {
    module.exports = { parseLiveParams: parseLiveParams, SERVER: SERVER, STRINGS: STRINGS };
    return;
  }

  var $ = function (id) { return document.getElementById(id); };
  var lang = root.WN.lang(navigator.language);
  var T = STRINGS[lang];
  document.documentElement.lang = lang;
  document.title = T.doc;
  Object.keys(T.text).forEach(function (id) { $(id).textContent = T.text[id]; });
  $("map").setAttribute("aria-label", T.map);

  function fail(title, body) {
    $("map").classList.add("hidden"); $("panel").classList.add("hidden");
    $("message").classList.remove("hidden");
    $("msgTitle").textContent = title; $("msgBody").textContent = body;
    $("status").textContent = T.offline; $("status").className = "badge";
  }

  var link = parseLiveParams(location.hash);
  if (link.error === "server") {
    fail(T.serverTitle, T.serverText);
    return;
  }
  if (link.error) {
    fail(T.invalidTitle, T.invalidText);
    return;
  }

  // Waits over France until the first position, flies in to it, then follows it (WN.map in assets/map.js).
  var map = root.WN.map($("map"), lang, [2.5, 46.5], 5, "wn-marker live");
  var last = null;

  var rtf = new Intl.RelativeTimeFormat(lang);
  function ago(ms) {
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (!isFinite(s)) return "–"; // a bad updated_at: rtf.format would throw
    if (s < 10) return T.justNow;
    if (s < 60) return rtf.format(-s, "second");
    if (s < 3600) return rtf.format(-Math.floor(s / 60), "minute");
    return rtf.format(-Math.floor(s / 3600), "hour");
  }
  function time(iso) { return iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "–"; }

  function render(s) {
    last = s;
    var name = (s.display_name || "").trim() || T.someone;
    $("title").textContent = T.live(name);
    $("who").textContent = T.onTheWay(name);
    $("dest").textContent = s.dest_name ? T.to(s.dest_name) : "";
    $("stop").textContent = s.next_stop_name || "–";
    $("eta").textContent = time(s.eta);
    $("speed").textContent = s.speed_kmh == null ? "–" : Math.round(s.speed_kmh) + " km/h";
    if (map && s.lat != null && s.lon != null) map.show(s.lat, s.lon, 15);
    status();
  }

  // WaterNow is being updated (HTTP 503): the badge says so, the last position stays, the next try waits longer.
  var updating = false;

  function status(offline) {
    var st = $("status");
    if (updating) { st.textContent = T.maintenance; st.className = "badge warn"; return; }
    if (!last) return;
    var stale = Date.now() - new Date(last.updated_at).getTime() > 120000;
    var when = ago(new Date(last.updated_at).getTime());
    st.textContent = offline ? T.retrying(when) : T.updated(when);
    st.className = "badge " + (offline || stale ? "warn" : "ok");
  }

  function poll() {
    fetch(link.endpoint, {
      method: "POST",
      headers: { "apikey": PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: link.token }),
      referrerPolicy: "no-referrer", credentials: "omit", cache: "no-store"
    }).then(function (r) {
      updating = root.WN.isMaintenance(r.status);
      if (updating) {
        status();
        setTimeout(poll, 30000);
        return undefined;
      }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (rows) {
      if (rows === undefined) return;
      if (!Array.isArray(rows) || rows.length === 0) {
        fail(T.endedTitle, T.endedText);
        return;
      }
      render(rows[0]);
      setTimeout(poll, 15000);
    }).catch(function () {
      if (last) status(true); else $("status").textContent = T.unreachable;
      setTimeout(poll, 15000);
    });
  }
  setInterval(function () { status(); }, 5000);
  poll();
})(this);

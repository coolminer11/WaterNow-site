/*
 * WaterNow gift cards and referrals on the website (docs/20_BOUTIQUE_CADEAUX_PARRAINAGE.md), by <body data-page>:
 *   gift  cadeau/?c=<12 characters>: the paid card (gift_preview, section 95: plan, months, the buyer's public name, the
 *         message), « Ouvrir dans l'app » (waternow://gift/CODE), the APK beside it. Nothing about an unpaid card.
 *   ref   r/?c=<8 characters>: a friend's referral link, « Ouvrir dans l'app » (waternow://r/CODE: the app keeps the code
 *         through the sign-in and attaches it), the APK beside it. No read: the page names nobody.
 *   trip  t/#c=<8 characters>: a road trip invitation, « Ouvrir dans l'app » (waternow://trip/CODE: « Rejoindre » with
 *         the code filled in). The code rides after # (a password to the group: never sent to the site's host). No read.
 * What the server sends is cleaned here and written with textContent only. Pure helpers and the 7 languages are shared
 * with the node test (module.exports); the page part runs in a browser only.
 */
(function (root) {
  "use strict";
  var node = typeof module === "object" && module.exports;
  var P = node ? require("./page-data.js") : root.WNP;
  // The codes' alphabet (section 95): no 0, O, 1 or I. A gift card has 12 characters, a referral code 8.
  var LEN = { gift: 12, ref: 8, trip: 8 }, LINK = { gift: "waternow://gift/", ref: "waternow://r/", trip: "waternow://trip/" };

  /** The c= code of a page's address (its ?query, or its #fragment for a trip), upper case, or null when it isn't one of [kind]. */
  function code(search, kind) {
    if (typeof search !== "string" || search.length > 512 || !LEN[kind]) return null;
    var c;
    try { c = (new URLSearchParams(search).get("c") || "").trim().toUpperCase(); } catch (e) { return null; }
    return new RegExp("^[A-HJ-NP-Z2-9]{" + LEN[kind] + "}$").test(c) ? c : null;
  }

  /** The app's link for a code: waternow://gift/CODE or waternow://r/CODE. */
  function appLink(kind, c) { return LINK[kind] + encodeURIComponent(c); }

  /** gift_preview's answer, cleaned: {plan, months, from, message, redeemed}, or null (not_found, or anything odd). */
  function preview(o) {
    if (!o || typeof o !== "object" || o.result !== "ok" || (o.plan !== "plus" && o.plan !== "racines") || [1, 3, 12].indexOf(o.months) < 0) return null;
    if (o.status !== "paid" && o.status !== "redeemed") return null;
    return { plan: o.plan, months: o.months, from: P.text(o.from_name, 40) || null, message: P.text(o.message, 140) || null, redeemed: o.status === "redeemed" };
  }

  // One table per app language. French says "tu" and « courriel », Romanian writes ș ț with the comma below.
  var STRINGS = {
    en: {
      demo: "Demo data", foot: "No trackers, no cookies.", get: "Get WaterNow", open: "Open in the app",
      getTitle: "No WaterNow yet?", getText: "Free drinking water near you, on a map the community keeps up to date.",
      docGift: "A WaterNow gift", giftLead: "A gift card for", months: function (s, n) { return n === 1 ? "1 month" : s + " months"; },
      from: function (s) { return "From " + s; }, fromNone: "Someone is giving you this gift.",
      giftHow: "Open this link on your phone with the WaterNow app, then tap « Activate ».", code: function (s) { return "Code: " + s; },
      redeemed: "This card has already been activated.", plus: "Themes, every icon, WaterNow Wrapped and ride extras, 2 trees a month for the community.",
      racines: "Your forest, the Racines badge and 3 app icons, 1 tree a month for the community.",
      missingTitle: "Gift card not found", missing: "This card doesn't exist or isn't paid yet. If it was just paid, wait a minute and reload the page.",
      badTitle: "Link incomplete", bad: "This link is damaged. Ask for it again.", soon: "Gift cards are coming soon.", offline: "No connection: the card couldn't be read.",
      retry: "Try again", docRef: "Join WaterNow", refTitle: "A friend invites you to WaterNow",
      refText: "Open this link in the app: your friend becomes your referrer.",
      refPerk: "After your first refill, a discount awaits you on one month of Racines or Plus.",
      refWhen: "The link works within 14 days of creating your account.", refCode: function (s) { return "Referral code: " + s; },
      docTrip: "Join a road trip", tripTitle: "You're invited to a road trip",
      tripText: "Open this link in the WaterNow app to join the group: everyone sees where the others are on the map.",
      tripPerk: "Leave whenever you want: your position is erased as soon as you go."
    },
    fr: {
      demo: "Données de démonstration", foot: "Aucun traceur, aucun cookie.", get: "Télécharger WaterNow", open: "Ouvrir dans l'app",
      getTitle: "Pas encore WaterNow ?", getText: "De l'eau potable gratuite près de toi, sur une carte que la communauté tient à jour.",
      docGift: "Un cadeau WaterNow", giftLead: "Une carte-cadeau pour", months: function (s, n) { return n === 1 ? "1 mois" : s + " mois"; },
      from: function (s) { return "De la part de " + s; }, fromNone: "Quelqu'un t'offre ce cadeau.",
      giftHow: "Ouvre ce lien sur ton téléphone avec l'app WaterNow, puis touche « Activer ».", code: function (s) { return "Code : " + s; },
      redeemed: "Cette carte a déjà été activée.", plus: "Les thèmes, toutes les icônes, WaterNow Wrapped et les extras de sortie, 2 arbres par mois pour la communauté.",
      racines: "Ta forêt, le badge Racines et 3 icônes d'app, 1 arbre par mois pour la communauté.",
      missingTitle: "Carte-cadeau introuvable", missing: "Cette carte n'existe pas ou n'est pas encore payée. Si elle vient de l'être, attends une minute et recharge la page.",
      badTitle: "Lien incomplet", bad: "Ce lien est abîmé. Redemande-le.", soon: "Les cartes-cadeaux arrivent bientôt.", offline: "Pas de connexion : la carte n'a pas pu être lue.",
      retry: "Réessayer", docRef: "Rejoins WaterNow", refTitle: "Un ami t'invite sur WaterNow",
      refText: "Ouvre ce lien dans l'app : ton ami devient ton parrain.",
      refPerk: "À ta première bouteille remplie, un rabais t'attend sur un mois de Racines ou de Plus.",
      refWhen: "Le lien fonctionne dans les 14 jours suivant la création de ton compte.", refCode: function (s) { return "Code de parrainage : " + s; },
      docTrip: "Rejoins un roadtrip", tripTitle: "On t'invite à un roadtrip",
      tripText: "Ouvre ce lien dans l'app WaterNow pour rejoindre le groupe : chacun voit où sont les autres sur la carte.",
      tripPerk: "Tu quittes quand tu veux : ta position est effacée dès que tu pars."
    },
    es: {
      demo: "Datos de demostración", foot: "Sin rastreadores, sin cookies.", get: "Consigue WaterNow", open: "Abrir en la app",
      getTitle: "¿Todavía no tienes WaterNow?", getText: "Agua potable gratis cerca de ti, en un mapa que la comunidad mantiene al día.",
      docGift: "Un regalo de WaterNow", giftLead: "Una tarjeta regalo de", months: function (s, n) { return n === 1 ? "1 mes" : s + " meses"; },
      from: function (s) { return "De parte de " + s; }, fromNone: "Alguien te hace este regalo.",
      giftHow: "Abre este enlace en tu teléfono con la app WaterNow y toca «Activar».", code: function (s) { return "Código: " + s; },
      redeemed: "Esta tarjeta ya se activó.", plus: "Los temas, todos los iconos, WaterNow Wrapped y los extras de salida, 2 árboles al mes para la comunidad.",
      racines: "Tu bosque, la insignia Racines y 3 iconos de la app, 1 árbol al mes para la comunidad.",
      missingTitle: "Tarjeta regalo no encontrada", missing: "Esta tarjeta no existe o todavía no está pagada. Si se acaba de pagar, espera un minuto y vuelve a cargar la página.",
      badTitle: "Enlace incompleto", bad: "Este enlace está dañado. Pídelo de nuevo.", soon: "Las tarjetas regalo llegarán pronto.", offline: "Sin conexión: no se pudo leer la tarjeta.",
      retry: "Reintentar", docRef: "Únete a WaterNow", refTitle: "Un amigo te invita a WaterNow",
      refText: "Abre este enlace en la app: así constará que te invitó tu amigo.",
      refPerk: "Tras tu primera recarga, te espera un descuento en un mes de Racines o de Plus.",
      refWhen: "El enlace funciona durante los 14 días siguientes a la creación de tu cuenta.", refCode: function (s) { return "Código de invitación: " + s; },
      docTrip: "Únete a un viaje en grupo", tripTitle: "Te invitan a un viaje en grupo",
      tripText: "Abre este enlace en la app WaterNow para unirte al grupo: cada uno ve dónde están los demás en el mapa.",
      tripPerk: "Sal cuando quieras: tu ubicación se borra en cuanto te vas."
    },
    de: {
      demo: "Demodaten", foot: "Keine Tracker, keine Cookies.", get: "WaterNow herunterladen", open: "In der App öffnen",
      getTitle: "Noch kein WaterNow?", getText: "Kostenloses Trinkwasser in deiner Nähe, auf einer Karte, die die Community aktuell hält.",
      docGift: "Ein WaterNow-Geschenk", giftLead: "Eine Geschenkkarte für", months: function (s, n) { return n === 1 ? "1 Monat" : s + " Monate"; },
      from: function (s) { return "Von " + s; }, fromNone: "Jemand schenkt dir das.",
      giftHow: "Öffne diesen Link auf deinem Handy mit der WaterNow-App und tippe auf „Aktivieren“.", code: function (s) { return "Code: " + s; },
      redeemed: "Diese Karte wurde schon aktiviert.", plus: "Designs, alle Symbole, WaterNow Wrapped und die Fahrt-Extras, 2 Bäume pro Monat für die Community.",
      racines: "Dein Wald, das Racines-Abzeichen und 3 App-Symbole, 1 Baum pro Monat für die Community.",
      missingTitle: "Geschenkkarte nicht gefunden", missing: "Diese Karte gibt es nicht oder sie ist noch nicht bezahlt. Wurde sie gerade bezahlt, warte eine Minute und lade die Seite neu.",
      badTitle: "Link unvollständig", bad: "Dieser Link ist beschädigt. Frag noch einmal danach.", soon: "Geschenkkarten kommen bald.", offline: "Keine Verbindung: Die Karte konnte nicht gelesen werden.",
      retry: "Erneut versuchen", docRef: "Komm zu WaterNow", refTitle: "Ein Freund lädt dich zu WaterNow ein",
      refText: "Öffne diesen Link in der App: So wird die Einladung deinem Freund zugeordnet.",
      refPerk: "Nach deiner ersten Nachfüllung wartet ein Rabatt auf einen Monat Racines oder Plus auf dich.",
      refWhen: "Der Link gilt in den 14 Tagen nach dem Erstellen deines Kontos.", refCode: function (s) { return "Einladungscode: " + s; },
      docTrip: "Einem Roadtrip beitreten", tripTitle: "Du bist zu einem Roadtrip eingeladen",
      tripText: "Öffne diesen Link in der WaterNow-App, um der Gruppe beizutreten: Alle sehen auf der Karte, wo die anderen sind.",
      tripPerk: "Verlass ihn, wann du willst: Dein Standort wird gelöscht, sobald du gehst."
    },
    pt: {
      demo: "Dados de demonstração", foot: "Sem rastreadores, sem cookies.", get: "Baixar o WaterNow", open: "Abrir no app",
      getTitle: "Ainda não tem o WaterNow?", getText: "Água potável grátis perto de você, em um mapa que a comunidade mantém atualizado.",
      docGift: "Um presente WaterNow", giftLead: "Um cartão-presente de", months: function (s, n) { return n === 1 ? "1 mês" : s + " meses"; },
      from: function (s) { return "Da parte de " + s; }, fromNone: "Alguém está dando este presente para você.",
      giftHow: "Abra este link no seu celular com o app WaterNow e toque em “Ativar”.", code: function (s) { return "Código: " + s; },
      redeemed: "Este cartão já foi ativado.", plus: "Os temas, todos os ícones, o WaterNow Wrapped e os extras de trajeto, 2 árvores por mês para a comunidade.",
      racines: "Sua floresta, o selo Racines e 3 ícones do app, 1 árvore por mês para a comunidade.",
      missingTitle: "Cartão-presente não encontrado", missing: "Este cartão não existe ou ainda não foi pago. Se acabou de ser pago, espere um minuto e recarregue a página.",
      badTitle: "Link incompleto", bad: "Este link está danificado. Peça de novo.", soon: "Os cartões-presente chegam em breve.", offline: "Sem conexão: não foi possível ler o cartão.",
      retry: "Tentar de novo", docRef: "Entre no WaterNow", refTitle: "Um amigo convida você para o WaterNow",
      refText: "Abra este link no app: seu amigo vira seu padrinho.",
      refPerk: "Depois da sua primeira recarga, um desconto espera por você em um mês de Racines ou de Plus.",
      refWhen: "O link funciona nos 14 dias após a criação da sua conta.", refCode: function (s) { return "Código de convite: " + s; },
      docTrip: "Entre em uma viagem em grupo", tripTitle: "Chegou um convite para uma viagem em grupo",
      tripText: "Abra este link no app WaterNow para entrar no grupo: cada um vê onde os outros estão no mapa.",
      tripPerk: "Saia quando quiser: sua localização é apagada assim que você sai."
    },
    ja: {
      demo: "デモデータ", foot: "トラッカーなし、Cookieなし。", get: "WaterNowを入手", open: "アプリで開く",
      getTitle: "WaterNowをまだ使っていませんか？", getText: "近くの無料の飲み水を、コミュニティが更新し続けるマップで探せます。",
      docGift: "WaterNowのギフト", giftLead: "ギフトカード：", months: function (s, n) { return s + "か月"; },
      from: function (s) { return s + "さんから"; }, fromNone: "ギフトが届いています。",
      giftHow: "WaterNowアプリが入ったスマートフォンでこのリンクを開き、「有効にする」をタップしてください。", code: function (s) { return "コード：" + s; },
      redeemed: "このカードはすでに有効化されています。", plus: "テーマ、すべてのアイコン、WaterNow Wrapped、ライドの追加機能。コミュニティのために毎月2本の木。",
      racines: "自分の森、Racinesバッジ、3つのアプリアイコン。コミュニティのために毎月1本の木。",
      missingTitle: "ギフトカードが見つかりません", missing: "このカードは存在しないか、まだ支払われていません。支払った直後なら、1分ほど待ってからページを再読み込みしてください。",
      badTitle: "リンクが不完全です", bad: "このリンクは壊れています。もう一度送ってもらってください。", soon: "ギフトカードは近日公開です。", offline: "接続がありません。カードを読み込めませんでした。",
      retry: "再試行", docRef: "WaterNowに参加", refTitle: "友だちがWaterNowに招待しています",
      refText: "このリンクをアプリで開くと、友だちが招待者として登録されます。",
      refPerk: "初めての給水のあと、RacinesまたはPlusの1か月分の割引が待っています。",
      refWhen: "このリンクはアカウント作成から14日以内に使えます。", refCode: function (s) { return "招待コード：" + s; },
      docTrip: "グループ旅に参加", tripTitle: "グループ旅への招待",
      tripText: "WaterNowアプリでこのリンクを開くとグループに参加できます。地図上でお互いの位置が分かります。",
      tripPerk: "いつでも抜けられます。抜けるとすぐに位置は削除されます。"
    },
    ro: {
      demo: "Date demonstrative", foot: "Fără trackere, fără cookie-uri.", get: "Descarcă WaterNow", open: "Deschide în aplicație",
      getTitle: "Încă nu ai WaterNow?", getText: "Apă potabilă gratuită lângă tine, pe o hartă pe care comunitatea o ține la zi.",
      docGift: "Un cadou WaterNow", giftLead: "Un card cadou pentru", months: function (s, n) { return n === 1 ? "1 lună" : s + " luni"; },
      from: function (s) { return "De la " + s; }, fromNone: "Cineva îți face acest cadou.",
      giftHow: "Deschide acest link pe telefonul cu aplicația WaterNow, apoi atinge „Activează”.", code: function (s) { return "Cod: " + s; },
      redeemed: "Acest card a fost deja activat.", plus: "Temele, toate pictogramele, WaterNow Wrapped și funcțiile extra pentru ture, 2 copaci pe lună pentru comunitate.",
      racines: "Pădurea ta, insigna Racines și 3 pictograme de aplicație, 1 copac pe lună pentru comunitate.",
      missingTitle: "Card cadou negăsit", missing: "Acest card nu există sau nu e încă plătit. Dacă tocmai a fost plătit, așteaptă un minut și reîncarcă pagina.",
      badTitle: "Link incomplet", bad: "Acest link e deteriorat. Cere-l din nou.", soon: "Cardurile cadou vin în curând.", offline: "Fără conexiune: cardul nu a putut fi citit.",
      retry: "Încearcă din nou", docRef: "Vino pe WaterNow", refTitle: "Un prieten te invită pe WaterNow",
      refText: "Deschide acest link în aplicație: prietenul tău va apărea ca cel care te-a invitat.",
      refPerk: "După prima reumplere, te așteaptă o reducere la o lună de Racines sau de Plus.",
      refWhen: "Linkul funcționează în primele 14 zile de la crearea contului.", refCode: function (s) { return "Cod de invitație: " + s; },
      docTrip: "Intră într-o excursie în grup", tripTitle: "Ai primit o invitație la o excursie în grup",
      tripText: "Deschide acest link în aplicația WaterNow ca să intri în grup: fiecare vede pe hartă unde sunt ceilalți.",
      tripPerk: "Pleci când vrei: poziția ta este ștearsă imediat ce pleci."
    }
  };

  /** Is a 404 PostgREST's "no such function" (PGRST202: section 95 not on the server yet)? Any other 404 is an error. */
  function missingRpc(status, body) { return status === 404 && !!body && body.code === "PGRST202"; }

  var api = { code: code, appLink: appLink, preview: preview, missingRpc: missingRpc, STRINGS: STRINGS, LEN: LEN };
  if (node) { module.exports = api; return; }

  // ---- The page ----
  var WN = root.WN;
  function meta(n) { var m = document.querySelector('meta[name="' + n + '"]'); return m ? m.getAttribute("content") : null; }
  // The server (the page's CSP connect-src pins it); the key is public by design, as on the other pages.
  var API = meta("wn-api") == null ? "https://pkqsvlbiznrqxfckaxll.supabase.co" : meta("wn-api");
  var KEY = "sb_publishable_Jw6cnMgupaVxupvltvUlPQ_mvwpiNVE";
  var PAGE = document.body.getAttribute("data-page");
  var ROOT = new URL(document.body.getAttribute("data-root") || "../", location.href).href;
  var lang = WN.lang(WN.browserLangs(navigator)), T = STRINGS[lang], nf = new Intl.NumberFormat(lang);
  var $ = function (id) { return document.getElementById(id); };
  var text = function (id, v) { var e = $(id); if (e) e.textContent = v; };
  var show = function (id, on) { var e = $(id); if (e) e.classList.toggle("hidden", !on); };

  document.documentElement.lang = lang;
  document.documentElement.classList.add("wn-ready"); // main.hold shows now, in this language (site.css)
  if (meta("wn-demo") === "1") { text("demo", T.demo); show("demo", true); } // the local preview only
  ["foot", "get", "open", "getTitle", "getText"].forEach(function (k) { text(k, T[k]); });
  text("again", T.retry);
  WN.apkLink(ROOT).then(function (apk) { if (apk) $("get").href = apk; });
  function reveal() {
    Array.prototype.slice.call(document.querySelectorAll(".page > .waiting")).forEach(function (e) { e.classList.remove("waiting"); e.classList.add("fade-in"); });
  }
  /** The line with the code: its words in the body font, the code itself a <code> people can select. */
  function codeLine(line, c) {
    var parts = line.split(c), k = document.createElement("code");
    k.textContent = c;
    $("codeLine").replaceChildren(parts[0], k, parts.slice(1).join(c));
  }
  /** A heading that just appeared inside the live region gets the focus (a screen reader reads it from there). */
  function focusOn(id) { var e = $(id); if (e) e.focus({ preventScroll: true }); }
  function bad(title, line) {
    show("card", false); show("note", false); show("againBox", false);
    text("badTitle", title); text("badText", line); show("bad", true); reveal(); focusOn("badTitle");
  }

  var c = PAGE === "trip" ? code(location.hash.slice(1), "trip") : code(location.search, PAGE === "gift" ? "gift" : "ref");
  if (PAGE === "trip") {
    document.title = T.docTrip;
    if (!c) { bad(T.badTitle, T.bad); return; }
    text("title", T.tripTitle); text("lead", T.tripText); text("perk", T.tripPerk); codeLine(T.code(c), c);
    $("open").href = appLink("trip", c);
    reveal();
    return;
  }
  if (PAGE === "ref") {
    document.title = T.docRef;
    if (!c) { bad(T.badTitle, T.bad); return; }
    text("title", T.refTitle); text("lead", T.refText); text("perk", T.refPerk); text("when", T.refWhen); codeLine(T.refCode(c), c);
    $("open").href = appLink("ref", c);
    reveal();
    return;
  }

  // ---- cadeau/?c=: the paid card ----
  document.title = T.docGift;
  if (!c) { bad(T.badTitle, T.bad); return; }
  $("open").href = appLink("gift", c);
  codeLine(T.code(c), c);
  // « Réessayer » tapped again before an answer: only the latest read may draw (an older answer is dropped).
  var seq = 0;
  function read() {
    var mine = ++seq, stale = function () { return mine !== seq; };
    show("note", false); show("againBox", false);
    WN.fetchIn(API + "/rest/v1/rpc/gift_preview", {
      method: "POST", headers: { apikey: KEY, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ p_code: c }), credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer"
    }).then(function (r) {
      if (stale()) return null;
      if (r.status === 404) {
        return r.json().catch(function () { return null; }).then(function (b) {
          if (!missingRpc(404, b)) throw new Error("HTTP 404");
          if (!stale()) bad(T.missingTitle, T.soon); // section 95 not on the server yet
          return null;
        });
      }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (j) {
      if (j === null || stale()) return;
      var g = preview(j);
      if (!g) { bad(T.missingTitle, T.missing); return; }
      document.body.setAttribute("data-plan", g.plan);
      text("lead", T.giftLead);
      text("title", g.plan === "plus" ? "WaterNow Plus" : "WaterNow Racines");
      text("months", T.months(nf.format(g.months), g.months));
      text("perks", T[g.plan]);
      text("from", g.from ? T.from(g.from) : T.fromNone);
      text("message", g.message || ""); show("message", !!g.message);
      text("how", g.redeemed ? T.redeemed : T.giftHow);
      show("open", !g.redeemed); show("codeLine", !g.redeemed);
      show("bad", false); show("card", true); reveal(); focusOn("title");
    }).catch(function () {
      if (stale()) return;
      text("note", T.offline); show("note", true); show("againBox", true); reveal();
    });
  }
  $("again").addEventListener("click", read);
  read();
})(this);

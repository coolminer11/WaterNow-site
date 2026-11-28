/* A location shared once from the app's « Ma position »: #lat=..&lon=.. Nothing is fetched, kept or sent: the place lives
   only in the link, after # (browsers never send a fragment, so neither this site's host nor a chat app's preview server
   sees it). Everything is written with textContent, never as HTML. */
(function () {
  "use strict";
  var WN = window.WN;
  var SITE = new URL("../", location.href).href;

  // One table per app language (WN.LANGS).
  var STRINGS = {
    en: {
      kicker: "Shared location", title: "Here's where they are", open: "Open in WaterNow", dir: "Directions", map: "Map of the shared location",
      note: "This location lives only in this link: WaterNow doesn't keep it.",
      badTitle: "Link incomplete", badText: "This link to a location is damaged. Ask for it again.",
      getTitle: "No WaterNow yet?", getText: "Free drinking water near you, on a map the community keeps up to date.", get: "Get WaterNow",
      foot: "No trackers, no cookies."
    },
    fr: {
      kicker: "Position partagée", title: "Voici où la personne se trouve", open: "Ouvrir dans WaterNow", dir: "Itinéraire", map: "Carte de la position partagée",
      note: "Cette position n'existe que dans ce lien : WaterNow ne la garde pas.",
      badTitle: "Lien incomplet", badText: "Ce lien vers une position est abîmé. Redemande-le.",
      getTitle: "Pas encore WaterNow ?", getText: "De l'eau potable gratuite près de toi, sur une carte que la communauté tient à jour.", get: "Obtenir WaterNow",
      foot: "Aucun traceur, aucun cookie."
    },
    es: {
      kicker: "Ubicación compartida", title: "Aquí es donde está", open: "Abrir en WaterNow", dir: "Indicaciones", map: "Mapa de la ubicación compartida",
      note: "Esta ubicación solo existe en este enlace: WaterNow no la guarda.",
      badTitle: "Enlace incompleto", badText: "Este enlace a una ubicación está dañado. Pídelo de nuevo.",
      getTitle: "¿Aún no tienes WaterNow?", getText: "Agua potable gratis cerca de ti, en un mapa que la comunidad mantiene al día.", get: "Consigue WaterNow",
      foot: "Sin rastreadores ni cookies."
    },
    de: {
      kicker: "Geteilter Standort", title: "Hier ist die Person gerade", open: "In WaterNow öffnen", dir: "Route", map: "Karte des geteilten Standorts",
      note: "Dieser Standort steckt nur in diesem Link: WaterNow speichert ihn nicht.",
      badTitle: "Link unvollständig", badText: "Dieser Link zu einem Standort ist beschädigt. Lass ihn dir noch einmal schicken.",
      getTitle: "Noch kein WaterNow?", getText: "Kostenloses Trinkwasser in deiner Nähe, auf einer Karte, die die Community aktuell hält.", get: "WaterNow holen",
      foot: "Keine Tracker, keine Cookies."
    },
    pt: {
      kicker: "Localização compartilhada", title: "É aqui que a pessoa está", open: "Abrir no WaterNow", dir: "Rota", map: "Mapa da localização compartilhada",
      note: "Esta localização só existe neste link: o WaterNow não a guarda.",
      badTitle: "Link incompleto", badText: "Este link para uma localização está corrompido. Peça de novo.",
      getTitle: "Ainda não tem o WaterNow?", getText: "Água potável grátis perto de você, em um mapa que a comunidade mantém atualizado.", get: "Baixe o WaterNow",
      foot: "Sem rastreadores, sem cookies."
    },
    ja: {
      kicker: "共有された位置", title: "相手はここにいます", open: "WaterNowで開く", dir: "ルート", map: "共有された位置の地図",
      note: "この位置はこのリンクの中にだけあります。WaterNowは保存しません。",
      badTitle: "リンクが不完全です", badText: "この位置へのリンクは壊れています。もう一度送ってもらってください。",
      getTitle: "WaterNowをまだ使っていませんか？", getText: "近くの無料の飲み水を、コミュニティが更新し続けるマップで探せます。", get: "WaterNowを入手",
      foot: "トラッカーもCookieも使っていません。"
    },
    ro: {
      kicker: "Locație distribuită", title: "Aici se află persoana", open: "Deschide în WaterNow", dir: "Traseu", map: "Harta locației distribuite",
      note: "Această locație există doar în acest link: WaterNow nu o păstrează.",
      badTitle: "Link incomplet", badText: "Acest link către o locație este deteriorat. Cere-l din nou.",
      getTitle: "Nu ai încă WaterNow?", getText: "Apă potabilă gratuită lângă tine, pe o hartă pe care comunitatea o ține la zi.", get: "Descarcă WaterNow",
      foot: "Fără trackere, fără cookie-uri."
    }
  };
  var lang = WN.lang(WN.browserLangs(navigator));
  var T = STRINGS[lang];
  document.documentElement.lang = lang;
  document.documentElement.classList.add("wn-ready"); // main.hold shows now, in this language (site.css)

  var $ = function (id) { return document.getElementById(id); };
  var text = function (id, value) { $(id).textContent = value; };
  ["kicker", "title", "open", "dir", "note", "badTitle", "badText", "getTitle", "getText", "get", "foot"].forEach(function (k) { text(k, T[k]); });
  document.title = T.kicker + " · WaterNow";

  // "Get WaterNow": the APK announced by the site's version.json when it checks out, else the home page.
  WN.apkLink(SITE).then(function (apk) { if (apk) $("get").href = apk; });

  var at = WN.parsePositionParams(location.hash);
  if (!at) {
    $("place").classList.add("hidden");
    $("map").classList.add("hidden");
    $("bad").classList.remove("hidden");
    document.title = "WaterNow";
    return;
  }
  text("coords", at.lat.toFixed(5) + ", " + at.lon.toFixed(5));
  $("open").href = WN.positionAppLink(at);
  $("dir").href = WN.directionsLink(at, navigator.userAgent);
  // The map's library is the page's last script: the words above are on screen first, the map starts once it has run.
  document.addEventListener("DOMContentLoaded", function () {
    var map = WN.map($("map"), lang, [at.lon, at.lat], 12, "wn-marker", T.map);
    if (map) map.show(at.lat, at.lon, 16);
  });
})();

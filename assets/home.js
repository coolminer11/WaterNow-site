/* Landing page: the text in the browser's language (English in the HTML is the no-JS fallback), and the download button from version.json (when it checks out). */
(function () {
  "use strict";
  var WN = window.WN;
  var $ = function (id) { return document.getElementById(id); };
  var site = new URL("./", location.href).href;

  // One table per app language (WN.LANGS); `text` keys are element ids.
  var STRINGS = {
    en: {
      doc: "WaterNow: free drinking water near you", version: "Version ",
      text: {
        title: "Free drinking water, near you",
        lead: "WaterNow shows fountains, bottle refill stations, water for dogs and restrooms on a map, with directions, even offline.",
        p1: "Points checked by the community: see what works right now.",
        p2: "Add a water point, a photo or a review in a few taps.",
        p3: "Track the plastic bottles you avoid, and take on weekly challenges.",
        download: "Download for Android",
        privacyTitle: "Privacy",
        privacy: "This site has no trackers, no ads and no cookies. The app uses your location to find the water around you and guide you there. What you add (points, photos, reviews, checks) is shared with the community, and you can export or delete your data from the app at any time."
      }
    },
    fr: {
      doc: "WaterNow : de l'eau potable gratuite près de toi", version: "Version ",
      text: {
        title: "De l'eau potable gratuite, près de toi",
        lead: "WaterNow affiche les fontaines, les stations de remplissage, l'eau pour chiens et les toilettes sur une carte, avec l'itinéraire, même hors ligne.",
        p1: "Des points vérifiés par la communauté : vois ce qui fonctionne en ce moment.",
        p2: "Ajoute un point d'eau, une photo ou un avis en quelques gestes.",
        p3: "Suis les bouteilles en plastique évitées et relève les défis de la semaine.",
        download: "Télécharger pour Android",
        privacyTitle: "Confidentialité",
        privacy: "Ce site n'a aucun traceur, aucune pub et aucun cookie. L'app utilise ta position pour trouver l'eau autour de toi et t'y guider. Ce que tu ajoutes (points, photos, avis, vérifications) est partagé avec la communauté, et tu peux exporter ou supprimer tes données depuis l'app à tout moment."
      }
    },
    es: {
      doc: "WaterNow: agua potable gratis cerca de ti", version: "Versión ",
      text: {
        title: "Agua potable gratis, cerca de ti",
        lead: "WaterNow muestra fuentes, estaciones de recarga, agua para perros y baños en un mapa, con indicaciones, incluso sin conexión.",
        p1: "Puntos verificados por la comunidad: mira qué funciona ahora mismo.",
        p2: "Añade un punto de agua, una foto o una reseña en pocos toques.",
        p3: "Lleva la cuenta de las botellas de plástico que evitas y supera los retos semanales.",
        download: "Descargar para Android",
        privacyTitle: "Privacidad",
        privacy: "Este sitio no tiene rastreadores, ni anuncios, ni cookies. La app usa tu ubicación para encontrar el agua a tu alrededor y llevarte hasta ella. Lo que añades (puntos, fotos, reseñas, verificaciones) se comparte con la comunidad, y puedes exportar o eliminar tus datos desde la app cuando quieras."
      }
    },
    de: {
      doc: "WaterNow: kostenloses Trinkwasser in deiner Nähe", version: "Version ",
      text: {
        title: "Kostenloses Trinkwasser in deiner Nähe",
        lead: "WaterNow zeigt Trinkbrunnen, Nachfüllstationen, Hundetränken und Toiletten auf einer Karte, mit Route, auch offline.",
        p1: "Von der Community geprüfte Orte: Sieh, was gerade funktioniert.",
        p2: "Füge mit wenigen Tipps eine Wasserstelle, ein Foto oder eine Bewertung hinzu.",
        p3: "Behalte im Blick, wie viele Plastikflaschen du vermeidest, und stell dich den Wochen-Challenges.",
        download: "Für Android herunterladen",
        privacyTitle: "Datenschutz",
        privacy: "Diese Seite hat keine Tracker, keine Werbung und keine Cookies. Die App nutzt deinen Standort, um Wasser in deiner Nähe zu finden und dich dorthin zu führen. Was du hinzufügst (Orte, Fotos, Bewertungen, Prüfungen), wird mit der Community geteilt, und du kannst deine Daten jederzeit in der App exportieren oder löschen."
      }
    },
    pt: {
      doc: "WaterNow: água potável grátis perto de você", version: "Versão ",
      text: {
        title: "Água potável grátis, perto de você",
        lead: "O WaterNow mostra bebedouros, estações de recarga, água para cães e banheiros em um mapa, com rotas, mesmo offline.",
        p1: "Pontos verificados pela comunidade: veja o que está funcionando agora.",
        p2: "Adicione um ponto de água, uma foto ou uma avaliação em poucos toques.",
        p3: "Acompanhe as garrafas de plástico que você evita e encare os desafios semanais.",
        download: "Baixar para Android",
        privacyTitle: "Privacidade",
        privacy: "Este site não tem rastreadores, anúncios nem cookies. O app usa sua localização para encontrar água perto de você e te levar até lá. O que você adiciona (pontos, fotos, avaliações, verificações) é compartilhado com a comunidade, e você pode exportar ou excluir seus dados pelo app a qualquer momento."
      }
    },
    ja: {
      doc: "WaterNow：近くの無料の飲み水", version: "バージョン ",
      text: {
        title: "無料の飲み水を、すぐ近くで",
        lead: "WaterNowは、水飲み場、給水ステーション、犬用の水、トイレをマップに表示し、オフラインでもルートを案内します。",
        p1: "コミュニティが確認したスポットなので、今使える場所がひと目でわかります。",
        p2: "給水スポット、写真、レビューを数タップで追加できます。",
        p3: "削減したペットボトルを記録して、今週のチャレンジに挑戦しましょう。",
        download: "Android版をダウンロード",
        privacyTitle: "プライバシー",
        privacy: "このサイトにはトラッカーも広告もCookieもありません。アプリは位置情報を使って周りの水を探し、そこまで案内します。追加した内容（スポット、写真、レビュー、確認）はコミュニティと共有されます。データはいつでもアプリからエクスポートまたは削除できます。"
      }
    }
  };
  var lang = WN.lang(navigator.language);
  var T = STRINGS[lang];
  document.documentElement.lang = lang;
  document.title = T.doc;
  Object.keys(T.text).forEach(function (id) { $(id).textContent = T.text[id]; });

  fetch(site + "version.json", { cache: "no-cache", credentials: "omit" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (m) {
      var apk = WN.safeApkUrl(m, site);
      if (!apk) return;
      $("download").href = apk;
      $("download").classList.remove("hidden");
      if (typeof m.versionName === "string" && /^[0-9A-Za-z.+-]{1,20}$/.test(m.versionName)) {
        $("version").textContent = T.version + m.versionName;
      }
    })
    .catch(function () {});
})();

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
      retry: "Try again", offline: "Download not reachable right now.",
      text: {
        kicker: "Android app · free, no ads",
        title: "Free drinking water, near you",
        lead: "WaterNow shows fountains, bottle refill stations, water for dogs and toilets on a map, with directions, even offline.",
        p1: "Points checked by the community: see what works right now.",
        p2: "Add a water point, a photo or a review in a few taps.",
        p3: "Track the plastic bottles you avoid, and take on weekly challenges.",
        download: "Download for Android",
        privacyTitle: "Privacy",
        privacy: "This site has no trackers, no ads and no cookies. The app uses your location to find the water around you and guide you there. What you add (points, photos, reviews, checks) is shared with the community, and you can export or delete your data from the app at any time.",
        terms: "Terms of use",
        privacyLink: "Privacy policy",
        statsLink: "See the community's live impact",
        racinesTitle: "WaterNow Racines",
        racinesLine: "A real tree planted every month, certificate included. Everything useful stays free."
      }
    },
    fr: {
      doc: "WaterNow : de l'eau potable gratuite près de toi", version: "Version ",
      retry: "Réessayer", offline: "Téléchargement injoignable pour l'instant.",
      text: {
        kicker: "App Android · gratuite, sans pub",
        title: "De l'eau potable gratuite, près de toi",
        lead: "WaterNow affiche les fontaines, les stations de remplissage, l'eau pour chiens et les toilettes sur une carte, avec l'itinéraire, même hors ligne.",
        p1: "Des points vérifiés par la communauté : vois ce qui fonctionne en ce moment.",
        p2: "Ajoute un point d'eau, une photo ou un avis en quelques gestes.",
        p3: "Suis les bouteilles en plastique évitées et relève les défis de la semaine.",
        download: "Télécharger pour Android",
        privacyTitle: "Confidentialité",
        privacy: "Ce site n'a aucun traceur, aucune pub et aucun cookie. L'app utilise ta position pour trouver l'eau autour de toi et t'y guider. Ce que tu ajoutes (points, photos, avis, vérifications) est partagé avec la communauté, et tu peux exporter ou supprimer tes données depuis l'app à tout moment.",
        terms: "Conditions d'utilisation",
        privacyLink: "Politique de confidentialité",
        statsLink: "Voir l'impact de la communauté en direct",
        racinesTitle: "WaterNow Racines",
        racinesLine: "Un vrai arbre planté chaque mois, certificat à l'appui. Tout ce qui est utile reste gratuit."
      }
    },
    es: {
      doc: "WaterNow: agua potable gratis cerca de ti", version: "Versión ",
      retry: "Reintentar", offline: "Descarga no disponible ahora mismo.",
      text: {
        kicker: "App para Android · gratis, sin anuncios",
        title: "Agua potable gratis, cerca de ti",
        lead: "WaterNow muestra fuentes, estaciones de recarga, agua para perros y baños en un mapa, con indicaciones, incluso sin conexión.",
        p1: "Puntos verificados por la comunidad: mira qué funciona ahora mismo.",
        p2: "Añade un punto de agua, una foto o una reseña en pocos toques.",
        p3: "Lleva la cuenta de las botellas de plástico que evitas y supera los retos semanales.",
        download: "Descargar para Android",
        privacyTitle: "Privacidad",
        privacy: "Este sitio no tiene rastreadores, ni anuncios, ni cookies. La app usa tu ubicación para encontrar el agua a tu alrededor y llevarte hasta ella. Lo que añades (puntos, fotos, reseñas, verificaciones) se comparte con la comunidad, y puedes exportar o eliminar tus datos desde la app cuando quieras.",
        terms: "Condiciones de uso",
        privacyLink: "Política de privacidad",
        statsLink: "Ver el impacto de la comunidad en directo",
        racinesTitle: "WaterNow Racines",
        racinesLine: "Un árbol de verdad plantado cada mes, con certificado. Todo lo útil sigue siendo gratis."
      }
    },
    de: {
      doc: "WaterNow: kostenloses Trinkwasser in deiner Nähe", version: "Version ",
      retry: "Erneut versuchen", offline: "Download gerade nicht erreichbar.",
      text: {
        kicker: "Android-App · kostenlos, ohne Werbung",
        title: "Kostenloses Trinkwasser in deiner Nähe",
        lead: "WaterNow zeigt Trinkbrunnen, Nachfüllstationen, Hundetränken und Toiletten auf einer Karte, mit Route, auch offline.",
        p1: "Von der Community geprüfte Orte: Sieh, was gerade funktioniert.",
        p2: "Füge mit wenigen Fingertipps eine Wasserstelle, ein Foto oder eine Bewertung hinzu.",
        p3: "Behalte im Blick, wie viele Plastikflaschen du vermeidest, und stell dich den Wochen-Challenges.",
        download: "Für Android herunterladen",
        privacyTitle: "Datenschutz",
        privacy: "Diese Seite hat keine Tracker, keine Werbung und keine Cookies. Die App nutzt deinen Standort, um Wasser in deiner Nähe zu finden und dich dorthin zu führen. Was du hinzufügst (Orte, Fotos, Bewertungen, Prüfungen), wird mit der Community geteilt, und du kannst deine Daten jederzeit in der App exportieren oder löschen.",
        terms: "Nutzungsbedingungen",
        privacyLink: "Datenschutzerklärung",
        statsLink: "Die Wirkung der Community live ansehen",
        racinesTitle: "WaterNow Racines",
        racinesLine: "Jeden Monat ein echter Baum, mit Zertifikat. Alles Nützliche bleibt kostenlos."
      }
    },
    pt: {
      doc: "WaterNow: água potável grátis perto de você", version: "Versão ",
      retry: "Tentar de novo", offline: "Download indisponível agora.",
      text: {
        kicker: "App para Android · grátis, sem anúncios",
        title: "Água potável grátis, perto de você",
        lead: "O WaterNow mostra bebedouros, estações de recarga, água para cães e banheiros em um mapa, com rotas, mesmo offline.",
        p1: "Pontos verificados pela comunidade: veja o que está funcionando agora.",
        p2: "Adicione um ponto de água, uma foto ou uma avaliação em poucos toques.",
        p3: "Acompanhe as garrafas de plástico que você evita e encare os desafios semanais.",
        download: "Baixar para Android",
        privacyTitle: "Privacidade",
        privacy: "Este site não tem rastreadores, anúncios nem cookies. O app usa sua localização para encontrar água perto de você e levar você até lá. O que você adiciona (pontos, fotos, avaliações, verificações) é compartilhado com a comunidade, e você pode exportar ou excluir seus dados pelo app a qualquer momento.",
        terms: "Termos de uso",
        privacyLink: "Política de privacidade",
        statsLink: "Ver o impacto da comunidade ao vivo",
        racinesTitle: "WaterNow Racines",
        racinesLine: "Uma árvore de verdade plantada todo mês, com certificado. Tudo o que é útil continua grátis."
      }
    },
    ja: {
      doc: "WaterNow：近くの無料の飲み水", version: "バージョン ",
      retry: "再試行", offline: "いまダウンロードに接続できません。",
      text: {
        kicker: "Androidアプリ · 無料・広告なし",
        title: "無料の飲み水を、すぐ近くで",
        lead: "WaterNowは、水飲み場、給水ステーション、犬用の水、トイレをマップに表示し、オフラインでもルートを案内します。",
        p1: "コミュニティが確認したスポットなので、今使える場所がひと目でわかります。",
        p2: "給水スポット、写真、レビューを数タップで追加できます。",
        p3: "削減したペットボトルを記録して、今週のチャレンジに挑戦しましょう。",
        download: "Android版をダウンロード",
        privacyTitle: "プライバシー",
        privacy: "このサイトにはトラッカーも広告もCookieもありません。アプリは位置情報を使って周りの水を探し、そこまで案内します。追加した内容（スポット、写真、レビュー、確認）はコミュニティと共有されます。データはいつでもアプリからエクスポートまたは削除できます。",
        terms: "利用規約",
        privacyLink: "プライバシーポリシー",
        statsLink: "コミュニティのライブインパクトを見る",
        racinesTitle: "WaterNow Racines",
        racinesLine: "毎月1本、本物の木を植えます（証明書付き）。便利な機能はすべて無料のままです。"
      }
    },
    ro: {
      doc: "WaterNow: apă potabilă gratuită lângă tine", version: "Versiunea ",
      retry: "Încearcă din nou", offline: "Descărcare indisponibilă acum.",
      text: {
        kicker: "Aplicație Android · gratuită, fără reclame",
        title: "Apă potabilă gratuită, lângă tine",
        lead: "WaterNow îți arată pe hartă cișmelele, stațiile de reumplere a sticlelor, apa pentru câini și toaletele, cu traseu până acolo, chiar și offline.",
        p1: "Puncte verificate de comunitate: vezi ce funcționează chiar acum.",
        p2: "Adaugă un punct de apă, o fotografie sau o recenzie în câteva atingeri.",
        p3: "Ține evidența sticlelor de plastic pe care le eviți și ia parte la provocările săptămânii.",
        download: "Descarcă pentru Android",
        privacyTitle: "Confidențialitate",
        privacy: "Acest site nu are trackere, reclame sau cookie-uri. Aplicația îți folosește locația ca să găsească apa din jurul tău și să te ghideze până la ea. Ce adaugi (puncte, fotografii, recenzii, verificări) este împărtășit cu comunitatea și îți poți exporta sau șterge datele din aplicație oricând.",
        terms: "Condiții de utilizare",
        privacyLink: "Politica de confidențialitate",
        statsLink: "Vezi impactul comunității în direct",
        racinesTitle: "WaterNow Racines",
        racinesLine: "Un copac adevărat plantat în fiecare lună, cu certificat. Tot ce e util rămâne gratuit."
      }
    }
  };
  var lang = WN.lang(WN.browserLangs(navigator));
  var T = STRINGS[lang];
  document.documentElement.lang = lang;
  document.documentElement.classList.add("wn-ready"); // main.hold shows now, in this language (site.css)
  document.title = T.doc;
  Object.keys(T.text).forEach(function (id) { $(id).textContent = T.text[id]; });
  // The legal pages hold every language: open them at this one.
  $("terms").href = "terms/#" + lang;
  $("privacyLink").href = "privacy/#" + lang;

  // The button keeps its place while version.json is read (class pending: unseen, no jump), then shows. When the
  // manifest can't be read (offline, no answer within 15 s) or doesn't check out, it stays in its place as "Try again",
  // with a line under it that says why: it went, and the card below jumped up (CLS 0.017).
  var dl = $("download"), reading = false;
  function check() {
    reading = true;
    WN.fetchIn(site + "version.json", { cache: "no-cache", credentials: "omit" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (m) {
        var apk = WN.safeApkUrl(m, site);
        reading = false;
        dl.classList.remove("pending");
        dl.removeAttribute("aria-disabled");
        dl.classList.toggle("go", !!apk);
        if (!apk) {
          dl.setAttribute("role", "button");
          dl.textContent = T.retry;
          $("version").textContent = T.offline;
          return;
        }
        dl.removeAttribute("role");
        dl.textContent = T.text.download;
        dl.href = apk;
        dl.classList.add("fade-in");
        $("version").textContent = typeof m.versionName === "string" && /^[0-9A-Za-z.+-]{1,20}$/.test(m.versionName) ? T.version + m.versionName : "";
      });
  }
  // « Fontaine commune »: a small entry to the current project (the one being funded, else the vote, else the one being
  // built), only when there is one. No project, a server without the read yet (404), offline: no entry, nothing said.
  // The cards under it (Racines, privacy) wait unseen for this read (at most 3 s, site.css .waiting): the entry never pushes them.
  function commons() {
    var F = window.WNF, done = function () { $("racines").classList.remove("waiting"); $("privacyCard").classList.remove("waiting"); };
    if (!F) { done(); return; } // fontaine-data.js didn't load: no entry
    var m = document.querySelector('meta[name="wn-api"]'), api = m ? m.getAttribute("content") : null;
    if (api == null) { done(); return; }
    var FT = F.STRINGS[lang], demo = document.querySelector('meta[name="wn-demo"]');
    if (demo && demo.getAttribute("content") === "1") { $("demo").textContent = FT.demo; $("demo").classList.remove("hidden"); } // the local preview only
    WN.fetchIn(api + "/rest/v1/rpc/commons_list", {
      method: "POST", headers: { apikey: "sb_publishable_Jw6cnMgupaVxupvltvUlPQ_mvwpiNVE", Accept: "application/json", "Content-Type": "application/json" },
      body: "{}", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer"
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (list) {
        var p = F.current((Array.isArray(list) ? list : []).map(function (o) { return F.project(o, api, location.href); }));
        if (p) {
          var total = p.raised; // gifts + matched + money moved in (section 85)
          $("commonsTitle").textContent = p.title || FT.name;
          // The feature's name in the line under the title (no label above it).
          $("commonsLine").textContent = FT.name + " · " + (p.status === "vote" ? FT.status.vote
            : FT.raisedOf(F.money(total, lang), F.money(p.goal, lang)) + " · " + FT.status[p.status]);
          // During the vote: voting is in the app, so the project in the app (the download button above gets it).
          if (p.status === "vote" && F.appLink(p.id)) {
            $("commonsVote").textContent = FT.voteTitle;
            $("commonsVote").href = F.appLink(p.id);
            $("commonsApp").classList.remove("hidden");
          }
          $("commonsFill").style.setProperty("--w", (F.share(total, p.goal) * 100).toFixed(1) + "%");
          $("commonsTrack").classList.toggle("hidden", p.status === "vote");
          $("commons").href = "fontaine/?p=" + p.id;
          $("commons").classList.remove("hidden");
          $("commons").classList.add("fade-in");
        }
        done();
      });
  }
  commons();

  dl.addEventListener("click", function (e) {
    if (dl.getAttribute("role") !== "button") return; // the APK: the browser downloads it
    e.preventDefault();
    if (reading) return;
    dl.setAttribute("aria-disabled", "true");
    check();
  });
  // A button takes Space as well as Enter (a link only Enter): Space on "Try again" scrolled the page instead.
  dl.addEventListener("keydown", function (e) {
    if (e.key === " " && dl.getAttribute("role") === "button") { e.preventDefault(); dl.click(); }
  });
  check();
})();

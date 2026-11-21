/*
 * WaterNow Statistics, private console: « Boutique » for admins (docs/20_BOUTIQUE_CADEAUX_PARRAINAGE.md, section 94).
 * The partner shop's partners (shop_admin_upsert_partner: name, link, a commons-media logo, a short blurb, shown or not)
 * and their discount codes, pasted per tier (shop_admin_add_codes: 5 % free, 10 % Racines, 15 % Plus), with what is left
 * and handed out (shop_admin_list: counts only, never a code or who holds it), and the unused ones dropped
 * (shop_admin_drop_unused). Admin + aal2, checked by the server. The session, calls and uploads are console.js's
 * (window.WNCAPP); text cleaning page-data.js's, the logo rules racines.js's. Text through textContent only. Pure helpers
 * shared with the node test (module.exports).
 */
(function (root) {
  "use strict";
  var node = typeof module === "object" && module.exports;
  var P = node ? require("../assets/page-data.js") : root.WNP;
  var RC = node ? require("./racines.js") : root.WNC_RC;
  var TIERS = ["free", "racines", "plus"], CODE = /^[A-Za-z0-9._-]{3,40}$/, CODES_MAX = 5000;

  function n(v) { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : 0; }
  function https(v) {
    try { var u = new URL(v); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch (e) { return null; }
  }

  /** shop_admin_list's answer, cleaned: [{id, name, url, logo_url, blurb, active, codes: {free: {left, assigned}, …}}]. */
  function partners(o) {
    var list = o && Array.isArray(o.partners) ? o.partners : [];
    return list.filter(function (p) { return p && Number.isSafeInteger(p.id) && P.text(p.name, 120); }).map(function (p) {
      var c = p.codes && typeof p.codes === "object" ? p.codes : {}, codes = {};
      TIERS.forEach(function (t) { codes[t] = { left: n(c[t] && c[t].left), assigned: n(c[t] && c[t].assigned) }; });
      return { id: p.id, name: P.text(p.name, 120), url: typeof p.url === "string" ? p.url : "", logo_url: typeof p.logo_url === "string" ? p.logo_url : "",
               blurb: P.text(p.blurb, 280, true), active: p.active !== false, codes: codes };
    });
  }

  /**
   * The partner form as shop_admin_upsert_partner's p: {id (absent: a new one), name, url, logo_url, blurb, active}, or
   * {error: "name" | "url" | "logo" | "blurb"} (the server's rules, said before the call).
   */
  function partnerPayload(f, api, base) {
    var name = P.text(f && f.name, 120);
    if (Array.from(name).length < 2) return { error: "name" };
    var url = String(f.url || "").trim(), logo = String(f.logo || "").trim(), blurb = String(f.blurb || "").trim();
    if (url && (url.length > 500 || !https(url))) return { error: "url" };
    if (logo && !RC.logoOk(logo, api, base)) return { error: "logo" };
    if (Array.from(blurb).length > 280) return { error: "blurb" };
    var p = { name: name, url: url || null, logo_url: logo || null, blurb: P.text(blurb, 280, true), active: f.active !== false };
    if (Number.isSafeInteger(f.id) && f.id > 0) p.id = f.id;
    return { p: p };
  }

  /**
   * Codes pasted as the partner sent them (one per line, or separated by spaces, commas or semicolons): {codes} in their
   * order, repeats once; or {error: "empty" | "many"} or {error: "bad", code} (3 to 40 of A-Z a-z 0-9 . _ -).
   */
  function codesList(text) {
    var seen = {}, codes = [];
    String(text || "").split(/[\s,;]+/).forEach(function (c) { if (c && !seen[c]) { seen[c] = true; codes.push(c); } });
    if (!codes.length) return { error: "empty" };
    if (codes.length > CODES_MAX) return { error: "many" };
    for (var i = 0; i < codes.length; i++) if (!CODE.test(codes[i])) return { error: "bad", code: codes[i].slice(0, 40) };
    return { codes: codes };
  }

  // The console's 7 languages (docs/translations-glossary.md): French says "tu" and « courriel », Romanian writes ș ț.
  var STRINGS = {
    en: {
      title: "Shop", lead: "Partners who give members a discount code: 5% for free members, 10% Racines, 15% Plus. One code per member, per partner and per year; nobody sees who holds which code.",
      unavailable: "The shop isn't on the server yet (section 94).", forbidden: "This account can't manage the shop.", refused: "The server refused this change.",
      saved: "Saved.", removed: "Removed.", noPartners: "No partner yet.", newPartner: "New partner", editing: function (s) { return "Edit: " + s; },
      edit: "Edit", cancel: "Cancel", remove: "Remove", shown: "Shown", hidden: "Hidden",
      fName: "Name", fUrl: "Website (https)", fLogo: "Logo (WaterNow storage link)", upload: "Choose a picture", uploading: "Sending the picture…",
      uploaded: "Picture sent: save to keep it.", badFile: "A JPEG, PNG or WebP picture of 2 MB at most.", uploadFailed: "The picture couldn't be sent. Try again.",
      fBlurb: "A short line for members (280 at most)", fActive: "Show in the app", save: "Save",
      codes: "Codes", codesLead: "Paste the codes the partner sent, one per line (or separated by spaces or commas). Codes already there count as duplicates.",
      fTier: "For", fCodes: "Codes", addCodes: "Add the codes", choose: "Choose a partner first, or save the new one.",
      added: function (a, d) { return a + " added" + (d ? ", " + d + " already there" : "") + "."; },
      drop: function (t) { return "Drop the unused codes: " + t; }, dropped: function (k) { return k + " unused codes dropped."; },
      tiers: { free: "Free (5%)", racines: "Racines (10%)", plus: "Plus (15%)" },
      counts: function (l, a) { return l + " left · " + a + " handed out"; },
      bad: { name: "Type the partner's name (2 characters or more).", url: "The website must start with https://.", logo: "A logo comes from WaterNow's storage only: use “Choose a picture”.",
        blurb: "280 characters at most.", empty: "Paste at least one code.", many: "5,000 codes at most per paste.", code: function (c) { return "This code can't be used: " + c + " (3 to 40 letters, digits, . _ -)."; } },
      reasons: { in_use: "Codes of this partner were handed out: hide it instead.", bad_name: "The server refused the name.", bad_url: "The server refused a link.",
        bad_blurb: "The server refused the line.", not_found: "This partner no longer exists.", bad_tier: "Choose a tier.", bad_codes: "Paste from 1 to 5,000 codes.",
        bad_code: "The server refused a code." }
    },
    fr: {
      title: "Boutique", lead: "Les partenaires qui donnent un code de rabais aux membres : 5 % sans abonnement, 10 % Racines, 15 % Plus. Un code par membre, par partenaire et par année ; personne ne voit qui détient quel code.",
      unavailable: "La boutique n'est pas encore sur le serveur (section 94).", forbidden: "Ce compte ne peut pas gérer la boutique.", refused: "Le serveur a refusé ce changement.",
      saved: "Enregistré.", removed: "Retiré.", noPartners: "Aucun partenaire pour l'instant.", newPartner: "Nouveau partenaire", editing: function (s) { return "Modifier : " + s; },
      edit: "Modifier", cancel: "Annuler", remove: "Retirer", shown: "Affiché", hidden: "Masqué",
      fName: "Nom", fUrl: "Site web (https)", fLogo: "Logo (lien du stockage WaterNow)", upload: "Choisir une image", uploading: "Envoi de l'image…",
      uploaded: "Image envoyée : enregistre pour la garder.", badFile: "Une image JPEG, PNG ou WebP de 2 Mo au plus.", uploadFailed: "L'image n'a pas pu être envoyée. Réessaie.",
      fBlurb: "Une courte ligne pour les membres (280 au plus)", fActive: "Afficher dans l'app", save: "Enregistrer",
      codes: "Codes", codesLead: "Colle les codes envoyés par le partenaire, un par ligne (ou séparés par des espaces ou des virgules). Ceux qui y sont déjà comptent comme doublons.",
      fTier: "Pour", fCodes: "Codes", addCodes: "Ajouter les codes", choose: "Choisis d'abord un partenaire, ou enregistre le nouveau.",
      added: function (a, d) { return a + " ajoutés" + (d ? ", " + d + " déjà là" : "") + "."; },
      drop: function (t) { return "Retirer les codes non utilisés : " + t; }, dropped: function (k) { return k + " codes non utilisés retirés."; },
      tiers: { free: "Gratuit (5 %)", racines: "Racines (10 %)", plus: "Plus (15 %)" },
      counts: function (l, a) { return l + " restants · " + a + " donnés"; },
      bad: { name: "Écris le nom du partenaire (2 caractères ou plus).", url: "Le site web doit commencer par https://.", logo: "Un logo vient seulement du stockage WaterNow : utilise « Choisir une image ».",
        blurb: "280 caractères au plus.", empty: "Colle au moins un code.", many: "5 000 codes au plus à la fois.", code: function (c) { return "Ce code ne peut pas servir : " + c + " (3 à 40 lettres, chiffres, . _ -)."; } },
      reasons: { in_use: "Des codes de ce partenaire ont été donnés : masque-le plutôt.", bad_name: "Le serveur a refusé le nom.", bad_url: "Le serveur a refusé un lien.",
        bad_blurb: "Le serveur a refusé la ligne.", not_found: "Ce partenaire n'existe plus.", bad_tier: "Choisis un forfait.", bad_codes: "Colle de 1 à 5 000 codes.",
        bad_code: "Le serveur a refusé un code." }
    },
    es: {
      title: "Tienda", lead: "Los socios que dan un código de descuento a los miembros: 5 % para todos, 10 % con Racines, 15 % con Plus. Un código por miembro, por socio y por año; nadie ve quién tiene qué código.",
      unavailable: "La tienda todavía no está en el servidor (sección 94).", forbidden: "Esta cuenta no puede gestionar la tienda.", refused: "El servidor rechazó este cambio.",
      saved: "Guardado.", removed: "Eliminado.", noPartners: "Todavía no hay socios.", newPartner: "Nuevo socio", editing: function (s) { return "Editar: " + s; },
      edit: "Editar", cancel: "Cancelar", remove: "Eliminar", shown: "Visible", hidden: "Oculto",
      fName: "Nombre", fUrl: "Sitio web (https)", fLogo: "Logo (enlace del almacenamiento de WaterNow)", upload: "Elegir una imagen", uploading: "Enviando la imagen…",
      uploaded: "Imagen enviada: guarda para conservarla.", badFile: "Una imagen JPEG, PNG o WebP de 2 MB como máximo.", uploadFailed: "No se pudo enviar la imagen. Inténtalo de nuevo.",
      fBlurb: "Una línea breve para los miembros (280 como máximo)", fActive: "Mostrar en la app", save: "Guardar",
      codes: "Códigos", codesLead: "Pega los códigos que envió el socio, uno por línea (o separados por espacios o comas). Los que ya están cuentan como duplicados.",
      fTier: "Para", fCodes: "Códigos", addCodes: "Añadir los códigos", choose: "Elige primero un socio, o guarda el nuevo.",
      added: function (a, d) { return a + " añadidos" + (d ? ", " + d + " ya estaban" : "") + "."; },
      drop: function (t) { return "Quitar los códigos sin usar: " + t; }, dropped: function (k) { return k + " códigos sin usar quitados."; },
      tiers: { free: "Gratis (5 %)", racines: "Racines (10 %)", plus: "Plus (15 %)" },
      counts: function (l, a) { return l + " disponibles · " + a + " entregados"; },
      bad: { name: "Escribe el nombre del socio (2 caracteres o más).", url: "El sitio web debe empezar por https://.", logo: "Un logo solo puede venir del almacenamiento de WaterNow: usa «Elegir una imagen».",
        blurb: "280 caracteres como máximo.", empty: "Pega al menos un código.", many: "5000 códigos como máximo cada vez.", code: function (c) { return "Este código no sirve: " + c + " (de 3 a 40 letras, cifras, . _ -)."; } },
      reasons: { in_use: "Ya se entregaron códigos de este socio: mejor ocúltalo.", bad_name: "El servidor rechazó el nombre.", bad_url: "El servidor rechazó un enlace.",
        bad_blurb: "El servidor rechazó la línea.", not_found: "Este socio ya no existe.", bad_tier: "Elige un plan.", bad_codes: "Pega de 1 a 5000 códigos.",
        bad_code: "El servidor rechazó un código." }
    },
    de: {
      title: "Shop", lead: "Partner, die Mitgliedern einen Rabattcode geben: 5 % kostenlos, 10 % Racines, 15 % Plus. Ein Code pro Mitglied, Partner und Jahr; niemand sieht, wer welchen Code hat.",
      unavailable: "Der Shop ist noch nicht auf dem Server (Abschnitt 94).", forbidden: "Dieses Konto kann den Shop nicht verwalten.", refused: "Der Server hat diese Änderung abgelehnt.",
      saved: "Gespeichert.", removed: "Entfernt.", noPartners: "Noch kein Partner.", newPartner: "Neuer Partner", editing: function (s) { return "Bearbeiten: " + s; },
      edit: "Bearbeiten", cancel: "Abbrechen", remove: "Entfernen", shown: "Sichtbar", hidden: "Verborgen",
      fName: "Name", fUrl: "Website (https)", fLogo: "Logo (Link zum WaterNow-Speicher)", upload: "Bild auswählen", uploading: "Bild wird gesendet…",
      uploaded: "Bild gesendet: Speichere, um es zu behalten.", badFile: "Ein JPEG-, PNG- oder WebP-Bild von höchstens 2 MB.", uploadFailed: "Das Bild konnte nicht gesendet werden. Versuche es noch einmal.",
      fBlurb: "Eine kurze Zeile für Mitglieder (höchstens 280)", fActive: "In der App zeigen", save: "Speichern",
      codes: "Codes", codesLead: "Füge die Codes des Partners ein, einen pro Zeile (oder durch Leerzeichen oder Kommas getrennt). Vorhandene zählen als Duplikate.",
      fTier: "Für", fCodes: "Codes", addCodes: "Codes hinzufügen", choose: "Wähle zuerst einen Partner oder speichere den neuen.",
      added: function (a, d) { return a + " hinzugefügt" + (d ? ", " + d + " schon vorhanden" : "") + "."; },
      drop: function (t) { return "Unbenutzte Codes entfernen: " + t; }, dropped: function (k) { return k + " unbenutzte Codes entfernt."; },
      tiers: { free: "Kostenlos (5 %)", racines: "Racines (10 %)", plus: "Plus (15 %)" },
      counts: function (l, a) { return l + " übrig · " + a + " vergeben"; },
      bad: { name: "Gib den Namen des Partners ein (mindestens 2 Zeichen).", url: "Die Website muss mit https:// beginnen.", logo: "Ein Logo kommt nur aus dem WaterNow-Speicher: Nutze „Bild auswählen“.",
        blurb: "Höchstens 280 Zeichen.", empty: "Füge mindestens einen Code ein.", many: "Höchstens 5.000 Codes auf einmal.", code: function (c) { return "Dieser Code geht nicht: " + c + " (3 bis 40 Buchstaben, Ziffern, . _ -)."; } },
      reasons: { in_use: "Codes dieses Partners wurden vergeben: Verberge ihn stattdessen.", bad_name: "Der Server hat den Namen abgelehnt.", bad_url: "Der Server hat einen Link abgelehnt.",
        bad_blurb: "Der Server hat die Zeile abgelehnt.", not_found: "Diesen Partner gibt es nicht mehr.", bad_tier: "Wähle ein Abo.", bad_codes: "Füge 1 bis 5.000 Codes ein.",
        bad_code: "Der Server hat einen Code abgelehnt." }
    },
    pt: {
      title: "Loja", lead: "Os parceiros que dão um código de desconto aos membros: 5% no plano gratuito, 10% no Racines, 15% no Plus. Um código por membro, por parceiro e por ano; ninguém vê quem tem qual código.",
      unavailable: "A loja ainda não está no servidor (seção 94).", forbidden: "Esta conta não pode gerenciar a loja.", refused: "O servidor recusou esta alteração.",
      saved: "Salvo.", removed: "Removido.", noPartners: "Nenhum parceiro ainda.", newPartner: "Novo parceiro", editing: function (s) { return "Editar: " + s; },
      edit: "Editar", cancel: "Cancelar", remove: "Remover", shown: "Visível", hidden: "Oculto",
      fName: "Nome", fUrl: "Site (https)", fLogo: "Logo (link do armazenamento do WaterNow)", upload: "Escolher uma imagem", uploading: "Enviando a imagem…",
      uploaded: "Imagem enviada: salve para mantê-la.", badFile: "Uma imagem JPEG, PNG ou WebP de até 2 MB.", uploadFailed: "Não foi possível enviar a imagem. Tente de novo.",
      fBlurb: "Uma linha curta para os membros (até 280)", fActive: "Mostrar no app", save: "Salvar",
      codes: "Códigos", codesLead: "Cole os códigos enviados pelo parceiro, um por linha (ou separados por espaços ou vírgulas). Os que já existem contam como duplicados.",
      fTier: "Para", fCodes: "Códigos", addCodes: "Adicionar os códigos", choose: "Escolha primeiro um parceiro, ou salve o novo.",
      added: function (a, d) { return a + " adicionados" + (d ? ", " + d + " já existiam" : "") + "."; },
      drop: function (t) { return "Remover os códigos não usados: " + t; }, dropped: function (k) { return k + " códigos não usados removidos."; },
      tiers: { free: "Gratuito (5%)", racines: "Racines (10%)", plus: "Plus (15%)" },
      counts: function (l, a) { return l + " restantes · " + a + " entregues"; },
      bad: { name: "Digite o nome do parceiro (2 caracteres ou mais).", url: "O site deve começar com https://.", logo: "Um logo só pode vir do armazenamento do WaterNow: use “Escolher uma imagem”.",
        blurb: "Até 280 caracteres.", empty: "Cole pelo menos um código.", many: "Até 5.000 códigos por vez.", code: function (c) { return "Este código não serve: " + c + " (3 a 40 letras, números, . _ -)."; } },
      reasons: { in_use: "Códigos deste parceiro já foram entregues: oculte-o em vez disso.", bad_name: "O servidor recusou o nome.", bad_url: "O servidor recusou um link.",
        bad_blurb: "O servidor recusou a linha.", not_found: "Este parceiro não existe mais.", bad_tier: "Escolha um plano.", bad_codes: "Cole de 1 a 5.000 códigos.",
        bad_code: "O servidor recusou um código." }
    },
    ja: {
      title: "ショップ", lead: "メンバーに割引コードを提供するパートナー：無料5%、Racines 10%、Plus 15%。コードはメンバー・パートナー・年ごとに1つ。誰がどのコードを持っているかは誰にも見えません。",
      unavailable: "ショップはまだサーバーにありません（セクション94）。", forbidden: "このアカウントではショップを管理できません。", refused: "サーバーがこの変更を拒否しました。",
      saved: "保存しました。", removed: "削除しました。", noPartners: "まだパートナーはいません。", newPartner: "新しいパートナー", editing: function (s) { return "編集：" + s; },
      edit: "編集", cancel: "キャンセル", remove: "削除", shown: "表示中", hidden: "非表示",
      fName: "名前", fUrl: "ウェブサイト（https）", fLogo: "ロゴ（WaterNowストレージのリンク）", upload: "画像を選ぶ", uploading: "画像を送信中…",
      uploaded: "画像を送信しました。保存すると反映されます。", badFile: "2 MB以下のJPEG、PNG、WebP画像にしてください。", uploadFailed: "画像を送信できませんでした。もう一度お試しください。",
      fBlurb: "メンバー向けの短い説明（280文字まで）", fActive: "アプリに表示", save: "保存",
      codes: "コード", codesLead: "パートナーから届いたコードを1行に1つ（またはスペースやカンマ区切りで）貼り付けてください。登録済みのものは重複として数えます。",
      fTier: "対象", fCodes: "コード", addCodes: "コードを追加", choose: "先にパートナーを選ぶか、新しいパートナーを保存してください。",
      added: function (a, d) { return a + "件追加" + (d ? "（" + d + "件は登録済み）" : "") + "。"; },
      drop: function (t) { return "未使用のコードを削除：" + t; }, dropped: function (k) { return "未使用のコードを" + k + "件削除しました。"; },
      tiers: { free: "無料（5%）", racines: "Racines（10%）", plus: "Plus（15%）" },
      counts: function (l, a) { return "残り" + l + " · 配布済み" + a; },
      bad: { name: "パートナー名を入力してください（2文字以上）。", url: "ウェブサイトはhttps:// で始めてください。", logo: "ロゴはWaterNowのストレージからのみ使えます。「画像を選ぶ」を使ってください。",
        blurb: "280文字までにしてください。", empty: "コードを1つ以上貼り付けてください。", many: "一度に貼り付けられるのは5,000件までです。", code: function (c) { return "このコードは使えません：" + c + "（3〜40文字の英数字と . _ -）。"; } },
      reasons: { in_use: "このパートナーのコードはすでに配布されています。代わりに非表示にしてください。", bad_name: "サーバーが名前を拒否しました。", bad_url: "サーバーがリンクを拒否しました。",
        bad_blurb: "サーバーが説明を拒否しました。", not_found: "このパートナーはもう存在しません。", bad_tier: "プランを選んでください。", bad_codes: "1〜5,000件のコードを貼り付けてください。",
        bad_code: "サーバーがコードを拒否しました。" }
    },
    ro: {
      title: "Magazin", lead: "Partenerii care dau membrilor un cod de reducere: 5 % fără abonament, 10 % Racines, 15 % Plus. Un cod pe membru, pe partener și pe an; nimeni nu vede cine are ce cod.",
      unavailable: "Magazinul nu e încă pe server (secțiunea 94).", forbidden: "Acest cont nu poate gestiona magazinul.", refused: "Serverul a refuzat această modificare.",
      saved: "Salvat.", removed: "Eliminat.", noPartners: "Încă niciun partener.", newPartner: "Partener nou", editing: function (s) { return "Modifică: " + s; },
      edit: "Modifică", cancel: "Anulează", remove: "Elimină", shown: "Afișat", hidden: "Ascuns",
      fName: "Nume", fUrl: "Site web (https)", fLogo: "Siglă (link din stocarea WaterNow)", upload: "Alege o imagine", uploading: "Se trimite imaginea…",
      uploaded: "Imagine trimisă: salvează ca s-o păstrezi.", badFile: "O imagine JPEG, PNG sau WebP de cel mult 2 MB.", uploadFailed: "Imaginea nu s-a putut trimite. Încearcă din nou.",
      fBlurb: "Un rând scurt pentru membri (cel mult 280)", fActive: "Afișează în aplicație", save: "Salvează",
      codes: "Coduri", codesLead: "Lipește codurile trimise de partener, câte unul pe rând (sau separate prin spații ori virgule). Cele care există deja contează ca duplicate.",
      fTier: "Pentru", fCodes: "Coduri", addCodes: "Adaugă codurile", choose: "Alege mai întâi un partener sau salvează-l pe cel nou.",
      added: function (a, d) { return a + " adăugate" + (d ? ", " + d + " existau deja" : "") + "."; },
      drop: function (t) { return "Elimină codurile nefolosite: " + t; }, dropped: function (k) { return k + " coduri nefolosite eliminate."; },
      tiers: { free: "Gratuit (5 %)", racines: "Racines (10 %)", plus: "Plus (15 %)" },
      counts: function (l, a) { return l + " rămase · " + a + " distribuite"; },
      bad: { name: "Scrie numele partenerului (cel puțin 2 caractere).", url: "Site-ul trebuie să înceapă cu https://.", logo: "O siglă vine doar din stocarea WaterNow: folosește „Alege o imagine”.",
        blurb: "Cel mult 280 de caractere.", empty: "Lipește cel puțin un cod.", many: "Cel mult 5.000 de coduri odată.", code: function (c) { return "Acest cod nu poate fi folosit: " + c + " (3 până la 40 de litere, cifre, . _ -)."; } },
      reasons: { in_use: "Au fost deja distribuite coduri ale acestui partener: mai bine ascunde-l.", bad_name: "Serverul a refuzat numele.", bad_url: "Serverul a refuzat un link.",
        bad_blurb: "Serverul a refuzat rândul.", not_found: "Acest partener nu mai există.", bad_tier: "Alege un abonament.", bad_codes: "Lipește între 1 și 5.000 de coduri.",
        bad_code: "Serverul a refuzat un cod." }
    }
  };

  var api = { STRINGS: STRINGS, partners: partners, partnerPayload: partnerPayload, codesList: codesList, TIERS: TIERS, CODES_MAX: CODES_MAX };
  if (node) { module.exports = api; return; }

  // ---- The page ----
  var A = root.WNCAPP;
  if (!A || !P || !RC) return;
  var T = STRINGS[A.lang] || STRINGS.en, nf = new Intl.NumberFormat(A.lang);
  function el(tag, cls, t) { var e = document.createElement(tag); if (cls) e.className = cls; if (t != null) e.textContent = t; return e; }
  function clear(x) { while (x.firstChild) x.removeChild(x.firstChild); return x; }
  function btn(parent, t, cls) { var b = el("button", cls || "ghost", t); b.type = "button"; parent.appendChild(b); return b; }
  var uid = 0;
  function field(parent, label, type, value, attrs) {
    var id = "sh" + (++uid), l = el("label", "field", label), i = el(type === "select" || type === "textarea" ? type : "input", "input");
    l.htmlFor = id; i.id = id;
    if (type !== "select" && type !== "textarea") i.type = type;
    Object.keys(attrs || {}).forEach(function (k) { i.setAttribute(k, attrs[k]); });
    if (value != null && type !== "select") i.value = value;
    var w = el("div", "rc-f"); w.appendChild(l); w.appendChild(i); parent.appendChild(w);
    return i;
  }
  function waiting(b, on) { if (on) b.setAttribute("aria-disabled", "true"); else b.removeAttribute("aria-disabled"); }
  function isWaiting(b) { return b.getAttribute("aria-disabled") === "true"; }

  var box = document.getElementById("shop"), list = [], edit = null, msg = null, last = null, inited = false, tier = "free";
  function say(t, cls) { last = t ? [t, cls] : null; if (msg) { msg.textContent = t || ""; msg.className = "msg" + (cls ? " " + cls : ""); } }
  function fatal(e) {
    if (e.status === 401) { A.lost(); return true; }
    if (e.code === "WNMFA") { A.showMfa(); return true; }
    return false;
  }

  async function load() {
    try {
      list = partners(await A.rpc("shop_admin_list", {}));
      if (edit) edit = list.filter(function (p) { return p.id === edit.id; })[0] || null;
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

  /** One write: the answer when the server took it ({result: 'ok', …}), else null; the line under the card says why not. */
  async function call(name, args, b) {
    if (isWaiting(b)) return null;
    waiting(b, true);
    try {
      var r = await A.rpc(name, args);
      if (!r || r.result !== "ok") {
        var why = r && typeof r.result === "string" ? r.result : "";
        say(why === "bad_code" && r.code ? T.bad.code(P.text(r.code, 40)) : T.reasons[why] || T.refused + (why ? " (" + P.text(why, 40) + ")" : ""), "err");
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
    var grid = el("div", "rc-grid sh-grid"), side = el("div"), main = el("div", "rc-forms");
    if (!list.length) side.appendChild(el("p", "note", T.noPartners));
    else {
      var ul = el("ul", "rc-list");
      list.forEach(function (p) {
        var li = el("li"), top = el("div", "rc-item-top");
        top.appendChild(el("b", null, p.name));
        top.appendChild(el("span", "chip " + (p.active ? "rc-shown" : "rc-hidden"), p.active ? T.shown : T.hidden));
        li.appendChild(top);
        var dl = el("div", "sh-counts");
        TIERS.forEach(function (t) {
          var c = p.codes[t];
          dl.appendChild(el("span", "muted small" + (c.left ? "" : " sh-none"), T.tiers[t] + " · " + T.counts(nf.format(c.left), nf.format(c.assigned))));
        });
        li.appendChild(dl);
        var e = btn(li, T.edit, "ghost small-btn");
        e.setAttribute("aria-pressed", String(!!edit && edit.id === p.id));
        e.addEventListener("click", function () { edit = p; last = null; render(); });
        ul.appendChild(li);
      });
      side.appendChild(ul);
    }
    btn(side, T.newPartner, "ghost rc-new").addEventListener("click", function () { edit = null; last = null; render(); });
    grid.appendChild(side);

    // The partner's editor: a new one, or the one being edited.
    var p0 = edit || {}, f = el("div", "rc-form");
    f.appendChild(el("h3", "rc-h3", edit ? T.editing(edit.name) : T.newPartner));
    var name = field(f, T.fName, "text", p0.name || "", { maxlength: "120", autocomplete: "off" });
    var url = field(f, T.fUrl, "url", p0.url || "", { spellcheck: "false", placeholder: "https://" });
    var logo = field(f, T.fLogo, "url", p0.logo_url || "", { spellcheck: "false" });
    var row = el("div", "rc-pic"), pick = el("input"), up = btn(row, T.upload, "ghost small-btn");
    pick.type = "file"; pick.accept = "image/jpeg,image/png,image/webp"; pick.hidden = true;
    row.appendChild(pick);
    logo.parentNode.appendChild(row);
    up.addEventListener("click", function () { if (!isWaiting(up)) pick.click(); });
    pick.addEventListener("change", async function () {
      var file = pick.files && pick.files[0];
      pick.value = "";
      if (!file) return;
      var m = RC.logoPath(file, name.value, Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
      if (m.error) { say(T.badFile, "err"); return; }
      waiting(up, true);
      say(T.uploading);
      try { logo.value = await A.upload(m.path, file); say(T.uploaded, "ok"); }
      catch (e) { if (e.status === 401) { A.lost(); return; } say(e.status === 413 || /mime|type|large|size/i.test(String(e.code || "")) ? T.badFile : T.uploadFailed, "err"); }
      finally { waiting(up, false); }
    });
    var blurb = field(f, T.fBlurb, "textarea", p0.blurb || "", { maxlength: "280", rows: "2" });
    blurb.classList.add("sh-blurb");
    var vl = el("label", "rc-check"), vis = el("input");
    vis.type = "checkbox"; vis.checked = edit ? p0.active : true;
    vl.appendChild(vis); vl.appendChild(el("span", null, T.fActive));
    f.appendChild(vl);
    var acts = el("div", "rc-acts"), save = btn(acts, T.save, "primary");
    if (edit) {
      btn(acts, T.cancel).addEventListener("click", function () { edit = null; last = null; render(); });
      var rm = btn(acts, T.remove, "ghost rc-danger");
      rm.addEventListener("click", async function () {
        if (!(await call("shop_admin_upsert_partner", { p: { id: edit.id, delete: true } }, rm))) return;
        edit = null; say(T.removed, "ok"); await load();
      });
    }
    f.appendChild(acts);
    save.addEventListener("click", async function () {
      var pl = partnerPayload({ id: p0.id, name: name.value, url: url.value, logo: logo.value, blurb: blurb.value, active: vis.checked }, A.api, location.href);
      if (pl.error) { say(T.bad[pl.error], "err"); ({ name: name, url: url, logo: logo, blurb: blurb })[pl.error].focus(); return; }
      var r = await call("shop_admin_upsert_partner", { p: pl.p }, save);
      if (!r) return;
      say(T.saved, "ok"); await load();
      edit = list.filter(function (x) { return x.id === r.id; })[0] || null; render();
    });
    main.appendChild(f);

    // The codes of the partner being edited: pasted per tier, the unused ones dropped per tier.
    var g = el("div", "rc-form");
    g.appendChild(el("h3", "rc-h3", T.codes + (edit ? " · " + edit.name : "")));
    g.appendChild(el("p", "muted small", edit ? T.codesLead : T.choose));
    if (edit) {
      var t = field(g, T.fTier, "select");
      TIERS.forEach(function (k) { var o = el("option", null, T.tiers[k]); o.value = k; t.appendChild(o); });
      t.value = tier;
      t.addEventListener("change", function () { tier = t.value; });
      var codes = field(g, T.fCodes, "textarea", "", { spellcheck: "false", autocomplete: "off", rows: "5", placeholder: "EAU-7K2Q\nEAU-9P3X" });
      var a2 = el("div", "rc-acts"), add = btn(a2, T.addCodes, "primary");
      g.appendChild(a2);
      add.addEventListener("click", async function () {
        var c = codesList(codes.value);
        if (c.error) { say(c.error === "bad" ? T.bad.code(c.code) : T.bad[c.error], "err"); codes.focus(); return; }
        var r = await call("shop_admin_add_codes", { p_partner: edit.id, p_tier: t.value, p_codes: c.codes }, add);
        if (!r) return;
        say(T.added(nf.format(r.added || 0), r.duplicates ? nf.format(r.duplicates) : ""), "ok"); await load();
      });
      var drops = el("div", "rc-acts sh-drops");
      TIERS.forEach(function (k) {
        if (!edit.codes[k].left) return;
        var d = btn(drops, T.drop(T.tiers[k]), "ghost small-btn rc-danger");
        d.addEventListener("click", async function () {
          var r = await call("shop_admin_drop_unused", { p_partner: edit.id, p_tier: k }, d);
          if (r) { say(T.dropped(nf.format(r.dropped || 0)), "ok"); await load(); }
        });
      });
      if (drops.firstChild) g.appendChild(drops);
    }
    main.appendChild(g);
    grid.appendChild(main);
    box.appendChild(grid);
    msg = el("p", "msg");
    msg.setAttribute("role", "status");
    box.appendChild(msg);
    if (last) say(last[0], last[1]);
  }

  // The owner only since section 98 (a co-admin never sees it; the server checks again); once the console has drawn its
  // first figures.
  function start() {
    if (inited || !A.admin || !A.admin()) return;
    inited = true;
    (A.owner ? A.owner() : Promise.resolve(true)).then(function (yes) { if (yes) load(); });
  }
  document.addEventListener("wnc:render", start);
  // On a fast connection the first figures can be drawn before this script loads: catch up.
  if (root.WNC_PAGE && root.WNC_PAGE.data && root.WNC_PAGE.data()) start();
  if (A.demo) root.WNC_SHOP = { open: function (id) { edit = list.filter(function (p) { return p.id === id; })[0] || null; last = null; render(); } };
})(this);

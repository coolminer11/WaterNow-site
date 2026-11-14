/* The account page (auth/index.html): an email confirmed, or a new password from a recovery link. Everything is written with textContent. */
(async () => {
  const SUPABASE_URL = "https://pkqsvlbiznrqxfckaxll.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_Jw6cnMgupaVxupvltvUlPQ_mvwpiNVE";
  // One table per app language; the browser's language when it is one of them ("pt-PT" → pt), English otherwise.
  const STRINGS = {
    en: {
      doc: "WaterNow account",
      confirmedTitle: "Email confirmed", confirmedText: "Your account is ready. Go back to WaterNow and sign in.",
      resetTitle: "New password", resetText: "Choose a new password for your WaterNow account.",
      pw: "New password", pw2: "Confirm password", save: "Save",
      rule: "At least 8 characters, with a letter and a digit.", mismatch: "The two passwords don't match.",
      saved: "Password changed. Go back to WaterNow and sign in with your new password.",
      expired: "This link has expired or was already used. Request a new email from the app.",
      failed: "Couldn't save right now. Try again in a moment.",
      same: "This is already your password. Go back to WaterNow and sign in with it, or choose a different one.",
      weak: "This password is too weak. Use at least 8 characters with letters and numbers.",
      nothingTitle: "WaterNow", nothingText: "Open this link from the email WaterNow sent you.",
      codeTitle: "Two-step verification", codeText: "Your account uses an authenticator app. Enter its 6-digit code, then choose your new password.",
      code: "Code", next: "Continue", codeRule: "Enter the 6 digits shown in your authenticator app.",
      codeWrong: "This code isn't right or has expired. Try the next one in your app."
    },
    fr: {
      doc: "Compte WaterNow",
      confirmedTitle: "Courriel confirmé", confirmedText: "Ton compte est prêt. Retourne dans WaterNow et connecte-toi.",
      resetTitle: "Nouveau mot de passe", resetText: "Choisis un nouveau mot de passe pour ton compte WaterNow.",
      pw: "Nouveau mot de passe", pw2: "Confirme le mot de passe", save: "Enregistrer",
      rule: "Au moins 8 caractères, avec une lettre et un chiffre.", mismatch: "Les deux mots de passe ne correspondent pas.",
      saved: "Mot de passe changé. Retourne dans WaterNow et connecte-toi avec ton nouveau mot de passe.",
      expired: "Ce lien a expiré ou a déjà servi. Redemande un courriel depuis l'app.",
      failed: "Impossible d'enregistrer pour l'instant. Réessaie dans un moment.",
      same: "C'est déjà ton mot de passe. Retourne dans WaterNow et connecte-toi avec, ou choisis-en un autre.",
      weak: "Ce mot de passe est trop faible. Utilise au moins 8 caractères avec des lettres et des chiffres.",
      nothingTitle: "WaterNow", nothingText: "Ouvre ce lien depuis le courriel que WaterNow t'a envoyé.",
      codeTitle: "Validation en deux étapes", codeText: "Ton compte utilise une app d'authentification. Entre son code à 6 chiffres, puis choisis ton nouveau mot de passe.",
      code: "Code", next: "Continuer", codeRule: "Entre les 6 chiffres affichés dans ton app d'authentification.",
      codeWrong: "Ce code n'est pas bon ou a expiré. Essaie le suivant dans ton app."
    },
    es: {
      doc: "Cuenta de WaterNow",
      confirmedTitle: "Correo confirmado", confirmedText: "Tu cuenta está lista. Vuelve a WaterNow e inicia sesión.",
      resetTitle: "Nueva contraseña", resetText: "Elige una nueva contraseña para tu cuenta de WaterNow.",
      pw: "Nueva contraseña", pw2: "Confirma la contraseña", save: "Guardar",
      rule: "Al menos 8 caracteres, con una letra y un número.", mismatch: "Las dos contraseñas no coinciden.",
      saved: "Contraseña cambiada. Vuelve a WaterNow e inicia sesión con tu nueva contraseña.",
      expired: "Este enlace ha caducado o ya se ha usado. Pide un correo nuevo desde la app.",
      failed: "No se ha podido guardar ahora. Inténtalo de nuevo en un momento.",
      same: "Esta ya es tu contraseña. Vuelve a WaterNow e inicia sesión con ella, o elige otra.",
      weak: "Esta contraseña es demasiado débil. Usa al menos 8 caracteres con letras y números.",
      nothingTitle: "WaterNow", nothingText: "Abre este enlace desde el correo que te envió WaterNow.",
      codeTitle: "Verificación en dos pasos", codeText: "Tu cuenta usa una app de autenticación. Escribe su código de 6 dígitos y luego elige tu nueva contraseña.",
      code: "Código", next: "Continuar", codeRule: "Escribe los 6 dígitos que muestra tu app de autenticación.",
      codeWrong: "Este código no es correcto o ha caducado. Prueba el siguiente de tu app."
    },
    de: {
      doc: "WaterNow-Konto",
      confirmedTitle: "E-Mail bestätigt", confirmedText: "Dein Konto ist bereit. Geh zurück zu WaterNow und melde dich an.",
      resetTitle: "Neues Passwort", resetText: "Wähle ein neues Passwort für dein WaterNow-Konto.",
      pw: "Neues Passwort", pw2: "Passwort bestätigen", save: "Speichern",
      rule: "Mindestens 8 Zeichen, mit einem Buchstaben und einer Ziffer.", mismatch: "Die beiden Passwörter stimmen nicht überein.",
      saved: "Passwort geändert. Geh zurück zu WaterNow und melde dich mit deinem neuen Passwort an.",
      expired: "Dieser Link ist abgelaufen oder wurde schon benutzt. Fordere in der App eine neue E-Mail an.",
      failed: "Speichern ist gerade nicht möglich. Versuch es gleich noch einmal.",
      same: "Das ist schon dein Passwort. Geh zurück zu WaterNow und melde dich damit an, oder wähle ein anderes.",
      weak: "Dieses Passwort ist zu schwach. Verwende mindestens 8 Zeichen mit Buchstaben und Zahlen.",
      nothingTitle: "WaterNow", nothingText: "Öffne diesen Link aus der E-Mail, die WaterNow dir geschickt hat.",
      codeTitle: "Bestätigung in zwei Schritten", codeText: "Dein Konto nutzt eine Authenticator-App. Gib ihren 6-stelligen Code ein und wähle dann dein neues Passwort.",
      code: "Code", next: "Weiter", codeRule: "Gib die 6 Ziffern aus deiner Authenticator-App ein.",
      codeWrong: "Dieser Code stimmt nicht oder ist abgelaufen. Versuch den nächsten aus deiner App."
    },
    pt: {
      doc: "Conta WaterNow",
      confirmedTitle: "E-mail confirmado", confirmedText: "Sua conta está pronta. Volte ao WaterNow e entre.",
      resetTitle: "Nova senha", resetText: "Escolha uma nova senha para sua conta do WaterNow.",
      pw: "Nova senha", pw2: "Confirme a senha", save: "Salvar",
      rule: "Pelo menos 8 caracteres, com uma letra e um número.", mismatch: "As duas senhas não coincidem.",
      saved: "Senha alterada. Volte ao WaterNow e entre com sua nova senha.",
      expired: "Este link expirou ou já foi usado. Peça um novo e-mail pelo app.",
      failed: "Não foi possível salvar agora. Tente de novo daqui a pouco.",
      same: "Esta já é a sua senha. Volte ao WaterNow e entre com ela, ou escolha outra.",
      weak: "Esta senha é fraca demais. Use pelo menos 8 caracteres com letras e números.",
      nothingTitle: "WaterNow", nothingText: "Abra este link pelo e-mail que o WaterNow enviou para você.",
      codeTitle: "Verificação em duas etapas", codeText: "Sua conta usa um app autenticador. Digite o código de 6 dígitos dele e depois escolha sua nova senha.",
      code: "Código", next: "Continuar", codeRule: "Digite os 6 dígitos mostrados no seu app autenticador.",
      codeWrong: "Este código não está certo ou expirou. Tente o próximo do seu app."
    },
    ja: {
      doc: "WaterNowアカウント",
      confirmedTitle: "メールアドレスを確認しました", confirmedText: "アカウントの準備ができました。WaterNowに戻ってログインしてください。",
      resetTitle: "新しいパスワード", resetText: "WaterNowアカウントの新しいパスワードを決めてください。",
      pw: "新しいパスワード", pw2: "パスワードの確認", save: "保存",
      rule: "8文字以上で、英字と数字をそれぞれ1つ以上含めてください。", mismatch: "2つのパスワードが一致しません。",
      saved: "パスワードを変更しました。WaterNowに戻って、新しいパスワードでログインしてください。",
      expired: "このリンクは期限切れか、すでに使われています。アプリからもう一度メールをリクエストしてください。",
      failed: "今は保存できません。しばらくしてからもう一度お試しください。",
      same: "これはすでに今のパスワードです。WaterNowに戻ってこのパスワードでログインするか、別のパスワードを選んでください。",
      weak: "このパスワードは弱すぎます。英字と数字を含む8文字以上にしてください。",
      nothingTitle: "WaterNow", nothingText: "WaterNowから届いたメールのリンクから開いてください。",
      codeTitle: "2段階認証", codeText: "このアカウントは認証アプリを使っています。アプリの6桁のコードを入力してから、新しいパスワードを決めてください。",
      code: "コード", next: "次へ", codeRule: "認証アプリに表示されている6桁の数字を入力してください。",
      codeWrong: "コードが正しくないか、期限切れです。アプリの次のコードでお試しください。"
    },
    ro: {
      doc: "Cont WaterNow",
      confirmedTitle: "E-mail confirmat", confirmedText: "Contul tău este gata. Întoarce-te în WaterNow și conectează-te.",
      resetTitle: "Parolă nouă", resetText: "Alege o parolă nouă pentru contul tău WaterNow.",
      pw: "Parolă nouă", pw2: "Confirmă parola", save: "Salvează",
      rule: "Cel puțin 8 caractere, cu o literă și o cifră.", mismatch: "Cele două parole nu se potrivesc.",
      saved: "Parola a fost schimbată. Întoarce-te în WaterNow și conectează-te cu parola nouă.",
      expired: "Acest link a expirat sau a fost deja folosit. Cere un e-mail nou din aplicație.",
      failed: "Nu s-a putut salva acum. Încearcă din nou peste câteva clipe.",
      same: "Aceasta este deja parola ta. Întoarce-te în WaterNow și conectează-te cu ea sau alege alta.",
      weak: "Parola este prea slabă. Folosește cel puțin 8 caractere, cu litere și cifre.",
      nothingTitle: "WaterNow", nothingText: "Deschide acest link din e-mailul trimis de WaterNow.",
      codeTitle: "Verificare în doi pași", codeText: "Contul tău folosește o aplicație de autentificare. Introdu codul ei de 6 cifre, apoi alege parola nouă.",
      code: "Cod", next: "Continuă", codeRule: "Introdu cele 6 cifre afișate în aplicația de autentificare.",
      codeWrong: "Codul nu este corect sau a expirat. Încearcă următorul cod din aplicație."
    }
  };
  // The first of the browser's languages this page has (Italian then French: French), else English.
  const prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  const lang = Array.from(prefs).map((t) => /^([a-z]{2,3})(?:[-_]|$)/i.exec(typeof t === "string" ? t : ""))
    .map((m) => m && m[1].toLowerCase()).find((c) => c && Object.prototype.hasOwnProperty.call(STRINGS, c)) || "en";
  const T = STRINGS[lang];
  document.documentElement.lang = lang;
  document.documentElement.classList.add("wn-ready"); // main.hold shows now, in this language (site.css)
  document.title = T.doc;

  // Tokens arrive in the URL fragment (never sent to this site's server). Read once, then wipe the URL.
  const params = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  history.replaceState(null, "", location.pathname);
  const type = params.get("type");
  const token = params.get("access_token");
  const title = document.getElementById("title");
  const text = document.getElementById("text");
  const app = document.getElementById("app");
  const show = (t, x) => { title.textContent = t; text.textContent = x; };

  if (params.get("error") || params.get("error_code")) { show(T.nothingTitle, T.expired); return; }
  if (!token) { show(T.nothingTitle, T.nothingText); return; }
  if (type !== "recovery") { show(T.confirmedTitle, T.confirmedText); return; }

  // Every Auth call carries the session it has: the recovery link's, then the aal2 one after the code. With no answer
  // within 15 s it is aborted and fails as an offline call does ("Try again in a moment", the button back): a call that
  // hung kept the shimmer or a disabled Save until the browser gave up on it.
  let bearer = token;
  const api = (path, method, body) => {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
    return fetch(SUPABASE_URL + "/auth/v1/" + path, {
      method, signal: ctl.signal,
      headers: { "apikey": PUBLISHABLE_KEY, "Authorization": "Bearer " + bearer, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    }).finally(() => clearTimeout(timer));
  };
  const add = (parent, tag, props) => { const el = Object.assign(document.createElement(tag), props); parent.append(el); return el; };
  const field = (box, id, label, props) => { add(box, "label", { htmlFor: id, textContent: label }); return add(box, "input", Object.assign({ id, required: true }, props)); };

  const pwBox = add(app, "div", { hidden: true });
  const p1 = field(pwBox, "pw", T.pw, { type: "password", autocomplete: "new-password" });
  const p2 = field(pwBox, "pw2", T.pw2, { type: "password", autocomplete: "new-password" });
  add(pwBox, "p", { className: "hint muted small", textContent: T.rule });
  const btn = add(pwBox, "button", { type: "button", className: "btn primary wide", textContent: T.save });
  const codeBox = add(app, "div", { hidden: true });
  const otp = field(codeBox, "code", T.code, { type: "text", inputMode: "numeric", autocomplete: "one-time-code", maxLength: 7 });
  const next = add(codeBox, "button", { type: "button", className: "btn primary wide", textContent: T.next });
  const msg = add(app, "p", { className: "msg" }); msg.setAttribute("role", "status");
  const say = (x, cls) => { msg.textContent = x; msg.className = "msg " + (cls || ""); };
  // Busy while its call is on its way: aria-disabled, not disabled, so the keyboard's focus stays on the button (a
  // disabled one dropped it to the page's top, and the answer never gave it back). A second press waits.
  const busy = (b, on) => (on ? b.setAttribute("aria-disabled", "true") : b.removeAttribute("aria-disabled"));
  const isBusy = (b) => b.getAttribute("aria-disabled") === "true";

  // Two-factor accounts (team members with an authenticator app): Supabase Auth changes their password only from an aal2
  // session (401 insufficient_aal, "AAL2 session is required to update email or password when MFA is enabled": supabase/auth
  // internal/api/user.go, UserUpdate) and a recovery link signs in at aal1, so "Save" answered "link expired". Such an
  // account gives its app's code first (factors/<id>/challenge then /verify, which answers with the aal2 session).
  const totp = (user) => (user && Array.isArray(user.factors) ? user.factors : [])
    .filter((f) => f && f.factor_type === "totp" && f.status === "verified" && /^[0-9a-f-]{36}$/i.test(f.id)).map((f) => f.id);
  const aal = (jwt) => { try { return JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).aal; } catch (_) { return null; } };
  const account = async () => { try { const r = await api("user", "GET"); return { status: r.status, user: r.ok ? await r.json() : null }; } catch (_) { return { status: 0, user: null }; } };
  let factors = [], afterCode = null;
  // After the code, the focus goes to the first password field: the Continue button it was on is gone.
  const choose = (focus) => { show(T.resetTitle, T.resetText); codeBox.hidden = true; pwBox.hidden = false; if (focus) p1.focus(); };
  const ask = (then) => { afterCode = then; show(T.codeTitle, T.codeText); pwBox.hidden = true; codeBox.hidden = false; say(""); otp.focus(); };

  next.addEventListener("click", async () => {
    if (isBusy(next)) return;
    const c = otp.value.replace(/\s/g, "");
    if (!/^\d{6}$/.test(c)) { say(T.codeRule, "err"); return; }
    say(""); // an old message goes while the tap is fresh: the answer never moves a line that was there
    busy(next, true);
    let wrong = false;
    try {
      // Each verified authenticator in turn (a backup one is allowed): the first that takes the code gives the session.
      for (const id of factors) {
        const ch = await api("factors/" + id + "/challenge", "POST", {});
        if (ch.status === 401 || ch.status === 403) { say(T.expired, "err"); return; }
        const cid = ch.ok ? ((await ch.json().catch(() => null)) || {}).id : null;
        if (typeof cid !== "string") continue;
        const v = await api("factors/" + id + "/verify", "POST", { challenge_id: cid, code: c });
        if (v.status === 401 || v.status === 403) { say(T.expired, "err"); return; }
        const session = v.ok ? (await v.json().catch(() => null)) || {} : {};
        if (typeof session.access_token === "string") {
          bearer = session.access_token; otp.value = "";
          const then = afterCode; choose(!then); say(""); if (then) then();
          return;
        }
        if (v.status === 400 || v.status === 422) wrong = true;
      }
      say(wrong ? T.codeWrong : T.failed, "err");
    } catch (_) { say(T.failed, "err"); } finally { busy(next, false); }
  });

  const save = async () => {
    if (isBusy(btn)) return;
    const a = p1.value, b = p2.value;
    // The app's rule (PasswordPolicy.isValid): any script's letters and digits, not only A-Z and 0-9.
    if (a.length < 8 || !/\p{L}/u.test(a) || !/\p{Nd}/u.test(a)) { say(T.rule, "err"); return; }
    if (a !== b) { say(T.mismatch, "err"); return; }
    say("");
    busy(btn, true);
    try {
      const r = await api("user", "PUT", { password: a });
      if (r.ok) { p1.value = ""; p2.value = ""; pwBox.hidden = true; say(T.saved, "ok"); return; }
      // 422: the server refused this password (same as the current one, or too weak): retrying it would never work.
      // 401 insufficient_aal: a two-factor account the first look missed: its code, then this same password again.
      const code = r.status === 422 || r.status === 401 ? ((await r.json().catch(() => null)) || {}).error_code : "";
      if (code === "insufficient_aal") {
        if (!factors.length) factors = totp((await account()).user);
        if (factors.length) { busy(btn, false); ask(save); return; }
        say(T.failed, "err"); busy(btn, false); return;
      }
      say(r.status === 401 || r.status === 403 ? T.expired : code === "same_password" ? T.same : code === "weak_password" ? T.weak : T.failed, "err");
    } catch (_) { say(T.failed, "err"); }
    busy(btn, false);
  };
  btn.addEventListener("click", save);
  // No <form> (the CSP allows no form action): Enter (the keyboard's Go) acts as a form would; ignored mid-request.
  [[p1, btn], [p2, btn], [otp, next]].forEach(([i, b]) => i.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) b.click(); }));

  // First look at the account: the link is spent (401), a two-factor account (its code first), or straight to the
  // password. When the account can't be read, the password comes first and Save finds out.
  // Two shimmering lines hold the words' place while the account is read.
  add(text, "span", { className: "sk-line" }); add(text, "span", { className: "sk-line short" });
  const first = await account();
  if (first.status === 401 || first.status === 403) { show(T.nothingTitle, T.expired); return; }
  factors = totp(first.user);
  if (factors.length && aal(bearer) !== "aal2") ask(null); else choose();
})();

/*
 * WaterNow Statistics, private console: « Preuves » for the owner (lawful evidence, section 104,
 * docs/migrations/2026-11-24_bouclier_evidence.sql; docs/work/bouclier-D-2026-11-24.md).
 * The incidents the shield opened (or the owner), the chain check, evidence mode for one entity, and per incident: the
 * printable dossier (HTML) for the authorities, the JSON / CSV export, the abuse report draft for the network's provider.
 * The IP addresses arrive encrypted with the owner's RSA-OAEP-4096 key: they are decrypted HERE, in this browser, with
 * the private key file the owner picks (scripts/gen-evidence-key.mjs); the file is never uploaded, the key never leaves
 * this tab. The abuse contact comes from the public RDAP registry, asked from this browser. Nothing is ever sent by
 * itself: the owner reads the draft and sends it from his own mail app. Each dossier, export and draft has its SHA-256
 * logged in the chain of custody (sec_evidence_custody). Owner only (the server checks: owner role, aal2). French and
 * English (the documents go to Canadian authorities and to providers). Card text through textContent only; the dossier
 * is a separate file whose every value is escaped, under a CSP that runs no script. Pure helpers shared with the node
 * test (module.exports).
 */
(function (root) {
  "use strict";
  var node = typeof module === "object" && module.exports;
  var G = typeof globalThis !== "undefined" ? globalThis : root;
  var ISO = /^\d{4}-\d{2}-\d{2}T/, HEX64 = /^[0-9a-f]{64}$/, B64 = /^[A-Za-z0-9+/]+=*$/;
  var EMAIL = /^[^\s@<>"',;:()\\]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/, IP = /^[0-9A-Fa-f:.]{2,45}$/;
  var KINDS = ["campaign", "level", "admin", "beacon"], SOURCES = ["edge", "beacon", "db_event", "account"];
  var TARGETS = ["ip", "device", "user", "asn"], MAX = 50000, PAGE = 2000, TABLE = 5000;

  function when(v) { return typeof v === "string" && ISO.test(v) && !isNaN(Date.parse(v)) ? v : null; }
  function int(v, lo, hi) { return typeof v === "number" && Number.isSafeInteger(v) && v >= lo && v <= hi ? v : null; }
  function str(v, max) { return typeof v === "string" ? v.slice(0, max) : ""; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function hex(buf) { return Array.from(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); }).join(""); }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  /** "2026-11-24 13:05:22.123 UTC", or "—". */
  function utc(s) { return s ? new Date(s).toISOString().replace("T", " ").replace("Z", " UTC") : "—"; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  /**
   * The server's French title (section 104), as the list shows it after its kind: the owner's default note goes (« Démarré
   * par toi · Démarré par le propriétaire » said it twice) and a campaign of one account says « 1 compte ».
   */
  function title(kind, t) {
    if (kind === "admin" && t === "Démarré par le propriétaire") return "";
    return t.replace(/(^|\D)([01]) comptes\b/, "$1$2 compte");
  }

  /** sec_evidence_incidents' answer, cleaned (anything malformed dropped). */
  function incidents(raw) {
    return (Array.isArray(raw) ? raw : []).map(function (o) {
      if (!o || !Number.isSafeInteger(o.id) || KINDS.indexOf(o.kind) < 0) return null;
      var src = {};
      SOURCES.forEach(function (s) { var n = obj(o.sources)[s]; if (int(n, 0, 1e9) != null) src[s] = n; });
      var c = obj(o.campaign);
      return {
        id: o.id, kind: o.kind, ref: str(o.ref, 80), title: title(o.kind, str(o.title, 200)), by: o.opened_by === "owner" ? "owner" : "shield",
        opened_at: when(o.opened_at), until: when(o.until), closed_at: when(o.closed_at), redacted_at: when(o.redacted_at),
        items: int(o.items, 0, 1e9) || 0, first_at: when(o.first_at), last_at: when(o.last_at), sources: src,
        targets: (Array.isArray(o.targets) ? o.targets : []).filter(function (t) { return t && TARGETS.indexOf(t.type) >= 0 && typeof t.id === "string"; })
          .map(function (t) { return { type: t.type, id: t.id.slice(0, 64), why: str(t.why, 80), until: when(t.until) }; }),
        campaign: Number.isSafeInteger(c.id) ? { id: c.id, kind: str(c.kind, 40), size: int(c.size, 0, 1e6) || 0, status: str(c.status, 20) } : null
      };
    }).filter(Boolean);
  }
  function state(i) { return i.redacted_at ? "redacted" : i.closed_at ? "closed" : "open"; }

  /** One row of sec_evidence_items, cleaned; null when its seq or hashes are malformed. */
  function item(e) {
    if (!e || !Number.isSafeInteger(e.seq) || SOURCES.indexOf(e.source) < 0 || !HEX64.test(e.item_sha256 || "") || !HEX64.test(e.hash || "")) return null;
    return {
      seq: e.seq, incident: int(e.incident_id, 0, Number.MAX_SAFE_INTEGER), source: e.source, at: when(e.at), received_at: when(e.received_at),
      entity_type: str(e.entity_type, 10), entity_id: str(e.entity_id, 64), ip_hash: str(e.ip_hash, 32),
      ip_enc: typeof e.ip_enc === "string" && e.ip_enc.length <= 1400 && B64.test(e.ip_enc) ? e.ip_enc : null, key_id: str(e.key_id, 16),
      device_id: str(e.device_id, 36), user_id: str(e.user_id, 36), asn: int(e.asn, 0, 4294967295), as_org: str(e.as_org, 120),
      country: str(e.country, 2), colo: str(e.colo, 3), http_protocol: str(e.http_protocol, 10), tls_version: str(e.tls_version, 12),
      method: str(e.method, 8), path: str(e.path, 512), query: str(e.query, 2048), status: int(e.status, 100, 599), ua: str(e.ua, 512),
      headers: obj(e.headers), body_sha256: str(e.body_sha256, 64), body: str(e.body, 4096), verdict: str(e.verdict, 20), detail: obj(e.detail),
      redacted: !!when(e.redacted_at), item_sha256: e.item_sha256, prev_hash: str(e.prev_hash, 64), hash: e.hash
    };
  }

  async function sha256Hex(text) { return hex(await G.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))); }

  /**
   * The links recomputed here, as the database chains them: hash = SHA-256("<seq>|<prev_hash>|<item_sha256>"), and each
   * item's prev_hash is the hash of the item just before it when both are in this incident. {checked, ok, bad[seq]}.
   */
  async function verifyLinks(list) {
    var bad = [], ok = 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (await sha256Hex(e.seq + "|" + e.prev_hash + "|" + e.item_sha256) === e.hash) ok++; else bad.push(e.seq);
      if (i > 0 && list[i - 1].seq === e.seq - 1 && list[i - 1].hash !== e.prev_hash) bad.push(e.seq);
    }
    return { checked: list.length, ok: ok, bad: uniq(bad) };
  }

  /** The DER bytes of a PKCS#8 PEM private key (the evidence key file), or null. */
  function pemDer(text) {
    var m = /-----BEGIN PRIVATE KEY-----([A-Za-z0-9+/=\s]+)-----END PRIVATE KEY-----/.exec(String(text == null ? "" : text));
    if (!m) return null;
    try { return Uint8Array.from(G.atob(m[1].replace(/\s+/g, "")), function (c) { return c.charCodeAt(0); }); } catch (e) { return null; }
  }
  /** The owner's private key as a non-extractable CryptoKey (decrypt only), or null. */
  async function importKey(text) {
    var der = pemDer(text);
    if (!der) return null;
    try { return await G.crypto.subtle.importKey("pkcs8", der, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]); } catch (e) { return null; }
  }
  /** Adds to [ips] (ciphertext → address) every address of [list] this key opens. {opened, failed}. */
  async function decryptIps(key, list, ips) {
    var opened = 0, failed = 0;
    for (var c of uniq(list.map(function (e) { return e.ip_enc; }).filter(Boolean))) {
      if (ips[c]) continue;
      try {
        var b = Uint8Array.from(G.atob(c), function (x) { return x.charCodeAt(0); });
        var ip = new TextDecoder().decode(await G.crypto.subtle.decrypt({ name: "RSA-OAEP" }, key, b));
        if (IP.test(ip)) { ips[c] = ip; opened++; } else failed++;
      } catch (e) { failed++; }
    }
    return { opened: opened, failed: failed };
  }

  /** The networks seen in what the clients sent (requests and beacon loads), busiest first. */
  function networks(list, ips) {
    var by = {};
    list.forEach(function (e) {
      if ((e.source !== "edge" && e.source !== "beacon") || e.asn == null) return;
      var n = by[e.asn] || (by[e.asn] = { asn: e.asn, org: "", count: 0, ips: [], encrypted: [], countries: [], first: null, last: null });
      n.count++;
      if (e.as_org && !n.org) n.org = e.as_org;
      if (e.country && n.countries.indexOf(e.country) < 0) n.countries.push(e.country);
      if (e.ip_enc && ips[e.ip_enc]) { if (n.ips.indexOf(ips[e.ip_enc]) < 0) n.ips.push(ips[e.ip_enc]); }
      else if (e.ip_enc && n.encrypted.indexOf(e.ip_enc) < 0) n.encrypted.push(e.ip_enc);
      if (e.at && (!n.first || e.at < n.first)) n.first = e.at;
      if (e.at && (!n.last || e.at > n.last)) n.last = e.at;
    });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.count - a.count; });
  }

  function top(values, n) {
    var c = {};
    values.filter(Boolean).forEach(function (v) { c[v] = (c[v] || 0) + 1; });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).slice(0, n).map(function (k) { return { v: k, n: c[k] }; });
  }

  /** What an incident's items add up to. */
  function summary(list, ips) {
    var edge = list.filter(function (e) { return e.source === "edge"; });
    var by = {};
    SOURCES.forEach(function (s) { by[s] = 0; });
    list.forEach(function (e) { by[e.source]++; });
    var times = list.map(function (e) { return e.at; }).filter(Boolean).sort();
    var accounts = {};
    list.forEach(function (e) {
      if (e.source !== "account" || !e.user_id) return;
      var a = accounts[e.user_id] || (accounts[e.user_id] = { user_id: e.user_id, email: "", created_at: null, devices: [] });
      if (EMAIL.test(e.detail.email || "")) a.email = e.detail.email;
      if (when(e.detail.created_at)) a.created_at = e.detail.created_at;
      (Array.isArray(e.detail.devices) ? e.detail.devices : [{ device_id: e.device_id, attest_level: e.detail.attest_level }]).forEach(function (d) {
        if (d && typeof d.device_id === "string" && !a.devices.some(function (x) { return x.device_id === d.device_id; })) {
          a.devices.push({ device_id: d.device_id.slice(0, 36), attest: str(d.attest_level, 10) });
        }
      });
    });
    return {
      total: list.length, by: by, first: times[0] || null, last: times[times.length - 1] || null,
      writes: edge.filter(function (e) { return e.method && e.method !== "GET" && e.method !== "HEAD"; }).length,
      canaries: edge.filter(function (e) { return typeof e.detail.canary === "number"; }).length,
      addresses: uniq(list.map(function (e) { return e.ip_hash; }).filter(Boolean)).length,
      opened: uniq(list.map(function (e) { return e.ip_enc && ips[e.ip_enc]; }).filter(Boolean)),
      networks: networks(list, ips), uas: top(edge.map(function (e) { return e.ua; }), 5),
      paths: top(edge.map(function (e) { return e.method && e.path ? e.method + " " + e.path : ""; }), 8),
      verdicts: top(edge.map(function (e) { return e.verdict; }), 6), accounts: Object.keys(accounts).map(function (k) { return accounts[k]; }),
      redacted: list.filter(function (e) { return e.redacted; }).length
    };
  }

  function ipText(e, ips, D) {
    if (e.ip_enc && ips[e.ip_enc]) return ips[e.ip_enc];
    return e.ip_enc ? D.encrypted(e.key_id) : e.ip_hash ? D.hashOnly(e.ip_hash.slice(0, 12)) : "—";
  }
  function what(e, D) {
    if (e.redacted) return D.redacted;
    if (e.source === "edge") return (e.method + " " + e.path + (e.query || "")).trim() + (e.status ? " → " + e.status : "");
    if (e.source === "beacon") return D.beacon(str(e.detail.recipient, 60), str(e.detail.decoy, 10), str(e.detail.referer, 300));
    if (e.source === "db_event") return D.event(str(e.detail.kind, 60));
    return D.account(str(e.detail.email, 120) || e.user_id || e.device_id);
  }

  /** The printable dossier for the authorities, a whole HTML file. o: {incident, items, ips, verify, links, lang, generated, truncated}. */
  function dossierHtml(o) {
    var D = STRINGS[o.lang === "fr" ? "fr" : "en"].doc, inc = o.incident, list = o.items, ips = o.ips || {}, s = summary(list, ips);
    var v = obj(o.verify), L = o.links || { checked: 0, ok: 0, bad: [] }, h = [];
    function row(k, val) { h.push("<tr><th>" + esc(k) + "</th><td>" + esc(val) + "</td></tr>"); }
    h.push("<!doctype html><html lang=\"" + (o.lang === "fr" ? "fr" : "en") + "\"><head><meta charset=\"utf-8\">",
      "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'\">",
      "<title>" + esc(D.title(inc.id)) + "</title><style>body{font:13px/1.45 system-ui,sans-serif;margin:24px;color:#111;background:#fff}",
      "h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px;border-bottom:1px solid #999}table{border-collapse:collapse;width:100%;font-size:11px}",
      "td,th{border:1px solid #bbb;padding:3px 5px;vertical-align:top;text-align:left;overflow-wrap:anywhere}th{background:#f2f2f2}",
      "code{font:11px ui-monospace,Consolas,monospace;overflow-wrap:anywhere}.ok{color:#060}.bad{color:#a00}li{margin:3px 0}.tl td:nth-child(-n+4){white-space:nowrap}",
      "@media print{body{margin:0}tr{break-inside:avoid}}</style></head><body>");
    h.push("<h1>" + esc(D.title(inc.id)) + "</h1><p>" + esc(D.generated(utc(o.generated))) + "</p>");
    h.push("<h2>" + esc(D.sSummary) + "</h2><table>");
    row(D.incident, "#" + inc.id + " · " + (inc.title ? inc.title + " (" + D.kinds[inc.kind] + ")" : D.kinds[inc.kind]));
    row(D.opened, utc(inc.opened_at) + (inc.closed_at ? " → " + utc(inc.closed_at) : " · " + D.stillOpen));
    row(D.period, utc(s.first) + " → " + utc(s.last));
    row(D.counts, D.countLine(s.total, s.by.edge, s.writes, s.by.beacon, s.canaries, s.by.db_event, s.by.account));
    row(D.addresses, D.addressLine(s.addresses, s.opened.length) + (s.opened.length ? " : " + s.opened.join(", ") : ""));
    row(D.networks, s.networks.map(function (n) { return "AS" + n.asn + " " + n.org + " (" + n.countries.join(", ") + ") · " + n.count; }).join(" ; ") || "—");
    row(D.tools, s.uas.map(function (u) { return u.v + " (" + u.n + ")"; }).join(" ; ") || "—");
    row(D.requests, s.paths.map(function (p) { return p.v + " (" + p.n + ")"; }).join(" ; ") || "—");
    row(D.verdicts, s.verdicts.map(function (x) { return x.v + " (" + x.n + ")"; }).join(" ; ") || "—");
    if (inc.campaign) row(D.campaign, "#" + inc.campaign.id + " · " + inc.campaign.kind + " · " + inc.campaign.size + " · " + inc.campaign.status);
    h.push("</table>");

    h.push("<h2>" + esc(D.sTimeline) + "</h2>");
    if (list.length > TABLE || o.truncated) h.push("<p>" + esc(D.cut(Math.min(list.length, TABLE))) + "</p>");
    h.push("<table class=\"tl\"><tr>" + D.cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr>");
    list.slice(0, TABLE).forEach(function (e) {
      var net = e.asn != null ? "AS" + e.asn + " " + e.as_org + " " + e.country + (e.colo ? " · " + e.colo : "") : e.country;
      var tech = [e.http_protocol, e.tls_version, e.verdict, e.device_id ? D.phone + " " + e.device_id : ""].filter(Boolean).join(" · ");
      h.push("<tr><td>" + e.seq + "</td><td>" + esc(utc(e.at)) + "</td><td>" + esc(D.sources[e.source]) + "</td><td>" + esc(ipText(e, ips, D)) + "</td><td>" +
        esc(net) + "</td><td>" + esc(what(e, D)) + (e.body ? "<br><code>" + esc(e.body.slice(0, 600)) + "</code>" : "") + "</td><td>" + esc(tech) +
        "</td><td>" + esc(e.ua) + "</td><td><code>" + D.itemH + " " + e.item_sha256 + "<br>" + D.linkH + " " + e.hash +
        (e.body_sha256 ? "<br>" + D.bodyH + " " + esc(e.body_sha256) : "") + "</code></td></tr>");
    });
    h.push("</table>");

    h.push("<h2>" + esc(D.sAccounts) + "</h2>");
    if (!s.accounts.length) h.push("<p>" + esc(D.noAccounts) + "</p>");
    else {
      h.push("<table><tr><th>" + esc(D.account("")) + "</th><th>" + esc(D.email) + "</th><th>" + esc(D.created) + "</th><th>" + esc(D.phones) + "</th></tr>");
      s.accounts.forEach(function (a) {
        h.push("<tr><td><code>" + esc(a.user_id) + "</code></td><td>" + esc(a.email) + "</td><td>" + esc(utc(a.created_at)) + "</td><td>" +
          esc(a.devices.map(function (d) { return d.device_id + " (" + (d.attest || "?") + ")"; }).join(", ")) + "</td></tr>");
      });
      h.push("</table>");
    }

    h.push("<h2>" + esc(D.sCustody) + "</h2><p>" + esc(D.custodyHow) + "</p><ul>");
    h.push("<li class=\"" + (v.ok === true ? "ok" : "bad") + "\">" + esc(v.ok === true ? D.serverOk(v.rows, v.roots_checked, utc(v.checked_at)) : D.serverBad(v.why || "?", v.first_bad)) + "</li>");
    h.push("<li class=\"" + (L.bad.length ? "bad" : "ok") + "\">" + esc(L.bad.length ? D.linksBad(L.bad.slice(0, 20).join(", ")) : D.linksOk(L.ok, L.checked)) + "</li>");
    if (typeof v.head === "string") h.push("<li>" + esc(D.head) + " <code>" + esc(v.head) + "</code></li>");
    if (list.length) h.push("<li>" + esc(D.firstLast) + " <code>" + list[0].hash + "</code> → <code>" + list[list.length - 1].hash + "</code></li>");
    if (s.redacted) h.push("<li>" + esc(D.redactedN(s.redacted)) + "</li>");
    h.push("<li>" + esc(D.selfHash) + "</li></ul>");

    h.push("<h2>" + esc(D.sLegal) + "</h2>");
    D.legal.forEach(function (p) { h.push("<p>" + esc(p) + "</p>"); });
    h.push("<h2>" + esc(D.sContacts) + "</h2><ul>");
    D.contacts.forEach(function (p) { h.push("<li>" + esc(p) + "</li>"); });
    h.push("</ul><p>" + esc(D.contactsNote) + "</p></body></html>");
    return h.join("\n");
  }

  var COLS = ["seq", "at_utc", "source", "ip", "ip_hash", "key_id", "asn", "as_org", "country", "colo", "http_protocol", "tls_version", "method", "path",
              "query", "status", "verdict", "device_id", "user_id", "ua", "body_sha256", "body", "detail", "redacted", "item_sha256", "prev_hash", "hash"];
  function cell(v) {
    var t = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // a spreadsheet never runs what a client sent
    return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  function csv(list, ips) {
    return [COLS.join(",")].concat(list.map(function (e) {
      return COLS.map(function (c) {
        return cell(c === "at_utc" ? (e.at ? new Date(e.at).toISOString() : "") : c === "ip" ? (e.ip_enc && ips[e.ip_enc]) || "" : e[c]);
      }).join(",");
    })).join("\r\n") + "\r\n";
  }
  function exportJson(o) {
    var ips = o.ips || {};
    return JSON.stringify({
      format: "waternow-evidence-1", generated_at: new Date(o.generated).toISOString(), incident: o.incident, verification: o.verify || null,
      link_check: o.links || null, truncated: !!o.truncated,
      items: o.items.map(function (e) { var x = Object.assign({}, e); x.ip = (e.ip_enc && ips[e.ip_enc]) || null; return x; })
    }, null, 2);
  }

  /** {emails, network, handle, org, country, range}: the abuse contact of an RDAP answer (an IP network or an AS). */
  function rdapAbuse(j) {
    j = obj(j);
    var emails = [], org = "";
    (function walk(ents, depth) {
      if (!Array.isArray(ents) || depth > 4) return;
      ents.forEach(function (en) {
        en = obj(en);
        var roles = Array.isArray(en.roles) ? en.roles : [], card = Array.isArray(en.vcardArray) && Array.isArray(en.vcardArray[1]) ? en.vcardArray[1] : [];
        card.forEach(function (p) {
          if (!Array.isArray(p) || typeof p[3] !== "string") return;
          if (p[0] === "email" && roles.indexOf("abuse") >= 0 && EMAIL.test(p[3])) emails.push(p[3].toLowerCase());
          if (p[0] === "fn" && !org && roles.indexOf("registrant") >= 0) org = p[3].slice(0, 120);
        });
        walk(en.entities, depth + 1);
      });
    })(j.entities, 0);
    return { emails: uniq(emails).slice(0, 3), network: str(j.name, 120), handle: str(j.handle, 60), org: org, country: str(j.country, 2),
             range: typeof j.startAddress === "string" && typeof j.endAddress === "string" ? (j.startAddress + " - " + j.endAddress).slice(0, 90) : "" };
  }
  /** The RDAP query: the address itself when it was decrypted here (the precise network), its AS otherwise. */
  function rdapUrl(net) {
    return net.ips.length ? "https://rdap.org/ip/" + encodeURIComponent(net.ips[0]) : "https://rdap.org/autnum/" + net.asn;
  }

  /** The e-mail to the network's abuse desk, for the owner to read and send himself. {to, subject, body}. */
  function abuseDraft(o) {
    var D = STRINGS[o.lang === "fr" ? "fr" : "en"].doc, ips = o.ips || {}, net = o.net, r = o.rdap || null;
    var mine = o.items.filter(function (e) { return (e.source === "edge" || e.source === "beacon") && e.asn === net.asn && !e.redacted; });
    var s = summary(mine, ips), sample = mine.slice(0, 25).map(function (e) {
      return utc(e.at) + "  " + ipText(e, ips, D) + "  " + what(e, D) + (e.ua ? "  " + e.ua.slice(0, 80) : "");
    });
    var addresses = net.ips.length ? net.ips.join(", ") + (net.encrypted.length ? " " + D.moreLocked(net.encrypted.length) : "") : D.noAddress;
    var c = D.colon, body = [D.hello, "", D.reportLead, "",
      D.network + c + "AS" + net.asn + " " + net.org + (r && r.network ? " (RDAP " + r.network + (r.handle ? ", " + r.handle : "") + (r.range ? ", " + r.range : "") + ")" : ""),
      D.addressesL + c + addresses, D.periodL + c + utc(net.first) + " → " + utc(net.last),
      D.whatL + c + D.countLine(s.total, s.by.edge, s.writes, s.by.beacon, s.canaries, 0, 0), "", D.sampleL, sample.join("\n"), "",
      D.proofL, (o.dossierSha ? D.dossierSha + c + o.dossierSha : D.noDossier),
      (mine.length ? D.itemsSha + c + mine[0].item_sha256 + " … " + mine[mine.length - 1].item_sha256 : ""),
      (o.head ? D.head + " " + o.head : ""), "", D.ask, "", D.thanks, D.signature].filter(function (x, i, a) { return x !== "" || a[i - 1] !== ""; });
    return { to: r ? r.emails.join(", ") : "", subject: D.subject(net.asn, net.org, net.ips[0] || ""), body: body.join("\n") };
  }
  /** A mailto: link (the body cut for mail apps' limits; the full text stays in the card to copy). */
  function mailto(d) {
    var to = String(d.to || "").split(/\s*,\s*/).filter(function (x) { return EMAIL.test(x); }).map(encodeURIComponent).join(",");
    var body = d.body.length > 1800 ? d.body.slice(0, 1800) + "\n[…]" : d.body;
    return "mailto:" + to + "?subject=" + encodeURIComponent(d.subject) + "&body=" + encodeURIComponent(body);
  }

  var DOC_EN = {
    colon: ": ", title: function (n) { return "WaterNow — Evidence file — incident #" + n; },
    generated: function (t) { return "Generated " + t + " by the owner of WaterNow (free map of drinking-water points, Québec). All times are UTC."; },
    sSummary: "1. Summary", sTimeline: "2. Timeline", sAccounts: "3. Accounts involved", sCustody: "4. Chain of custody",
    sLegal: "5. What was collected, and the legal basis", sContacts: "6. Where to hand this file", incident: "Incident", opened: "Opened",
    stillOpen: "capture still running", period: "Evidence period", counts: "Items", addresses: "IP addresses", networks: "Networks (AS, provider, country)",
    tools: "Tools (user agent)", requests: "Requests", verdicts: "Device signature verdicts", campaign: "Shield campaign",
    kinds: { campaign: "campaign detected by the shield", level: "alert level 2 or more", admin: "started by the owner", beacon: "beacon of a decoy loaded" },
    countLine: function (t, req, w, b, c, ev, ac) {
      return t + " in all: " + req + " requests (" + w + " write attempts, " + c + " decoy records served), " + b + " beacon loads" +
        (ev ? ", " + ev + " security events" : "") + (ac ? ", " + ac + " account records" : "");
    },
    addressLine: function (n, o) { return n + " distinct (by hash), " + o + " decrypted for this file"; },
    cut: function (n) { return "The first " + n + " items are listed; the JSON and CSV exports hold all of them."; },
    cols: ["#", "Time (UTC)", "Source", "IP address", "Network", "What", "Protocol · verdict · device", "User agent", "Hashes (SHA-256)"],
    sources: { edge: "request", beacon: "beacon", db_event: "security event", account: "account" }, phone: "device",
    encrypted: function (k) { return "encrypted (key " + k + ")"; }, hashOnly: function (h) { return "hash " + h + "…"; },
    redacted: "erased (false alarm), hash kept", beacon: function (r, d, ref) { return "beacon loaded; decoy given to " + r + " (" + d + ")" + (ref ? "; page " + ref : ""); },
    event: function (k) { return "security event " + k; }, account: function (e) { return e ? "account " + e : "Account"; },
    itemH: "item", linkH: "link", bodyH: "body", noAccounts: "No account involved.", email: "E-mail", created: "Created", phones: "Devices (attestation)",
    custodyHow: "Each item is hashed with SHA-256 when it is received (item), and chained: link = SHA-256(\"seq|previous link|item\"). Each day the head of the chain is written into WaterNow's tamper-evident audit log, itself hash-chained. Any edit, removal or rebuilt chain shows.",
    serverOk: function (n, r, t) { return "Server check: the whole chain is intact (" + n + " items, " + r + " daily roots matched), " + t + "."; },
    serverBad: function (w, s) { return "Server check FAILED (" + w + (s ? ", item " + s : "") + ")."; },
    linksOk: function (ok, n) { return "Links recomputed in the owner's browser for this file: " + ok + " of " + n + " match."; },
    linksBad: function (l) { return "Links recomputed in the owner's browser: MISMATCH at items " + l + "."; },
    head: "Head of the chain:", firstLast: "First and last link of this incident:", redactedN: function (n) { return n + " items erased as a false alarm: only their hashes remain."; },
    selfHash: "The SHA-256 of this file and of each export was written into the audit log when it was built: ask WaterNow to confirm it.",
    legal: [
      "Collected, only during a declared attack and only for the clients involved, and only what they sent to WaterNow's own servers: the time; the IP address, encrypted on receipt with the owner's public key (only his private key, kept offline, opens it); the network (AS number, provider, country, Cloudflare location); protocol and TLS version; the user agent; technical headers from a closed list; method, path and query of each request; the SHA-256 of the body and, for a write attempt, the body capped at 4 KB and cleaned; the device signature verdict and attestation level; the id and e-mail of the accounts involved; loads of the beacons placed in decoy records.",
      "Never collected: passwords, tokens, cookies, API keys; nothing about members not involved. No tracking outside our servers, no counter-attack, no attempt to de-anonymize anyone.",
      "Kept 90 days, then erased automatically (logged). Access: the owner only, with two-factor authentication; every read and every file built is logged.",
      "Legal basis: WaterNow's privacy policy (§ 9, « Evidence mode ») informs members of this collection. Act respecting the protection of personal information in the private sector (CQLR, c. P-39.1, as amended by Law 25) and the Personal Information Protection and Electronic Documents Act (PIPEDA, S.C. 2000, c. 5), notably paragraph 7(3)(d), which lets an organization disclose information on its own initiative to a government institution when it has reasonable grounds to believe it relates to a contravention of the law. Possible offences, for the authorities to assess: Criminal Code, s. 342.1 (unauthorized use of a computer) and s. 430(1.1) (mischief in relation to computer data).",
      "This file states technical facts; it is not legal advice."
    ],
    contacts: [
      "Canadian Anti-Fraud Centre: 1-888-495-8501 · antifraudcentre-centreantifraude.ca · online: National Cybercrime and Fraud Reporting System (reportcyberandfraud.canada.ca).",
      "Sûreté du Québec, cybercrime: 310-4141 (or *4141 from a cell phone) · sq.gouv.qc.ca · emergency: 911.",
      "RCMP, National Cybercrime Coordination Centre (NC3): through the National Cybercrime and Fraud Reporting System · rcmp.ca."
    ],
    contactsNote: "Check these details on the official sites before sending. Attach this file and the JSON export, and give their SHA-256.",
    // the abuse e-mail
    subject: function (asn, org, ip) { return "Abuse report: automated attack on our service from AS" + asn + (ip ? " (" + ip + ")" : "") + (org ? " " + org : ""); },
    hello: "Hello,", reportLead: "We are reporting abuse coming from your network against our service WaterNow (a free map of drinking-water points; its API runs on Cloudflare). Below: the addresses, the times (UTC) and a summary.",
    network: "Network", addressesL: "IP addresses", periodL: "Period (UTC)", whatL: "What happened", sampleL: "Sample of the requests (UTC, address, request, user agent):",
    noAddress: "[load the private key in the console to show the addresses]", moreLocked: function (n) { return "and " + n + " more still encrypted"; },
    proofL: "Evidence: every record is hashed (SHA-256) and chained, and the chain's daily roots are kept in our tamper-evident audit log.",
    dossierSha: "Evidence file SHA-256", noDossier: "Evidence file: available on request.", itemsSha: "First and last record SHA-256",
    ask: "Please investigate, stop this activity if it breaks your acceptable use policy, and keep your logs for these times: we may refer the matter to the police (Canada).",
    thanks: "Thank you,", signature: "[your name], WaterNow"
  };
  var DOC_FR = {
    colon: " : ", title: function (n) { return "WaterNow — Dossier de preuves — incident n° " + n; },
    generated: function (t) { return "Produit le " + t + " par le propriétaire de WaterNow (carte gratuite des points d'eau potable, Québec). Toutes les heures sont en UTC."; },
    sSummary: "1. Résumé", sTimeline: "2. Chronologie", sAccounts: "3. Comptes impliqués", sCustody: "4. Chaîne de possession",
    sLegal: "5. Ce qui a été recueilli, et la base légale", sContacts: "6. À qui remettre ce dossier", incident: "Incident", opened: "Ouvert",
    stillOpen: "capture en cours", period: "Période des preuves", counts: "Éléments", addresses: "Adresses IP", networks: "Réseaux (AS, fournisseur, pays)",
    tools: "Outils (user agent)", requests: "Requêtes", verdicts: "Verdicts de signature des appareils", campaign: "Campagne du Bouclier",
    kinds: { campaign: "campagne repérée par le Bouclier", level: "alerte de niveau 2 ou plus", admin: "démarré par le propriétaire", beacon: "balise d'un leurre chargée" },
    countLine: function (t, req, w, b, c, ev, ac) {
      return t + " en tout : " + req + " requêtes (" + w + " tentatives d'écriture, " + c + " lieux pièges servis), " + b + " chargements de balises" +
        (ev ? ", " + ev + " événements de sécurité" : "") + (ac ? ", " + ac + " fiches de comptes" : "");
    },
    addressLine: function (n, o) { return n + " distinctes (par empreinte), " + o + " déchiffrées pour ce dossier"; },
    cut: function (n) { return "Les " + n + " premiers éléments sont listés ; les exports JSON et CSV les contiennent tous."; },
    cols: ["N°", "Heure (UTC)", "Source", "Adresse IP", "Réseau", "Quoi", "Protocole · verdict · appareil", "User agent", "Empreintes (SHA-256)"],
    sources: { edge: "requête", beacon: "balise", db_event: "événement de sécurité", account: "compte" }, phone: "appareil",
    encrypted: function (k) { return "chiffrée (clé " + k + ")"; }, hashOnly: function (h) { return "empreinte " + h + "…"; },
    redacted: "effacé (fausse alerte), empreinte gardée", beacon: function (r, d, ref) { return "balise chargée ; leurre remis à " + r + " (" + d + ")" + (ref ? " ; page " + ref : ""); },
    event: function (k) { return "événement de sécurité " + k; }, account: function (e) { return e ? "compte " + e : "Compte"; },
    itemH: "élément", linkH: "lien", bodyH: "corps", noAccounts: "Aucun compte impliqué.", email: "Courriel", created: "Créé le", phones: "Appareils (attestation)",
    custodyHow: "Chaque élément reçoit son empreinte SHA-256 à la réception (élément), puis est enchaîné : lien = SHA-256(« n°|lien précédent|élément »). Chaque jour, la tête de la chaîne est inscrite au journal d'audit infalsifiable de WaterNow, lui-même enchaîné. Toute modification, suppression ou chaîne refaite se voit.",
    serverOk: function (n, r, t) { return "Vérification du serveur : la chaîne entière est intacte (" + n + " éléments, " + r + " racines quotidiennes concordantes), " + t + "."; },
    serverBad: function (w, s) { return "Vérification du serveur ÉCHOUÉE (" + w + (s ? ", élément " + s : "") + ")."; },
    linksOk: function (ok, n) { return "Liens recalculés dans le navigateur du propriétaire pour ce dossier : " + ok + " sur " + n + " concordent."; },
    linksBad: function (l) { return "Liens recalculés dans le navigateur du propriétaire : DISCORDANCE aux éléments " + l + "."; },
    head: "Tête de la chaîne :", firstLast: "Premier et dernier lien de cet incident :", redactedN: function (n) { return n + " éléments effacés comme fausse alerte : seules leurs empreintes restent."; },
    selfHash: "L'empreinte SHA-256 de ce dossier et de chaque export a été inscrite au journal d'audit à sa création : WaterNow peut la confirmer.",
    legal: [
      "Recueilli seulement pendant une attaque déclarée, seulement pour les clients impliqués, et seulement ce qu'ils ont envoyé aux serveurs de WaterNow : l'heure ; l'adresse IP, chiffrée dès la réception avec la clé publique du propriétaire (seule sa clé privée, gardée hors ligne, l'ouvre) ; le réseau (numéro d'AS, fournisseur, pays, point de présence Cloudflare) ; le protocole et la version TLS ; le user agent ; des en-têtes techniques d'une liste fermée ; la méthode, le chemin et les paramètres de chaque requête ; l'empreinte SHA-256 du corps et, pour une tentative d'écriture, le corps limité à 4 Ko et nettoyé ; le verdict de signature de l'appareil et son niveau d'attestation ; l'identifiant et le courriel des comptes impliqués ; les chargements des balises placées dans des lieux pièges.",
      "Jamais recueilli : mots de passe, jetons, témoins (cookies), clés d'API ; rien sur les membres non impliqués. Aucun suivi hors de nos serveurs, aucune contre-attaque, aucune tentative de désanonymisation.",
      "Conservation : 90 jours, puis effacement automatique (journalisé). Accès : le propriétaire seul, avec double authentification ; chaque lecture et chaque dossier produit sont journalisés.",
      "Base légale : la politique de confidentialité de WaterNow (§ 9, « Mode preuve ») informe les membres de cette collecte. Loi sur la protection des renseignements personnels dans le secteur privé (RLRQ, c. P-39.1, modifiée par la Loi 25) et Loi sur la protection des renseignements personnels et les documents électroniques (LPRPDE, L.C. 2000, ch. 5), notamment l'alinéa 7(3)d), qui permet à une organisation de communiquer de sa propre initiative des renseignements à une institution gouvernementale si elle a des motifs raisonnables de croire qu'ils sont afférents à la contravention d'une loi. Infractions possibles, à l'appréciation des autorités : Code criminel, art. 342.1 (utilisation non autorisée d'ordinateur) et par. 430(1.1) (méfait à l'égard de données informatiques).",
      "Ce dossier expose des faits techniques ; il ne constitue pas un avis juridique."
    ],
    contacts: [
      "Centre antifraude du Canada : 1-888-495-8501 · antifraudcentre-centreantifraude.ca · en ligne : Système national de signalement des cybercrimes et de la fraude.",
      "Sûreté du Québec, cybercriminalité : 310-4141 (ou *4141 d'un cellulaire) · sq.gouv.qc.ca · urgence : 911.",
      "GRC, Groupe national de coordination contre la cybercriminalité (GNC3) : par le Système national de signalement des cybercrimes et de la fraude · grc.ca."
    ],
    contactsNote: "Vérifie ces coordonnées sur les sites officiels avant l'envoi. Joins ce dossier et l'export JSON, avec leurs empreintes SHA-256.",
    subject: function (asn, org, ip) { return "Signalement d'abus : attaque automatisée contre notre service depuis l'AS" + asn + (ip ? " (" + ip + ")" : "") + (org ? " " + org : ""); },
    hello: "Bonjour,", reportLead: "Nous signalons un abus venant de votre réseau contre notre service WaterNow (carte gratuite des points d'eau potable ; son API tourne sur Cloudflare). Ci-dessous : les adresses, les heures (UTC) et un résumé.",
    network: "Réseau", addressesL: "Adresses IP", periodL: "Période (UTC)", whatL: "Ce qui s'est passé", sampleL: "Échantillon des requêtes (UTC, adresse, requête, user agent) :",
    noAddress: "[charge la clé privée dans la console pour afficher les adresses]", moreLocked: function (n) { return "et " + n + " autres encore chiffrées"; },
    proofL: "Preuves : chaque élément a son empreinte (SHA-256) et est enchaîné ; les racines quotidiennes de la chaîne sont gardées dans notre journal d'audit infalsifiable.",
    dossierSha: "Empreinte SHA-256 du dossier", noDossier: "Dossier de preuves : disponible sur demande.", itemsSha: "Empreintes SHA-256 du premier et du dernier élément",
    ask: "Merci d'enquêter, de faire cesser cette activité si elle contrevient à vos conditions d'utilisation, et de conserver vos journaux pour ces heures : nous pourrions saisir la police (Canada).",
    thanks: "Merci,", signature: "[ton nom], WaterNow"
  };

  var STRINGS = {
    en: {
      colon: ": ", title: "Evidence (Bouclier)",
      lead: "Only during a declared attack, only for the clients involved: what they sent to our servers, sealed by chained hashes, kept 90 days. The addresses are encrypted with your key: they're decrypted here, in this browser, with your private key file, which is never uploaded.",
      unavailable: "Evidence isn't on the server yet (section 104).", refused: "The server refused.", done: "Done.", badInput: "Check the fields.",
      key: "Private key file (.pem)", keyLoaded: "Key loaded in this tab only (gone when you close it).", keyBad: "This file isn't the evidence private key.",
      opened: function (n, f) { return n + " addresses decrypted" + (f ? ", " + f + " not opened by this key" : "") + "."; },
      verify: "Verify the chain", verifyOk: function (n, r) { return "The chain is intact: " + n + " items, " + r + " daily roots matched."; },
      verifyBad: function (w, s) { return "The chain is broken (" + w + (s ? ", item " + s : "") + "): hand nothing over, tell your developer."; },
      start: "Start evidence mode", startLead: "For one address (its hash, as the Sécurité card shows it), phone, member or provider. Admins are always refused.",
      types: { ip: "Address (hash)", device: "Phone", user: "Member", asn: "Provider (AS number)" }, type: "Type", id: "Id", hours: "Hours (1-720)", note: "Note (optional)",
      confirmAsn: "A whole provider's network holds innocent people. Capture all of it for this time?",
      incidents: "Incidents (90 days)", none: "No incident: nothing was captured.",
      kinds: { campaign: "Campaign", level: "Alert level", admin: "Started by you", beacon: "Beacon loaded" },
      states: { open: "Capturing", closed: "Closed", redacted: "Erased (false alarm)" },
      count: function (n, t) { return n + (n === 1 ? " item · " : " items · ") + t + (t === 1 ? " target" : " targets"); }, docLang: "Document language",
      dossier: "Build the dossier", json: "JSON export", csv: "CSV export", abuse: "Abuse report to the provider", close: "Stop the capture",
      erase: "Close and erase (false alarm)", confirmClose: "Stop capturing for this incident?",
      confirmErase: "Erase what this incident captured? Only the hashes stay, so the chain still verifies. This can't be undone.",
      loading: "Reading the evidence…", built: function (w, sha) { return w + " ready, SHA-256 " + sha.slice(0, 16) + "… logged in the chain of custody."; },
      what: { dossier: "Dossier", export: "Export", abuse_draft: "Draft" }, open: "Open to print", noKey: "No key loaded: the addresses stay encrypted.",
      network: "Network", lookup: "Find the abuse contact (RDAP)", lookupNote: "Asks the public registry (rdap.org) from this browser.",
      lookupFail: "No abuse contact found: look on the provider's site.", to: "To", subject: "Subject", copy: "Copy", copied: "Copied.",
      mail: "Open in my mail app", draftNote: "Read it, fill in your name, then send it yourself. Nothing is ever sent automatically.",
      noNetwork: "No network in this incident's requests.", truncated: "Only the first 50,000 items were read.",
      doc: DOC_EN
    },
    fr: {
      colon: " : ", title: "Preuves (Bouclier)",
      lead: "Seulement pendant une attaque déclarée, seulement pour les clients impliqués : ce qu'ils ont envoyé à nos serveurs, scellé par des empreintes enchaînées, gardé 90 jours. Les adresses sont chiffrées avec ta clé : elles sont déchiffrées ici, dans ce navigateur, avec ton fichier de clé privée, qui n'est jamais envoyé.",
      unavailable: "Les preuves ne sont pas encore sur le serveur (section 104).", refused: "Le serveur a refusé.", done: "C'est fait.", badInput: "Vérifie les champs.",
      key: "Fichier de clé privée (.pem)", keyLoaded: "Clé chargée dans cet onglet seulement (oubliée à sa fermeture).", keyBad: "Ce fichier n'est pas la clé privée des preuves.",
      opened: function (n, f) { return n + " adresses déchiffrées" + (f ? ", " + f + " que cette clé n'ouvre pas" : "") + "."; },
      verify: "Vérifier la chaîne", verifyOk: function (n, r) { return "La chaîne est intacte : " + n + " éléments, " + r + " racines quotidiennes concordantes."; },
      verifyBad: function (w, s) { return "La chaîne est rompue (" + w + (s ? ", élément " + s : "") + ") : ne remets rien, préviens ton développeur."; },
      start: "Démarrer le mode preuve", startLead: "Pour une adresse (son empreinte, comme la carte Sécurité l'affiche), un téléphone, un membre ou un fournisseur. Les admins sont toujours refusés.",
      types: { ip: "Adresse (empreinte)", device: "Téléphone", user: "Membre", asn: "Fournisseur (numéro d'AS)" }, type: "Type", id: "Identifiant", hours: "Heures (1-720)", note: "Note (facultative)",
      confirmAsn: "Le réseau entier d'un fournisseur contient des innocents. Tout capturer pendant ce temps ?",
      incidents: "Incidents (90 jours)", none: "Aucun incident : rien n'a été capturé.",
      kinds: { campaign: "Campagne", level: "Niveau d'alerte", admin: "Démarré par toi", beacon: "Balise chargée" },
      states: { open: "Capture en cours", closed: "Fermé", redacted: "Effacé (fausse alerte)" },
      count: function (n, t) { return n + (n < 2 ? " élément · " : " éléments · ") + t + (t < 2 ? " cible" : " cibles"); }, docLang: "Langue des documents",
      dossier: "Produire le dossier", json: "Export JSON", csv: "Export CSV", abuse: "Signalement au fournisseur", close: "Arrêter la capture",
      erase: "Fermer et effacer (fausse alerte)", confirmClose: "Arrêter la capture pour cet incident ?",
      confirmErase: "Effacer ce que cet incident a capturé ? Seules les empreintes restent, la chaîne se vérifie encore. C'est irréversible.",
      loading: "Lecture des preuves…", built: function (w, sha) { return w + " prêt, SHA-256 " + sha.slice(0, 16) + "… inscrit dans la chaîne de possession."; },
      what: { dossier: "Dossier", export: "Export", abuse_draft: "Brouillon" }, open: "Ouvrir pour imprimer", noKey: "Aucune clé chargée : les adresses restent chiffrées.",
      network: "Réseau", lookup: "Trouver le contact abus (RDAP)", lookupNote: "Interroge le registre public (rdap.org) depuis ce navigateur.",
      lookupFail: "Aucun contact abus trouvé : regarde sur le site du fournisseur.", to: "À", subject: "Objet", copy: "Copier", copied: "Copié.",
      mail: "Ouvrir dans mon courriel", draftNote: "Relis-le, ajoute ton nom, puis envoie-le toi-même. Rien n'est jamais envoyé automatiquement.",
      noNetwork: "Aucun réseau dans les requêtes de cet incident.", truncated: "Seuls les 50 000 premiers éléments ont été lus.",
      doc: DOC_FR
    }
  };

  var api = { STRINGS: STRINGS, incidents: incidents, state: state, item: item, verifyLinks: verifyLinks, pemDer: pemDer, importKey: importKey,
              decryptIps: decryptIps, networks: networks, summary: summary, dossierHtml: dossierHtml, csv: csv, exportJson: exportJson,
              rdapAbuse: rdapAbuse, rdapUrl: rdapUrl, abuseDraft: abuseDraft, mailto: mailto, sha256Hex: sha256Hex, esc: esc, utc: utc };
  if (node) { module.exports = api; return; }

  // ---- The page ----
  var A = root.WNCAPP;
  if (!A) return;
  var T = STRINGS[A.lang === "fr" ? "fr" : "en"], docLang = A.lang === "fr" ? "fr" : "en";
  var fmt = new Intl.DateTimeFormat(A.lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  function el(tag, cls, t) { var e = document.createElement(tag); if (cls) e.className = cls; if (t != null) e.textContent = t; return e; }
  function clear(x) { while (x.firstChild) x.removeChild(x.firstChild); return x; }
  function btn(parent, t, cls) { var b = el("button", cls || "ghost small-btn", t); b.type = "button"; parent.appendChild(b); return b; }
  function day(s) { return s ? fmt.format(new Date(s)) : "—"; }
  function field(parent, label, attrs, tag) {
    var w = el("label", "sec-field sec-" + ((attrs && attrs.type) || "text")), i = el(tag || "input");
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

  var box = document.getElementById("preuves"), list = [], msg = null, inited = false, busy = false, key = null, ips = {}, cache = {}, urls = [];
  function say(t, cls) { if (msg) { msg.textContent = t || ""; msg.className = "msg" + (cls ? " " + cls : ""); } }
  function fatal(e) {
    if (e.status === 401) { A.lost(); return true; }
    if (e.code === "WNMFA") { A.showMfa(); return true; }
    return false;
  }
  function denied(e) { return e.code === "42501" || e.status === 403; }
  function fail(e) { if (!fatal(e)) say(T.refused, "err"); }

  async function load() {
    try {
      list = incidents(await A.rpc("sec_evidence_incidents", {}));
    } catch (e) {
      if (fatal(e)) return;
      if (denied(e)) { box.classList.add("hidden"); return; } // not the owner: the card doesn't exist for them
      clear(box);
      box.appendChild(el("h2", null, T.title));
      box.appendChild(el("p", "note", e.status === 404 ? T.unavailable : T.refused));
      box.classList.remove("hidden");
      return;
    }
    render();
  }

  // Everything one incident's documents need, read once: its items (paged), the server's chain check, the links
  // recomputed here, and the addresses this key opens.
  async function bundle(inc) {
    var b = cache[inc.id];
    if (!b) {
      var items = [], after = 0, raw;
      do {
        raw = await A.rpc("sec_evidence_items", { p_incident: inc.id, p_after_seq: after, p_limit: PAGE });
        raw = Array.isArray(raw) ? raw : [];
        raw.forEach(function (r) { var x = item(r); if (x) items.push(x); });
        if (raw.length) after = raw[raw.length - 1].seq;
      } while (raw.length === PAGE && items.length < MAX && Number.isSafeInteger(after));
      b = cache[inc.id] = { items: items, truncated: raw.length === PAGE, verify: await A.rpc("sec_evidence_verify", {}), links: await verifyLinks(items) };
    }
    if (key) await decryptIps(key, b.items, ips);
    return b;
  }

  async function custody(inc, what, text) {
    var sha = await sha256Hex(text);
    var out = await A.rpc("sec_evidence_custody", { p_incident: inc.id, p_what: what, p_sha256: sha });
    if (!out || out.result !== "ok") throw { status: 400 };
    return sha;
  }
  function blobUrl(text, type) { var u = URL.createObjectURL(new Blob([text], { type: type })); urls.push(u); return u; }
  function save(name, text, type) {
    var a = el("a");
    a.href = blobUrl(text, type);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return a.href;
  }
  function stamp() { return new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ""); }

  async function build(inc, kind, out) {
    if (busy) return;
    busy = true;
    say(T.loading);
    try {
      var b = await bundle(inc), o = { incident: inc, items: b.items, ips: ips, verify: b.verify, links: b.links, lang: docLang, generated: Date.now(), truncated: b.truncated };
      var name = "waternow-preuves-" + inc.id + "-" + stamp(), text, type, what = kind === "dossier" ? "dossier" : "export";
      if (kind === "dossier") { text = dossierHtml(o); type = "text/html"; name += ".html"; }
      else if (kind === "json") { text = exportJson(o); type = "application/json"; name += ".json"; }
      else { text = csv(b.items, ips); type = "text/csv"; name += ".csv"; }
      var sha = await custody(inc, what, text), href = save(name, text, type);
      if (kind === "dossier") cache[inc.id].dossierSha = sha;
      clear(out);
      out.appendChild(el("p", "muted small", T.built(T.what[what], sha) + (key ? "" : " " + T.noKey) + (b.truncated ? " " + T.truncated : "")));
      out.appendChild(el("code", "small pv-sha", sha));
      if (kind === "dossier") { var a = el("a", "ghost small-btn", T.open); a.href = href; a.target = "_blank"; a.rel = "noopener"; out.appendChild(a); }
      say(T.done, "ok");
    } catch (e) { fail(e); } finally { busy = false; }
  }

  async function abusePanel(inc, out) {
    if (busy) return;
    busy = true;
    say(T.loading);
    try {
      var b = await bundle(inc), nets = networks(b.items, ips);
      clear(out);
      say("");
      if (!nets.length) { out.appendChild(el("p", "note", T.noNetwork)); return; }
      var form = el("div", "sec-form"), names = {};
      nets.forEach(function (n, i) { names[i] = "AS" + n.asn + " " + n.org + " (" + n.count + ")"; });
      var nsel = pick(form, T.network, nets.map(function (n, i) { return i; }), names, 0);
      var look = btn(form, T.lookup);
      out.appendChild(form);
      out.appendChild(el("p", "muted small", T.lookupNote + (key ? "" : " " + T.noKey)));
      var to = field(out, T.to, { type: "text", autocomplete: "off", spellcheck: "false" });
      var subj = field(out, T.subject, { type: "text", autocomplete: "off" });
      var body = el("textarea", "input pv-draft");
      body.setAttribute("aria-label", T.abuse);
      out.appendChild(body);
      var acts = el("div", "rc-acts"), copyB = btn(acts, T.copy), mail = el("a", "ghost small-btn", T.mail);
      acts.appendChild(mail);
      out.appendChild(acts);
      out.appendChild(el("p", "muted small", T.draftNote));
      var rdap = null, logged = {};
      function fill() {
        var d = abuseDraft({ items: b.items, ips: ips, net: nets[Number(nsel.value)] || nets[0], rdap: rdap, lang: docLang, dossierSha: b.dossierSha,
                             head: obj(b.verify).head });
        to.value = d.to; subj.value = d.subject; body.value = d.body;
        link();
      }
      function link() { mail.href = mailto({ to: to.value, subject: subj.value, body: body.value }); }
      function text() { return T.to + T.colon + to.value + "\n" + T.subject + T.colon + subj.value + "\n\n" + body.value; }
      async function log() { var t = text(); if (!logged[t]) { logged[t] = true; try { await custody(inc, "abuse_draft", t); } catch (e) { delete logged[t]; } } }
      [to, subj, body].forEach(function (x) { x.addEventListener("input", link); });
      nsel.addEventListener("change", function () { rdap = null; fill(); });
      look.addEventListener("click", async function () {
        try {
          var r = await fetch(rdapUrl(nets[Number(nsel.value)] || nets[0]), { credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
          rdap = r.ok ? rdapAbuse(await r.json()) : null;
        } catch (e) { rdap = null; }
        fill();
        say(rdap && rdap.emails.length ? "" : T.lookupFail, rdap && rdap.emails.length ? "" : "err");
      });
      copyB.addEventListener("click", async function () {
        try { await navigator.clipboard.writeText(text()); say(T.copied, "ok"); } catch (e) { body.select(); }
        log();
      });
      mail.addEventListener("click", function () { log(); });
      fill();
    } catch (e) { fail(e); } finally { busy = false; }
  }

  async function act(name, args) {
    if (busy) return;
    busy = true;
    try {
      var out = await A.rpc(name, args);
      if (!out || out.result !== "ok") { say(T.refused, "err"); return; }
      cache = {};
      await load();
      say(T.done, "ok");
    } catch (e) { fail(e); } finally { busy = false; }
  }

  function render() {
    clear(box);
    box.classList.remove("hidden");
    var head = el("div", "card-head"), hl = el("div");
    hl.appendChild(el("h2", null, T.title));
    hl.appendChild(el("p", "muted small", T.lead));
    head.appendChild(hl);
    box.appendChild(head);

    // The key (kept in this tab only), the documents' language, the chain check.
    var kb = el("div", "sec-form");
    var file = field(kb, T.key, { type: "file", accept: ".pem,application/x-pem-file,text/plain" });
    var lsel = pick(kb, T.docLang, ["fr", "en"], { fr: "Français", en: "English" }, docLang);
    lsel.addEventListener("change", function () { docLang = lsel.value === "en" ? "en" : "fr"; });
    btn(kb, T.verify).addEventListener("click", async function () {
      try {
        var v = obj(await A.rpc("sec_evidence_verify", {}));
        say(v.ok === true ? T.verifyOk(v.rows || 0, v.roots_checked || 0) : T.verifyBad(String(v.why || "?"), v.first_bad), v.ok === true ? "ok" : "err");
      } catch (e) { fail(e); }
    });
    box.appendChild(kb);
    var kn = el("p", "muted small", key ? T.keyLoaded : "");
    box.appendChild(kn);
    file.addEventListener("change", async function () {
      var f = file.files && file.files[0];
      file.value = "";
      if (!f || f.size > 20000) { kn.textContent = T.keyBad; return; }
      var k = await importKey(await f.text());
      if (!k) { kn.textContent = T.keyBad; return; }
      key = k;
      var n = 0, failed = 0;
      for (var id of Object.keys(cache)) { var r = await decryptIps(key, cache[id].items, ips); n += r.opened; failed += r.failed; }
      kn.textContent = T.keyLoaded + (n || failed ? " " + T.opened(n, failed) : "");
    });

    // Incidents.
    var li0 = section(T.incidents);
    if (!list.length) li0.appendChild(el("p", "note", T.none));
    else {
      var ul = el("ul", "rc-list");
      list.forEach(function (inc) {
        var li = el("li"), top = el("div", "rc-item-top"), st = state(inc);
        top.appendChild(el("b", null, "#" + inc.id + " · " + T.kinds[inc.kind] + (inc.title ? " · " + inc.title : "")));
        top.appendChild(el("span", "chip sec-" + (st === "open" ? "warn" : st === "redacted" ? "watch" : "ok"), T.states[st]));
        li.appendChild(top);
        li.appendChild(el("div", "muted small", T.count(inc.items, inc.targets.length) + " · " + day(inc.opened_at) + " → " + day(inc.closed_at || inc.until)));
        var out = el("div", "pv-out"), row = el("div", "rc-acts");
        if (inc.items && st !== "redacted") {
          btn(row, T.dossier, "ghost small-btn").addEventListener("click", function () { build(inc, "dossier", out); });
          btn(row, T.json).addEventListener("click", function () { build(inc, "json", out); });
          btn(row, T.csv).addEventListener("click", function () { build(inc, "csv", out); });
          btn(row, T.abuse).addEventListener("click", function () { abusePanel(inc, out); });
        }
        if (st === "open") btn(row, T.close).addEventListener("click", function () { if (root.confirm(T.confirmClose)) act("sec_evidence_close", { p_incident: inc.id, p_redact: false }); });
        if (st !== "redacted") {
          btn(row, T.erase, "ghost small-btn rc-danger").addEventListener("click", function () {
            if (root.confirm(T.confirmErase)) act("sec_evidence_close", { p_incident: inc.id, p_redact: true });
          });
        }
        li.appendChild(row);
        li.appendChild(out);
        ul.appendChild(li);
      });
      li0.appendChild(ul);
    }

    // Evidence mode for one entity.
    var sb = section(T.start);
    sb.appendChild(el("p", "muted small", T.startLead));
    var sf = el("div", "sec-form");
    var tsel = pick(sf, T.type, TARGETS, T.types, "ip");
    var tid = field(sf, T.id, { type: "text", autocomplete: "off", spellcheck: "false", maxlength: "36" });
    var th = field(sf, T.hours, { type: "number", min: "1", max: "720", value: "24", inputmode: "numeric" });
    var tn = field(sf, T.note, { type: "text", autocomplete: "off", maxlength: "160" });
    btn(sf, T.start, "ghost small-btn rc-danger").addEventListener("click", function () {
      var type = tsel.value, id = String(tid.value || "").trim().toLowerCase(), h = Number(th.value);
      var okId = type === "ip" ? /^[0-9a-f]{32}$/.test(id) : type === "asn" ? /^[0-9]{1,10}$/.test(id)
        : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
      if (TARGETS.indexOf(type) < 0 || !okId || !Number.isInteger(h) || h < 1 || h > 720) { say(T.badInput, "err"); return; }
      if (type === "asn" && !root.confirm(T.confirmAsn)) return;
      act("sec_evidence_start", { p_type: type, p_id: id, p_hours: h, p_note: String(tn.value || "").slice(0, 160) });
    });
    sb.appendChild(sf);

    msg = el("p", "msg");
    msg.setAttribute("role", "status");
    box.appendChild(msg);
  }

  root.addEventListener("pagehide", function () { urls.forEach(function (u) { URL.revokeObjectURL(u); }); });

  // The owner only (the server checks again: owner role, aal2); once the console has drawn its first figures.
  function start() {
    if (inited || !A.admin || !A.admin()) return;
    inited = true;
    (A.owner ? A.owner() : Promise.resolve(true)).then(function (yes) { if (yes) load(); });
  }
  document.addEventListener("wnc:render", start);
  if (root.WNC_PAGE && root.WNC_PAGE.data && root.WNC_PAGE.data()) start();
})(this);

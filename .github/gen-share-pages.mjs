// Link previews of the app's shares (setup section 58): one e/<slug>/index.html per public published event (to come,
// or over for less than 30 days) and one p/<slug>/index.html per visible partner. Each is a copy of e/index.html or
// p/index.html, one folder deeper, with its own title, description, og:url and og:image (the cover, or the logo), so
// messengers show what is shared; the page still reads the server live (assets/page.js). A share whose folder isn't
// there yet (a new or link-only event) lands on the site's 404.html, which sends it to e/?s=<slug>.
//
// It lives in the site so the site repo's Action (.github/workflows/share-pages.yml) runs it every 30 minutes;
// scripts/deploy-site.sh runs it too, through scripts/gen-share-pages.mjs. It reads one public list
// (get_share_pages) with the site's publishable key, never a secret one. With zero events it writes nothing and
// removes the previews no longer listed; when the server can't be read it changes nothing and exits 1.
//
// Usage: node .github/gen-share-pages.mjs [site folder]   (default: the folder this one is in)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const WN = require("../assets/spot-params.js");
const P = require("../assets/page-data.js");

export const SERVER = "https://pkqsvlbiznrqxfckaxll.supabase.co";
// Public by design, the same key as assets/page.js: the server's grants decide what it reads.
const PUBLISHABLE_KEY = "sb_publishable_Jw6cnMgupaVxupvltvUlPQ_mvwpiNVE";
const SITE_URL = (process.env.SITE_URL || "https://coolminer11.github.io/WaterNow-site/").replace(/\/*$/, "/");
// An image's signed address lasts 7 days and is kept while it has 2 left, so a page only changes when its data does.
const SIGN_S = 7 * 86400;
const KEEP_MS = 2 * 86400 * 1000;

/**
 * Text for an HTML attribute or element: & < > " ' escaped, and "_" too, so no generated page can ever read as a
 * template token (deploy-site.sh refuses to publish one).
 */
export function esc(s) {
  return String(s).replace(/[&<>"'_]/g, (c) => "&#" + c.charCodeAt(0) + ";");
}

function unesc(s) {
  return s.replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
}

// One replacement that must happen: a template that changed shape stops the run instead of making broken pages.
function swap(html, re, fn) {
  if (!re.test(html)) throw new Error("template: no match for " + re);
  return html.replace(re, fn);
}

/** The preview of [item] ([kind] "event" or "partner") made from [template], with [image] as og:image when given. */
export function page(template, kind, item, image) {
  const name = P.text(item.name, 80) || "WaterNow";
  const tagline = P.text(item.tagline, 100);
  const desc = kind === "event"
    ? [tagline, P.dates(item.starts_at, item.ends_at, item.timezone, "en")].filter(Boolean).join(" · ") || "An event on WaterNow"
    : tagline || "A WaterNow partner";
  const url = SITE_URL + (kind === "event" ? "e/" : "p/") + item.slug + "/";
  const tags = ['<meta property="og:url" content="' + esc(url) + '">'];
  if (image) tags.push('<meta property="og:image" content="' + esc(image) + '">');
  let html = template.replace(/ (href|src)="\.\.\//g, (m, a) => " " + a + '="../../');
  html = swap(html, /<title>[^<]*<\/title>/, () => "<title>" + esc(name) + " · WaterNow</title>");
  html = swap(html, /(<meta name="description" content=")[^"]*/, (m, a) => a + esc(desc));
  html = swap(html, /(<meta property="og:title" content=")[^"]*/, (m, a) => a + esc(name));
  html = swap(html, /(<meta property="og:description" content=")[^"]*/, (m, a) => a + esc(desc));
  html = swap(html, /<meta name="twitter:card" content="summary">/,
    () => '<meta name="twitter:card" content="' + (image && kind === "event" ? "summary_large_image" : "summary") + '">\n' + tags.join("\n"));
  html = swap(html, /<body data-kind="(event|partner)">/, (m, k) => '<body data-kind="' + k + '" data-slug="' + item.slug + '">');
  html = swap(html, /(<h1 id="title">)[^<]*/, (m, a) => a + esc(name));
  html = swap(html, /(<p class="muted" id="text">)[^<]*/, (m, a) => a + esc(desc));
  return html;
}

/** The og:image of a page written before, else null. */
function imageOf(html) {
  const m = html && /<meta property="og:image" content="([^"]*)">/.exec(html);
  return m ? unesc(m[1]) : null;
}

/** A signed address of a partner-media [name] (the one [before] holds while it has 2 days left), or null. */
async function signed(fetchImpl, name, before, now) {
  const mine = SERVER + "/storage/v1/object/sign/partner-media/" + name + "?token=";
  if (before && before.startsWith(mine)) {
    try {
      const exp = JSON.parse(Buffer.from(before.slice(mine.length).split(".")[1], "base64url").toString()).exp;
      if (exp * 1000 - now > KEEP_MS) return before;
    } catch (e) { /* signed again below */ }
  }
  const r = await fetchImpl(SERVER + "/storage/v1/object/sign/partner-media/" + name, {
    method: "POST", headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: SIGN_S })
  });
  if (!r.ok) return null; // the page without a picture rather than no page
  const u = (await r.json()).signedURL;
  return typeof u === "string" && u.startsWith("/object/sign/partner-media/" + name + "?token=") ? SERVER + "/storage/v1" + u : null;
}

/** Writes the previews into [siteDir] (e/ and p/); {written, removed, events, partners}. Throws when the list can't be read. */
export async function generate(siteDir, { fetchImpl = fetch, now = Date.now() } = {}) {
  const r = await fetchImpl(SERVER + "/rest/v1/rpc/get_share_pages", {
    method: "POST", headers: { apikey: PUBLISHABLE_KEY, Accept: "application/json", "Content-Type": "application/json" }, body: "{}"
  });
  if (!r.ok) throw new Error("get_share_pages: HTTP " + r.status);
  const data = await r.json();
  if (!data || !Array.isArray(data.events) || !Array.isArray(data.partners)) throw new Error("get_share_pages: not the list it should be");
  const out = { written: 0, removed: 0, events: 0, partners: 0 };
  for (const [kind, dir, list, media] of [["event", "e", data.events, "cover"], ["partner", "p", data.partners, "logo"]]) {
    const root = path.join(siteDir, dir);
    const template = fs.readFileSync(path.join(root, "index.html"), "utf8");
    const keep = new Set();
    for (const item of list) {
      if (!item || !WN.isSlug(item.slug) || keep.has(item.slug)) continue;
      keep.add(item.slug);
      const file = path.join(root, item.slug, "index.html");
      const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
      const name = P.mediaName(item[media], media);
      const html = page(template, kind, item, name ? await signed(fetchImpl, name, imageOf(before), now) : null);
      if (html !== before) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, html);
        out.written++;
      }
    }
    out[kind === "event" ? "events" : "partners"] = keep.size;
    // A preview no longer listed (unpublished, suspended, link-only now, long over) goes.
    for (const d of fs.readdirSync(root, { withFileTypes: true })) {
      if (d.isDirectory() && WN.isSlug(d.name) && !keep.has(d.name)) {
        fs.rmSync(path.join(root, d.name), { recursive: true, force: true });
        out.removed++;
      }
    }
  }
  return out;
}

export async function main(siteDir) {
  try {
    const r = await generate(siteDir);
    console.log(`Link previews: ${r.events} events, ${r.partners} partners (${r.written} written, ${r.removed} removed).`);
  } catch (e) {
    console.error("Link previews not refreshed (kept as they were): " + e.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
}

// node --test site/assets/edge-list.test.js : the edge gate's list (private.edge_refused, one definition since section 98)
// is exactly what the website reads straight from Supabase: the public pages' RPCs, the link-preview job's, and the
// console's for partners and cities. The console's admin RPCs aren't in it (admins pass the gate), nor the app's reads
// (they go through the edge).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const site = path.join(__dirname, "..");
const migrations = path.join(site, "..", "docs", "migrations");

function scripts(dir) { // every script of the site, not the tests nor vendored code
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "vendor" || e.name === "node_modules" ? [] : scripts(p);
    return /\.(js|mjs)$/.test(e.name) && !/\.test\.(js|mjs)$/.test(e.name) ? [p] : [];
  });
}

/** The list of the section (highest number) that last wrote private.edge_refused() in full. */
function edgeList() {
  const defs = fs.readdirSync(migrations).filter((f) => f.endsWith(".sql") && !f.endsWith("_tests.sql")).map((f) => {
    const sql = fs.readFileSync(path.join(migrations, f), "utf8");
    const at = sql.lastIndexOf("CREATE OR REPLACE FUNCTION private.edge_refused()");
    const n = (sql.match(/^-- Section (\d+)/) || [])[1];
    return at < 0 ? null : { n: Number(n), body: sql.slice(at, sql.indexOf("END $$;", at)) };
  }).filter(Boolean).sort((a, b) => b.n - a.n);
  return [...defs[0].body.matchAll(/'\/rpc\/([a-z_]+)'/g)].map((m) => m[1]);
}

test("edge_refused lets through exactly the site's own reads", () => {
  const called = new Set();
  for (const f of scripts(site)) {
    const js = fs.readFileSync(f, "utf8");
    for (const m of js.matchAll(/rpc\/([a-z_]+)"|\brpc\("([a-z_]+)"|"(get_partner_public|get_event_public)"/g)) called.add(m[1] || m[2] || m[3]);
  }
  const site_reads = [...called].filter((n) => !/_admin_/.test(n)).sort();
  const list = edgeList();
  assert.equal(new Set(list).size, list.length, "each name once");
  assert.deepEqual([...list].sort(), site_reads);
  assert.ok(list.includes("get_share_pages") && list.includes("stats_console_me") && list.includes("gift_preview"), "the job, the console, a page");
});

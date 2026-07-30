// Generates the aggregated third-party license notices for haxtheweb-desktop.
// Reads the installed node_modules tree (read-only) and emits two artifacts
// into src/legal-notices/ (which babel --copy-files carries into the build):
//   - THIRD_PARTY_LICENSES.txt  (plain text package list + critical notices)
//   - legal-notices.html        (self-contained rendered view, inlined texts)
//
// Re-run after dependency changes:  node scripts/generate-notices.js
// No optional chaining is used (polymer toolchain). Pure Node, no deps.

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const nmRoot = path.join(repoRoot, "node_modules");
const outDir = path.join(repoRoot, "src", "legal-notices");

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; }
}
function readFile(p) {
  try { return fs.readFileSync(p, "utf8"); } catch (e) { return null; }
}
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- license family classification -----------------------------------------
function normLic(j) {
  if (Array.isArray(j.licenses)) {
    return j.licenses.map(function (l) { return typeof l === "string" ? l : (l.type || l.name); }).join(" OR ");
  }
  if (typeof j.license === "string") return j.license;
  if (j.license && typeof j.license === "object") return j.license.type || j.license.name || "UNKNOWN";
  return null;
}
function family(lic) {
  if (!lic) return "unknown";
  const s = String(lic);
  if (/(SSPL|BUSL|Elastic|Commons.?Clause|Confluent.?Community|fair.?source|\bBSL\b)/i.test(s)) return "non-OSI source-available";
  if (/AGPL/i.test(s)) return "strong copyleft (AGPL)";
  if (/(^|[^\w])GPL([\-\.]|$)/i.test(s) && !/LGPL/i.test(s)) return "strong copyleft (GPL)";
  if (/LGPL/i.test(s)) return "weak copyleft (LGPL)";
  if (/MPL/i.test(s)) return "weak copyleft (MPL)";
  if (/(^|[^\w])EPL([\-\.]|$)/i.test(s) || /CDDL/i.test(s) || /EUPL/i.test(s) || /(^|[^\w])OSL([\-\.]|$)/i.test(s)) return "weak copyleft (other)";
  if (/CC[-\s]?BY/i.test(s)) return "permissive (data — attribution)";
  if (/CC0|Unlicense|WTFPL|Public Domain|0BSD/i.test(s)) return "public domain / dedication";
  // Prefix match: handles non-standard spellings like "Apache2" (== Apache-2.0).
  // Copyleft/non-OSI are already ruled out above, so a permissive-family prefix is safe.
  if (/(^|[^\w])(MIT|ISC|BSD|Apache|Zlib|BlueOak|Python)/i.test(s)) return "permissive";
  return "unknown / review";
}
function normalizeGitUrl(u) {
  if (!u) return "";
  if (/^git\+/.test(u)) u = u.slice(4);
  if (/^git:/.test(u)) u = "https:" + u.slice(4);
  // scp-like: git@github.com:owner/repo  ->  https://github.com/owner/repo
  let m = /^git@([^:]+):(.+)$/.exec(u);
  if (m) u = "https://" + m[1] + "/" + m[2];
  // ssh://[git@]host/path  ->  https://host/path
  m = /^ssh:\/\/(?:git@)?([^\/]+)\/(.+)$/.exec(u);
  if (m) u = "https://" + m[1] + "/" + m[2];
  if (/^github:/.test(u)) u = "https://github.com/" + u.slice(7);
  if (!/:\/\//.test(u) && /^[^\/\s]+\/[^\/\s]+$/.test(u)) u = "https://github.com/" + u;
  return u.replace(/\.git$/, "");
}
function repoUrl(j) {
  let r = j.repository;
  if (!r) return j.homepage || "";
  if (typeof r === "string") return normalizeGitUrl(r);
  if (r && typeof r === "object") return normalizeGitUrl(r.url || "") || j.homepage || "";
  return j.homepage || "";
}

// --- walk node_modules ------------------------------------------------------
const pkgs = [];
function scanPkg(pkgDir) {
  const pj = path.join(pkgDir, "package.json");
  if (!fs.existsSync(pj)) return;
  const j = readJSON(pj);
  if (!j || !j.name) return;
  pkgs.push({
    name: j.name,
    version: j.version || "?",
    license: normLic(j) || "UNKNOWN",
    family: family(normLic(j)),
    url: repoUrl(j),
    author: (j.author && typeof j.author === "object") ? (j.author.name || j.author.email || "") : (j.author || "")
  });
}
function walk(dir) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const ent of ents) {
    if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
    const sub = path.join(dir, ent.name);
    if (ent.name.startsWith("@")) {
      let subs = [];
      try { subs = fs.readdirSync(sub, { withFileTypes: true }); } catch (e) { continue; }
      for (const s2 of subs) {
        if (!s2.isDirectory()) continue;
        scanPkg(path.join(sub, s2.name));
        const nm = path.join(sub, s2.name, "node_modules");
        if (fs.existsSync(nm)) walk(nm);
      }
    } else {
      scanPkg(sub);
      const nm = path.join(sub, "node_modules");
      if (fs.existsSync(nm)) walk(nm);
    }
  }
}
if (fs.existsSync(nmRoot)) walk(nmRoot);
pkgs.sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });

// --- group by family --------------------------------------------------------
const byFamily = {};
for (const p of pkgs) {
  if (!byFamily[p.family]) byFamily[p.family] = [];
  byFamily[p.family].push(p);
}
const familyOrder = [
  "strong copyleft (AGPL)", "strong copyleft (GPL)",
  "weak copyleft (LGPL)", "weak copyleft (MPL)", "weak copyleft (other)",
  "non-OSI source-available", "unknown / review", "unknown",
  "permissive (data — attribution)", "public domain / dedication", "permissive"
];

// --- static notice texts ----------------------------------------------------
const appPkg = readJSON(path.join(repoRoot, "package.json")) || {};
const apacheLicense = readFile(path.join(repoRoot, "LICENSE")) || "";
const lgpl = readFile(path.join(outDir, "lgpl-3.0.txt")) || "";
const mpl = readFile(path.join(outDir, "mpl-2.0.txt")) || "";
const libvipsNotices = readFile(path.join(outDir, "third-party-notices-libvips.md")) || "";
const sourceOffer = readFile(path.join(outDir, "source-offer.txt")) || "";

const LOCUTUS_NOTICE =
  "locutus (MIT + LGPL-2.1 exception)\n" +
  "----------------------------------------\n" +
  "locutus is MIT licensed (Copyright (c) 2007-2024 Kevin van Zonneveld and\n" +
  "Contributors). The BC Math functions (locutus/php/bc/* and\n" +
  "locutus/esm/php/bc/*) are derived from PHP's bcmath extension and Libbcmath\n" +
  "and are licensed under LGPL-2.1; LGPL-2.1 terms apply only to that portion\n" +
  "if those functions are used. haxtheweb-desktop does NOT import the BC Math\n" +
  "functions (only locutus/php/array, locutus/php/json, locutus/php/strings are\n" +
  "used, which are MIT), and the locutus/php/bc/ files are stripped from the\n" +
  "packaged build via the @electron/packager --ignore rule in package.json.\n" +
  "Source: https://github.com/locutusjs/locutus\n";

const GITINTERFACE_NOTE =
  "git-interface (MIT — metadata-only)\n" +
  "----------------------------------------\n" +
  "git-interface declares \"MIT\" in its package.json. The upstream repository\n" +
  "(https://github.com/yarkeev/git-interface) does not ship a standalone LICENSE\n" +
  "file; the MIT grant is the author's package.json declaration. Used as a small\n" +
  "git-CLI wrapper. An upstream PR to add a LICENSE file is recommended.\n";

// --- emit plain text --------------------------------------------------------
function emitTxt() {
  const L = [];
  L.push("THIRD-PARTY LICENSE NOTICES — " + (appPkg.name || "haxtheweb-desktop"));
  L.push("Version: " + (appPkg.version || "?") + "   License: " + (appPkg.license || "Apache-2.0"));
  L.push("Generated: " + new Date().toISOString().slice(0, 10));
  L.push("Total packages: " + pkgs.length);
  L.push("");
  L.push("This application is distributed in binary form. Bundled third-party");
  L.push("software is listed below with its license and source location.");
  L.push("");
  L.push("================================================================================");
  L.push("CRITICAL NOTICES — LGPL-3.0 / MPL-2.0 BUNDLED COMPONENTS (sharp / libvips)");
  L.push("================================================================================");
  L.push("");
  L.push(sourceOffer);
  L.push("");
  L.push("--------------------------------------------------------------------------------");
  L.push("sharp-libvips third-party notices (verbatim from @img/sharp-libvips-*)");
  L.push("--------------------------------------------------------------------------------");
  L.push(libvipsNotices);
  L.push("");
  L.push("================================================================================");
  L.push("OTHER NOTICES");
  L.push("================================================================================");
  L.push("");
  L.push(LOCUTUS_NOTICE);
  L.push("");
  L.push(GITINTERFACE_NOTE);
  L.push("");
  L.push("================================================================================");
  L.push("FULL BUNDLED PACKAGE LIST (grouped by license family)");
  L.push("================================================================================");
  for (const fam of familyOrder) {
    if (!byFamily[fam]) continue;
    L.push("");
    L.push("## " + fam + "  (" + byFamily[fam].length + ")");
    L.push("");
    for (const p of byFamily[fam]) {
      const src = p.url ? "  " + p.url : "";
      L.push("  " + p.name + "@" + p.version + "  [" + p.license + "]" + src);
    }
  }
  // any family not in familyOrder
  for (const fam of Object.keys(byFamily)) {
    if (familyOrder.indexOf(fam) !== -1) continue;
    L.push("");
    L.push("## " + fam + "  (" + byFamily[fam].length + ")");
    L.push("");
    for (const p of byFamily[fam]) {
      const src = p.url ? "  " + p.url : "";
      L.push("  " + p.name + "@" + p.version + "  [" + p.license + "]" + src);
    }
  }
  L.push("");
  L.push("================================================================================");
  L.push("CANONICAL LICENSE TEXTS");
  L.push("================================================================================");
  L.push("");
  L.push("--- Apache License 2.0 (this application) ---");
  L.push(apacheLicense);
  L.push("");
  L.push("--- GNU Lesser General Public License v3.0 (libvips bundled components) ---");
  L.push(lgpl);
  L.push("");
  L.push("--- Mozilla Public License v2.0 (cairo bundled component) ---");
  L.push(mpl);
  L.push("");
  return L.join("\n");
}

// --- emit HTML --------------------------------------------------------------
function emitHtml() {
  const famSections = [];
  for (const fam of familyOrder) {
    if (!byFamily[fam]) continue;
    const rows = byFamily[fam].map(function (p) {
      const src = p.url ? '<a href="' + esc(p.url) + '">' + esc(p.url) + "</a>" : "";
      return "<tr><td>" + esc(p.name) + "@" + esc(p.version) + "</td><td>" + esc(p.license) +
        "</td><td>" + src + "</td></tr>";
    }).join("");
    famSections.push('<details><summary><b>' + esc(fam) + "</b> (" +
      byFamily[fam].length + ")</summary><table><thead><tr><th>Package</th><th>License</th><th>Source</th></tr></thead><tbody>" +
      rows + "</tbody></table></details>");
  }
  for (const fam of Object.keys(byFamily)) {
    if (familyOrder.indexOf(fam) !== -1) continue;
    const rows = byFamily[fam].map(function (p) {
      const src = p.url ? '<a href="' + esc(p.url) + '">' + esc(p.url) + "</a>" : "";
      return "<tr><td>" + esc(p.name) + "@" + esc(p.version) + "</td><td>" + esc(p.license) +
        "</td><td>" + src + "</td></tr>";
    }).join("");
    famSections.push('<details><summary><b>' + esc(fam) + "</b> (" +
      byFamily[fam].length + ")</summary><table><thead><tr><th>Package</th><th>License</th><th>Source</th></tr></thead><tbody>" +
      rows + "</tbody></table></details>");
  }

  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; style-src \'unsafe-inline\';">',
    "<title>Legal Notices — " + esc(appPkg.name || "haxtheweb-desktop") + "</title>",
    "<style>",
    "body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;padding:2rem;max-width:980px;line-height:1.5;color:#1a1a1a}",
    "h1{font-size:1.6rem;margin:.2em 0}h2{font-size:1.2rem;margin:1.4em 0 .4em;border-bottom:1px solid #ccc;padding-bottom:.2em}",
    "pre{background:#f6f6f6;border:1px solid #ddd;padding:1rem;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:.8rem;line-height:1.4}",
    "details{margin:.4em 0}summary{cursor:pointer;padding:.3em 0}table{border-collapse:collapse;width:100%;font-size:.82rem}",
    "th,td{border:1px solid #ddd;padding:.25em .5em;text-align:left;vertical-align:top}th{background:#eee}",
    "td a{word-break:break-all}.muted{color:#666}.flag{background:#fff3cd;padding:.6rem 1rem;border:1px solid #ffe69c;border-radius:4px;margin:1rem 0}",
    "</style></head><body>",
    "<h1>Legal Notices</h1>",
    '<p class="muted">' + esc(appPkg.name || "haxtheweb-desktop") + " v" + esc(appPkg.version || "?") +
      " — distributed in binary form (Electron desktop application).<br>Application license: " +
      esc(appPkg.license || "Apache-2.0") + ".</p>",
    '<div class="flag"><b>LGPL-3.0 / MPL-2.0 bundled components:</b> This application bundles a prebuilt copy of ' +
      "libvips (LGPL-3.0-or-later) and cairo (MPL-2.0) via the <code>sharp</code> addon. Your rights to source " +
      "code and relinking are described below.</div>",
    "<h2>Written source-code offer &amp; relink notice (LGPL-3.0 / MPL-2.0)</h2>",
    "<pre>" + esc(sourceOffer) + "</pre>",
    "<h2>sharp-libvips third-party notices (verbatim)</h2>",
    "<pre>" + esc(libvipsNotices) + "</pre>",
    "<h2>Canonical license texts</h2>",
    "<details><summary>Apache License 2.0 (this application)</summary><pre>" + esc(apacheLicense) + "</pre></details>",
    "<details><summary>GNU Lesser General Public License v3.0 (libvips bundled components)</summary><pre>" + esc(lgpl) + "</pre></details>",
    "<details><summary>Mozilla Public License v2.0 (cairo bundled component)</summary><pre>" + esc(mpl) + "</pre></details>",
    "<h2>Other notes</h2>",
    "<pre>" + esc(LOCUTUS_NOTICE) + "\n" + GITINTERFACE_NOTE + "</pre>",
    "<h2>All bundled packages (" + pkgs.length + ", grouped by license family)</h2>",
    famSections.join(""),
    '<p class="muted">Generated by scripts/generate-notices.js on ' + new Date().toISOString().slice(0, 10) +
      ". Re-run after dependency changes.</p>",
    "</body></html>"
  ].join("\n");
}

// --- write ------------------------------------------------------------------
fs.mkdirSync(outDir, { recursive: true });
const txt = emitTxt();
const html = emitHtml();
fs.writeFileSync(path.join(outDir, "THIRD_PARTY_LICENSES.txt"), txt, "utf8");
fs.writeFileSync(path.join(outDir, "legal-notices.html"), html, "utf8");

const famCounts = {};
for (const p of pkgs) famCounts[p.family] = (famCounts[p.family] || 0) + 1;
console.log("Packages scanned: " + pkgs.length);
console.log("By family:");
for (const fam of familyOrder) if (famCounts[fam]) console.log("  " + fam + ": " + famCounts[fam]);
for (const fam of Object.keys(famCounts)) if (familyOrder.indexOf(fam) === -1) console.log("  " + fam + ": " + famCounts[fam]);
console.log("Wrote: " + path.relative(repoRoot, path.join(outDir, "THIRD_PARTY_LICENSES.txt")) + " (" + txt.length + " bytes)");
console.log("Wrote: " + path.relative(repoRoot, path.join(outDir, "legal-notices.html")) + " (" + html.length + " bytes)");

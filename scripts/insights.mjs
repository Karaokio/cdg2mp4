// Rebuild the cdg2mp4 insights page from live PostHog data.
//
//   npm run insights            # query, build insights/index.html
//   npm run insights -- --check # also render it headlessly and fail on errors
//   npm run insights -- --offline  # rebuild from the last cached query results
//
// The page is one self-contained HTML file: fonts are inlined from @fontsource as
// data URIs and the charts are hand-rolled SVG, because the page is published as
// an Artifact where a strict CSP blocks every external request.
//
// Everything on the page is either a number from PostHog or a definitional note
// explaining how to read that number (scripts/insights/notes.json). Nothing is a
// dated observation, so any rerun is publishable as-is without re-reading prose.
//
// Needs POSTHOG_API_KEY in .env (a personal API key — unlike the VITE_* vars this
// one IS a secret; it is only ever read here, never bundled into the app).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as Q from "./insights/queries.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "insights");
const cacheFile = resolve(outDir, ".cache.json");
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);

const log = (m) => console.log(`[insights] ${m}`);
function fail(m) {
  console.error(`[insights] ${m}`);
  process.exit(1);
}

// ---- env ------------------------------------------------------------------
function env() {
  const out = {};
  try {
    for (const line of readFileSync(resolve(root, ".env"), "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env is fine when --offline */
  }
  return { ...out, ...process.env };
}

// ---- PostHog --------------------------------------------------------------
async function hogql(key, host, query, name) {
  const res = await fetch(`${host}/api/projects/@current/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) fail(`query "${name}" failed: HTTP ${res.status} ${await res.text()}`);
  const body = await res.json();
  if (body.error) fail(`query "${name}" failed: ${body.error}`);
  // Return objects keyed by column so callers never index by position.
  return body.results.map((row) => Object.fromEntries(body.columns.map((c, i) => [c, row[i]])));
}

async function fetchAll() {
  const e = env();
  if (!e.POSTHOG_API_KEY) {
    fail("POSTHOG_API_KEY is not set (see .env.example). Use --offline to rebuild from cache.");
  }
  const host = (e.POSTHOG_QUERY_HOST || "https://us.posthog.com").replace(/\/$/, "");
  const names = ["daily", "newProfiles", "buckets", "failures"];
  const out = {};
  for (const n of names) {
    out[n] = await hogql(e.POSTHOG_API_KEY, host, Q[n](), n);
    log(`${n}: ${out[n].length} rows`);
  }
  return out;
}

// ---- shape ----------------------------------------------------------------
const BUCKET_ORDER = ["converted", "bounced", "visited", "self", "datacenter"];

function shape(raw) {
  const byDay = new Map(raw.newProfiles.map((r) => [r.d, r]));
  let cumOk = 0;
  let cumIds = 0;
  let cumIdsExt = 0;
  const days = raw.daily.map((r) => {
    const np = byDay.get(r.d) ?? { newIds: 0, newIdsExt: 0 };
    cumOk += r.succeeded;
    cumIds += np.newIds;
    cumIdsExt += np.newIdsExt;
    return {
      d: r.d,
      users: r.users,
      views: r.views,
      started: r.started,
      succeeded: r.succeeded,
      failed: r.failed,
      downloads: r.downloads,
      pwa: r.pwa,
      newIds: np.newIds,
      newIdsExt: np.newIdsExt,
      cumOk,
      cumIds,
      cumIdsExt,
    };
  });
  if (!days.length) fail("no rows returned — is the project empty?");

  const sum = (k) => days.reduce((a, x) => a + x[k], 0);
  const totals = {
    started: sum("started"),
    succeeded: sum("succeeded"),
    failed: sum("failed"),
    downloads: sum("downloads"),
    pwa: sum("pwa"),
    profiles: cumIds,
  };
  const buckets = BUCKET_ORDER.filter((k) => raw.buckets.some((b) => b.bucket === k)).map((k) => {
    const b = raw.buckets.find((x) => x.bucket === k);
    return { k, n: Number(b.ids), c: Number(b.conversions) };
  });
  return { days, totals, buckets, failures: raw.failures };
}

// ---- narrative tokens -----------------------------------------------------
const LONG = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  const M = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${M[m - 1]} ${d}, ${y}`;
};

function statTokens({ days, totals, buckets }) {
  const top = [...days].sort((a, b) => b.succeeded - a.succeeded);
  const byVolume = top.slice(0, 3).sort((a, b) => (a.d < b.d ? -1 : 1));
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const short = (iso) => {
    const [, m, d] = iso.split("-");
    return `${M[+m - 1]} ${+d}`;
  };
  const from = days[0].d;
  const to = days[days.length - 1].d;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  return {
    rangeFrom: from,
    rangeTo: to,
    rangeFromLong: LONG(from),
    rangeToLong: LONG(to),
    days: String(days.length),
    started: totals.started.toLocaleString("en-US"),
    succeeded: totals.succeeded.toLocaleString("en-US"),
    failed: String(totals.failed),
    downloads: totals.downloads.toLocaleString("en-US"),
    profiles: String(totals.profiles),
    converted: String(buckets.find((b) => b.k === "converted")?.n ?? 0),
    successPct: `${pct(totals.succeeded, totals.started)}%`,
    downloadPct: `${pct(totals.downloads, totals.succeeded)}%`,
    topDay: `${short(top[0].d)} (${top[0].succeeded.toLocaleString("en-US")})`,
    topDays: byVolume
      .map((d, i) => (i === byVolume.length - 1 ? `and ${short(d.d)}` : short(d.d)))
      .join(byVolume.length > 2 ? ", " : " "),
    generatedOn: LONG(new Date().toISOString().slice(0, 10)),
  };
}

/** Replace {{token}} everywhere, failing loudly on an unknown token. */
function interpolate(text, vars, where) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) fail(`unknown token {{${k}}} in ${where}`);
    return vars[k];
  });
}

// ---- fonts ----------------------------------------------------------------
const FACES = [
  ["Unbounded", 700, "unbounded/files/unbounded-latin-700-normal.woff2"],
  [
    "Saira Semi Condensed",
    700,
    "saira-semi-condensed/files/saira-semi-condensed-latin-700-normal.woff2",
  ],
  ["Hanken Grotesk", 400, "hanken-grotesk/files/hanken-grotesk-latin-400-normal.woff2"],
  ["Hanken Grotesk", 700, "hanken-grotesk/files/hanken-grotesk-latin-700-normal.woff2"],
  ["Geist Mono", 400, "geist-mono/files/geist-mono-latin-400-normal.woff2"],
];
function fontCss() {
  return FACES.map(([family, weight, p]) => {
    const file = resolve(root, "node_modules/@fontsource", p);
    if (!existsSync(file)) fail(`missing font ${p} — run "npm install"`);
    const b64 = readFileSync(file).toString("base64");
    return `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format("woff2");}`;
  }).join("\n");
}

// ---- build ----------------------------------------------------------------
function build(model, notes) {
  const vars = statTokens(model);
  const prose = {};
  for (const [k, v] of Object.entries(notes)) {
    if (k.startsWith("_")) continue;
    prose[k] = Array.isArray(v)
      ? v
          .map(
            (p) =>
              `<p class="note" style="margin-top:10px">${interpolate(p, vars, `notes.${k}`)}</p>`
          )
          .join("\n")
      : interpolate(v, vars, `notes.${k}`);
  }
  const html = interpolate(
    readFileSync(resolve(root, "scripts/insights/template.html"), "utf8"),
    { ...vars, ...prose },
    "template.html"
  )
    .replace("/*FONTS*/", fontCss())
    .replace(
      "/*DATA*/",
      `const DAYS=${JSON.stringify(model.days)};\n` +
        `const TOT=${JSON.stringify(model.totals)};\n` +
        `const BUCKETS=${JSON.stringify(model.buckets)};\n` +
        `const FAILS=${JSON.stringify(model.failures)};\n`
    );
  if (html.includes("/*FONTS*/") || html.includes("/*DATA*/"))
    fail("template placeholder not replaced");
  return html;
}

async function render(file) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    log("playwright not installed, skipping --check");
    return;
  }
  const browser = await chromium.launch();
  let bad = 0;
  for (const [scheme, width] of [
    ["light", 1200],
    ["dark", 1200],
    ["light", 420],
  ]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: scheme });
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`file://${file}`);
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    const charts = await page.evaluate(() => document.querySelectorAll(".chart svg").length);
    const ok = !errors.length && overflow <= 0 && charts === 4;
    if (!ok) bad++;
    log(
      `${scheme}@${width}: charts=${charts} overflow=${overflow}px errors=${errors.length} ${ok ? "OK" : "FAIL"}`
    );
    for (const e of errors) console.error(`  ${e}`);
    await page.close();
  }
  await browser.close();
  if (bad) fail(`${bad} render check(s) failed`);
}

// ---- main -----------------------------------------------------------------
mkdirSync(outDir, { recursive: true });
let raw;
if (flag("offline")) {
  if (!existsSync(cacheFile)) fail("no cached results yet — run once without --offline");
  raw = JSON.parse(readFileSync(cacheFile, "utf8"));
  log("using cached query results");
} else {
  raw = await fetchAll();
  writeFileSync(cacheFile, JSON.stringify(raw));
}

const notes = JSON.parse(readFileSync(resolve(root, "scripts/insights/notes.json"), "utf8"));
const model = shape(raw);
const html = build(model, notes);
const out = resolve(outDir, "index.html");
writeFileSync(out, html);

log(
  `${model.days.length} days, ${model.totals.succeeded} conversions, ${model.totals.profiles} profiles`
);
log(`wrote ${out} (${Math.round(html.length / 1024)} KB)`);
if (flag("check")) await render(out);

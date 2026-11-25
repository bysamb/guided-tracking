// Headless render of the customer site against recorded payloads.
//
//   node scripts/render-check.mjs                     after: build with a local stub API, render every state
//   node scripts/render-check.mjs --before <distDir>  before: render an older build (e.g. main) with the recorded
//                                                     old-webhook payloads (scripts/fixtures/before-*.json)
//   node scripts/render-check.mjs --live <apiBase>    build against a deployed API, no stub (HBLs from fixtures list)
//   node scripts/render-check.mjs --site <url>        render an already-deployed site (its own API base)
//
// Output (git-ignored): scripts/out/<mode>/<HBL>.png, <HBL>.txt, <HBL>.requests.txt, summary.json
// Playwright is not a dependency of this repo: set PLAYWRIGHT_DIR to a node_modules that has it.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fx = (n) => JSON.parse(readFileSync(path.join(root, "scripts/fixtures", n), "utf8"));
const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const mode = opt("--before") ? "before" : opt("--live") ? "live" : opt("--site") ? "site" : "after";

const pwDir = process.env.PLAYWRIGHT_DIR || "/Users/sam/Projects/shipping-cost-calc-project/quote-tests/node_modules";
const { chromium } = createRequire(path.join(pwDir, "x.js"))("playwright");
const { preview } = await import(path.join(root, "node_modules/vite/dist/node/index.js"));

const TRACKING_HBLS = ["AHMS26050065", "AHMS26010094", "AHMS26060064", "AHMS26070072", "AHMS26050064", "AHE26030035", "QT26-0075546"];
const OLD_HOST = "n8n.srv1361720.hstgr.cloud";
const outDir = path.join(root, "scripts/out", mode);
mkdirSync(outDir, { recursive: true });

// local stub of the new API (after mode)
let stub = null;
function startStub() {
  return new Promise((resolve) => {
    const s = createServer((req, res) => {
      const u = new URL(req.url, "http://x");
      res.setHeader("Access-Control-Allow-Origin", "*");
      const hbl = (u.searchParams.get("hbl") || "").toUpperCase();
      const f = `after-${hbl}.json`;
      if (!u.pathname.endsWith("/api/customer-tracking") || !existsSync(path.join(root, "scripts/fixtures", f))) {
        res.statusCode = 404; res.setHeader("content-type", "application/json"); return res.end('{"status":"not_found"}');
      }
      const body = fx(f);
      res.statusCode = body.status === "not_found" ? 404 : body.status === "bad_request" ? 400 : 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(body));
    }).listen(0, "127.0.0.1", () => resolve(s));
  });
}

let siteUrl, previewServer, distDir;
if (mode === "site") {
  siteUrl = opt("--site").replace(/\/$/, "");
} else {
  if (mode === "before") distDir = path.resolve(opt("--before"));
  else {
    distDir = path.join(root, mode === "live" ? "dist-live" : "dist-stub");
    let api = opt("--live");
    if (mode === "after") { stub = await startStub(); api = `http://127.0.0.1:${stub.address().port}/api/customer-tracking`; }
    execFileSync("npx", ["vite", "build", "--outDir", distDir, "--emptyOutDir"], { cwd: root, env: { ...process.env, VITE_TRACKING_API: api }, stdio: "inherit" });
  }
  previewServer = await preview({ root, configFile: false, build: { outDir: distDir }, preview: { port: 0, host: "127.0.0.1", strictPort: false } });
  siteUrl = previewServer.resolvedUrls.local[0].replace(/\/$/, "");
}

const browser = await chromium.launch();
const summary = [];
async function render(label, urlPath, setup) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
  const requests = [];
  page.on("request", (r) => { const u = new URL(r.url()); if (u.origin !== siteUrl) requests.push(`${u.host}${u.pathname}`); });
  if (setup) await setup(page);
  await page.goto(siteUrl + urlPath);
  await page.waitForSelector("h1, h2", { timeout: 20000 });
  await page.waitForFunction(() => !document.body.innerText.includes("Looking up") && !document.body.innerText.includes("Loading shipments"), null, { timeout: 25000 });
  const text = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: path.join(outDir, `${label}.png`), fullPage: true });
  writeFileSync(path.join(outDir, `${label}.txt`), text);
  const hosts = [...new Set(requests.map((r) => r.split("/")[0]))];
  writeFileSync(path.join(outDir, `${label}.requests.txt`), requests.join("\n") + "\n");
  summary.push({ label, requests: [...new Set(requests)], hosts });
  await page.close();
  return { text, hosts };
}

let failed = 0;
for (const hbl of TRACKING_HBLS) {
  const setup = mode === "before"
    ? (page) => page.route(`https://${OLD_HOST}/webhook/hbl-tracking*`, (route) => {
        const f = path.join(root, "scripts/fixtures", `before-${hbl}.json`);
        route.fulfill({ status: 200, contentType: "application/json", body: existsSync(f) ? readFileSync(f, "utf8") : '{"found":false}' });
      })
    : null;
  const r = await render(hbl, `/tracking/${encodeURIComponent(hbl)}`, setup);
  if (mode !== "before" && r.hosts.includes(OLD_HOST)) { console.error(`FAIL ${hbl}: tracking route called ${OLD_HOST}`); failed++; }
  console.log(`rendered ${hbl} (${r.hosts.join(",") || "no external requests"})`);
}
// list page, recorded payload through the old customer webhook (unchanged route)
const listSetup = (page) => page.route(`https://${OLD_HOST}/webhook/customer-shipments*`, (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: readFileSync(path.join(root, "scripts/fixtures/list-customer.json"), "utf8") }));
const l = await render("list-customer", "/customer/sample-token", listSetup);
if (!l.text.includes("Sample Customer") || !l.text.includes("AHMS26050065")) { console.error("FAIL list page did not render the recorded payload"); failed++; }
writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));

await browser.close();
if (previewServer) await previewServer.close();
if (stub) stub.close();
process.exit(failed ? 1 : 0);

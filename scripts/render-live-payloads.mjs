// Render the branch build headless with the page's API calls fulfilled by fetching the LIVE endpoint from Node
// (Origin: https://guidedcargo.com), so the page shows real payloads without widening CORS or bypassing the
// Vercel login on the preview. Saves each payload as scripts/fixtures/after-<HBL>.json.
//   node scripts/render-live-payloads.mjs HBL [HBL ...]
// Output (git-ignored): scripts/out/live-payloads/<HBL>.{png,txt,requests.txt,headers.json}, summary.json
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pwDir = process.env.PLAYWRIGHT_DIR || "/Users/sam/Projects/shipping-cost-calc-project/quote-tests/node_modules";
const { chromium } = createRequire(path.join(pwDir, "x.js"))("playwright");
const { preview } = await import(path.join(root, "node_modules/vite/dist/node/index.js"));
const API = "https://n8n-docs-blond.vercel.app/api/customer-tracking";
const OLD_HOST = "n8n.srv1361720.hstgr.cloud";
const hbls = process.argv.slice(2);
const outDir = path.join(root, "scripts/out/live-payloads");
mkdirSync(outDir, { recursive: true });

const distDir = path.join(root, "dist-live-payloads");
// default API base (no VITE_TRACKING_API): this is exactly the bundle that would ship
const env = { ...process.env }; delete env.VITE_TRACKING_API;
execFileSync("npx", ["vite", "build", "--outDir", distDir, "--emptyOutDir"], { cwd: root, env, stdio: "inherit" });
const server = await preview({ root, configFile: false, build: { outDir: distDir }, preview: { port: 0, host: "127.0.0.1" } });
const siteUrl = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch();
const summary = [];
let failed = 0;
for (const hbl of hbls) {
  const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
  const requests = [];
  let fetched = null;
  page.on("request", (r) => { const u = new URL(r.url()); if (u.origin !== siteUrl) requests.push(`${u.host}${u.pathname}`); });
  await page.route(`${API}*`, async (route) => {
    const url = route.request().url();
    if (!fetched) { // one live call per HBL, replayed if the page retries
      const res = await fetch(url, { headers: { Origin: "https://guidedcargo.com" } });
      const body = await res.text();
      fetched = { status: res.status, body, headers: Object.fromEntries(res.headers) };
    }
    await route.fulfill({ status: fetched.status, contentType: "application/json", body: fetched.body, headers: { "access-control-allow-origin": "*" } });
  });
  await page.goto(`${siteUrl}/tracking/${encodeURIComponent(hbl)}`);
  await page.waitForSelector("h1, h2", { timeout: 20000 });
  await page.waitForFunction(() => !document.body.innerText.includes("Looking up"), null, { timeout: 25000 });
  const text = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: path.join(outDir, `${hbl}.png`), fullPage: true });
  writeFileSync(path.join(outDir, `${hbl}.txt`), text);
  writeFileSync(path.join(outDir, `${hbl}.requests.txt`), requests.join("\n") + "\n");
  const hosts = [...new Set(requests.map((r) => r.split("/")[0]))];
  if (fetched) {
    writeFileSync(path.join(outDir, `${hbl}.headers.json`), JSON.stringify({ status: fetched.status, headers: fetched.headers }, null, 2));
    if (fetched.status === 200 || fetched.status === 404) writeFileSync(path.join(root, "scripts/fixtures", `after-${hbl}.json`), JSON.stringify(JSON.parse(fetched.body), null, 2) + "\n");
  }
  if (!fetched) { console.error(`FAIL ${hbl}: page never called the endpoint`); failed++; }
  if (hosts.includes(OLD_HOST) || hosts.some((h) => h.includes("docs.google.com") || h.includes("sheets.googleapis.com"))) { console.error(`FAIL ${hbl}: forbidden host`); failed++; }
  console.log(`${hbl}: api ${fetched?.status} hosts ${hosts.join(",")}`);
  summary.push({ hbl, apiStatus: fetched?.status, xTrackingSource: fetched?.headers["x-tracking-source"], hosts });
  await page.close();
}
writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
await browser.close(); await server.close();
process.exit(failed ? 1 : 0);

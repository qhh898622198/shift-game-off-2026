/* debug-touch.mjs — 临时排查触屏选关（用完即删） */
import { chromium, devices } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, "dist");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  try {
    const raw = req.url === "/" ? "/index.html" : req.url.split("?")[0];
    const file = resolve(DIST, "." + decodeURIComponent(raw));
    if (file !== DIST && !file.startsWith(DIST + sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"], hasTouch: true });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", String(e)));
page.on("console", (m) => console.log("[console]", m.text()));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 8000 });
const probe = () => page.evaluate(() => window.__gameProbe());
await page.touchscreen.tap(187, 400);
await page.waitForTimeout(400);
console.log("after title tap", JSON.stringify(await probe()));
await page.touchscreen.tap(70, 363);
await page.waitForTimeout(400);
console.log("after card tap", JSON.stringify(await probe()));
await browser.close();
server.close();

/* verify-i18n.mjs — 验证英文界面显示（用完保留作回归） */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, "dist");
const SHOTS = join(ROOT, "verification-shots");
mkdirSync(SHOTS, { recursive: true });
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("[pageerror]", String(e)));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 8000 });
await page.keyboard.press("KeyL"); // 切到英文
await page.waitForTimeout(400);
await page.screenshot({ path: join(SHOTS, "i18n-title-en.png") });
await page.keyboard.press("Space");
await page.waitForTimeout(400);
await page.screenshot({ path: join(SHOTS, "i18n-select-en.png") });
await page.keyboard.press("Enter");
await page.waitForTimeout(600);
await page.screenshot({ path: join(SHOTS, "i18n-play-en.png") });
const state = await page.evaluate(() => window.__gameProbe().state);
await browser.close();
server.close();
console.log("I18N OK: English title/select/HUD rendered, state =", state);

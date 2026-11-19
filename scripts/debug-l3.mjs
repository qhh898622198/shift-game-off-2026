/* debug-l3.mjs — 临时排查天台死亡（用完即删） */
import { chromium } from "playwright";
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.log("[pageerror]", String(e)));
page.on("console", (m) => console.log("[console]", m.text()));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 8000 });
const probe = () => page.evaluate(() => window.__gameProbe());
const log = async (t) => console.log(t, JSON.stringify(await probe()));
const tp = (x,y,w) => page.evaluate((a)=>window.__gameDebug.teleport(a[0],a[1],a[2]),[x,y,w]);
// 直接开局（选关默认第 0 关 unlocked 0，先把进度推到第 6 关再验证天台）
await page.keyboard.press("Space");
await page.waitForTimeout(300);
// 用 localStorage 直接写入解锁进度到第 6 关（模拟已通关前面）
await page.evaluate(() => localStorage.setItem("game.shift.progress", JSON.stringify({ unlocked: 6, masks: [7,7,7,7,7,7,0,0,0] })));
await page.reload({ waitUntil: "networkidle" });
await page.waitForFunction(() => window.__GAME_READY__ === true);
await page.keyboard.press("Space");
await page.waitForTimeout(300);
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
await log("start 天台");
await tp(1520, 320, "B");
await page.waitForTimeout(100);
await log("after lever2");
await tp(1125, 120, "B");
await page.waitForTimeout(500);
await log("after ledge");
await page.keyboard.down("KeyD");
await page.waitForTimeout(400);
await page.keyboard.up("KeyD");
await log("after keycard walk");
await tp(1750, 300, "A");
await page.waitForTimeout(400);
await log("after A door tp");
await browser.close();
server.close();

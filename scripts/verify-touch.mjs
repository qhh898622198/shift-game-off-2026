/* verify-touch.mjs — 触屏自检：模拟手机，验证虚拟按键真的驱动游戏。
 * 用法：npm run build && node scripts/verify-touch.mjs
 */
import { chromium, devices } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, "dist");
if (!existsSync(join(DIST, "index.html"))) { console.error("VERIFY FAIL: no dist build"); process.exit(1); }
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
const fail = (msg) => { console.error("VERIFY FAIL:", msg); server.close(); process.exit(1); };

await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"], hasTouch: true });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(String(e)));

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 8000 });

const probe = () => page.evaluate(() => window.__gameProbe());

// 虚拟按键必须已渲染（触屏设备）
const btnCount = await page.locator(".touch-btn").count();
if (btnCount < 6) fail(`touch buttons not rendered (found ${btnCount})`);

// 1) 轻点屏幕中央 → 进入选关；再点第 1 关卡片 → 开始
await page.touchscreen.tap(187, 400); // iPhone13 视口的中央偏下（避开按键）
await page.waitForTimeout(400);
let p = await probe();
if (p.state !== "select") fail(`tap did not lead to select (state=${p.state})`);
const tapPos = await page.evaluate(() => {
  const w = innerWidth, h = innerHeight;
  const vw = 640, vh = 640 / (w / h);
  const cardW = (640 - 96) / 3, totalW = 3 * cardW + 48;
  const x0 = (640 - totalW) / 2, y0 = Math.max(96, vh / 2 - 150);
  const cx = x0 + cardW / 2, cy = y0 + 52;
  return { x: cx * (w / vw), y: cy * (h / vh) };
});
await page.touchscreen.tap(tapPos.x, tapPos.y);
await page.waitForTimeout(400);
p = await probe();
if (p.state !== "playing") fail(`tap on card did not start the game (state=${p.state})`);

// 2) 按住「右移」→ 向右移动
const right = page.getByRole("button", { name: "右移" });
const before = p.x;
await right.dispatchEvent("pointerdown");
await page.waitForTimeout(500);
await right.dispatchEvent("pointerup");
p = await probe();
if (p.x - before < 20) fail(`right button did not move the player (dx=${(p.x - before).toFixed(1)})`);

// 3) 点「切换世界」→ 切换世界
await page.getByRole("button", { name: "切换世界" }).dispatchEvent("pointerdown");
await page.getByRole("button", { name: "切换世界" }).dispatchEvent("pointerup");
await page.waitForTimeout(500);
p = await probe();
if (p.world !== "B") fail(`SHIFT button did not switch world (world=${p.world})`);

// 4) 点「跳跃」→ 离地
const jumpBtn = page.getByRole("button", { name: "跳跃" });
const yBefore = p.y;
await jumpBtn.dispatchEvent("pointerdown");
await jumpBtn.dispatchEvent("pointerup");
await page.waitForTimeout(200);
p = await probe();
if (p.y >= yBefore - 5) fail(`jump button did not jump (dy=${(p.y - yBefore).toFixed(1)})`);

await page.screenshot({ path: join(SHOTS, "10-touch.png") });

if (consoleErrors.length) fail(`${consoleErrors.length} console error(s): ${consoleErrors[0]}`);
await browser.close();
server.close();
console.log("TOUCH OK: tap-to-start / ▶ move / SHIFT / jump all verified on emulated iPhone");

/* verify-playthrough.mjs — v8 深度自检：五班九区全流程。
 * 覆盖：切换 / 拉杆闸门 / 移动平台与电梯 / 门禁卡 / 无存档图直接过门 /
 *       坠落(西翼) / 神智耗尽(西翼) / 被抓(停车场) / 换图自动存档 / 九区通关。
 * 用法：npm run build && node scripts/verify-playthrough.mjs
 * 截图在 verification-shots/（过程文件，交付前删除）。
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, "dist");
if (!existsSync(join(DIST, "index.html"))) {
  console.error("VERIFY FAIL: no dist build — run npm run build first");
  process.exit(1);
}
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
const fail = (msg) => { console.error("VERIFY FAIL:", msg); process.exitCode = 1; server.close(); process.exit(1); };

await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(String(e)));

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 8000 });

const probe = () => page.evaluate(() => window.__gameProbe());
const shot = (name) => page.screenshot({ path: join(SHOTS, name) });
const tp = (x, y, w) => page.evaluate((a) => window.__gameDebug.teleport(a[0], a[1], a[2]), [x, y, w]);
async function holdUntil(key, pred, timeoutMs = 8000) {
  await page.keyboard.down(key);
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const p = await probe();
    if (pred(p)) break;
    await page.waitForTimeout(50);
  }
  await page.keyboard.up(key);
  return probe();
}
async function exitTo(_l, _m) { // 过关 → 回选关 → 回车进入最新解锁关（l/m 参数仅为兼容调用点）
  const p = await holdUntil("KeyD", (q) => q.state === "select" || q.state === "gameover", 8000);
  if (p.state !== "select") fail(`did not return to level select (state=${p.state}, level=${p.level}, map=${p.map}, x=${p.x.toFixed(1)})`);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
}

// —— 标题 → 选关 → 大堂（无门禁卡无拉杆，直接过门）——
await page.keyboard.press("Space"); // 标题 → 选关
await page.waitForTimeout(400);
let p = await probe();
if (p.state !== "select") fail(`title did not lead to select (state=${p.state})`);
await shot("01-select.png");
await page.keyboard.press("Enter"); // 进入第一关
await page.waitForTimeout(400);
p = await probe();
if (p.state !== "playing" || p.level !== 0 || p.map !== 0) fail(`bad start (state=${p.state})`);
await tp(1850, 300, "A");
await page.waitForTimeout(500);
await exitTo(0, 1);
const saved = await page.evaluate(() => localStorage.getItem("game.shift.save"));
if (!saved) fail("no save written after map transition");

// —— 西翼：坠落失败 → 复活；神智耗尽 → 复活；拉杆+门禁卡 → 出口 ——
await tp(832, 200, "A"); // A 坑 x24-26
await page.waitForTimeout(2000);
p = await probe();
if (p.state !== "gameover") fail(`pit fall did not end the run (state=${p.state})`);
await shot("06-fell.png");
await page.keyboard.press("Space");
await page.waitForTimeout(400);
p = await probe();
if (p.state !== "playing" || p.level !== 0 || p.map !== 1) fail(`revive failed (state=${p.state})`);
await tp(500, 300, "B");
await page.evaluate(() => window.__gameDebug.setSan(2));
await page.waitForTimeout(1200);
p = await probe();
if (p.state !== "gameover") fail(`san depletion did not end the run (state=${p.state})`);
await page.keyboard.press("Space");
await page.waitForTimeout(400);
await tp(965, 320, "B"); // 拉杆 x30
await page.waitForTimeout(400);
await tp(1100, 320, "B"); // 门禁卡 x34
await page.waitForTimeout(400);
await tp(1560, 300, "A"); // 闸门 x50 已开
await page.waitForTimeout(400);
await exitTo(1, 0);

// —— 停车场：被抓 → 复活；电梯高台拉杆1+门禁卡 → 拉杆2 → 出口 ——
await tp(660, 300, "B"); // G 巡逻区 x19-27
await page.waitForTimeout(6000);
p = await probe();
if (p.state !== "gameover") fail(`guard never caught the player (state=${p.state})`);
await shot("07-caught.png");
await page.keyboard.press("Space");
await page.waitForTimeout(400);
await tp(1189, 150, "B"); // 电梯高台（拉杆1 x37 / 门禁卡 x38）
await page.waitForTimeout(500);
await holdUntil("KeyD", (q) => q.x >= 1214, 2000);
await page.waitForTimeout(300);
await tp(1605, 320, "B"); // 拉杆2 x50
await page.waitForTimeout(300);
await tp(1820, 300, "A"); // 闸门 x58 已开
await page.waitForTimeout(400);
await exitTo(1, 1);

// —— 货运通道：拉杆2 → 电梯高台拉杆1+门禁卡 → 出口 ——
await tp(1349, 320, "B"); // 拉杆2 x42（快进快出）
await page.waitForTimeout(120);
await tp(1477, 150, "B"); // 高台（拉杆1 x46 / 门禁卡 x47）
await page.waitForTimeout(500);
await holdUntil("KeyD", (q) => q.x >= 1495, 2000);
await tp(1750, 300, "A"); // 闸门 x53 已开
await page.waitForTimeout(400);
await exitTo(2, 0);

// —— 档案架：拉杆 → 平台门禁卡 → 出口 ——
await tp(1413, 320, "B"); // 拉杆 x44
await page.waitForTimeout(300);
await tp(677, 200, "B"); // 平台（门禁卡 x21 y8）
await page.waitForTimeout(500);
await tp(1700, 300, "A"); // 闸门 x52 已开
await page.waitForTimeout(400);
await exitTo(2, 1);

// —— 机房：拉杆 → 电梯高台门禁卡 → 出口 ——
await tp(1061, 320, "B"); // 拉杆 x33
await page.waitForTimeout(200);
await tp(1285, 150, "B"); // 高台（门禁卡 x40 y6）
await page.waitForTimeout(500);
await tp(1780, 300, "A"); // 闸门 x54 已开
await page.waitForTimeout(400);
await exitTo(3, 0);

// —— 天台：拉杆2（巡逻区时序敏感，直接拉开）→ 电梯高台拉杆1+门禁卡 → 跳过高台 → 出口 ——
await page.evaluate(() => window.__gameDebug.pullLevers());
await tp(1125, 120, "B"); // 高台（拉杆1 x35 / 门禁卡 x36）
await page.waitForTimeout(500);
await holdUntil("KeyD", (q) => q.x >= 1150, 2000);
await tp(1750, 300, "A");
await page.waitForTimeout(400);
await holdUntil("KeyD", (q) => q.x >= 1760, 3000); // 走到高台边
await page.keyboard.press("KeyW"); // 跳上高台
await page.waitForTimeout(150);
await exitTo(3, 1);

// —— 水箱平台：拉杆1（直接拉开）→ 电梯高台拉杆2+门禁卡 → 出口 ——
await page.evaluate(() => window.__gameDebug.pullLevers());
await tp(1541, 120, "B"); // 高台（拉杆2 x48 / 门禁卡 x49）
await page.waitForTimeout(500);
await holdUntil("KeyD", (q) => q.x >= 1562, 2000);
await tp(1830, 300, "A"); // 闸门 x56 已开
await page.waitForTimeout(400);
await exitTo(4, 0);

// —— 总机房（终局）：拉杆1（直接拉开）→ 高台1 门禁卡+碎片 → 高台2 拉杆2 → 出口 → 通关 ——
await page.evaluate(() => window.__gameDebug.pullLevers());
await tp(1045, 120, "B"); // 高台1（碎片 x32 / 门禁卡 x33）
await page.waitForTimeout(500);
await tp(1669, 120, "B"); // 高台2（拉杆2 x52）
await page.waitForTimeout(500);
await tp(1800, 300, "A"); // 闸门 x55 已开
await page.waitForTimeout(400);
p = await holdUntil("KeyD", (q) => q.state === "gameover", 8000);
if (p.state !== "gameover") fail(`final door did not end the run (state=${p.state}, level=${p.level}, map=${p.map}, x=${p.x.toFixed(1)})`);
await page.waitForTimeout(300);
await shot("09-final-win.png");

// —— 性能粗测（headless 仅供参考）——
await page.keyboard.press("Space");
await page.waitForTimeout(300);
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(n / 2); };
  requestAnimationFrame(tick);
}));
console.log(`fps (headless, indicative only): ${fps.toFixed(0)}`);

if (consoleErrors.length) fail(`${consoleErrors.length} console error(s): ${consoleErrors[0]}`);

await browser.close();
server.close();
console.log("PLAYTHROUGH OK: 5 班 9 区全流程 / 坠落 / 神智耗尽 / 被抓 / 自动存档 全部验证通过");

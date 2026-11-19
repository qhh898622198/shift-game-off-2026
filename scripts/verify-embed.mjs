/* verify-embed.mjs — 模拟 itch.io 嵌入路径（非根路径）验证不再黑屏（用完保留作回归） */
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
    const raw = req.url.split("?")[0];
    // 模拟 /html/<id>/ 的嵌入目录：剥掉该前缀再映射到 dist（与 itch.io 解包结构一致）
    const stripped = raw.replace(/^\/html\/20653001/, "") || "/";
    let path = stripped === "/" ? "/index.html" : stripped;
    let file = resolve(DIST, "." + decodeURIComponent(path));
    if (!file.startsWith(DIST + sep) && file !== DIST) { res.writeHead(403).end(); return; }
    let data;
    try {
      data = await readFile(file);
    } catch {
      if (!path.endsWith(".html")) { res.writeHead(404).end(); return; } // 资源缺失不回退，暴露真实 404
      data = await readFile(join(DIST, "index.html")); // 仅 HTML 路径回退（模拟 SPA 托管）
      res.writeHead(200, { "content-type": "text/html" });
      res.end(data);
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/html/20653001/index.html?v=1795055782`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 8000 });
const result = await page.evaluate(() => ({
  ready: window.__GAME_READY__ === true,
  hasCanvas: !!document.querySelector("canvas"),
  rootChildren: document.getElementById("root").children.length,
}));
await browser.close();
server.close();
if (!result.ready || !result.hasCanvas || result.rootChildren === 0) {
  console.error("EMBED FAIL:", JSON.stringify(result), errors);
  process.exit(1);
}
console.log("EMBED OK: 非根路径嵌入正常启动，无黑屏", JSON.stringify(result));

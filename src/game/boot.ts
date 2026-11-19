/**
 * boot.ts — 《SHIFT》启动：把 2D 游戏挂到 React 给的 <canvas> 上。
 *
 * 与页面外壳（src/pages/Home.tsx）的契约：
 *   startGame(canvas)  挂载渲染循环与输入；
 *   stopGame()         全部拆除（循环、监听器、AudioContext、探针）。
 * React StrictMode 双挂载安全：重复 startGame 会先停掉上一会话。
 *
 * 视口跟随窗口比例：横屏高 540（宽约 960+），竖屏固定宽 640、拉高纵向视野，
 * 整个屏幕都是画面，不再信箱式缩放。
 */

import { Game, VIEW_W, VIEW_H } from "./game";

declare global {
  interface Window {
    /** 玩家坐标探针 —— scripts/verify-game.mjs 用它做方向断言，替换实现时保留。 */
    __gameProbe?: () => { x: number; y: number; z: number };
    /** 就绪信号 —— 自检脚本等到它再截图/断言。 */
    __GAME_READY__?: boolean;
    /** 自检脚本专用调试接口（瞬移/给钥匙/调神智/拉杆）。 */
    __gameDebug?: {
      teleport: (x: number, y: number, world?: "A" | "B") => void;
      giveKey: () => void;
      setSan: (v: number) => void;
      pullLevers: () => void;
    };
  }
}

let session: { dispose: () => void } | null = null;

/** 由窗口尺寸决定逻辑视口：横屏 540 高；竖屏 640 宽、纵向拉高。 */
function computeViewport(w: number, h: number): { vw: number; vh: number } {
  const r = w / Math.max(1, h);
  if (r >= 1.2) return { vw: Math.min(1280, Math.round(VIEW_H * r)), vh: VIEW_H };
  return { vw: 640, vh: Math.round(640 / r) };
}

export function startGame(canvas: HTMLCanvasElement): void {
  stopGame();

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const game = new Game(canvas);
  const resize = () => {
    const { vw, vh } = computeViewport(window.innerWidth, window.innerHeight);
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
    }
    game.layout(vw, vh);
  };
  resize();
  window.addEventListener("resize", resize);

  game.start();

  window.__gameProbe = () => game.probe();
  window.__gameDebug = {
    teleport: (x, y, world) => game.debugTeleport(x, y, world),
    giveKey: () => game.debugGiveKey(),
    setSan: (v) => game.debugSetSan(v),
    pullLevers: () => game.debugPullLevers(),
  };

  session = {
    dispose: () => {
      window.removeEventListener("resize", resize);
      game.dispose();
      delete window.__gameProbe;
      delete window.__gameDebug;
      window.__GAME_READY__ = false;
    },
  };
}

export function stopGame(): void {
  session?.dispose();
  session = null;
}

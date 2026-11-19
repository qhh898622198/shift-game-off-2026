/**
 * game.ts — 《SHIFT》v7 游戏本体：2D 平台跳跃 + 一键切换双世界。
 *
 * 结构：三班五区（班 → 区域），每区一道出口门，走完进入下一区。
 * 难度曲线：大堂（散步教学）→ 西翼（教切换/拉杆/门禁卡，无巡逻者）→ 停车场
 *          → 货运通道 → 天台。神智消耗、视锥范围、追击速度均为温和档。
 * 系统：双世界切换 / 神智值 / 冲刺 / 时间换挡（键盘） / 巡逻者视野锥 / 拉杆闸门 /
 *       移动平台与电梯 / 记忆碎片（拾取即入账） / 任务清单 / 情境提示牌 / 目标罗盘
 * 存档：换图自动存档（localStorage），标题可「继续夜班」；图内有存档点，死了从存档点复活。
 * 视口：跟随窗口比例——横屏 540 高，竖屏加宽纵向视野，整个屏幕都是画面。
 */

import { GameLoop } from "./engine";
import { Input } from "./input";
import { GameStateMachine } from "./state";
import { AudioSystem } from "./audio";
import { storage } from "./storage";
import { Pool, type Poolable } from "./types";
import {
  loadLevel, mapTitle, mapFlatIndex, totalMaps, totalShards, TILE, LEVEL_W, LEVEL_H, LEVEL_PX_W, LEVEL_PX_H,
  type WorldId, type LevelData,
} from "./level";

export const VIEW_W = 960;
export const VIEW_H = 540;

const IS_TOUCH = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);

// —— 手感参数（全部在这里调）——
const MOVE_SPEED = 230;
const ACCEL_GROUND = 2000;
const ACCEL_AIR = 1300;
const FRICTION = 2600;
const GRAVITY = 2100;
const JUMP_VEL = 700;
const MAX_FALL = 900;
const COYOTE = 0.1;
const JUMP_BUFFER = 0.12;
const SHIFT_COOLDOWN = 0.45;
const GLITCH_TIME = 0.3;

const DASH_SPEED = 520;
const DASH_TIME = 0.18;
const DASH_CD = 1.2;
const SLOWMO_SCALE = 0.45;
const SLOWMO_SAN_MULT = 1.7;

const PLAYER_W = 22;
const PLAYER_H = 44;
const GUARD_W = 26;
const GUARD_H = 56;
const CONE_LEN = 130;
const CHASE_TIME = 1.5;
const CHASE_MULT = 2.0;

const SAN_MAX = 100;
const SAN_DRAIN = 6;
const SAN_REGEN = 30;

const MOVER_H = 14;
const SAVE_KEY = "shift.save";

interface SaveData { l: number; m: number; grand: number; time: number }

const PAL = {
  A: {
    sky0: "#0a121c", sky1: "#16222f",
    tile: "#2c3a4a", tileTop: "#46586c", tileEdge: "#1c2733",
    accent: "#7ac8f0", lamp: "#ffe9b0",
  },
  B: {
    sky0: "#140a0f", sky1: "#241016",
    tile: "#47202b", tileTop: "#6b2d3a", tileEdge: "#2b1219",
    accent: "#ff5a4a", lamp: "#ff8a5a",
  },
};

class Particle implements Poolable {
  alive = false;
  x = 0; y = 0; vx = 0; vy = 0;
  life = 0; maxLife = 1; size = 3; color = "#fff";
  gravity = 0;
  reset(): void { this.life = this.maxLife; }
}

interface Hint { text: string; t: number }

interface Guard {
  x: number; y: number; dir: 1 | -1;
  minX: number; maxX: number; speed: number;
  alertT: number;
  alertedOnce: boolean;
}

interface MoverState { pos: number; dir: 1 | -1; prev: number }

type EndKind = "win" | "caught" | "fell" | "consumed";

interface TutSpot { id: string; world: WorldId; x0: number; x1: number; text: () => string }

export class Game {
  private ctx: CanvasRenderingContext2D;
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private vignette: HTMLCanvasElement;
  private levelIndex = 0;
  private mapIndex = 0;
  private level: LevelData = loadLevel(0, 0);
  private input: Input;
  private audio = new AudioSystem();
  private sm = new GameStateMachine();
  private loop: GameLoop;

  // 视口（跟随窗口比例，竖屏全屏）
  private vw = VIEW_W;
  private vh = VIEW_H;

  // 玩家
  private px = 0; private py = 0; private vx = 0; private vy = 0;
  private vyLand = 0;
  private onGround = false;
  private facing: 1 | -1 = 1;
  private coyote = 0; private jumpBuf = 0;
  private landT = 0;
  private world: WorldId = "A";
  private shiftCd = 0;
  private glitchT = 0;
  private glitchFrom: WorldId = "A";
  private denyFlash = 0;

  // 变速
  private dashT = 0;
  private dashCd = 0;
  private airDashed = false;
  private dashGhosts: Array<{ x: number; y: number; t: number }> = [];
  private slowmo = false;
  private slowmoHintShown = false;

  // 目标与机关
  private san = SAN_MAX;
  private hasKey = false;
  private keyTaken = false;
  private leversPulled: boolean[] = [];
  private shardsTaken: boolean[] = [];
  private shardsGrand = 0;
  private checkpointOn = false;
  private guards: Guard[] = [];
  private movers: MoverState[] = [];

  private time = 0;
  private endKind: EndKind = "win";
  private best = storage.get<number>("shift.bestTime", 0);
  private save: SaveData | null = storage.get<SaveData | null>(SAVE_KEY, null);

  private camX = 0;
  private particles = new Pool<Particle>(() => new Particle(), 240);
  private hints: Hint[] = [];
  private ambient: Particle[] = [];
  private shake = 0;
  private runTime = 0;
  private firstShiftB = false;
  private lowSanWarned = false;
  private briefT = 0;
  private tutSeen = new Set<string>();

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.off = document.createElement("canvas");
    this.off.width = VIEW_W; this.off.height = VIEW_H;
    const offCtx = this.off.getContext("2d");
    if (!offCtx) throw new Error("no offscreen 2d context");
    this.offCtx = offCtx;
    this.vignette = makeVignette(VIEW_W, VIEW_H);

    this.input = new Input(canvas);
    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: () => this.render(),
    });
    this.resetMapState(false);
    this.seedAmbient();
  }

  start(): void { this.loop.start(); }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
  }

  /** 视口跟随窗口（boot 在 resize 时调用）。 */
  layout(vw: number, vh: number): void {
    this.vw = vw;
    this.vh = vh;
    this.off.width = vw;
    this.off.height = vh;
    this.vignette = makeVignette(vw, vh);
    this.camX = this.clampCam(this.camX);
  }

  /** 世界在视口中的垂直偏移（竖屏时关卡垂直居中）。 */
  private get camY(): number {
    return (this.vh - LEVEL_PX_H) / 2;
  }

  probe(): { x: number; y: number; z: number; world: WorldId; state: string; san: number; moverX: number; timeScale: number; level: number; map: number; vw: number; vh: number } {
    return {
      x: this.px, y: this.py, z: 0, world: this.world, state: this.sm.state,
      san: this.san, moverX: this.movers[0]?.pos ?? 0, timeScale: this.slowmo ? SLOWMO_SCALE : 1,
      level: this.levelIndex, map: this.mapIndex, vw: this.vw, vh: this.vh,
    };
  }

  /** 自检脚本专用：瞬移（可选指定世界），用于逐状态截图与可达性验证。 */
  debugTeleport(x: number, y: number, world?: WorldId): void {
    this.px = x; this.py = y; this.vx = 0; this.vy = 0;
    if (world) this.world = world;
    this.camX = this.clampCam(x + PLAYER_W / 2 - this.vw / 2);
  }

  debugGiveKey(): void { this.hasKey = true; this.keyTaken = true; }
  debugSetSan(v: number): void { this.san = v; }

  // ---------------------------------------------------------------- 流程与存档

  private writeSave(): void {
    this.save = { l: this.levelIndex, m: this.mapIndex, grand: this.shardsGrand, time: this.time };
    storage.set(SAVE_KEY, this.save);
  }

  private clearSave(): void {
    this.save = null;
    storage.remove(SAVE_KEY);
  }

  private newGame(): void {
    this.clearSave();
    this.levelIndex = 0;
    this.mapIndex = 0;
    this.level = loadLevel(0, 0);
    this.time = 0;
    this.shardsGrand = 0;
    this.resetMapState(false);
    this.briefT = 2.8;
  }

  private continueGame(): void {
    if (!this.save) return this.newGame();
    this.levelIndex = this.save.l;
    this.mapIndex = this.save.m;
    this.level = loadLevel(this.levelIndex, this.mapIndex);
    this.time = this.save.time;
    this.shardsGrand = this.save.grand;
    this.resetMapState(false);
    this.briefT = 2.8;
  }

  /**
   * 重置当前地图的跑动状态。
   * soft=true（死亡复活）：保留门禁卡/拉杆/存档点，从存档点（或入口）复活；
   * soft=false（换图/手动重开/继续）：整张图重来。
   */
  private resetMapState(soft: boolean): void {
    const { spawn, checkpoint, guards, levers, movers } = this.level;
    const at = soft && this.checkpointOn && checkpoint ? checkpoint : spawn;
    this.px = at.x; this.py = at.y + TILE - PLAYER_H;
    this.vx = 0; this.vy = 0;
    this.world = "A";
    this.shiftCd = 0; this.glitchT = 0; this.denyFlash = 0;
    this.dashT = 0; this.dashCd = 0; this.airDashed = false;
    this.dashGhosts = [];
    this.slowmo = false;
    this.san = SAN_MAX;
    if (!soft) {
      this.hasKey = false; this.keyTaken = false;
      this.leversPulled = levers.map(() => false);
      this.shardsTaken = this.level.shards.map(() => false);
      this.checkpointOn = false;
    }
    this.guards = guards.map((g) => ({
      x: g.x, y: g.y + TILE - GUARD_H, dir: 1 as const,
      minX: g.minX, maxX: g.maxX, speed: g.speed,
      alertT: 0, alertedOnce: false,
    }));
    this.movers = movers.map((m) => ({ pos: m.a0, dir: 1 as const, prev: m.a0 }));
    this.hints = [];
    this.firstShiftB = false;
    this.lowSanWarned = false;
    this.tutSeen = new Set();
    this.camX = this.clampCam(this.px + PLAYER_W / 2 - this.vw / 2);
    this.particles.each((p) => (p.alive = false));
  }

  /** 进入下一区 / 下一班 / 通关。 */
  private completeMap(): void {
    this.audio.sfx("door");
    if (this.mapIndex + 1 < this.level.mapTotal) {
      this.mapIndex++;
    } else if (this.levelIndex + 1 < this.level.levelTotal) {
      this.levelIndex++;
      this.mapIndex = 0;
    } else {
      this.clearSave();
      this.toGameOver("win");
      return;
    }
    this.level = loadLevel(this.levelIndex, this.mapIndex);
    this.resetMapState(false);
    this.writeSave(); // 换图即存档
    this.briefT = 3.2;
    this.glitchFrom = "B";
    this.glitchT = GLITCH_TIME;
    this.audio.sfx("win");
    this.audio.setWorld("A");
  }

  private toGameOver(kind: EndKind): void {
    this.endKind = kind;
    if (kind === "win") {
      this.audio.sfx("win");
      if (!this.best || this.time < this.best) {
        this.best = this.time;
        storage.set("shift.bestTime", this.best);
      }
    } else {
      this.audio.sfx("lose");
      this.audio.sfx(kind === "caught" ? "caught" : "hit");
    }
    this.audio.stopMusic();
    this.sm.transition("gameover");
  }

  private hint(text: string, t = 2.2): void {
    const h = this.hints.find((x) => x.text === text);
    if (h) h.t = Math.max(h.t, t);
    else this.hints.push({ text, t });
  }

  private get leverCount(): number {
    return this.leversPulled.reduce((n, b) => n + (b ? 1 : 0), 0);
  }

  private get gateOpen(): boolean {
    return this.leversPulled.length === 0 || this.leversPulled.every(Boolean);
  }

  private get needsKey(): boolean {
    return this.level.hasKeycard;
  }

  private get doorReady(): boolean {
    return this.gateOpen && (!this.needsKey || this.hasKey);
  }

  /** 评价只看收集，不看用时——这不是竞速游戏。 */
  private rank(): string {
    const total = totalShards();
    if (this.shardsGrand >= total) return "S";
    if (this.shardsGrand >= Math.ceil(total * 0.6)) return "A";
    return "B";
  }

  private objectives(): Array<{ done: boolean; label: string }> {
    const list: Array<{ done: boolean; label: string }> = [];
    if (this.needsKey) list.push({ done: this.hasKey, label: "找到门禁卡（里世界）" });
    if (this.level.levers.length > 0) {
      list.push({
        done: this.gateOpen,
        label: this.level.levers.length > 1
          ? `拉开闸门（里世界 ${this.leverCount}/${this.level.levers.length} 个拉杆）`
          : "拉开闸门（里世界的拉杆）",
      });
    }
    list.push({ done: false, label: "到出口交班" });
    return list;
  }

  // ---------------------------------------------------------------- 更新

  private update(dt: number): void {
    if (this.input.consumeAction("KeyM")) this.audio.toggleMute();

    switch (this.sm.state) {
      case "title": {
        this.runTime += dt;
        const wantContinue = this.save
          && (this.input.consumeAction("Enter") || this.input.consumeAction("TouchTapHigh"));
        const wantNew = this.input.consumeAction("Space") || this.input.consumeAction("TouchTap")
          || (!this.save && this.input.consumeAction("Enter"));
        if (wantContinue) {
          this.continueGame();
          this.sm.transition("playing");
          this.audio.sfx("ui");
          this.audio.startMusic();
        } else if (wantNew) {
          this.newGame();
          this.sm.transition("playing");
          this.audio.sfx("ui");
          this.audio.startMusic();
        }
        return;
      }
      case "playing": break;
      case "paused": {
        if (this.input.consumeAction("Escape")) { this.sm.transition("playing"); this.audio.sfx("ui"); }
        if (this.input.consumeAction("KeyR")) { this.resetMapState(false); this.briefT = 2; this.sm.transition("playing"); this.audio.sfx("ui"); }
        return;
      }
      case "gameover": {
        this.runTime += dt;
        if (this.input.consumeAction("Space") || this.input.consumeAction("Enter") || this.input.consumeAction("KeyR") || this.input.consumeAction("TouchTap")) {
          if (this.endKind === "win") this.newGame();
          else { this.resetMapState(true); this.briefT = 0; }
          this.sm.transition("playing");
          this.audio.sfx("ui");
          this.audio.startMusic();
        }
        return;
      }
    }

    // playing:
    if (this.input.consumeAction("Escape")) { this.sm.transition("paused"); this.audio.sfx("ui"); return; }
    if (this.input.consumeAction("KeyR")) { this.resetMapState(false); this.briefT = 2; this.audio.sfx("ui"); return; }

    // —— 时间换挡（键盘限定；里世界按住生效）——
    const wantSlow = this.input.isHeld("KeyK");
    this.slowmo = wantSlow && this.world === "B";
    if (wantSlow && this.world === "A" && !this.slowmoHintShown) {
      this.slowmoHintShown = true;
      this.hint("现实不为所动——只有里世界的时间能被拨动", 2.4);
    }
    const dtg = this.slowmo ? dt * SLOWMO_SCALE : dt;
    this.runTime += dtg;

    this.time += dt;
    this.briefT = Math.max(0, this.briefT - dt);
    this.checkTutSpots();
    this.shiftCd = Math.max(0, this.shiftCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.glitchT = Math.max(0, this.glitchT - dt);
    this.denyFlash = Math.max(0, this.denyFlash - dt);
    this.shake = Math.max(0, this.shake - dt);
    this.landT = Math.max(0, this.landT - dt);
    for (const h of this.hints) h.t -= dt;
    this.hints = this.hints.filter((h) => h.t > 0);

    // —— 神智值（按真实时间计：慢动作是你的选择，代价照付）——
    if (this.world === "B") {
      this.san -= SAN_DRAIN * (this.slowmo ? SLOWMO_SAN_MULT : 1) * dt;
      if (this.san < 30 && !this.lowSanWarned) {
        this.lowSanWarned = true;
        this.hint("神智快见底了——回现实喘口气", 2.4);
      }
      if (this.san <= 0) {
        this.san = 0;
        this.shake = 0.5;
        this.toGameOver("consumed");
        return;
      }
    } else {
      this.san = Math.min(SAN_MAX, this.san + SAN_REGEN * dt);
      if (this.san > 40) this.lowSanWarned = false;
    }

    // —— 移动平台/电梯 ——
    for (let i = 0; i < this.movers.length; i++) {
      const spec = this.level.movers[i];
      const st = this.movers[i];
      st.prev = st.pos;
      st.pos += st.dir * spec.speed * dtg;
      if (st.pos < spec.a0) { st.pos = spec.a0; st.dir = 1; }
      if (st.pos > spec.a1) { st.pos = spec.a1; st.dir = -1; }
      if (spec.world !== this.world) continue;
      const delta = st.pos - st.prev;
      const r = this.moverRect(i);
      const standing = this.onGround
        && Math.abs(this.py + PLAYER_H - r.y) < 2.5
        && this.px + PLAYER_W > r.x && this.px < r.x + r.w;
      if (standing) {
        if (spec.axis === "x") this.px += delta;
        else this.py += delta;
      }
    }

    // —— 冲刺（J）——
    if (this.onGround) this.airDashed = false;
    if (this.dashT > 0) this.dashT -= dtg;
    if (this.input.consumeAction("KeyJ") && this.dashCd <= 0 && this.dashT <= 0 && !this.airDashed) {
      this.dashT = DASH_TIME;
      this.dashCd = DASH_CD;
      if (!this.onGround) this.airDashed = true;
      this.vy = 0;
      this.audio.sfx("dash");
      this.burst(this.px + PLAYER_W / 2, this.py + PLAYER_H / 2, 8, this.world === "A" ? "#7ac8f0" : "#ff6a4a", 90);
    }

    // —— 移动 ——
    if (this.dashT > 0) {
      this.vx = this.facing * DASH_SPEED;
      this.vy = 0;
      this.dashGhosts.push({ x: this.px, y: this.py, t: 0.25 });
      if (this.dashGhosts.length > 8) this.dashGhosts.shift();
    } else {
      const move = this.input.moveX;
      if (move !== 0) {
        this.facing = move > 0 ? 1 : -1;
        const accel = this.onGround ? ACCEL_GROUND : ACCEL_AIR;
        this.vx = approach(this.vx, move * MOVE_SPEED, accel * dtg);
      } else {
        this.vx = approach(this.vx, 0, (this.onGround ? FRICTION : FRICTION * 0.25) * dtg);
      }

      if (this.input.consumeAction("KeyW") || this.input.consumeAction("Space") || this.input.consumeAction("ArrowUp")) {
        this.jumpBuf = JUMP_BUFFER;
      }
      this.jumpBuf = Math.max(0, this.jumpBuf - dtg);
      this.coyote = this.onGround ? COYOTE : Math.max(0, this.coyote - dtg);
      if (this.jumpBuf > 0 && this.coyote > 0) {
        this.vy = -JUMP_VEL;
        this.jumpBuf = 0; this.coyote = 0; this.onGround = false;
        this.audio.sfx("jump");
        this.burst(this.px + PLAYER_W / 2, this.py + PLAYER_H, 6, this.world === "A" ? "#8fa8bf" : "#a05a68", 60);
      }
      this.vy = Math.min(this.vy + GRAVITY * dtg, MAX_FALL);
    }
    for (const gh of this.dashGhosts) gh.t -= dtg;
    this.dashGhosts = this.dashGhosts.filter((gh) => gh.t > 0);

    // —— 位移与碰撞 ——
    this.moveAxis(this.vx * dtg, 0);
    const wasAir = !this.onGround;
    this.onGround = false;
    const prevFeet = this.py + PLAYER_H;
    this.moveAxis(0, this.vy * dtg);
    if (!this.onGround && this.vy >= 0) {
      const feet = this.py + PLAYER_H;
      for (let i = 0; i < this.movers.length; i++) {
        if (this.level.movers[i].world !== this.world) continue;
        const r = this.moverRect(i);
        if (prevFeet <= r.y + 0.5 && feet >= r.y
          && this.px + PLAYER_W > r.x && this.px < r.x + r.w) {
          this.py = r.y - PLAYER_H - 0.01;
          this.vy = 0;
          this.onGround = true;
          break;
        }
      }
    }
    if (this.onGround && wasAir && this.vyLand > 300) {
      this.landT = 0.14;
      this.burst(this.px + PLAYER_W / 2, this.py + PLAYER_H, 5, this.world === "A" ? "#6b7f92" : "#7a3d4b", 40);
      this.audio.sfx("move");
    }

    // —— 切换世界 ——
    if (this.input.consumeAction("ShiftLeft") || this.input.consumeAction("ShiftRight")) {
      this.tryShift();
    }

    // —— 存档点 ——
    if (this.world === "A" && !this.checkpointOn && this.level.checkpoint) {
      const c = this.level.checkpoint;
      if (aabb(this.px, this.py, PLAYER_W, PLAYER_H, c.x - 10, c.y - 10, 42, 42 + TILE)) {
        this.checkpointOn = true;
        this.audio.sfx("key");
        this.burst(c.x + 11, c.y, 12, "#58e08a", 90);
        this.hint("存档点已激活——死了从这里复活", 2.4);
      }
    }

    // —— 巡逻者 ——
    for (const g of this.guards) {
      if (g.alertT > 0) {
        g.alertT -= dtg;
        const dir = this.px + PLAYER_W / 2 > g.x + GUARD_W / 2 ? 1 : -1;
        g.dir = dir as 1 | -1;
        g.x += g.dir * g.speed * CHASE_MULT * dtg;
        g.x = Math.max(g.minX, Math.min(g.maxX, g.x));
      } else {
        g.x += g.dir * g.speed * dtg;
        if (g.x < g.minX) { g.x = g.minX; g.dir = 1; }
        if (g.x > g.maxX) { g.x = g.maxX; g.dir = -1; }
      }
      if (this.world !== "B") continue;
      const coneX0 = g.dir > 0 ? g.x + GUARD_W / 2 : g.x + GUARD_W / 2 - CONE_LEN;
      if (g.alertT <= 0
        && aabb(this.px, this.py, PLAYER_W, PLAYER_H, coneX0, g.y - 6, CONE_LEN, GUARD_H + 12)) {
        g.alertT = CHASE_TIME;
        this.audio.sfx("alert");
        this.shake = 0.25;
        this.hint("它看到你了——跑！", 1.6);
        if (!g.alertedOnce) g.alertedOnce = true;
      }
      if (aabb(this.px, this.py, PLAYER_W, PLAYER_H, g.x, g.y, GUARD_W, GUARD_H)) {
        this.shake = 0.4;
        this.toGameOver("caught");
        return;
      }
    }

    // —— 拉杆 ——
    if (this.world === "B") {
      this.level.levers.forEach((l, i) => {
        if (this.leversPulled[i]) return;
        if (aabb(this.px, this.py, PLAYER_W, PLAYER_H, l.x - 12, l.y - 16, 24, 32)) {
          this.leversPulled[i] = true;
          this.audio.sfx("door");
          this.burst(l.x, l.y, 14, "#ffd27a", 100);
          const total = this.level.levers.length;
          this.hint(
            this.leverCount >= total
              ? "远处传来闸门升起的声音——回到现实"
              : `闸门机关 ${this.leverCount}/${total}——还有拉杆没拉`,
            2.8,
          );
        }
      });
    }

    // —— 门禁卡 ——
    if (this.world === "B" && this.needsKey && !this.keyTaken) {
      const k = this.level.keycard;
      if (aabb(this.px, this.py, PLAYER_W, PLAYER_H, k.x - 10, k.y - 12, 20, 24)) {
        this.keyTaken = true; this.hasKey = true;
        this.audio.sfx("key");
        this.burst(k.x, k.y, 16, "#7af0c8", 120);
        this.hint("拿到门禁卡了——回到现实，去出口", 2.8);
      }
    }

    // —— 记忆碎片（拾取即入账，死了不丢）——
    this.level.shards.forEach((s, i) => {
      if (this.shardsTaken[i] || this.world !== s.world) return;
      if (aabb(this.px, this.py, PLAYER_W, PLAYER_H, s.x - 10, s.y - 10, 20, 20)) {
        this.shardsTaken[i] = true;
        this.shardsGrand++;
        this.audio.sfx("pickup");
        this.burst(s.x, s.y, 14, "#c8a2ff", 110);
        this.hint(`记忆碎片 ${this.shardsGrand}/${totalShards()}`, 2);
      }
    });

    // —— 出口门 ——
    if (this.world === "A") {
      const d = this.level.door;
      const dx = d.tx * TILE, dy = d.ty0 * TILE;
      if (aabb(this.px, this.py, PLAYER_W, PLAYER_H, dx - 4, dy, TILE + 8, (d.ty1 - d.ty0 + 1) * TILE)) {
        if (!this.gateOpen) this.hint("闸门纹丝不动——开关不在这个世界", 1.4);
        else if (this.needsKey && !this.hasKey) this.hint("门锁着。需要一张门禁卡——它不在这个世界", 1.4);
        else {
          this.completeMap();
          return;
        }
      }
    }

    // —— 坠落 ——
    if (this.py > LEVEL_PX_H + 60) {
      this.toGameOver("fell");
      return;
    }

    // —— 相机 ——
    const targetCam = this.clampCam(this.px + PLAYER_W / 2 - this.vw / 2 + this.facing * 50);
    this.camX += (targetCam - this.camX) * Math.min(1, dtg * 6);

    // —— 粒子 ——
    this.particles.each((p) => {
      p.life -= dtg;
      if (p.life <= 0) { p.alive = false; return; }
      p.vy += p.gravity * dtg;
      p.x += p.vx * dtg; p.y += p.vy * dtg;
    });
    this.updateAmbient(dtg);
  }

  private checkTutSpots(): void {
    for (const s of this.tutSpots()) {
      if (this.tutSeen.has(s.id)) continue;
      if (this.world !== s.world) continue;
      if (this.px < s.x0 || this.px > s.x1) continue;
      this.tutSeen.add(s.id);
      this.hint(s.text(), 2.8);
    }
  }

  private tutSpots(): TutSpot[] {
    const key = `${this.levelIndex}-${this.mapIndex}`;
    if (key === "0-0") {
      return [
        { id: "m1walk", world: "A", x0: 60, x1: 280, text: () => "跟着右上任务走——出口在最右边" },
        { id: "m1step", world: "A", x0: 540, x1: 620, text: () => "小台阶——跳一下（W / 跳）" },
        { id: "m1shift", world: "A", x0: 900, x1: 1100, text: () => "想不想看看另一边？按 Shift 试试" },
        { id: "m1exit", world: "A", x0: 1800, x1: 1910, text: () => "出口就在前面——交班！" },
      ];
    }
    if (key === "0-1") {
      return [
        { id: "m2wall", world: "A", x0: 350, x1: 440, text: () => "墙挡路——Shift 切到里世界" },
        { id: "m2pit", world: "A", x0: 700, x1: 760, text: () => "坑——里世界那边是实地" },
        { id: "m2lever", world: "B", x0: 900, x1: 980, text: () => "拉杆！出口闸门的开关在这个世界" },
        { id: "m2card", world: "B", x0: 1030, x1: 1130, text: () => "门禁卡——拿了它，回现实" },
        { id: "m2gate", world: "A", x0: 1500, x1: 1595, text: () => this.gateOpen ? "闸门开了——过去" : "闸门纹丝不动——开关在里世界" },
        { id: "m2exit", world: "A", x0: 1800, x1: 1910, text: () => "出口就在前面——交班！" },
      ];
    }
    if (key === "1-0") {
      return [
        { id: "l2start", world: "A", x0: 60, x1: 280, text: () => "地下停车场：坑更多，抬头看路" },
        { id: "l2pit1", world: "A", x0: 240, x1: 310, text: () => "坑——里世界的地面也许不一样" },
        { id: "l2steps", world: "A", x0: 470, x1: 610, text: () => "顺着台阶上去，亮晶晶的在等你" },
        { id: "l2wall", world: "A", x0: 700, x1: 762, text: () => "墙——按 Shift 换条路" },
        { id: "l2guard", world: "B", x0: 560, x1: 660, text: () => "前面有“住户”在巡——别走进红色视锥" },
        { id: "l2lift", world: "B", x0: 1030, x1: 1118, text: () => "里世界有部电梯——站上去" },
        { id: "l2ledge", world: "B", x0: 1140, x1: 1260, text: () => "碎片、拉杆、门禁卡——都在这层" },
        { id: "l2lever2", world: "B", x0: 1500, x1: 1620, text: () => "第二个拉杆在地面" },
        { id: "l2gate", world: "A", x0: 1696, x1: 1840, text: () => this.gateOpen ? "闸门开了——过去" : "闸门纹丝不动——两个拉杆都在里世界" },
        { id: "l2exit", world: "A", x0: 1860, x1: 1910, text: () => "出口就在前面——交班！" },
      ];
    }
    if (key === "1-1") {
      return [
        { id: "m2start", world: "A", x0: 60, x1: 240, text: () => "货运通道：左边的台子上有东西在闪" },
        { id: "m2pit1", world: "A", x0: 200, x1: 250, text: () => "坑——换世界或者绕高台" },
        { id: "m2wall", world: "A", x0: 520, x1: 570, text: () => "高墙——Shift 切过去" },
        { id: "m2lift", world: "B", x0: 1330, x1: 1420, text: () => "电梯——上高台，拉杆和门禁卡都在上面" },
        { id: "m2lever2", world: "B", x0: 1300, x1: 1370, text: () => "地面还有个拉杆——快的在右边巡" },
        { id: "m2gate", world: "A", x0: 1560, x1: 1690, text: () => this.gateOpen ? "闸门开了——过去" : "闸门纹丝不动——两个拉杆都在里世界" },
        { id: "m2exit", world: "A", x0: 1800, x1: 1910, text: () => "出口就在前面——交班！" },
      ];
    }
    if (key === "2-0") {
      return [
        { id: "a1", world: "A", x0: 320, x1: 380, text: () => "坑——里世界是实地" },
        { id: "a2", world: "B", x0: 500, x1: 550, text: () => "前面塌了——切回现实" },
        { id: "a3", world: "B", x0: 620, x1: 720, text: () => "门禁卡在平台上——跳上去" },
        { id: "a4", world: "B", x0: 1250, x1: 1350, text: () => "拉杆！顺便躲开巡逻的" },
        { id: "gate", world: "A", x0: 1560, x1: 1660, text: () => this.gateOpen ? "闸门开了——过去" : "闸门纹丝不动——开关在里世界" },
      ];
    }
    if (key === "2-1") {
      return [
        { id: "s1", world: "A", x0: 460, x1: 540, text: () => "墙——Shift 换条路" },
        { id: "s2", world: "A", x0: 780, x1: 830, text: () => "大坑——里世界是实地" },
        { id: "s3", world: "B", x0: 1180, x1: 1240, text: () => "电梯——上高台拿门禁卡" },
        { id: "gate", world: "A", x0: 1630, x1: 1720, text: () => this.gateOpen ? "闸门开了——过去" : "闸门纹丝不动——开关在里世界" },
      ];
    }
    if (key === "3-0") {
      return [
        { id: "l3start", world: "A", x0: 60, x1: 280, text: () => "天台。风大，东西多" },
        { id: "l3steps", world: "A", x0: 520, x1: 700, text: () => "台阶上有碎片——上面风景好" },
        { id: "l3lift", world: "B", x0: 980, x1: 1040, text: () => "电梯上高台——拉杆和门禁卡都在" },
        { id: "l3lever2", world: "B", x0: 1400, x1: 1520, text: () => "第二个拉杆——两只住户都在这片巡" },
        { id: "l3gate", world: "A", x0: 1560, x1: 1690, text: () => this.gateOpen ? "闸门开了——过去" : "闸门纹丝不动——两个拉杆都在里世界" },
      ];
    }
    if (key === "3-1") {
      return [
        { id: "t1", world: "A", x0: 240, x1: 310, text: () => "长坑——等移动平台，或切里世界走实地" },
        { id: "t2", world: "B", x0: 700, x1: 780, text: () => "拉杆1 在地面——巡逻的就在旁边" },
        { id: "t3", world: "B", x0: 1420, x1: 1470, text: () => "电梯上高台——拉杆2 和门禁卡" },
        { id: "gate", world: "A", x0: 1700, x1: 1790, text: () => this.gateOpen ? "闸门开了——过去" : "闸门纹丝不动——两个拉杆都在里世界" },
      ];
    }
    return [
      { id: "f1", world: "A", x0: 60, x1: 280, text: () => "总机房——最后一区，交完班就天亮了" },
      { id: "f2", world: "B", x0: 1100, x1: 1180, text: () => "拉杆1 在地面——注意三只住户的视锥" },
      { id: "f3", world: "B", x0: 1550, x1: 1620, text: () => "第二部电梯——拉杆2 在高台上" },
      { id: "gate", world: "A", x0: 1660, x1: 1750, text: () => this.gateOpen ? "闸门开了——过去" : "闸门纹丝不动——两个拉杆都在里世界" },
    ];
  }

  private moverRect(i: number): { x: number; y: number; w: number; h: number } {
    const spec = this.level.movers[i];
    const st = this.movers[i];
    return spec.axis === "x"
      ? { x: st.pos, y: spec.fixed * TILE, w: spec.wTiles * TILE, h: MOVER_H }
      : { x: spec.fixed * TILE, y: st.pos, w: spec.wTiles * TILE, h: MOVER_H };
  }

  private tryShift(): void {
    if (this.shiftCd > 0) return;
    const target: WorldId = this.world === "A" ? "B" : "A";
    if (this.collides(this.px, this.py, PLAYER_W, PLAYER_H, target)) {
      this.denyFlash = 0.35;
      this.audio.sfx("denied");
      this.hint("对面是一堵墙——这里切不过去", 1.6);
      this.shiftCd = 0.25;
      return;
    }
    this.glitchFrom = this.world;
    this.world = target;
    this.glitchT = GLITCH_TIME;
    this.shiftCd = SHIFT_COOLDOWN;
    this.shake = 0.18;
    this.audio.sfx("shift");
    this.audio.setWorld(target);
    if (target === "B" && !this.firstShiftB) {
      this.firstShiftB = true;
      this.hint(IS_TOUCH ? "里世界会消耗神智——快进快出" : "里世界会消耗神智——快进快出，按住 K 可以拨慢时间", 3.2);
    }
    const cx = this.px + PLAYER_W / 2, cy = this.py + PLAYER_H / 2;
    this.burst(cx, cy, 20, target === "B" ? "#ff6a4a" : "#7ac8f0", 160);
  }

  private moveAxis(dx: number, dy: number): void {
    if (dx !== 0) {
      this.px += dx;
      const r = this.firstCollision(this.px, this.py, PLAYER_W, PLAYER_H, this.world);
      if (r) {
        if (dx > 0) this.px = r.tx * TILE - PLAYER_W - 0.01;
        else this.px = (r.tx + 1) * TILE + 0.01;
        this.vx = 0;
      }
    }
    if (dy !== 0) {
      if (dy > 0) this.vyLand = this.vy;
      this.py += dy;
      const r = this.firstCollision(this.px, this.py, PLAYER_W, PLAYER_H, this.world);
      if (r) {
        if (dy > 0) { this.py = r.ty * TILE - PLAYER_H - 0.01; this.onGround = true; }
        else this.py = (r.ty + 1) * TILE + 0.01;
        this.vy = 0;
      }
    }
  }

  private isSolid(world: WorldId, tx: number, ty: number): boolean {
    if (tx < 0 || tx >= LEVEL_W || ty < 0) return true;
    if (ty >= LEVEL_H) return false; // 底部开口：掉出世界 = 坠落
    if (world === "A" && !this.gateOpen) {
      const g = this.level.gate;
      if (g.tx >= 0 && tx === g.tx && ty >= g.ty0 && ty <= g.ty1) return true;
    }
    return this.level.solid[world][ty][tx];
  }

  private firstCollision(x: number, y: number, w: number, h: number, world: WorldId): { tx: number; ty: number } | null {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.isSolid(world, tx, ty)) return { tx, ty };
      }
    }
    return null;
  }

  private collides(x: number, y: number, w: number, h: number, world: WorldId): boolean {
    return this.firstCollision(x, y, w, h, world) !== null;
  }

  private clampCam(x: number): number {
    return Math.max(0, Math.min(Math.max(0, LEVEL_PX_W - this.vw), x));
  }

  private burst(x: number, y: number, n: number, color: string, speed: number): void {
    for (let i = 0; i < n; i++) {
      const p = this.particles.obtain();
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 40;
      p.maxLife = 0.4 + Math.random() * 0.35;
      p.life = p.maxLife;
      p.size = 2 + Math.random() * 3;
      p.color = color;
      p.gravity = 500;
    }
  }

  private seedAmbient(): void {
    this.ambient = [];
    for (let i = 0; i < 48; i++) {
      const p = new Particle();
      p.alive = true;
      p.x = Math.random() * LEVEL_PX_W;
      p.y = Math.random() * LEVEL_PX_H;
      p.vx = (Math.random() - 0.5) * 8;
      p.vy = -4 - Math.random() * 10;
      p.size = 1 + Math.random() * 2;
      p.maxLife = Infinity; p.life = Infinity;
      this.ambient.push(p);
    }
  }

  private updateAmbient(dt: number): void {
    for (const p of this.ambient) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y < -10) { p.y = LEVEL_PX_H + 10; p.x = Math.random() * LEVEL_PX_W; }
      if (p.x < -10) p.x = LEVEL_PX_W + 10;
      if (p.x > LEVEL_PX_W + 10) p.x = -10;
    }
  }

  // ---------------------------------------------------------------- 渲染

  private render(): void {
    const g = this.offCtx;
    const glitching = this.glitchT > 0;
    const shown: WorldId = glitching && this.glitchT > GLITCH_TIME / 2 ? this.glitchFrom : this.world;
    this.drawScene(g, shown);

    const ctx = this.ctx;
    const vw = this.vw, vh = this.vh;
    ctx.save();
    ctx.clearRect(0, 0, vw, vh);
    if (this.shake > 0) {
      const s = this.shake * 14;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    if (glitching) {
      const k = this.glitchT / GLITCH_TIME;
      const slices = 14;
      const h = vh / slices;
      for (let i = 0; i < slices; i++) {
        const off = (Math.random() - 0.5) * 90 * k;
        ctx.drawImage(this.off, 0, i * h, vw, h, off, i * h, vw, h);
      }
      ctx.globalAlpha = 0.35 * k;
      ctx.fillStyle = shown === "B" ? "#ff5a4a" : "#7ac8f0";
      for (let i = 0; i < 4; i++) ctx.fillRect(0, Math.random() * vh, vw, 2);
      ctx.globalAlpha = 1;
    } else {
      ctx.drawImage(this.off, 0, 0);
    }
    if (this.slowmo) {
      ctx.fillStyle = "rgba(122,180,240,0.10)";
      ctx.fillRect(0, 0, vw, vh);
      ctx.strokeStyle = "rgba(122,200,240,0.35)";
      ctx.lineWidth = 1;
      const yy = 40 + Math.sin(this.runTime * 3) * 6;
      ctx.beginPath();
      for (let x = 0; x <= vw; x += 16) {
        ctx.lineTo(x, yy + Math.sin(x * 0.05 + this.runTime * 5) * 3);
      }
      ctx.stroke();
    }
    ctx.drawImage(this.vignette, 0, 0);
    if (this.denyFlash > 0) {
      ctx.globalAlpha = this.denyFlash * 1.4;
      ctx.fillStyle = "rgba(255,60,60,0.25)";
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = 1;
    }
    const alerted = this.guards.some((gd) => gd.alertT > 0);
    const danger = this.sm.state === "playing"
      && ((this.world === "B" && this.san < 30) || alerted);
    if (danger) {
      const strength = alerted ? 0.9 : 1 - this.san / 30;
      ctx.globalAlpha = (0.25 + Math.sin(this.runTime * 6) * 0.15) * strength;
      ctx.strokeStyle = "#ff3a2a";
      ctx.lineWidth = 26;
      ctx.strokeRect(0, 0, vw, vh);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    this.drawHud(ctx);
    window.__GAME_READY__ = true;
  }

  private drawScene(g: CanvasRenderingContext2D, world: WorldId): void {
    const pal = PAL[world];
    const cam = Math.round(this.camX);
    const vw = this.vw, vh = this.vh;

    const grad = g.createLinearGradient(0, 0, 0, vh);
    grad.addColorStop(0, pal.sky0);
    grad.addColorStop(1, pal.sky1);
    g.fillStyle = grad;
    g.fillRect(0, 0, vw, vh);

    g.save();
    g.translate(-cam, this.camY);

    this.drawParallax(g, world, cam, vw);
    this.drawPillars(g, world, cam, vw);
    this.drawTiles(g, world, cam, vw);
    this.drawLamps(g, world, cam, vw);
    this.drawGate(g, world);
    this.drawMovers(g, world);
    this.drawDoor(g, world);
    this.drawLevers(g, world);
    this.drawCheckpoint(g, world);
    this.drawPickups(g, world);

    for (const p of this.ambient) {
      if (p.x < cam - 20 || p.x > cam + vw + 20) continue;
      g.fillStyle = world === "A" ? "rgba(160,190,220,0.35)" : "rgba(255,120,90,0.4)";
      g.fillRect(p.x, p.y, p.size, p.size);
    }

    for (const gd of this.guards) {
      if (world === "B") this.drawGuard(g, gd, 1);
      else this.drawGuard(g, gd, 0.14 + Math.sin(this.runTime * 3) * 0.05);
    }

    for (const gh of this.dashGhosts) {
      g.globalAlpha = (gh.t / 0.25) * 0.4;
      g.fillStyle = world === "A" ? "#7ac8f0" : "#ff8a6a";
      g.fillRect(gh.x, gh.y, PLAYER_W, PLAYER_H);
    }
    g.globalAlpha = 1;

    this.drawPlayer(g, world);
    this.drawPlayerLight(g, world);

    this.particles.each((p) => {
      g.globalAlpha = Math.max(0, p.life / p.maxLife);
      g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    });
    g.globalAlpha = 1;

    this.drawForeground(g, world, cam, vw);

    g.restore();
  }

  /** 中景立柱：0.7 视差。 */
  private drawPillars(g: CanvasRenderingContext2D, world: WorldId, cam: number, vw: number): void {
    g.save();
    g.translate(cam * 0.3, 0);
    for (let i = 0; i < LEVEL_W / 5; i++) {
      const x = i * 5 * TILE + 96 + ((i * 53) % 40);
      if (x < cam * 0.7 - 160 || x > cam * 0.7 + vw + 160) continue;
      if (world === "A") {
        g.fillStyle = "rgba(30,42,56,0.55)";
        g.fillRect(x, TILE, 18, LEVEL_PX_H - TILE);
        g.fillStyle = "rgba(70,88,108,0.35)";
        g.fillRect(x, TILE, 4, LEVEL_PX_H - TILE);
      } else {
        g.strokeStyle = "rgba(50,18,28,0.6)";
        g.lineWidth = 16;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(x + 8, TILE);
        g.quadraticCurveTo(x + Math.sin(i) * 14, LEVEL_PX_H * 0.5, x + 4, LEVEL_PX_H);
        g.stroke();
      }
    }
    g.restore();
  }

  /** 前景剪影：1.25 视差，从玩家面前掠过。 */
  private drawForeground(g: CanvasRenderingContext2D, world: WorldId, cam: number, vw: number): void {
    g.save();
    g.translate(-cam * 0.25, 0);
    if (world === "A") {
      for (let i = 0; i < LEVEL_W / 7; i++) {
        const x = i * 7 * TILE + 64 + ((i * 71) % 50);
        if (x < cam * 1.25 - 100 || x > cam * 1.25 + vw + 100) continue;
        const sag = 50 + ((i * 37) % 60);
        g.strokeStyle = "rgba(6,10,16,0.7)";
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x, -this.camY);
        g.quadraticCurveTo(x + 30, sag - this.camY, x + 60, -this.camY);
        g.stroke();
        if (i % 3 === 0) {
          g.fillStyle = "rgba(6,12,18,0.75)";
          g.fillRect(x + 22, sag - 14 - this.camY, 18, 22);
        }
      }
    } else {
      for (let i = 0; i < LEVEL_W / 6; i++) {
        const x = i * 6 * TILE + 40 + ((i * 47) % 60);
        if (x < cam * 1.25 - 100 || x > cam * 1.25 + vw + 100) continue;
        const len = 70 + ((i * 41) % 110);
        const sway = Math.sin(this.runTime * 0.9 + i * 1.7) * 10;
        g.fillStyle = "rgba(18,7,11,0.7)";
        g.beginPath();
        g.moveTo(x - 8, -this.camY);
        g.quadraticCurveTo(x + sway, len * 0.6 - this.camY, x + sway * 1.4, len - this.camY);
        g.quadraticCurveTo(x + sway * 1.4 + 6, len * 0.5 - this.camY, x + 8, -this.camY);
        g.closePath();
        g.fill();
      }
    }
    g.restore();
  }

  /** 玩家光环：暗场景里的主角辨识层。 */
  private drawPlayerLight(g: CanvasRenderingContext2D, world: WorldId): void {
    const cx = this.px + PLAYER_W / 2, cy = this.py + PLAYER_H / 2;
    const r = world === "A" ? 175 : 135;
    g.save();
    g.globalCompositeOperation = "screen";
    const grad = g.createRadialGradient(cx, cy, 8, cx, cy, r);
    grad.addColorStop(0, world === "A" ? "rgba(255,236,190,0.22)" : "rgba(255,150,110,0.18)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  private drawParallax(g: CanvasRenderingContext2D, world: WorldId, cam: number, vw: number): void {
    const floorY = LEVEL_PX_H; // 视差层锚定世界地面，而不是屏幕底
    if (world === "A") {
      g.fillStyle = "rgba(240,244,220,0.85)";
      g.beginPath();
      g.arc(790 + cam * 0.95, 84, 24, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(10,18,28,0.55)";
      g.beginPath();
      g.arc(782 + cam * 0.95, 78, 21, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(cam * 0.8, 0); // 净 0.2 视差
      for (let i = 0; i < 40; i++) {
        const bx = i * 90 + ((i * 37) % 40);
        const bh = 120 + ((i * 53) % 160);
        g.fillStyle = "rgba(16,26,38,0.85)";
        g.fillRect(bx, floorY - bh - 70, 60, bh + 70);
      }
      g.restore();
      g.save();
      g.translate(cam * 0.55, 0); // 净 0.45 视差
      for (let i = 0; i < 30; i++) {
        const bx = i * 130 + ((i * 71) % 60);
        const bh = 150 + ((i * 43) % 200);
        g.fillStyle = "rgba(22,34,47,0.95)";
        g.fillRect(bx, floorY - bh - 40, 80, bh + 40);
        for (let wy = 0; wy < 7; wy++) {
          for (let wx = 0; wx < 3; wx++) {
            if (((i * 7 + wy * 3 + wx) % 5) === 0) {
              g.fillStyle = "rgba(255,210,122,0.55)";
              g.fillRect(bx + 10 + wx * 22, floorY - bh - 20 + wy * 24, 10, 12);
            }
          }
        }
      }
      g.restore();
    } else {
      const pulse = 1 + Math.sin(this.runTime * 0.8) * 0.08;
      g.fillStyle = "rgba(255,90,74,0.4)";
      g.beginPath();
      g.arc(700 + cam * 0.95, 90, 26 * pulse, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#140810";
      g.beginPath();
      g.arc(700 + cam * 0.95, 90, 9, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(cam * 0.8, 0);
      for (let i = 0; i < 16; i++) {
        const bx = i * 220 + ((i * 61) % 70);
        const bh = 230 + ((i * 41) % 190);
        g.fillStyle = "rgba(34,12,20,0.9)";
        g.beginPath();
        g.moveTo(bx, floorY);
        g.quadraticCurveTo(bx + 60, floorY - bh - 50, bx + 120, floorY);
        g.fill();
      }
      g.restore();
      g.save();
      g.translate(cam * 0.55, 0);
      for (let i = 0; i < 10; i++) {
        const bx = i * 320 + ((i * 83) % 90);
        const sway = Math.sin(this.runTime * 0.6 + i) * 22;
        const bh = 170 + ((i * 29) % 130);
        g.strokeStyle = "rgba(48,16,26,0.95)";
        g.lineWidth = 26;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(bx, floorY + 20);
        g.quadraticCurveTo(bx + sway, floorY - bh * 0.6, bx + sway * 1.6, floorY - bh);
        g.stroke();
      }
      g.restore();
    }
  }

  private drawTiles(g: CanvasRenderingContext2D, world: WorldId, cam: number, vw: number): void {
    const pal = PAL[world];
    const tx0 = Math.max(0, Math.floor(cam / TILE) - 1);
    const tx1 = Math.min(LEVEL_W - 1, Math.ceil((cam + vw) / TILE) + 1);
    for (let ty = 0; ty < LEVEL_H; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!this.level.solid[world][ty][tx]) continue;
        const x = tx * TILE, y = ty * TILE;
        const open = !this.isSolid(world, tx, ty - 1);
        g.fillStyle = pal.tile;
        g.fillRect(x, y, TILE, TILE);
        if (open) {
          g.fillStyle = pal.tileTop;
          g.fillRect(x, y, TILE, 6);
        }
        g.fillStyle = pal.tileEdge;
        g.fillRect(x, y + TILE - 2, TILE, 2);
        g.fillRect(x + TILE - 2, y, 2, TILE);
        const h = (tx * 31 + ty * 17) % 11;
        if (world === "A") {
          if ((tx + ty) % 3 === 0) {
            g.fillStyle = "rgba(122,200,240,0.10)";
            g.fillRect(x + 6, y + 10, TILE - 12, 1);
          }
          if (h === 0 && open) {
            g.fillStyle = "#28495e";
            g.fillRect(x + 8, y + 12, 16, 20);
            g.fillStyle = "#58e08a";
            g.fillRect(x + 11, y + 15, 10, 6);
            g.fillStyle = "#c8d6e4";
            g.fillRect(x + 11, y + 24, 10, 2);
          }
        } else {
          if ((tx * 5 + ty * 3) % 4 === 0) {
            g.strokeStyle = "rgba(255,106,74,0.25)";
            g.beginPath();
            g.moveTo(x + 4, y + TILE - 6);
            g.quadraticCurveTo(x + TILE / 2, y + 8, x + TILE - 5, y + TILE - 10);
            g.stroke();
          }
          if (h === 0 && open) {
            g.fillStyle = "rgba(255,120,80,0.5)";
            g.fillRect(x + 13, y + 8, 3, 18);
          }
        }
      }
    }
  }

  private drawLamps(g: CanvasRenderingContext2D, world: WorldId, cam: number, vw: number): void {
    for (let x = 4 * TILE; x < LEVEL_PX_W; x += 8 * TILE) {
      if (x < cam - 120 || x > cam + vw + 120) continue;
      const flicker = world === "B" ? 0.6 + Math.sin(this.runTime * 7 + x) * 0.35 : 1;
      const grad = g.createRadialGradient(x, 40, 4, x, 40, 150);
      const c = world === "A" ? "255,233,176" : "255,138,90";
      grad.addColorStop(0, `rgba(${c},${0.22 * flicker})`);
      grad.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = grad;
      g.fillRect(x - 150, 0, 300, 220);
      g.fillStyle = world === "A" ? "#e8ddc0" : "#d08a68";
      g.fillRect(x - 6, 34, 12, 5);
    }
  }

  private drawGate(g: CanvasRenderingContext2D, world: WorldId): void {
    if (world !== "A" || this.level.gate.tx < 0) return;
    const gt = this.level.gate;
    const x = gt.tx * TILE, y0 = gt.ty0 * TILE, h = (gt.ty1 - gt.ty0 + 1) * TILE;
    if (this.gateOpen) {
      g.fillStyle = "#3d5369";
      g.fillRect(x + 4, y0 - 10, TILE - 8, 10);
    } else {
      g.fillStyle = "#233140";
      g.fillRect(x, y0, TILE, h);
      g.fillStyle = "#42566b";
      for (let i = 0; i < 4; i++) g.fillRect(x + 3, y0 + 8 + i * 26, TILE - 6, 6);
      g.fillStyle = Math.sin(this.runTime * 2.5) > 0 ? "#e05858" : "#7a2a2a";
      g.fillRect(x + 11, y0 + 6, 10, 4);
    }
  }

  private drawMovers(g: CanvasRenderingContext2D, world: WorldId): void {
    for (let i = 0; i < this.movers.length; i++) {
      const spec = this.level.movers[i];
      if (spec.world !== world) continue;
      const r = this.moverRect(i);
      if (spec.axis === "y") {
        g.strokeStyle = world === "B" ? "rgba(255,138,90,0.35)" : "rgba(122,200,240,0.3)";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(r.x + r.w / 2, TILE);
        g.lineTo(r.x + r.w / 2, r.y);
        g.stroke();
      } else {
        g.fillStyle = "rgba(122,200,240,0.18)";
        for (let x = spec.a0; x < spec.a1 + r.w; x += 16) g.fillRect(x, r.y + 20, 8, 2);
      }
      g.fillStyle = world === "A" ? "#3d5369" : "#4a2430";
      g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle = world === "A" ? "#5a748f" : "#6b2d3a";
      g.fillRect(r.x, r.y, r.w, 4);
      g.fillStyle = "#ffd27a";
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const d = this.movers[i].dir;
      g.beginPath();
      if (spec.axis === "x") {
        g.moveTo(cx + d * 14, cy);
        g.lineTo(cx - d * 6, cy - 4);
        g.lineTo(cx - d * 6, cy + 4);
      } else {
        g.moveTo(cx, cy + d * 5);
        g.lineTo(cx - 4, cy - d * 3);
        g.lineTo(cx + 4, cy - d * 3 - 4);
      }
      g.closePath();
      g.fill();
    }
  }

  private drawDoor(g: CanvasRenderingContext2D, world: WorldId): void {
    const d = this.level.door;
    const dx = d.tx * TILE, dy = d.ty0 * TILE;
    if (world === "A") {
      g.fillStyle = "#1a2632";
      g.fillRect(dx, dy, TILE, (d.ty1 - d.ty0 + 1) * TILE);
      g.fillStyle = "#3d5369";
      g.fillRect(dx + 4, dy + 4, TILE - 8, (d.ty1 - d.ty0 + 1) * TILE - 8);
      const ready = this.doorReady;
      g.fillStyle = ready ? "#58e08a" : "#e05858";
      g.fillRect(dx - 6, dy + 22, 4, 8);
      g.fillStyle = "rgba(255,255,255,0.65)";
      g.font = "10px monospace";
      g.fillText("EXIT", dx + 5, dy + 14);
    } else {
      g.fillStyle = "rgba(255,90,74,0.12)";
      g.fillRect(dx, dy, TILE, (d.ty1 - d.ty0 + 1) * TILE);
    }
  }

  private drawLevers(g: CanvasRenderingContext2D, world: WorldId): void {
    if (world !== "B") return;
    this.level.levers.forEach((l, i) => {
      const pulled = this.leversPulled[i];
      const glow = pulled ? 0.25 : 0.6 + Math.sin(this.runTime * 4) * 0.3;
      g.save();
      g.shadowColor = "#ffd27a";
      g.shadowBlur = 10 * glow;
      g.fillStyle = "#3a2a1a";
      g.fillRect(l.x - 8, l.y + 4, 16, 8);
      g.strokeStyle = "#ffd27a";
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(l.x, l.y + 4);
      g.lineTo(l.x + (pulled ? 10 : -10), l.y - 12);
      g.stroke();
      g.restore();
    });
  }

  /** 存档点：未激活灰蓝，激活后绿光柱。 */
  private drawCheckpoint(g: CanvasRenderingContext2D, world: WorldId): void {
    if (world !== "A" || !this.level.checkpoint) return;
    const c = this.level.checkpoint;
    const x = c.x + 11, y = c.y + TILE;
    const on = this.checkpointOn;
    g.save();
    if (on) {
      const pulse = 0.5 + Math.sin(this.runTime * 3) * 0.3;
      g.globalAlpha = 0.25 + pulse * 0.2;
      const grad = g.createLinearGradient(x, y - 90, x, y);
      grad.addColorStop(0, "rgba(88,224,138,0)");
      grad.addColorStop(1, "rgba(88,224,138,0.8)");
      g.fillStyle = grad;
      g.fillRect(x - 7, y - 90, 14, 90);
      g.globalAlpha = 1;
    }
    g.fillStyle = on ? "#58e08a" : "#5a6b7a";
    g.fillRect(x - 2, y - 34, 4, 34);
    g.beginPath();
    g.arc(x, y - 38, 6, 0, Math.PI * 2);
    g.fill();
    if (on) {
      g.shadowColor = "#58e08a";
      g.shadowBlur = 12;
      g.fill();
    }
    g.restore();
  }

  private drawPickups(g: CanvasRenderingContext2D, world: WorldId): void {
    if (world === "B" && this.needsKey && !this.keyTaken) {
      const k = this.level.keycard;
      const bob = Math.sin(this.runTime * 2.4) * 4;
      const pulse = 0.6 + Math.sin(this.runTime * 4) * 0.4;
      g.save();
      g.shadowColor = "#7af0c8";
      g.shadowBlur = 14 * pulse;
      iconCard(g, k.x, k.y + bob, 20, "#7af0c8");
      g.restore();
    }
    this.level.shards.forEach((s, i) => {
      if (this.shardsTaken[i] || world !== s.world) return;
      const bob = Math.sin(this.runTime * 2 + i * 2) * 3;
      const rot = Math.sin(this.runTime * 1.5 + i) * 0.35;
      g.save();
      g.translate(s.x, s.y + bob);
      g.rotate(rot);
      g.shadowColor = "#c8a2ff";
      g.shadowBlur = 12;
      iconSpark(g, 0, 0, 18, "#c8a2ff");
      iconSpark(g, 0, 0, 7, "#efe6ff");
      g.restore();
    });
  }

  private drawGuard(g: CanvasRenderingContext2D, gd: Guard, alpha: number): void {
    const sway = Math.sin(this.runTime * 1.7) * 3;
    const x = gd.x + GUARD_W / 2, y = gd.y;
    g.save();
    g.globalAlpha = alpha;
    if (alpha > 0.5) {
      const alert = gd.alertT > 0;
      g.fillStyle = alert ? "rgba(255,50,30,0.20)" : "rgba(255,90,74,0.08)";
      g.beginPath();
      g.moveTo(x, y + 18);
      g.lineTo(x + gd.dir * CONE_LEN, y - 8);
      g.lineTo(x + gd.dir * CONE_LEN, y + GUARD_H + 8);
      g.closePath();
      g.fill();
    }
    g.fillStyle = "#140a10";
    g.beginPath();
    g.moveTo(x - GUARD_W / 2, y + GUARD_H);
    g.quadraticCurveTo(x - GUARD_W / 2 - 4 + sway, y + GUARD_H * 0.4, x, y + 2);
    g.quadraticCurveTo(x + GUARD_W / 2 + 4 + sway, y + GUARD_H * 0.4, x + GUARD_W / 2, y + GUARD_H);
    g.fill();
    const blink = Math.sin(this.runTime * 0.9) > -0.92;
    if (blink) {
      const big = gd.alertT > 0;
      g.fillStyle = "#ff5a4a";
      g.shadowColor = "#ff5a4a";
      g.shadowBlur = big ? 14 : 8;
      const eh = big ? 6 : 3;
      g.fillRect(x - 8 + gd.dir * 3, y + 14, 5, eh);
      g.fillRect(x + 3 + gd.dir * 3, y + 14, 5, eh);
    }
    if (gd.alertT > 0) {
      g.fillStyle = "#ff3a2a";
      g.font = "bold 16px monospace";
      g.fillText("!", x - 3, y - 6);
    }
    g.restore();
  }

  private drawPlayer(g: CanvasRenderingContext2D, world: WorldId): void {
    const x = this.px, y = this.py;
    const cx = x + PLAYER_W / 2;
    const running = Math.abs(this.vx) > 10 && this.onGround;
    const walk = running ? Math.sin(this.runTime * 14) * 3 : 0;

    g.save();
    g.globalAlpha = world === "A" ? 0.16 : 0.07;
    const grad = g.createLinearGradient(cx, y + 16, cx + this.facing * 170, y + 16);
    grad.addColorStop(0, world === "A" ? "#ffe9b0" : "#ff9a7a");
    grad.addColorStop(1, "transparent");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(cx, y + 14);
    g.lineTo(cx + this.facing * 170, y - 12);
    g.lineTo(cx + this.facing * 170, y + 52);
    g.closePath();
    g.fill();
    g.restore();

    g.save();
    g.translate(cx, y + PLAYER_H);
    if (running) g.transform(1, 0, this.facing * 0.08, 1, 0, 0);
    if (!this.onGround) g.scale(0.92, 1.08);
    if (this.landT > 0) g.scale(1.1, 0.86);
    g.translate(-cx, -(y + PLAYER_H));

    g.fillStyle = "#1c2733";
    g.fillRect(x + 3, y + 30 + walk, 7, 14 - walk);
    g.fillRect(x + 12, y + 30 - walk, 7, 14 + walk);
    g.fillStyle = "#2e4257";
    g.fillRect(x + 2, y + 14, PLAYER_W - 4, 18);
    g.fillStyle = "#e8d44d";
    g.fillRect(x + 2, y + 21, PLAYER_W - 4, 3);
    g.fillStyle = "#26394c";
    g.fillRect(cx + this.facing * 6 - 2, y + 16 + (running ? -walk : 0), 5, 12);
    g.fillStyle = "#d9b596";
    g.fillRect(x + 5, y + 2, 12, 11);
    g.fillStyle = "#1c2733";
    g.fillRect(x + 4, y + 0, 14, 5);
    g.fillStyle = world === "A" ? "#fff3c4" : "#ff8a6a";
    g.fillRect(cx + this.facing * 8 - 2, y + 5, 4, 3);
    g.fillStyle = world === "A" ? "rgba(160,220,255,0.55)" : "rgba(255,160,120,0.5)";
    g.fillRect(cx + this.facing * 10 - 1, y + 2, 2, PLAYER_H - 2);
    g.restore();
  }

  // ---------------------------------------------------------------- HUD 与界面

  private drawHud(ctx: CanvasRenderingContext2D): void {
    switch (this.sm.state) {
      case "title": this.drawTitle(ctx); return;
      case "paused": this.drawPause(ctx); return;
      case "gameover": this.drawGameOver(ctx); return;
      case "playing": break;
    }

    const vw = this.vw, vh = this.vh;
    const cx = vw / 2;

    // 顶部中央：计时 + 目标罗盘 + 警报
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "16px monospace";
    ctx.fillText(fmtTime(this.time), cx, 26);
    {
      const nextLever = this.level.levers.find((_, i) => !this.leversPulled[i]);
      const t = this.needsKey && !this.hasKey
        ? { x: this.level.keycard.x, w: "B" as WorldId, label: "门禁卡" }
        : nextLever
          ? { x: nextLever.x, w: "B" as WorldId, label: "拉杆" }
          : { x: this.level.door.tx * TILE, w: "A" as WorldId, label: "出口" };
      const dx = t.x - this.px;
      if (Math.abs(dx) > 100) {
        ctx.fillStyle = "rgba(255,233,176,0.85)";
        ctx.font = "13px monospace";
        const txt = t.label;
        const tx = cx + (dx > 0 ? 60 : -60);
        ctx.fillText(txt, tx, 46);
        const tw = ctx.measureText(txt).width;
        const iconX = tx + (dx > 0 ? tw / 2 + 14 : -(tw / 2 + 14));
        if (t.w !== this.world) {
          // 目标在对面世界：用月亮/眼睛图标表示，不写文字
          if (t.w === "B") iconEye(ctx, iconX, 42, 13, "#ff6a4a");
          else iconMoon(ctx, iconX, 42, 12, "#7ac8f0");
          iconChevron(ctx, iconX + (dx > 0 ? 14 : -14), 42, 11, "rgba(255,233,176,0.9)", dx > 0 ? 1 : -1);
        } else {
          iconChevron(ctx, iconX, 42, 12, "rgba(255,233,176,0.9)", dx > 0 ? 1 : -1);
        }
      }
    }
    const alerted = this.guards.some((gd) => gd.alertT > 0);
    if (alerted && Math.sin(this.runTime * 10) > -0.3) {
      iconEye(ctx, cx - 62, 60, 20, "#ff3a2a", "#2a0505");
      ctx.fillStyle = "#ff3a2a";
      ctx.font = "bold 18px monospace";
      ctx.fillText("被盯上了！", cx + 8, 66);
    }
    if (this.slowmo) {
      iconClock(ctx, cx - 52, 78, 15, "#7ac8f0");
      ctx.fillStyle = "#7ac8f0";
      ctx.font = "13px monospace";
      ctx.fillText("时间 ×0.45", cx + 8, 84);
    }

    // 左上：区域名 + 进度点 + 世界图标（文字能省则省）
    ctx.textAlign = "left";
    ctx.font = "13px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(this.level.mapName, 14, 24);
    const flatIdx = mapFlatIndex(this.levelIndex, this.mapIndex);
    const totalMapsN = totalMaps();
    for (let i = 0; i < totalMapsN; i++) {
      ctx.beginPath();
      ctx.arc(18 + ctx.measureText(this.level.mapName).width + 12 + i * 12, 20, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = i < flatIdx ? "#58e08a" : i === flatIdx ? "#ffe9b0" : "rgba(255,255,255,0.25)";
      ctx.fill();
    }
    const isB = this.world === "B";
    if (isB) iconEye(ctx, 20, 40, 18, "#ff6a4a");
    else iconMoon(ctx, 20, 40, 16, "#7ac8f0");
    if (this.shiftCd > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(12, 50, 44 * (1 - this.shiftCd / SHIFT_COOLDOWN), 3);
    }
    iconBolt(ctx, 22, 68, 13, this.dashCd <= 0 ? "#ffd27a" : "rgba(255,210,122,0.3)");

    // 左下：神智条（心形图标 + 条，无文字）
    const low = this.san < 30;
    iconHeart(ctx, 22, vh - 31, 13, low && Math.sin(this.runTime * 8) > 0 ? "#ff3a2a" : isB ? "#ff6a4a" : "#7ac8f0");
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(34, vh - 36, 104, 10);
    ctx.fillStyle = low && Math.sin(this.runTime * 8) > 0 ? "#ff3a2a" : isB ? "#ff6a4a" : "#7ac8f0";
    ctx.fillRect(34, vh - 36, 104 * (this.san / SAN_MAX), 10);

    // 右上：任务目标清单（无标题，图标自解释）
    this.drawObjectives(ctx);

    // 底部情境提示
    ctx.textAlign = "center";
    let hy = vh - 30;
    for (const h of this.hints) {
      ctx.globalAlpha = Math.min(1, h.t);
      ctx.fillStyle = "#ffe9b0";
      ctx.font = "15px monospace";
      ctx.fillText(h.text, cx, hy);
      hy -= 22;
    }
    ctx.globalAlpha = 1;

    // 开局任务卡（渐入渐出；区域名 + 目标行，无多余文案）
    if (this.briefT > 0) {
      const a = Math.min(1, this.briefT / 0.6, (3.2 - this.briefT) / 0.3);
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      const briefs: string[] = [];
      if (this.needsKey) briefs.push("门禁卡 · 里世界");
      if (this.level.levers.length > 1) briefs.push(`拉杆 ×${this.level.levers.length} · 里世界`);
      else if (this.level.levers.length === 1) briefs.push("拉杆 · 里世界");
      briefs.push("出口 · 交班");
      const w = 320, h = 44 + briefs.length * 30 + 14;
      const x = (vw - w) / 2, y = Math.max(80, vh / 2 - 150);
      ctx.fillStyle = "rgba(5,8,12,0.82)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "rgba(122,200,240,0.5)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = "#9fb4c8";
      ctx.font = "14px monospace";
      ctx.fillText(mapTitle(this.levelIndex, this.mapIndex), cx, y + 28);
      ctx.font = "15px monospace";
      briefs.forEach((l, i) => {
        ctx.fillStyle = "#c8d6e4";
        ctx.fillText(l, cx + 14, y + 62 + i * 30);
        iconChevron(ctx, cx - ctx.measureText(l).width / 2 - 20, y + 58 + i * 30, 10, "rgba(122,200,240,0.7)", 1);
      });
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = "left";
  }

  private drawObjectives(ctx: CanvasRenderingContext2D): void {
    const objs = this.objectives();
    const w = 218, h = 14 + objs.length * 22 + 20;
    const x = this.vw - 14 - w, y = 12;
    ctx.fillStyle = "rgba(5,8,12,0.5)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(122,200,240,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    ctx.textAlign = "left";
    const current = objs.findIndex((o) => !o.done);
    ctx.font = "12px monospace";
    objs.forEach((o, i) => {
      const oy = y + 26 + i * 22;
      if (o.done) {
        iconCheck(ctx, x + 16, oy - 4, 13, "#58e08a");
        ctx.fillStyle = "#58e08a";
        ctx.fillText(o.label, x + 28, oy);
      } else if (i === current) {
        iconChevron(ctx, x + 16, oy - 4, 12, "#ffe9b0", 1);
        ctx.fillStyle = "#ffe9b0";
        ctx.fillText(o.label, x + 28, oy);
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.beginPath();
        ctx.arc(x + 16, oy - 4, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillText(o.label, x + 28, oy);
      }
    });
    iconSpark(ctx, x + 16, y + 26 + objs.length * 22 - 4, 13, this.shardsGrand > 0 ? "#c8a2ff" : "rgba(255,255,255,0.35)");
    ctx.fillStyle = this.shardsGrand > 0 ? "#c8a2ff" : "rgba(255,255,255,0.35)";
    ctx.fillText(`${this.shardsGrand}/${totalShards()}`, x + 28, y + 26 + objs.length * 22);
  }

  private panel(ctx: CanvasRenderingContext2D, alpha: number): void {
    ctx.fillStyle = `rgba(5,8,12,${alpha})`;
    ctx.fillRect(0, 0, this.vw, this.vh);
  }

  private drawTitle(ctx: CanvasRenderingContext2D): void {
    const vw = this.vw, vh = this.vh;
    const cx = vw / 2;
    this.panel(ctx, 0.72);
    ctx.textAlign = "center";
    const flick = Math.random() < 0.08;
    ctx.font = "bold 84px monospace";
    if (flick) {
      ctx.fillStyle = "#ff5a4a";
      ctx.fillText("SHIFT", cx + 4, 140);
      ctx.fillStyle = "#7ac8f0";
      ctx.fillText("SHIFT", cx - 4, 140);
    }
    ctx.fillStyle = "#eef4fa";
    ctx.fillText("SHIFT", cx, 140);

    // 操作图标行：移动 / 跳 / 冲 / 切换（无文字说明）
    const iy = 210;
    const gap = 64;
    const icons: Array<(x: number) => void> = [
      (x) => { iconChevron(ctx, x - 12, iy, 16, "#9fb4c8", -1); iconChevron(ctx, x + 12, iy, 16, "#9fb4c8", 1); },
      (x) => { // 跳：上箭头 + 地面线
        ctx.strokeStyle = "#9fb4c8"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath(); ctx.moveTo(x - 7, iy + 2); ctx.lineTo(x, iy - 8); ctx.lineTo(x + 7, iy + 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 9, iy + 10); ctx.lineTo(x + 9, iy + 10); ctx.stroke();
      },
      (x) => iconBolt(ctx, x, iy, 20, "#ffd27a"),
      (x) => iconEye(ctx, x, iy, 24, "#ff5a4a"),
    ];
    icons.forEach((fn, i) => fn(cx + (i - 1.5) * gap));

    // 入口：继续 / 新一夜（闪烁提示即主操作）
    const blinkOn = Math.sin(this.runTime * 4) > 0;
    if (this.save) {
      const saveLabel = mapTitle(this.save.l, this.save.m);
      ctx.fillStyle = blinkOn ? "#7af0c8" : "#3f7a5f";
      ctx.font = "18px monospace";
      ctx.fillText(
        IS_TOUCH ? `上屏 · 继续（${saveLabel}）` : `Enter · 继续（${saveLabel}）`,
        cx, 320,
      );
      ctx.fillStyle = blinkOn ? "#ffe9b0" : "#8a7f5a";
      ctx.fillText(IS_TOUCH ? "下屏 · 新一夜" : "空格 · 新一夜", cx, 354);
    } else {
      ctx.fillStyle = blinkOn ? "#ffe9b0" : "#8a7f5a";
      ctx.font = "18px monospace";
      ctx.fillText(IS_TOUCH ? "轻点屏幕 开始" : "按 空格 开始", cx, 340);
    }
    if (this.best > 0) {
      ctx.fillStyle = "rgba(122,240,200,0.55)";
      ctx.font = "13px monospace";
      ctx.fillText(fmtTime(this.best), cx, 396);
    }
    ctx.textAlign = "left";
  }

  private drawPause(ctx: CanvasRenderingContext2D): void {
    const cx = this.vw / 2;
    this.panel(ctx, 0.6);
    ctx.textAlign = "center";
    ctx.fillStyle = "#eef4fa";
    ctx.font = "bold 40px monospace";
    ctx.fillText("暂 停", cx, 250);
    ctx.font = "16px monospace";
    ctx.fillStyle = "#9fb4c8";
    ctx.fillText(IS_TOUCH ? "⏸ 继续 · 虚拟按键操作" : "Esc 继续 · R 重开本区 · M 静音", cx, 300);
    ctx.textAlign = "left";
  }

  private drawGameOver(ctx: CanvasRenderingContext2D): void {
    const cx = this.vw / 2;
    this.panel(ctx, 0.7);
    ctx.textAlign = "center";
    if (this.endKind === "win") {
      ctx.fillStyle = "#7af0c8";
      ctx.font = "bold 44px monospace";
      ctx.fillText("天亮了", cx, 180);
      const r = this.rank();
      const rc = r === "S" ? "#ffd27a" : r === "A" ? "#7af0c8" : "#7ac8f0";
      ctx.fillStyle = rc;
      ctx.font = "bold 56px monospace";
      ctx.fillText(r, cx, 265);
      ctx.font = "16px monospace";
      ctx.fillStyle = "#c8d6e4";
      ctx.fillText(`${this.level.levelTotal} 班全勤 · 碎片 ${this.shardsGrand}/${totalShards()} · 用时 ${fmtTime(this.time)}（不计评价）`, cx, 305);
    } else {
      const msg = {
        caught: ["你被看到了", "里世界的东西不喜欢被打扰。"],
        fell: ["你坠入了夹缝", "两个世界之间的缝，比看起来深。"],
        consumed: ["你被里世界留下了", "神智见底的时候，现实就再也回不去了。"],
      }[this.endKind];
      ctx.fillStyle = "#ff5a4a";
      ctx.font = "bold 44px monospace";
      ctx.fillText(msg[0], cx, 200);
      ctx.font = "16px monospace";
      ctx.fillStyle = "#c8d6e4";
      ctx.fillText(msg[1], cx, 250);
      ctx.fillStyle = "#9fb4c8";
      const revive = this.checkpointOn ? "从存档点复活，门禁卡和拉杆保留" : "从本区入口重来";
      ctx.fillText(`倒在 ${mapTitle(this.levelIndex, this.mapIndex)} · ${revive}`, cx, 282);
    }
    ctx.fillStyle = Math.sin(this.runTime * 4) > 0 ? "#ffe9b0" : "#8a7f5a";
    ctx.font = "17px monospace";
    ctx.fillText(
      this.endKind === "win"
        ? (IS_TOUCH ? "轻点屏幕 再上一夜" : "按 空格 再上一夜")
        : (IS_TOUCH ? "轻点屏幕 继续" : "按 空格 继续"),
      cx, 340,
    );
    ctx.textAlign = "left";
  }
}

// ---------------------------------------------------------------- 工具

function approach(v: number, target: number, delta: number): number {
  if (v < target) return Math.min(v + delta, target);
  if (v > target) return Math.max(v - delta, target);
  return v;
}

function aabb(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ds = Math.floor((t % 1) * 10);
  return `${m}:${String(s).padStart(2, "0")}.${ds}`;
}

function makeVignette(vw: number, vh: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = vw; c.height = vh;
  const g = c.getContext("2d");
  if (!g) return c;
  const grad = g.createRadialGradient(vw / 2, vh / 2, vh * 0.42, vw / 2, vh / 2, vh * 0.85);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.42)");
  g.fillStyle = grad;
  g.fillRect(0, 0, vw, vh);
  return c;
}

// ---------------------------------------------------------------- 可爱小图标（全部手绘矢量，无字体/emoji 依赖）

type Ctx = CanvasRenderingContext2D;

function iconCheck(g: Ctx, x: number, y: number, s: number, color: string): void {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = s * 0.24;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  g.moveTo(x - s * 0.42, y + s * 0.02);
  g.lineTo(x - s * 0.08, y + s * 0.34);
  g.lineTo(x + s * 0.45, y - s * 0.3);
  g.stroke();
  g.restore();
}

function iconChevron(g: Ctx, x: number, y: number, s: number, color: string, dir: 1 | -1): void {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = s * 0.3;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  g.moveTo(x - dir * s * 0.28, y - s * 0.4);
  g.lineTo(x + dir * s * 0.3, y);
  g.lineTo(x - dir * s * 0.28, y + s * 0.4);
  g.stroke();
  g.restore();
}

function iconCard(g: Ctx, x: number, y: number, s: number, color: string): void {
  g.save();
  g.fillStyle = color;
  roundRectPath(g, x - s / 2, y - s * 0.36, s, s * 0.72, s * 0.16);
  g.fill();
  g.fillStyle = "rgba(10,20,28,0.4)";
  g.fillRect(x - s * 0.3, y - s * 0.12, s * 0.6, s * 0.16);
  g.fillStyle = "rgba(255,255,255,0.5)";
  g.beginPath();
  g.arc(x + s * 0.24, y + s * 0.14, s * 0.08, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function iconSpark(g: Ctx, x: number, y: number, s: number, color: string): void {
  const r1 = s / 2, r2 = s / 7;
  g.save();
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y - r1);
  g.quadraticCurveTo(x + r2, y - r2, x + r1, y);
  g.quadraticCurveTo(x + r2, y + r2, x, y + r1);
  g.quadraticCurveTo(x - r2, y + r2, x - r1, y);
  g.quadraticCurveTo(x - r2, y - r2, x, y - r1);
  g.fill();
  g.restore();
}

function iconEye(g: Ctx, x: number, y: number, s: number, color: string, pupil = "#140a10"): void {
  g.save();
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x - s / 2, y);
  g.quadraticCurveTo(x, y - s * 0.58, x + s / 2, y);
  g.quadraticCurveTo(x, y + s * 0.58, x - s / 2, y);
  g.closePath();
  g.fill();
  g.fillStyle = pupil;
  g.beginPath();
  g.arc(x, y, s * 0.21, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.beginPath();
  g.arc(x + s * 0.07, y - s * 0.07, s * 0.06, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function iconMoon(g: Ctx, x: number, y: number, s: number, color: string): void {
  const r = s * 0.45;
  g.save();
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, Math.PI * 0.35, Math.PI * 1.65, false);
  g.arc(x + r * 0.5, y, r * 0.72, Math.PI * 0.72, Math.PI * 1.28, true);
  g.closePath();
  g.fill();
  g.restore();
}

function iconClock(g: Ctx, x: number, y: number, s: number, color: string): void {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = s * 0.14;
  g.beginPath();
  g.arc(x, y, s * 0.42, 0, Math.PI * 2);
  g.stroke();
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y - s * 0.26);
  g.moveTo(x, y);
  g.lineTo(x + s * 0.2, y + s * 0.1);
  g.stroke();
  g.restore();
}

function iconHeart(g: Ctx, x: number, y: number, s: number, color: string): void {
  g.save();
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y + s * 0.42);
  g.bezierCurveTo(x - s * 0.62, y + s * 0.02, x - s * 0.36, y - s * 0.44, x, y - s * 0.12);
  g.bezierCurveTo(x + s * 0.36, y - s * 0.44, x + s * 0.62, y + s * 0.02, x, y + s * 0.42);
  g.fill();
  g.restore();
}

function iconBolt(g: Ctx, x: number, y: number, s: number, color: string): void {
  g.save();
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x + s * 0.14, y - s * 0.5);
  g.lineTo(x - s * 0.3, y + s * 0.08);
  g.lineTo(x - s * 0.02, y + s * 0.08);
  g.lineTo(x - s * 0.14, y + s * 0.5);
  g.lineTo(x + s * 0.3, y - s * 0.08);
  g.lineTo(x + s * 0.02, y - s * 0.08);
  g.closePath();
  g.fill();
  g.restore();
}

function roundRectPath(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

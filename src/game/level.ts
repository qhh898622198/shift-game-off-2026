/**
 * level.ts — 《SHIFT》多关卡多地图：双世界瓦片地图（每张 64×17，每格 32px）。
 *
 * 结构：Level（班）→ 若干 Map（区域），每区一道出口门，走完进入下一区。
 * 难度曲线（马里奥式：先散步教学，逐区加码）：
 *   第一班 · 大堂（纯散步教学：无切换需求、无门禁卡、无巡逻者，门直接开）
 *          → 西翼（教切换 + 拉杆 + 门禁卡，无巡逻者）
 *   第二班 · 停车场（电梯 + 双拉杆 + 慢巡逻者）
 *          → 货运通道（长坑摆渡 + 高台电梯 + 快巡逻者）
 *   第三班 · 天台（两只巡逻者 + 全机关综合）
 *
 * 行由「跨度表」生成：格式 [x起点, x终点, 字符]，长度天然正确。
 *   '#' 实心  '.' 空  'D' 闸门（仅 A，拉杆全开才升起）  'P' 出生点（A）  'E' 出口门（A）
 *   'C' 存档点（A）  'K' 门禁卡（B）  'L' 拉杆（B）  'S' 记忆碎片  'G'/'H' 巡逻者（B，H 快）
 *
 * 设计约束：闸门不可绕过——B 世界在闸门右侧是实心肉壁，只能在闸门左侧切回 A。
 * 没有门禁卡（K）的地图，出口只需闸门；没有拉杆（L）的地图，闸门视为常开。
 */

export const TILE = 32;
export const LEVEL_W = 64;
export const LEVEL_H = 17;
export const LEVEL_PX_W = LEVEL_W * TILE;
export const LEVEL_PX_H = LEVEL_H * TILE;

export type WorldId = "A" | "B";

type Span = [x0: number, x1: number, ch: string];

function row(spans: Span[], fill = "."): string {
  const a = Array.from({ length: LEVEL_W }, () => fill);
  for (const [x0, x1, ch] of spans) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || x >= LEVEL_W) throw new Error(`span out of range: ${x0}-${x1}`);
      a[x] = ch;
    }
  }
  return a.join("");
}

export interface GuardSpec { x: number; y: number; minX: number; maxX: number; speed: number }

export interface MoverSpec {
  world: WorldId;
  axis: "x" | "y";
  fixed: number;
  wTiles: number;
  a0: number; a1: number;
  speed: number;
}

interface RawMap {
  name: string;
  A: string[];
  B: string[];
  movers: MoverSpec[];
}

interface RawLevel {
  title: string;
  maps: RawMap[];
}

const EXIT_X = 60;
const BORDERS: Span[] = [[0, 0, "#"], [EXIT_X, EXIT_X, "#"], [LEVEL_W - 1, LEVEL_W - 1, "#"]];
const BORDERS_DOOR: Span[] = [[0, 0, "#"], [EXIT_X, EXIT_X, "E"], [LEVEL_W - 1, LEVEL_W - 1, "#"]];

// ================================================================ 第一班 · 大堂（散步教学）

const L1_M1_A: string[] = [
  row([[0, LEVEL_W - 1, "#"]]),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(() => row(BORDERS)),
  row([[0, 0, "#"], [21, 21, "S"], [45, 45, "S"], [EXIT_X, EXIT_X, "E"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y10 碎片（台阶上/平路）
  row([[0, 0, "#"], [2, 2, "P"], [10, 10, "S"], [20, 21, "#"], [34, 34, "C"], [EXIT_X, EXIT_X, "E"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y11 台阶+存档点
  ...[12, 13, 14, 15, 16].map(() => row([], "#")), // 全平地，没有坑
];

const L1_M1_B: string[] = [
  row([[0, LEVEL_W - 1, "#"]]),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(() => row([[0, 0, "#"], [EXIT_X + 1, LEVEL_W - 1, "#"]])),
  row([[0, 0, "#"], [20, 21, "#"], [EXIT_X + 1, LEVEL_W - 1, "#"]]), // y11
  ...[12, 13, 14, 15, 16].map(() => row([], "#")),
];

// ================================================================ 第一班 · 西翼（教切换/拉杆/门禁卡，无巡逻者）

const L2_M1_A: string[] = [
  row([[0, LEVEL_W - 1, "#"]]),
  ...[1, 2, 3, 4, 5, 6, 7].map(() => row(BORDERS)),
  row([[0, 0, "#"], [50, 50, "D"], [EXIT_X, EXIT_X, "#"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y8 闸门
  row([[0, 0, "#"], [14, 15, "#"], [50, 50, "D"], [EXIT_X, EXIT_X, "#"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y9 墙
  row([[0, 0, "#"], [14, 15, "#"], [50, 50, "D"], [EXIT_X, EXIT_X, "E"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y10
  row([[0, 0, "#"], [2, 2, "P"], [10, 10, "S"], [14, 15, "#"], [40, 40, "C"], [50, 50, "D"], [EXIT_X, EXIT_X, "E"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y11
  ...[12, 13, 14, 15, 16].map(() => row([[24, 26, "."]], "#")), // A 小坑
];

const L2_M1_B: string[] = [
  row([[0, LEVEL_W - 1, "#"]]),
  ...[1, 2, 3, 4, 5, 6, 7].map(() => row([[0, 0, "#"], [51, LEVEL_W - 1, "#"]])), // B 肉壁从闸门右侧开始
  row([[0, 0, "#"], [51, LEVEL_W - 1, "#"]]),                                                   // y8
  row([[0, 0, "#"], [51, LEVEL_W - 1, "#"]]),
  row([[0, 0, "#"], [51, LEVEL_W - 1, "#"]]),
  row([[0, 0, "#"], [16, 16, "S"], [30, 30, "L"], [34, 34, "K"], [44, 44, "S"], [51, LEVEL_W - 1, "#"]]), // y11 碎片/拉杆/门禁卡
  ...[12, 13, 14, 15, 16].map(() => row([], "#")), // B 全实地（A 的坑在这里是路）
];

// ================================================================ 第二班 · 停车场（电梯 + 双拉杆 + 慢巡逻者）

const L3_M1_A: string[] = [
  row([[0, LEVEL_W - 1, "#"]]),
  ...[1, 2, 3, 4, 5, 6].map(() => row(BORDERS)),
  row([[0, 0, "#"], [20, 20, "S"], [55, 55, "S"], [EXIT_X, EXIT_X, "#"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y7 碎片1/3
  row([[0, 0, "#"], [19, 21, "#"], [44, 45, "#"], [54, 56, "#"], [58, 58, "D"], [EXIT_X, EXIT_X, "#"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y8
  row([[0, 0, "#"], [24, 25, "#"], [44, 45, "#"], [58, 58, "D"], [EXIT_X, EXIT_X, "#"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y9
  row([[0, 0, "#"], [16, 18, "#"], [24, 25, "#"], [44, 45, "#"], [58, 58, "D"], [EXIT_X, EXIT_X, "E"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y10
  row([[0, 0, "#"], [2, 2, "P"], [24, 25, "#"], [34, 34, "C"], [44, 45, "#"], [58, 58, "D"], [EXIT_X, EXIT_X, "E"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y11
  ...[12, 13, 14, 15, 16].map(() => row([[10, 13, "."], [30, 34, "."]], "#")),
];

const L3_M1_B: string[] = [
  row([[0, LEVEL_W - 1, "#"]]),
  ...[1, 2, 3, 4, 5].map(() => row([[0, 0, "#"], [59, LEVEL_W - 1, "#"]])),
  row([[0, 0, "#"], [36, 36, "S"], [37, 37, "L"], [38, 38, "K"], [59, LEVEL_W - 1, "#"]]), // y6 高台：碎片+拉杆+门禁卡
  row([[0, 0, "#"], [36, 38, "#"], [59, LEVEL_W - 1, "#"]]),                                // y7 高台（电梯上）
  row([[0, 0, "#"], [59, LEVEL_W - 1, "#"]]),
  row([[0, 0, "#"], [59, LEVEL_W - 1, "#"]]),
  row([[0, 0, "#"], [59, LEVEL_W - 1, "#"]]),
  row([[0, 0, "#"], [20, 20, "G"], [50, 50, "L"], [59, LEVEL_W - 1, "#"]]), // y11 慢巡逻者 + 拉杆2
  ...[12, 13, 14, 15, 16].map(() => row([[14, 15, "."], [28, 29, "."], [46, 47, "."]], "#")),
];

// ================================================================ 第二班 · 货运通道（长坑摆渡 + 高台电梯 + 快巡逻者）

const L3_M2_A: string[] = [
  row([[0, LEVEL_W - 1, "#"]]),
  ...[1, 2, 3, 4, 5, 6, 7].map(() => row(BORDERS)),
  row([[0, 0, "#"], [6, 6, "S"], [18, 19, "#"], [40, 41, "#"], [53, 53, "D"], [EXIT_X, EXIT_X, "#"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y8
  row([[0, 0, "#"], [5, 7, "#"], [18, 19, "#"], [40, 41, "#"], [53, 53, "D"], [EXIT_X, EXIT_X, "#"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y9 高台 x5-7
  row([[0, 0, "#"], [18, 19, "#"], [20, 22, "#"], [40, 41, "#"], [47, 47, "S"], [53, 53, "D"], [EXIT_X, EXIT_X, "E"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y10 碎片3
  row([[0, 0, "#"], [2, 2, "P"], [18, 19, "#"], [34, 34, "C"], [40, 41, "#"], [53, 53, "D"], [EXIT_X, EXIT_X, "E"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y11
  ...[12, 13, 14, 15, 16].map(() => row([[8, 11, "."], [26, 31, "."]], "#")),
];

const L3_M2_B: string[] = [
  row([[0, LEVEL_W - 1, "#"]]),
  ...[1, 2, 3, 4, 5].map(() => row([[0, 0, "#"], [54, LEVEL_W - 1, "#"]])),
  row([[0, 0, "#"], [21, 21, "S"], [46, 46, "L"], [47, 47, "K"], [54, LEVEL_W - 1, "#"]]), // y6 高台：碎片+拉杆1+门禁卡
  row([[0, 0, "#"], [20, 22, "#"], [45, 47, "#"], [54, LEVEL_W - 1, "#"]]),                // y7 平台 + 高台
  row([[0, 0, "#"], [54, LEVEL_W - 1, "#"]]),
  row([[0, 0, "#"], [16, 18, "#"], [54, LEVEL_W - 1, "#"]]),                               // y9 平台
  row([[0, 0, "#"], [54, LEVEL_W - 1, "#"]]),
  row([[0, 0, "#"], [24, 24, "G"], [42, 42, "L"], [46, 46, "H"], [54, LEVEL_W - 1, "#"]]), // y11 巡逻×2 + 拉杆2
  ...[12, 13, 14, 15, 16].map(() => row([[12, 13, "."], [32, 33, "."]], "#")),
];

// ================================================================ 第三班 · 天台（双巡逻者综合）

const L4_M1_A: string[] = [
  row([[0, LEVEL_W - 1, "#"]]),
  ...[1, 2, 3, 4, 5, 6].map(() => row(BORDERS)),
  row([[0, 0, "#"], [23, 23, "S"], [EXIT_X, EXIT_X, "#"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y7 碎片1
  row([[0, 0, "#"], [22, 24, "#"], [28, 29, "#"], [53, 53, "D"], [EXIT_X, EXIT_X, "#"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y8 台阶2/墙/闸门
  row([[0, 0, "#"], [28, 29, "#"], [53, 53, "D"], [57, 57, "S"], [EXIT_X, EXIT_X, "#"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y9 碎片3
  row([[0, 0, "#"], [18, 20, "#"], [28, 29, "#"], [53, 53, "D"], [56, 58, "#"], [EXIT_X, EXIT_X, "E"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y10 台阶1/高台
  row([[0, 0, "#"], [2, 2, "P"], [28, 29, "#"], [33, 33, "C"], [53, 53, "D"], [EXIT_X, EXIT_X, "E"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y11
  ...[12, 13, 14, 15, 16].map(() => row([[10, 14, "."], [36, 40, "."]], "#")),
];

const L4_M1_B: string[] = [
  row([[0, LEVEL_W - 1, "#"]]),
  ...[1, 2, 3, 4].map(() => row([[0, 0, "#"], [54, LEVEL_W - 1, "#"]])),
  row([[0, 0, "#"], [35, 35, "L"], [36, 36, "K"], [54, LEVEL_W - 1, "#"]]), // y5 拉杆1 + 门禁卡（电梯高台）
  row([[0, 0, "#"], [34, 37, "#"], [54, LEVEL_W - 1, "#"]]),                // y6 高台
  ...[7, 8, 9].map(() => row([[0, 0, "#"], [54, LEVEL_W - 1, "#"]])),
  row([[0, 0, "#"], [48, 48, "S"], [54, LEVEL_W - 1, "#"]]),                // y10 碎片2
  row([[0, 0, "#"], [25, 25, "G"], [46, 46, "H"], [47, 47, "L"], [54, LEVEL_W - 1, "#"]]), // y11 巡逻×2 + 拉杆2
  ...[12, 13, 14, 15, 16].map(() => row([[15, 16, "."], [41, 42, "."]], "#")),
];

// ================================================================ 第三班 · 档案室

// —— 档案架：双坑节奏切换（A 坑 B 实地、B 坑 A 实地），平台拿卡 ——
const M_ARCHIVE_A: string[] = [
  row([[0, LEVEL_W - 1, "#"]]),
  ...[1, 2, 3, 4, 5, 6, 7].map(() => row(BORDERS)),
  row([[0, 0, "#"], [52, 52, "D"], [EXIT_X, EXIT_X, "#"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y8
  row([[0, 0, "#"], [24, 25, "#"], [52, 52, "D"], [EXIT_X, EXIT_X, "#"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y9 墙
  row([[0, 0, "#"], [8, 8, "S"], [24, 25, "#"], [52, 52, "D"], [55, 55, "S"], [EXIT_X, EXIT_X, "E"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y10
  row([[0, 0, "#"], [2, 2, "P"], [24, 25, "#"], [28, 28, "C"], [52, 52, "D"], [EXIT_X, EXIT_X, "E"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y11
  ...[12, 13, 14, 15, 16].map(() => row([[12, 15, "."], [34, 37, "."]], "#")),
];

const M_ARCHIVE_B: string[] = [
  row([[0, LEVEL_W - 1, "#"]]),
  ...[1, 2, 3, 4, 5, 6, 7].map(() => row([[0, 0, "#"], [53, LEVEL_W - 1, "#"]])),
  row([[0, 0, "#"], [21, 21, "K"], [53, LEVEL_W - 1, "#"]]),                  // y8 门禁卡（平台上方）
  row([[0, 0, "#"], [20, 22, "#"], [53, LEVEL_W - 1, "#"]]),                  // y9 平台
  row([[0, 0, "#"], [36, 36, "S"], [53, LEVEL_W - 1, "#"]]),                  // y10 碎片
  row([[0, 0, "#"], [40, 40, "G"], [44, 44, "L"], [53, LEVEL_W - 1, "#"]]),   // y11 慢巡逻 + 拉杆
  ...[12, 13, 14, 15, 16].map(() => row([[16, 17, "."], [30, 31, "."]], "#")),
];

// —— 机房：电梯上高台拿卡，守卫巡回 ——
const M_SERVER_A: string[] = [
  row([[0, LEVEL_W - 1, "#"]]),
  ...[1, 2, 3, 4, 5, 6, 7].map(() => row(BORDERS)),
  row([[0, 0, "#"], [16, 17, "#"], [33, 33, "S"], [54, 54, "D"], [EXIT_X, EXIT_X, "#"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y8 墙+碎片
  row([[0, 0, "#"], [16, 17, "#"], [32, 34, "#"], [54, 54, "D"], [EXIT_X, EXIT_X, "#"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y9 平台
  row([[0, 0, "#"], [10, 10, "S"], [16, 17, "#"], [54, 54, "D"], [EXIT_X, EXIT_X, "E"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y10
  row([[0, 0, "#"], [2, 2, "P"], [16, 17, "#"], [42, 42, "C"], [54, 54, "D"], [EXIT_X, EXIT_X, "E"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y11
  ...[12, 13, 14, 15, 16].map(() => row([[26, 29, "."]], "#")),
];

const M_SERVER_B: string[] = [
  row([[0, LEVEL_W - 1, "#"]]),
  ...[1, 2, 3, 4, 5].map(() => row([[0, 0, "#"], [55, LEVEL_W - 1, "#"]])),
  row([[0, 0, "#"], [40, 40, "K"], [55, LEVEL_W - 1, "#"]]),                  // y6 门禁卡（电梯高台）
  row([[0, 0, "#"], [39, 41, "#"], [55, LEVEL_W - 1, "#"]]),                  // y7 高台
  row([[0, 0, "#"], [55, LEVEL_W - 1, "#"]]),
  row([[0, 0, "#"], [55, LEVEL_W - 1, "#"]]),
  row([[0, 0, "#"], [24, 24, "S"], [55, LEVEL_W - 1, "#"]]),                  // y10 碎片
  row([[0, 0, "#"], [30, 30, "G"], [33, 33, "L"], [55, LEVEL_W - 1, "#"]]),   // y11 守卫 + 拉杆
  ...[12, 13, 14, 15, 16].map(() => row([[18, 19, "."]], "#")),
];

// ================================================================ 第四班 · 天台区

// —— 水箱平台：双摆渡平台 + 双巡逻 ——
const M_TANK_A: string[] = [
  row([[0, LEVEL_W - 1, "#"]]),
  ...[1, 2, 3, 4, 5, 6, 7].map(() => row(BORDERS)),
  row([[0, 0, "#"], [30, 31, "#"], [56, 56, "D"], [EXIT_X, EXIT_X, "#"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y8
  row([[0, 0, "#"], [30, 31, "#"], [56, 56, "D"], [EXIT_X, EXIT_X, "#"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y9
  row([[0, 0, "#"], [12, 12, "S"], [30, 31, "#"], [56, 56, "D"], [57, 57, "S"], [EXIT_X, EXIT_X, "E"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y10
  row([[0, 0, "#"], [2, 2, "P"], [20, 20, "C"], [30, 31, "#"], [56, 56, "D"], [EXIT_X, EXIT_X, "E"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y11
  ...[12, 13, 14, 15, 16].map(() => row([[10, 14, "."], [40, 44, "."]], "#")),
];

const M_TANK_B: string[] = [
  row([[0, LEVEL_W - 1, "#"]]),
  ...[1, 2, 3, 4].map(() => row([[0, 0, "#"], [57, LEVEL_W - 1, "#"]])),
  row([[0, 0, "#"], [48, 48, "L"], [49, 49, "K"], [57, LEVEL_W - 1, "#"]]), // y5 拉杆2+门禁卡（电梯高台）
  row([[0, 0, "#"], [47, 49, "#"], [57, LEVEL_W - 1, "#"]]),                // y6 高台
  ...[7, 8, 9].map(() => row([[0, 0, "#"], [57, LEVEL_W - 1, "#"]])),
  row([[0, 0, "#"], [25, 25, "S"], [57, LEVEL_W - 1, "#"]]),                // y10 碎片
  row([[0, 0, "#"], [22, 22, "G"], [24, 24, "L"], [38, 38, "H"], [57, LEVEL_W - 1, "#"]]), // y11 双巡逻 + 拉杆1
  ...[12, 13, 14, 15, 16].map(() => row([[18, 19, "."], [34, 35, "."]], "#")),
];

// ================================================================ 第五班 · 总机房（终局）

const M_MAINFRAME_A: string[] = [
  row([[0, LEVEL_W - 1, "#"]]),
  ...[1, 2, 3, 4, 5, 6, 7].map(() => row(BORDERS)),
  row([[0, 0, "#"], [38, 39, "#"], [55, 55, "D"], [EXIT_X, EXIT_X, "#"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y8
  row([[0, 0, "#"], [14, 15, "#"], [38, 39, "#"], [55, 55, "D"], [EXIT_X, EXIT_X, "#"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y9
  row([[0, 0, "#"], [8, 8, "S"], [14, 15, "#"], [38, 39, "#"], [55, 55, "D"], [57, 57, "S"], [EXIT_X, EXIT_X, "E"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y10
  row([[0, 0, "#"], [2, 2, "P"], [14, 15, "#"], [34, 34, "C"], [38, 39, "#"], [55, 55, "D"], [EXIT_X, EXIT_X, "E"], [LEVEL_W - 1, LEVEL_W - 1, "#"]]), // y11
  ...[12, 13, 14, 15, 16].map(() => row([[22, 26, "."], [44, 48, "."]], "#")),
];

const M_MAINFRAME_B: string[] = [
  row([[0, LEVEL_W - 1, "#"]]),
  ...[1, 2, 3, 4].map(() => row([[0, 0, "#"], [56, LEVEL_W - 1, "#"]])),
  row([[0, 0, "#"], [32, 32, "S"], [33, 33, "K"], [52, 52, "L"], [56, LEVEL_W - 1, "#"]]), // y5 高台1：碎片+门禁卡；高台2：拉杆2
  row([[0, 0, "#"], [31, 33, "#"], [51, 53, "#"], [56, LEVEL_W - 1, "#"]]),                // y6 双高台
  ...[7, 8, 9, 10].map(() => row([[0, 0, "#"], [56, LEVEL_W - 1, "#"]])),
  row([[0, 0, "#"], [22, 22, "G"], [36, 36, "L"], [42, 42, "G"], [48, 48, "H"], [56, LEVEL_W - 1, "#"]]), // y11 三巡逻 + 拉杆1
  ...[12, 13, 14, 15, 16].map(() => row([[18, 19, "."], [27, 28, "."]], "#")),
];

const RAW_LEVELS: RawLevel[] = [
  {
    title: "第一班 · 办公楼",
    maps: [
      { name: "大堂", A: L1_M1_A, B: L1_M1_B, movers: [] },
      { name: "西翼", A: L2_M1_A, B: L2_M1_B, movers: [] },
    ],
  },
  {
    title: "第二班 · 地下设施",
    maps: [
      {
        name: "停车场", A: L3_M1_A, B: L3_M1_B,
        movers: [
          { world: "A", axis: "x", fixed: 11, wTiles: 3, a0: 30 * TILE, a1: 32 * TILE, speed: 60 },
          { world: "B", axis: "y", fixed: 35, wTiles: 2, a0: 7 * TILE, a1: 11 * TILE + 18, speed: 50 },
        ],
      },
      {
        name: "货运通道", A: L3_M2_A, B: L3_M2_B,
        movers: [
          { world: "A", axis: "x", fixed: 11, wTiles: 3, a0: 26 * TILE, a1: 29 * TILE, speed: 60 },
          { world: "B", axis: "y", fixed: 44, wTiles: 2, a0: 7 * TILE, a1: 11 * TILE + 18, speed: 50 },
        ],
      },
    ],
  },
  {
    title: "第三班 · 档案室",
    maps: [
      { name: "档案架", A: M_ARCHIVE_A, B: M_ARCHIVE_B, movers: [] },
      {
        name: "机房", A: M_SERVER_A, B: M_SERVER_B,
        movers: [{ world: "B", axis: "y", fixed: 38, wTiles: 2, a0: 7 * TILE, a1: 11 * TILE + 18, speed: 50 }],
      },
    ],
  },
  {
    title: "第四班 · 天台区",
    maps: [
      {
        name: "天台", A: L4_M1_A, B: L4_M1_B,
        movers: [
          { world: "A", axis: "x", fixed: 11, wTiles: 3, a0: 10 * TILE, a1: 12 * TILE, speed: 60 },
          { world: "B", axis: "y", fixed: 32, wTiles: 2, a0: 6 * TILE, a1: 11 * TILE + 18, speed: 50 },
        ],
      },
      {
        name: "水箱平台", A: M_TANK_A, B: M_TANK_B,
        movers: [
          { world: "A", axis: "x", fixed: 11, wTiles: 3, a0: 10 * TILE, a1: 12 * TILE, speed: 60 },
          { world: "A", axis: "x", fixed: 11, wTiles: 3, a0: 40 * TILE, a1: 42 * TILE, speed: 75 },
          { world: "B", axis: "y", fixed: 46, wTiles: 2, a0: 6 * TILE, a1: 11 * TILE + 18, speed: 50 },
        ],
      },
    ],
  },
  {
    title: "第五班 · 总机房",
    maps: [
      {
        name: "总机房", A: M_MAINFRAME_A, B: M_MAINFRAME_B,
        movers: [
          { world: "A", axis: "x", fixed: 11, wTiles: 3, a0: 22 * TILE, a1: 24 * TILE, speed: 60 },
          { world: "B", axis: "y", fixed: 30, wTiles: 2, a0: 6 * TILE, a1: 11 * TILE + 18, speed: 50 },
          { world: "B", axis: "y", fixed: 50, wTiles: 2, a0: 6 * TILE, a1: 11 * TILE + 18, speed: 50 },
        ],
      },
    ],
  },
];

export interface LevelData {
  title: string;
  mapName: string;
  levelIndex: number;
  levelTotal: number;
  mapIndex: number;
  mapTotal: number;
  solid: Record<WorldId, boolean[][]>;
  spawn: { x: number; y: number };
  door: { tx: number; ty0: number; ty1: number };
  gate: { tx: number; ty0: number; ty1: number };
  keycard: { x: number; y: number };
  hasKeycard: boolean;
  levers: Array<{ x: number; y: number }>;
  shards: Array<{ x: number; y: number; world: WorldId }>;
  guards: GuardSpec[];
  movers: MoverSpec[];
  checkpoint: { x: number; y: number } | null;
}

function toSolid(rows: string[]): boolean[][] {
  return rows.map((r) => {
    if (r.length !== LEVEL_W) throw new Error(`level row width ${r.length} != ${LEVEL_W}: "${r}"`);
    return Array.from(r, (ch) => ch === "#");
  });
}

export function mapTitle(levelIndex: number, mapIndex: number): string {
  const l = RAW_LEVELS[levelIndex];
  return `${l.title} · ${l.maps[mapIndex].name}`;
}

/** 地图总数（进度点用）。 */
export function totalMaps(): number {
  return RAW_LEVELS.reduce((n, l) => n + l.maps.length, 0);
}

/** (班, 区) → 全局第几张图（进度点用）。 */
export function mapFlatIndex(levelIndex: number, mapIndex: number): number {
  let n = 0;
  for (let i = 0; i < levelIndex; i++) n += RAW_LEVELS[i].maps.length;
  return n + mapIndex;
}

/** 全局图序号 → (班, 区)（选关制用）。 */
export function flatToLevelMap(flat: number): { level: number; map: number } {
  let n = flat;
  for (let l = 0; l < RAW_LEVELS.length; l++) {
    if (n < RAW_LEVELS[l].maps.length) return { level: l, map: n };
    n -= RAW_LEVELS[l].maps.length;
  }
  throw new Error(`flat index out of range: ${flat}`);
}

/** 全部地图的记忆碎片总数（评价分母）。 */
export function totalShards(): number {
  let n = 0;
  for (const l of RAW_LEVELS) {
    for (const m of l.maps) {
      for (const rowStr of [...m.A, ...m.B]) {
        for (const ch of rowStr) if (ch === "S") n++;
      }
    }
  }
  return n;
}

export function loadLevel(levelIndex: number, mapIndex: number): LevelData {
  const lvl = RAW_LEVELS[levelIndex];
  if (!lvl) throw new Error(`no level ${levelIndex}`);
  const raw = lvl.maps[mapIndex];
  if (!raw) throw new Error(`no map ${levelIndex}/${mapIndex}`);
  if (raw.A.length !== LEVEL_H || raw.B.length !== LEVEL_H) throw new Error("level height mismatch");
  const solid: Record<WorldId, boolean[][]> = { A: toSolid(raw.A), B: toSolid(raw.B) };

  let spawn = { x: 2 * TILE, y: 11 * TILE };
  let door = { tx: EXIT_X, ty0: 10, ty1: 11 };
  let gate = { tx: -1, ty0: 8, ty1: 11 };
  let keycard = { x: 0, y: 0 };
  let hasKeycard = false;
  let checkpoint: LevelData["checkpoint"] = null;
  const levers: LevelData["levers"] = [];
  const shards: LevelData["shards"] = [];
  const guards: GuardSpec[] = [];

  for (let ty = 0; ty < LEVEL_H; ty++) {
    for (let tx = 0; tx < LEVEL_W; tx++) {
      const a = raw.A[ty][tx];
      const b = raw.B[ty][tx];
      if (a === "P") spawn = { x: tx * TILE + 5, y: ty * TILE };
      if (a === "E") door = { tx, ty0: Math.min(door.ty0, ty), ty1: ty };
      if (a === "D") gate = { tx, ty0: Math.min(gate.ty0, ty), ty1: Math.max(gate.ty1, ty) };
      if (a === "C") checkpoint = { x: tx * TILE + 5, y: ty * TILE };
      if (a === "S") shards.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, world: "A" });
      if (b === "K") { keycard = { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 }; hasKeycard = true; }
      if (b === "L") levers.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
      if (b === "S") shards.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, world: "B" });
      if (b === "G") guards.push({ x: tx * TILE, y: ty * TILE, minX: (tx - 1) * TILE, maxX: (tx + 7) * TILE, speed: 60 });
      if (b === "H") guards.push({ x: tx * TILE, y: ty * TILE, minX: (tx - 3) * TILE, maxX: (tx + 7) * TILE, speed: 90 });
    }
  }
  return {
    title: lvl.title, mapName: raw.name,
    levelIndex, levelTotal: RAW_LEVELS.length, mapIndex, mapTotal: lvl.maps.length,
    solid, spawn, door, gate, keycard, hasKeycard, levers, shards, guards,
    movers: raw.movers, checkpoint,
  };
}

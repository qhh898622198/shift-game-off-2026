/**
 * i18n.ts — 中英文案与语言切换（localStorage 持久化）。
 * t(s) 直接翻译整句；tf(s, ...args) 支持 {0},{1} 占位插值。
 */

import { storage } from "./storage";

export type Lang = "zh" | "en";
let current: Lang = storage.get<Lang>("shift.lang", "zh");

export function getLang(): Lang { return current; }
export function setLang(l: Lang): void {
  current = l;
  storage.set("shift.lang", l);
}
export function toggleLang(): Lang {
  setLang(current === "zh" ? "en" : "zh");
  return current;
}

export function t(s: string): string {
  if (current === "zh") return s;
  return EN[s] ?? s;
}

export function tf(s: string, ...args: Array<string | number>): string {
  const tpl = current === "en" ? (EN[s] ?? s) : s;
  return tpl.replace(/\{(\d)\}/g, (_, i) => String(args[Number(i)]));
}

/** 地图名（双语）。 */
const MAP_NAMES: Record<string, string> = {
  "大堂": "Lobby",
  "西翼": "West Wing",
  "停车场": "Parking Garage",
  "货运通道": "Freight Corridor",
  "档案架": "Archive Stacks",
  "机房": "Server Room",
  "天台": "Rooftop",
  "水箱平台": "Water Tank Platform",
  "总机房": "Mainframe",
};
export function mapName(zhName: string): string {
  return current === "en" ? (MAP_NAMES[zhName] ?? zhName) : zhName;
}

const EN: Record<string, string> = {
  // 标题/入口
  "轻点屏幕 开始": "Tap to start",
  "按 空格 开始": "Press SPACE to start",
  "下屏 · 新一夜": "Bottom: new night",
  "空格 · 新一夜": "SPACE: new night",
  "上屏 · 继续（{0}）": "Top: continue ({0})",
  "Enter · 继续（{0}）": "ENTER: continue ({0})",

  // 选关
  "选择关卡": "SELECT LEVEL",
  "已完成 {0}/{1} · 碎片 {2}/{3}": "Cleared {0}/{1} · Shards {2}/{3}",
  "方向键选择 · 空格进入 · Esc 返回": "Arrows: move · SPACE: play · Esc: back",
  "点选进入": "Tap a card to play",

  // 任务/罗盘
  "找到门禁卡（里世界）": "Find the keycard (Otherworld)",
  "拉开闸门（里世界的拉杆）": "Open the gate (Otherworld lever)",
  "拉开闸门（里世界 {0}/{1} 个拉杆）": "Open the gate ({0}/{1} levers, Otherworld)",
  "到出口交班": "Reach the exit, end your shift",
  "门禁卡": "Keycard",
  "拉杆": "Lever",
  "出口": "Exit",

  // HUD
  "被盯上了！": "SPOTTED!",
  "时间 ×0.45": "Time ×0.45",
  "神智": "Sanity",

  // 开局任务卡
  "门禁卡 · 里世界": "Keycard · Otherworld",
  "拉杆 ×{0} · 里世界": "{0} levers · Otherworld",
  "拉杆 · 里世界": "Lever · Otherworld",
  "出口 · 交班": "Exit · End shift",

  // 暂停/结算
  "暂 停": "PAUSED",
  "⏸ 继续 · 虚拟按键操作": "⏸ Resume · Touch controls",
  "Esc 继续 · R 重开本区 · M 静音": "Esc: resume · R: restart area · M: mute",
  "天亮了": "DAYBREAK",
  "{0} 班全勤 · 碎片 {1}/{2} · 用时 {3}（不计评价）": "{0} shifts cleared · Shards {1}/{2} · Time {3} (not ranked)",
  "你被看到了": "YOU WERE SEEN",
  "里世界的东西不喜欢被打扰。": "The Otherworld doesn't like visitors.",
  "你坠入了夹缝": "YOU FELL BETWEEN WORLDS",
  "两个世界之间的缝，比看起来深。": "The gap between worlds runs deep.",
  "你被里世界留下了": "THE OTHERWORLD KEPT YOU",
  "神智见底的时候，现实就再也回不去了。": "When sanity runs out, there's no way back.",
  "倒在 {0} · {1}": "Down at {0} · {1}",
  "从存档点复活，门禁卡和拉杆保留": "Respawn at checkpoint, keycard & levers kept",
  "从本区入口重来": "Restart from area entrance",
  "轻点屏幕 再上一夜": "Tap for another night",
  "按 空格 再上一夜": "SPACE for another night",
  "轻点屏幕 继续": "Tap to continue",
  "按 空格 继续": "SPACE to continue",

  // 情境提示（通用）
  "对面是一堵墙——这里切不过去": "Solid wall on the other side — can't shift here",
  "里世界会消耗神智——快进快出": "The Otherworld drains sanity — get in, get out",
  "里世界会消耗神智——快进快出，按住 K 可以拨慢时间": "The Otherworld drains sanity — hold K to slow time",
  "神智快见底了——回现实喘口气": "Sanity low — return to reality and breathe",
  "它看到你了——跑！": "It saw you — RUN!",
  "现实不为所动——只有里世界的时间能被拨动": "Reality is rigid — only the Otherworld's time can be shifted",
  "远处传来闸门升起的声音——回到现实": "A gate rumbles open in the distance — return to reality",
  "闸门机关 {0}/{1}——还有拉杆没拉": "Gate mechanism {0}/{1} — more levers to pull",
  "拿到门禁卡了——回到现实，去出口": "Keycard acquired — back to reality, to the exit",
  "记忆碎片 {0}/{1}": "Memory shard {0}/{1}",
  "闸门纹丝不动——开关不在这个世界": "The gate won't budge — the switch is not in this world",
  "门锁着。需要一张门禁卡——它不在这个世界": "Locked. You need a keycard — not in this world",
  "存档点已激活——死了从这里复活": "Checkpoint activated — you'll respawn here",

  // 情境提示牌 · 大堂
  "跟着右上任务走——出口在最右边": "Follow the objectives — exit is on the far right",
  "小台阶——跳一下（W / 跳）": "A small step — jump (W / jump)",
  "想不想看看另一边？按 Shift 试试": "Curious what's on the other side? Try Shift",
  "出口就在前面——交班！": "Exit is just ahead — end your shift!",

  // 情境提示牌 · 西翼
  "墙挡路——Shift 切到里世界": "Wall ahead — Shift to the Otherworld",
  "坑——里世界那边是实地": "A pit — solid ground on the other side",
  "拉杆！出口闸门的开关在这个世界": "A lever! The exit gate's switch is in this world",
  "门禁卡——拿了它，回现实": "The keycard — grab it and return to reality",
  "闸门纹丝不动——开关在里世界": "The gate won't budge — the switch is in the Otherworld",
  "闸门开了——过去": "Gate's open — go through",

  // 情境提示牌 · 停车场
  "地下停车场：坑更多，抬头看路": "Parking garage: more pits, watch your step",
  "坑——里世界的地面也许不一样": "A pit — the ground may differ in the Otherworld",
  "顺着台阶上去，亮晶晶的在等你": "Up the steps — something shiny awaits",
  "墙——按 Shift 换条路": "A wall — Shift to find another way",
  "前面有“住户”在巡——别走进红色视锥": "A resident patrols ahead — avoid its red cone of vision",
  "里世界有部电梯——站上去": "There's an elevator in the Otherworld — step on",
  "碎片、拉杆、门禁卡——都在这层": "Shard, lever, keycard — all up here",
  "第二个拉杆在地面": "The second lever is on the ground",
  "闸门纹丝不动——两个拉杆都在里世界": "The gate won't budge — both levers are in the Otherworld",

  // 情境提示牌 · 货运通道
  "货运通道：左边的台子上有东西在闪": "Freight corridor: something glints on the left ledge",
  "坑——换世界或者绕高台": "A pit — switch worlds or take the high platform",
  "高墙——Shift 切过去": "Tall wall — Shift through",
  "电梯——上高台，拉杆和门禁卡都在上面": "Elevator — lever and keycard are up top",
  "地面还有个拉杆——快的在右边巡": "Another lever on the ground — the fast one patrols right",

  // 情境提示牌 · 档案架
  "坑——里世界是实地": "A pit — solid ground in the Otherworld",
  "前面塌了——切回现实": "Collapsed ahead — shift back to reality",
  "门禁卡在平台上——跳上去": "Keycard on the platform — jump up",
  "拉杆！顺便躲开巡逻的": "Lever! Mind the patrolling resident",

  // 情境提示牌 · 机房
  "墙——Shift 换条路": "Wall — Shift to find another way",
  "大坑——里世界是实地": "Big pit — solid ground in the Otherworld",
  "电梯——上高台拿门禁卡": "Elevator — keycard's up top",

  // 情境提示牌 · 天台
  "天台。风大，东西多": "Rooftop. Windy and busy",
  "台阶上有碎片——上面风景好": "A shard on the steps — nice view up there",
  "电梯上高台——拉杆和门禁卡都在": "Elevator to the ledge — lever and keycard up there",
  "第二个拉杆——两只住户都在这片巡": "Second lever — two residents patrol here",

  // 情境提示牌 · 水箱平台
  "长坑——等移动平台，或切里世界走实地": "Long pit — ride the moving platform or shift for solid ground",
  "拉杆1 在地面——巡逻的就在旁边": "Lever 1 on the ground — patrol right beside it",
  "电梯上高台——拉杆2 和门禁卡": "Elevator up — lever 2 and keycard",

  // 情境提示牌 · 总机房
  "总机房——最后一区，交完班就天亮了": "Mainframe — final area, daybreak after this shift",
  "拉杆1 在地面——注意三只住户的视锥": "Lever 1 on the ground — watch three vision cones",
  "第二部电梯——拉杆2 在高台上": "Second elevator — lever 2 is on the ledge",

  // 最终出口通用
  "出口！交完这班就天亮了": "Exit! Daybreak after this shift",
};

export function initI18n(): void { /* 字典模块加载即初始化，无需调用 */
}

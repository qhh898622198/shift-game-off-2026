# SHIFT

A dual-reality puzzle-platformer for **Game Off 2026** (theme: SHIFT). Play in your browser, on desktop or mobile (touch controls).

**You are a night-shift security guard. One Shift key, two realities.** Walls that block you in reality may not exist in the Otherworld — but the Otherworld has residents of its own. Find the keycard, pull the levers, and make it to the end of your shift.

## Controls

| Input | Action |
| --- | --- |
| A / D or ← / → (touch ‹ ›) | Move |
| W / Space / ↑ (touch ∧) | Jump |
| Shift (touch eye icon) | Switch reality ⇄ Otherworld |
| J (touch ») | Dash (once per airtime) |
| K (hold, keyboard only) | Bullet time in the Otherworld (drains sanity faster) |
| Esc (touch ⏸) | Pause |
| R | Restart area |
| M | Mute |
| **L / title button** | **Switch language 中文 / English** |

## Content

- **5 shifts, 9 areas** (~25–30 min): Lobby → West Wing → Parking Garage → Freight Corridor → Archive Stacks → Server Room → Rooftop → Water Tank Platform → Mainframe, with a gentle difficulty curve
- Dual-reality switching (complementary tile maps), sanity meter, patrolling guards with vision cones and chase, lever-operated gates, moving platforms and vertical elevators
- 3 memory shards per area (27 total), S/A/B rank by collection (not by speed)
- **Level select grid** with per-level shards and rank badges, progressive unlocks
- **Auto-save** on area transitions (localStorage) + in-area checkpoints; continue anytime
- Objective panel, contextual hint signs and a target compass; full-screen adaptive viewport (portrait phones included)
- **中文 / English** — all UI text, map names and hints are bilingual; toggle with L or the title button
- All art drawn procedurally (including hand-drawn vector icons), all audio synthesized with Web Audio — **no third-party assets**

## Run

```bash
npm install
npm run dev        # dev preview (Vite)
npm run build      # production bundle in dist/ (upload to itch.io as HTML5)
npm run verify     # smoke test: render / controls / pause / zero console errors
node scripts/verify-playthrough.mjs  # full playthrough of all 9 areas
node scripts/verify-touch.mjs        # touch controls (emulated iPhone)
node scripts/verify-embed.mjs        # embedded-path boot check (no black screen)
node scripts/verify-i18n.mjs         # English UI rendering
```

## Tech

TypeScript + Vite + React (page shell only) + Canvas 2D (offscreen compositing, glitch transitions, parallax layers, player light halo, vignette). Fixed 60 Hz timestep, coyote time, jump buffering, particle pool.

## AI usage

Built primarily with **Kimi (Moonshot AI)** under the author's direction — gameplay, code, level design, art and audio are AI-generated; the author made design decisions, playtested and submitted.

## License

No third-party assets. All visuals and audio are generated at runtime. Dependencies listed in package.json.

---

# SHIFT（中文）

Game Off 2026（主题：SHIFT）参赛作品 —— 2D 双世界解谜平台跳跃，浏览器直接玩，支持手机触屏。

**你是夜班保安。现实里堵死的墙，在里世界也许不存在；但里世界多出来的东西，也不都是路。找到门禁卡、拉开闸门，活到交班。**

## 操作

| 输入 | 动作 |
| --- | --- |
| A / D 或 ← / →（触屏 ‹ ›） | 移动 |
| W / 空格 / ↑（触屏 ∧） | 跳跃 |
| Shift（触屏 大眼睛） | 切换 现实 ⇄ 里世界 |
| J（触屏 »） | 冲刺（空中限一次） |
| K 按住（键盘限定） | 里世界子弹时间，神智消耗加剧 |
| Esc（触屏 ⏸） | 暂停 |
| R | 重开本区 |
| M | 静音 |
| **L / 标题按钮** | **中/EN 切换** |

## 内容

- **五班九区**：大堂 → 西翼 → 停车场 → 货运通道 → 档案架 → 机房 → 天台 → 水箱平台 → 总机房，难度逐区递增
- 双世界切换（实心互补）、神智值、巡逻者视野锥与追击、拉杆闸门、移动平台与垂直电梯
- 每区 3 枚记忆碎片（共 27 枚），结算按收集数评 S/A/B（不看用时）
- **选关卡片**：每关独立碎片与评价，逐关解锁
- **自动存档**：换图即存（localStorage，仅存本机浏览器，清数据会丢），标题可"继续夜班"；图内存档点，死亡从存档点复活并保留门禁卡与拉杆
- 开局任务卡、情境提示牌、目标罗盘三重引导；全屏自适应视口（竖屏手机也全屏）
- **中文 / English**：全部界面文案、地图名、提示双语，L 键或标题按钮切换
- 全部画面程序化绘制（含手绘矢量图标）、全部音效 Web Audio 实时合成，**零第三方素材**

## 运行

```bash
npm install
npm run dev        # 开发预览（Vite）
npm run build      # 产出 dist/（可直接传 itch.io 为 HTML5 游戏）
npm run verify     # 冒烟自检：渲染/方向映射/暂停/控制台零报错
node scripts/verify-playthrough.mjs  # 全流程自检：五班九区通关路径
node scripts/verify-touch.mjs        # 触屏自检（模拟 iPhone）
node scripts/verify-embed.mjs        # 嵌入路径启动检查（不再黑屏）
node scripts/verify-i18n.mjs         # 英文界面显示检查
```

## 技术

TypeScript + Vite + React（仅页面外壳）+ Canvas 2D（离屏合成 + glitch 转场 + 视差多层 + 玩家光环 + 暗角）。固定 60Hz 步进、土狼时间、跳跃缓冲、粒子池。

## AI 使用说明

本作由 Moonshot AI 的 Kimi 在作者的指导下完成主要开发（玩法、代码、关卡、美术与音效均为 AI 生成），作者负责方向决策、试玩反馈与提交。

## 许可

无第三方素材；所有画面与音效均为运行时程序化生成。依赖见 package.json。

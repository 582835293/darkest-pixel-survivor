# 血夜幸存者 (Darkest Pixel Survivor) · 开发者维护与工程架构手册

> **适用版本**：v26.4 R30+  
> **文档定位**：面向项目开发者、维护者与二次开发学习者的完整工程架构说明、核心模块导航、渲染与同步管线解析、功能扩展手册及测试校验规范。

---

## 目录

1. [架构总览与设计哲学](#1-架构总览与设计哲学)
2. [目录结构与运行环境](#2-目录结构与运行环境)
3. [单文件源码 (`index.html`) 模块地图](#3-单文件源码-indexhtml-模块地图)
4. [核心游戏循环与状态机 (`update` & `GameState`)](#4-核心游戏循环与状态机-update--gamestate)
5. [Canvas 渲染管线与原生像素视觉系统 (`draw`)](#5-canvas-渲染管线与原生像素视觉系统-draw)
6. [战斗结算、状态异常与伤害统计归属](#6-战斗结算状态异常与伤害统计归属)
7. [多人联机同步与混合网络架构 (`CoopManager` & `WorldCoop`)](#7-多人联机同步与混合网络架构-coopmanager--worldcoop)
8. [二次开发实战指南（如何新增/修改内容）](#8-二次开发实战指南如何新增修改内容)
9. [调试工具、自动化测试与维护守则](#9-调试工具自动化测试与维护守则)

---

## 1. 架构总览与设计哲学

《血夜幸存者》采用 **零外部运行时构建依赖的单文件自包含架构（Single-File Self-Contained HTML Architecture）** 搭配轻量级 Node.js/Express 本地辅助服务：

1. **单文件便携性 (`index.html`)**：
   - 全部 HTML 结构、响应式 CSS 样式、162 枚矢量/像素图标图集、角色/怪物点阵精灵生成器、WebAudio 芯片交响乐合成器、5 幅高分辨率关卡 WebP CG（Base64 内嵌）以及完整游戏逻辑均内聚在 `/index.html` 中。
   - 使得游戏既可以部署在任何静态托管平台（如 GitHub Pages），也可以直接离线打开或在局域网手机热点下运行。
2. **原生程序化像素与音频生成**：
   - **视觉**：所有英雄、34 种怪物、24 位首领、弹道、法阵、刀光均通过 Canvas 2D API 与点阵矩阵 (`SpriteCache` / `PixelIcons`) 动态绘制，无需加载外部雪碧图文件。
   - **音频**：通过 `SoundEngine` (Web Audio API) 实时合成打击音效、Boss 入场警报以及四张主线地图的多声部背景音乐。
3. **增量式模块扩展 (R22 → R30+)**：
   - 核心基础引擎位于前半部分，后续版本（如 R25 死灵法师、R27 友军首领与秘宝觉醒、R29 三位新猎手与钟城、R30+ 番外爽关与精细化体验优化）通过清晰的命名空间对象（`HealerKit`、`EngineerKit`、`NecroKit`、`NewHeroes`、`CardTable`、`RelicAwakening`、`FriendlyBossKit`、`DamageMeter`、`ExtraStages`）挂载并与主循环解耦协作。

---

## 2. 目录结构与运行环境

```text
/
├── index.html                  # 核心单文件游戏源码（UI + 样式 + 资源 + 引擎 + 联机 + 番外关卡）
├── server.js                   # Express 本地运行与局域网房间发现/信令辅助服务（默认监听 3000 端口）
├── package.json                # 项目脚本与依赖配置
├── README.md                   # 项目总览与核心玩法介绍
├── CHANGELOG.md                # 历史版本迭代日志
├── assets/                     # 独立导出的像素 UI 图标、关卡 CG 与实机宣传截图
│   ├── cg/                     # 标题与四关 WebP 像素插画及生成 Prompt 说明
│   ├── screenshots/            # 桌面端与移动端实机截图
│   └── ui/                     # 162 枚像素图标图集导出文件
├── docs/                       # 开发者与设计文档中心
│   ├── DEVELOPER_GUIDE.md      # 【本文档】开发者维护与工程架构手册
│   ├── GAME_DESIGN_BIBLE.md    # 【设计总集】游戏信息设计与数值设定百科全书
│   ├── NETWORKING.md           # 联机发现、加密握手、WebRTC/MQTT 与状态同步协议深度说明
│   ├── TESTING.md              # 自动化回归测试套件说明与校验记录
│   └── BALANCE*.md             # 各版本受控木桩与 AI 遭遇战数值实验报告
├── scripts/                    # 工程校验、数值仿真与截图工具脚本
│   ├── check.mjs               # JS 语法提取校验与静态资源链接完整性检查（npm run build / check）
│   ├── test-all.cjs            # 全量 Playwright 自动化回归测试入口（npm test）
│   ├── balance-lab.cjs         # 自动化前中后期 DPS 与 AI 遭遇战仿真实验室（npm run balance）
│   └── export-icons.cjs        # 像素图标图集导出工具
└── tests/                      # 40+ 套 Playwright 端到端与联机 RTC 专项测试脚本
```

### 常用开发命令

| 命令 | 作用说明 |
| :--- | :--- |
| `npm run dev` | 启动 `server.js`（监听 `http://0.0.0.0:3000`），提供游戏服务与本地 LAN 联机信令接口 |
| `npm run check` / `npm run build` | 运行 `scripts/check.mjs`，提取 `index.html` 内所有 `<script>` 进行 Node VM 语法编译检查与引用校验 |
| `npm test` | 运行 `scripts/test-all.cjs` 全套 Playwright 自动化测试 |
| `npm run balance` | 运行 `scripts/balance-lab.cjs` 输出各职业四阶段受控木桩与遭遇战数值报告 |

---

## 3. 单文件源码 (`index.html`) 模块地图

为了在单文件中高效定位代码，以下按功能区块列出 `/index.html` 的核心模块分布：

| 区块范围（约行号） | 核心对象 / 函数 | 职责说明 |
| :--- | :--- | :--- |
| **1 ～ 1180** | `<style>` 全局样式表 | 暗黑像素风 UI、响应式布局、移动端安全区避让、技能树卡片、紧凑通知横幅、模态框样式 |
| **1180 ～ 1915** | HTML DOM 容器与弹窗 | 标题画面 (`#title-screen`)、顶部状态栏 (`#hud-top`)、Boss 入场警戒条 (`#boss-entrance-banner`)、移动端触控摇杆与技能键、营地/商店/技能树/图鉴/结算/联机模态框 |
| **1915 ～ 2320** | `PixelIcons` | 162 枚 16×16 原创像素图标 DSL 编译器，支持将文本中的 `[px:icon-name]` 实时渲染为矢量/像素图标 |
| **2320 ～ 2585** | `SoundEngine` (`audio`) | 基于 Web Audio API 的零外部音频合成器（挥砍、射击、暴击、升级、Boss 入场警报、四关芯片交响乐） |
| **2585 ～ 2850** | `HERO_CONFIGS` / `STAGE_SPECIAL_RELICS` | 基础英雄属性与初始技能模板、四关特殊地图秘宝定义、场景可破坏物与临时增益道具定义 |
| **2850 ～ 3080** | `player` / `NEW_SYNERGIES` / `HuntPulse` / `NewSynergies` / `FireTrail` | 玩家核心状态对象、7 大流派（最高 Lv.5）机制实现（余烬回响 `0.3s→0.1s` 冷却、星辉壁垒反伤、追猎脉冲、业火流星 `2x～4x` 持续时间） |
| **3080 ～ 3500** | `NecroKit` / `NewHeroes` / `CardTable` | 冥契术士（残魂收集、10倍血量闪光亡灵、30倍血量领主）、终局球爵（无衰减几何弹射）、风暴拳师（拳势与雷门）、赤契牌师（四花色攒牌与牌型极速蓄力） |
| **3500 ～ 4490** | `generateUpgradePool()` / `UpgradeChoice` | 升级三选一卡池生成器：控制普攻/蓄力/战技/大招 Lv.1→Lv.5、蓄力 A/B 专精二选一、超武合成、流派 3 槽 Lv.5 上限、装备 3 槽及满级后的突破（Limit Break） |
| **4490 ～ 5550** | `executeAttack()` / `executeChargedAttack()` / `executeSkill1()` / `executeSkill2()` / `executeUlt()` | 各职业主动技能施放逻辑、连招计数、弹道生成与全屏大招演出 |
| **5550 ～ 6700** | `MONSTER_SPECS` / `BIOME_BOSS_ROSTER` / `damageEnemy()` / `killEnemy()` | 怪物直觉化移速/血量/伤害配置表、6 阶经验水晶 (`GEM_TIER_SPECS`) 生成与动态合并 (`mergeGroundGems`)、核心伤害公式与击杀结算 |
| **6700 ～ 7550** | `spawnEnemyBatch()` / `spawnBoss()` / `BossEntranceAlert` | 波次刷新曲线（新怪前 30 秒渐强机制）、6 种战术包围阵型、Boss 入场警戒横幅与音效展示 |
| **7550 ～ 8680** | `update(dt)` / `damagePlayer()` | 主物理与逻辑帧循环：角色移动、技能冷却、弹道碰撞、地面领域 Tick、怪物 AI、空间哈希刚体碰撞、玩家受击与濒死倒地延迟演出 |
| **8680 ～ 9600** | `draw()` | 主 Canvas 渲染管线：分层绘制地图背景、地面特效、预警线、经验水晶、实体精灵、脚下蓄力/满能量法阵、头顶紧凑红格 Boss 血条、刀光与飘字 |
| **9600 ～ 12690** | `SaveManager` / `Campaign` / `Arena` | 本地持久化存档、营地圣殿天赋（逐级加减无损退款）、铁匠铺、45+ 成就系统、地图边界与 `~1 km` 随机方位秘宝生成 (`Arena.relicPoint`) |
| **12690 ～ 13400** | `SkillDetails` / `renderSkillTreeModal()` | 技能树 4 大标签页（主动技能、流派共鸣、被动装备、地图秘宝）的常显概要与可展开实时公式面板 |
| **13400 ～ 19150** | `CoopManager` / `WorldCoop` / `FriendlyBossKit` / `RelicAwakening` | 多人联机房间发现、WebRTC P2P / MQTT / 离线热点直连、AI 机器人队友、友军首领（每人最多2位、10秒沉睡复苏）与地图秘宝拾取即觉醒 |
| **19150 ～ 24500** | `R29` / `R30` 扩展与 `DamageMeter` | 第四关锈月钟城、内嵌 CG 加载器、实时与结算伤害统计系统 (`DamageMeter` + `__dmgSourceHint`)、高阶成就扩容 |
| **24500 ～ 末尾** | `ExtraStages` | 番外一《贪婪黄金宝库》（对数增伤撒币炮 + 十连全队命运轮盘）与番外二《史莱姆狂欢牧场》（五阶合体皮纳塔 + 彩虹吞噬战车） |

---

## 4. 核心游戏循环与状态机 (`update` & `GameState`)

### 4.1 关键状态标志 (`GameState`)

- `GameState.isStarted`：是否已从营地出征进入战斗。
- `GameState.isPaused`：本地或全队是否处于暂停状态（单人打开菜单暂停世界模拟；联机仅房主点击「暂停全队游戏」才冻结世界，个人打开菜单享有 10 秒菜单无敌保护）。
- `GameState.isOver`：本局是否已结束（胜利或团灭结算）。
- `GameState.dyingTimer`：**玩家濒死倒地演出计时器（`1.35s`）**。单人无复活次数且最后一名玩家气绝时，不会瞬间弹出结算框，而是进入 `1.35s` 慢动作倒地动画（画布绘制倾倒姿态、暗红脉冲与顶部提示），演出结束后再触发 `triggerGameOver()`。
- `GameState.activeBiome`：当前地图标识（`'dungeon'` | `'tundra'` | `'graveyard'` | `'clockwork'` | `'vault'` | `'slime_carnival'`）。

### 4.2 `update(dt)` 单帧执行顺序

每一帧 `requestAnimationFrame` 将时间步长 `dt` 钳制在安全范围内（防止切后台回来产生巨幅位移），并依次执行：

1. **濒死倒地过渡检查**：若 `GameState.dyingTimer > 0`，仅推进粒子/飘字/震屏与慢动作计时，到期后进入结算。
2. **全局计时与动态难度 (DDA)**：推进 `GameState.gameTime`，更新无伤升阶计时器（连续 120 秒生命高于 80% 自动提升难度档位）。
3. **玩家自身状态更新**：
   - 天性生命自愈（每 10 秒按职业恢复 `2.5%～4.0%` 最大生命）。
   - 主动技能、圣盾与蓄力计时器推进（含拳师满 6 点拳势、牌师牌型成型、球爵/拳师/牌师大招期间的极速蓄力倍率）。
   - 自动普攻/蓄力与手动按键触发。
4. **移动与地形碰撞**：
   - 计算方向输入与移速加成，推进玩家坐标，执行 `Arena.clamp()` 与障碍物刚体碰撞 `resolveEntityObstacleCollision()`。
   - 推进 `NewSynergies.tick(dt)`（含 `echoCd`、`reflectCd`、星辉壁垒周期护盾）与 `FireTrail.move()`（采样移动轨迹铺设熔岩池）。
5. **刷怪与联机网络步进**：
   - 执行 `updateFieldDrops(dt)` 与 `spawnEnemyBatch(dt)`（含每波新怪前 30 秒由少到多渐强曲线）。
   - 执行 `CoopManager.update(dt)` 同步联机帧。
6. **技能实体与地面领域更新**：
   - 更新剑客旋转剑阵 `orbitingBlades`、游侠回旋镖 `boomerangs`（同屏上限 12 枚，超出自动高速召回）、地面领域 `groundEffects`（固定 `0.28s～0.30s` Tick 间隔，严禁每帧直接无冷却扣血）。
7. **怪物 AI 与空间哈希刚体碰撞（Host 权威）**：
   - 结算怪物身上的流血/灼烧 DoT。
   - 计算怪物寻路（区分近战追击、远程预警狙击与 24 位 Boss 的双招式状态机 `BossCombat.tick`）。
   - 使用 `34px` 网格的 **Spatial Hash Grid（空间哈希网格）** 解算同屏数百只怪物之间的刚体挤压，保证尸潮合围时层次分明绝不重叠穿模。
8. **弹道更新与掉落物合并拾取**：
   - 推进 `projectiles` 移动、穿透、连锁与命中回调。
   - 每 `0.35s` 执行一次 `mergeGroundGems()` 与 `mergeGroundGoldDrops()`，将同区域水晶向上合并（最高 6 阶 `神耀源晶`，体积最大 `24px`）。

---

## 5. Canvas 渲染管线与原生像素视觉系统 (`draw`)

`draw()` 函数严格遵循 **自底向上（Painter's Algorithm）** 的分层渲染顺序，确保画面信息清晰、不遮挡关键走位视野：

1. **世界坐标系变换**：根据 `camera.x / camera.y` 与 `CameraFeedback`（限幅微震屏）平移画布。
2. **底层背景与地砖**：绘制当前关卡的程序化像素地砖、走廊边界墙体与装饰物。
3. **地面持续领域**：绘制熔岩火径 (`fireTrail`)、引力黑洞、庇护圣域、电磁陷阱、地面血迹 (`bloodDecals`)。
4. **危险预警层 (`telegraphs`)**：绘制远程怪瞄准线与 Boss 技能的圆形/扇形/矩形/环带红色预警区（始终位于怪物下方、地面上方，确保清晰可读）。
5. **场景道具与经验水晶 (`gems`)**：
   - 经验水晶按 `computeGemVisualSize()` 动态绘制菱形切面；当合并尺寸 `sz >= 9.5px` 时额外绘制外圈能量光晕与内部十字星芒。
   - 地图特殊秘宝 (`mapRelicDrops`) 绘制脉冲光柱与视野边缘方位指示器（距离约 `1.0 km`）。
6. **角色、友军与怪物实体层**：
   - **脚下状态光环**：当玩家处于蓄力中，或 **祷师满 100 祷光 / 拳师满 6 点拳势 / 牌师凑齐 4 张手牌或成型牌型** 时，在玩家脚下绘制旋转符文法阵、脉冲波纹与环绕光点。
   - **精灵绘制**：绘制亡灵军团、友军首领、敌方怪物与玩家本体（若玩家处于濒死倒地阶段，应用旋转倾倒变换）。
   - **Boss 头顶跟随血条**：所有敌方 Boss 不再使用遮挡手机视野的顶部大横幅，而是直接在 Boss 头顶绘制 **无背景名称 + 单行紧凑 10 格红框血条**。
7. **顶层特效与 HUD 飘字**：
   - 绘制近战弧形刀光 (`slashVisuals`)、弹道 (`projectiles`)、天降光柱/激光 (`skyBeams`)、闪电链 (`lightningArcs`)、暴击与治疗飘字 (`floatingTexts`)。

---

## 6. 战斗结算、状态异常与伤害统计归属

### 6.1 伤害来源追踪 (`window.__dmgSourceHint` & `DamageMeter`)

为了在暂停菜单「角色图鉴」和局末「结算画面」中精确统计每一项技能、流派、秘宝和番外机制的伤害占比，所有调用 `damageEnemy()` 的入口均遵循上下文标记协议：

```js
const _prevHint = window.__dmgSourceHint;
window.__dmgSourceHint = 'syn_emberEcho'; // 或 'skill_attack', 'skill_charge', 'relic_awakening' 等
try {
  damageEnemy(target, dmg, angle, knockback, isSecondary);
} finally {
  window.__dmgSourceHint = _prevHint;
}
```

- **主命中 vs 次级命中 (`isSecondary`)**：
  - `isSecondary = false`（主命中）：由玩家普攻、蓄力、主动战技直接造成的命中，**可以触发** 雷霆连锁 (`thunderChain`)、余烬回响 (`emberEcho`)、极寒碎冰 (`iceShatter`) 等流派效果。
  - `isSecondary = true`（次级命中）：由流派爆炸、闪电链弹跳、火径灼烧、反伤、秘宝脉冲造成的伤害，**绝不再递归触发流派**，从根源上杜绝无限死循环与性能雪崩。

---

## 7. 多人联机同步与混合网络架构 (`CoopManager` & `WorldCoop`)

详细的网络加密与传输协议请参阅 [`docs/NETWORKING.md`](NETWORKING.md)，核心工程原则如下：

1. **房主权威 (Host Authority) + 客机本地表现 (Client Prediction & Local VFX)**：
   - **房主 (`WorldCoop.authority() === true`)**：负责刷怪、怪物 AI 寻路、Boss 招式状态机、怪物死亡确认、掉落物生成与团队救援进度（6 秒基准）结算。
   - **客机 (`WorldCoop.guest() === true`)**：本地立即执行自身移动、技能施放与命中检测，通过 `WORLD_HITS` 将伤害上报房主；房主扣血并广播世界快照，同时将伤害归属记入该客机的 `Campaign.stat(peerId)`。
2. **全员可救 AI 机器人队友**：
   - 无论单人模式添加的 AI 队友还是联机中的 AI 队友，其倒地判定与救援循环均遍历所有存活人类玩家 (`WorldCoop.actors()`)，房主与客机站在 AI 队友旁均可救援。
3. **三模混合连接支持**：
   - **WebRTC P2P 数据通道**（公网低延迟直连）
   - **公共 MQTT / HTTPS 加密中继后备**（穿透严格 NAT）
   - **局域网手机热点自动发现 + 离线直连码**（无外网环境下通过本地 `server.js` `/api/lan/*` 接口或复制粘贴 SDP 直连码完成 P2P 握手）

---

## 8. 二次开发实战指南（如何新增/修改内容）

### 8.1 如何调整或新增英雄技能
1. 在 `HERO_CONFIGS`（约 2591 行）中修改或新增英雄的基础属性（`speed`, `maxHp`, `critChance`, `armor`）与 `initSkills()`。
2. 在 `generateUpgradePool()`（约 3550～4050 行）中配置该英雄的 `Lv.2～Lv.5` 升级描述 (`morphDescs`)、蓄力 A/B 分支描述与超武合成条目。
3. 在 `executeAttack()` / `executeChargedAttack()` / `executeSkill1()` / `executeSkill2()` / `executeUlt()` 中编写技能逻辑。
4. 在 `SkillDetails.describe()` 与 `SkillDetails.summary()` 中同步更新技能树详情面板展示的公式，确保玩家看到的面板数值与实际代码 100% 一致。

### 8.2 如何调整或新增流派共鸣（Synergy）
1. 所有流派统一存放在 `player.passives[key]`，最高等级由 `MAX_SYNERGY_LV = 5` 控制，每局最多选 3 种流派。
2. 若修改触发型流派（如 `emberEcho` 余烬回响、`fireTrail` 业火流星、`huntPulse` 追猎脉冲），请在 `NewSynergies`、`FireTrail` 或 `HuntPulse` 对象中维护其冷却计时器（如 `this.echoCd`）与等级规格函数 `spec(lv)`。
3. 同步更新 `NEW_SYNERGIES`（或 `renderSkillTreeModal` 中的 `synBranches`）的 5 级节点文案以及 `SkillDetails.describe('synergy', key)`。

### 8.3 如何新增或调整怪物与 Boss
1. **普通怪物**：在 `MONSTER_SPECS`（约 5580 行）中定义 `hp`, `speed`, `damage`, `exp`, `radius`, `color`, `tier`, `role`。遵循直觉化设计（体型小/刺客型移速快血量低；重装巨怪移速慢血量高伤害高）。
2. **图鉴同步**：`Campaign.bookRows('monsters')` 会自动读取 `MONSTER_SPECS` 的属性并渲染至魔物图鉴，无需硬编码重复数值。
3. **Boss 招式**：在 `BIOME_BOSS_ROSTER` 注册每 5 分钟登场的 Boss，并在 `BossCombat.profiles` 中配置其主招式与半血狂暴招式。

---

## 9. 调试工具、自动化测试与维护守则

### 9.1 游戏内开发者模式 (Dev Mode)
- 在营地或局内暂停菜单点击 **「开发者模式」**（口令验证通过后激活）：
  - **开发者无敌**：免疫致死伤害，方便测试高层波次与 Boss 招式。
  - **一键连升 5 级 (`#btn-dev-exp5`)**：立即触发 5 次升级选卡，快速验证构筑成型。
  - **全技能/流派/装备满级 (`#btn-dev-maxall`)**：一键将当前角色所有主动技能、流派升至 `Lv.5` 并觉醒超武。
  - **立即召唤 Boss / 发放金币**：直接测试当前关卡的 Boss 入场警戒、头顶血条与技能交互。

### 9.2 维护铁律（Checklist）
1. **严禁无冷却每帧结算伤害**：任何地面领域、光环、碰撞或流派触发必须带有明确的 `tickTimer` 或 `echoCd / reflectCd / iceShatterCd` 冷却锁。
2. **修改代码后必跑语法与构建检查**：每次修改 `index.html` 后，必须执行 `node scripts/check.mjs` 确保没有任何语法错误或断链。
3. **移动端 UI 避让原则**：战斗中浮动的提示信息（如 `#live-toast`、救援提示、Boss 入场警戒条）必须在任何模态框（`.modal-overlay`）打开时自动隐藏，且顶部横幅需控制在紧凑单行内，绝不遮挡中心视野。

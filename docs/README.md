# 文档中心 · Darkest Pixel Survivor (`v1.0.0`)

本目录包含《血夜幸存者》面向开发者与策划维护者的核心工程文档、设计总集、联机协议说明、测试记录与历史数值实验归档。

## 核心文档导航

| 文档 | 内容说明 |
| :--- | :--- |
| **[开发者维护与工程架构手册](DEVELOPER_GUIDE.md)** | 单文件源码 (`index.html`) 模块地图、主循环 `update(dt)` / `draw()` 管线、视野缩放与自适应特效档位、伤害归属追踪与二次开发实战指南 |
| **[游戏信息设计与数值设定总集](GAME_DESIGN_BIBLE.md)** | 核心伤害/防御公式、6 阶经验水晶动态合并、九大猎手全技能、七大五级流派、单技突破规则、十二件 1km 随机觉醒秘宝、34 种魔物与 24 位首领设定 |
| **[联网与同步机制深度说明](NETWORKING.md)** | WebRTC P2P、公共 MQTT / HTTPS 加密中继、离线手机热点局域网直连、多人神秘商人防重发、AI 机器人权威隔离与高频位姿平滑插值协议 |
| **[自动化回归测试与验证记录](TESTING.md)** | 端到端功能回归、真实本地 RTC 联机检验、输入兼容验证与复现命令 |
| **[数值平衡实验总览](BALANCE.md)** | 早期版本受控木桩与 AI 遭遇战方法论及各历史版本对比入口 |
| **[像素 CG 提示词存档](CG_PROMPTS.json)** | 主线像素插画生成的原始提示词元数据 |

## 历史数值与验证归档 (`archive/`)

| 语义化版本 | 数值平衡记录 | 原始数据 / 验证记录 |
| :--- | :--- | :--- |
| **v0.9.5** | [v0.9.5 数值与球量记录](archive/balance-v0.9.5.md) | [固定靶 JSON](archive/balance-v0.9.5.json) · [遭遇战 JSON](archive/balance-v0.9.5-encounters.json) · [回归验证 JSON](archive/validation-v0.9.5.json) |
| **v0.9.0** | [v0.9.0 九职业与蒜香护符数值记录](archive/balance-v0.9.0.md) | [固定靶 JSON](archive/balance-v0.9.0.json) · [控制组 JSON](archive/balance-v0.9.0-control.json) · [遭遇战 JSON](archive/balance-v0.9.0-encounters.json) · [蒜香单项 JSON](archive/balance-v0.9.0-garlic.json) · [回归验证 JSON](archive/validation-v0.9.0.json) |
| **v0.8.0** | [v0.8.0 亡灵军团与秘宝数值记录](archive/balance-v0.8.0.md) | [固定靶 JSON](archive/balance-v0.8.0.json) |
| **v0.7.5** | [v0.7.5 永久亡灵与蓄力对比记录](archive/balance-v0.7.5.md) | [对比数据 JSON](archive/balance-v0.7.5.json) |
| **v0.7.0** | [v0.7.0 六职业受控数值记录](archive/balance-v0.7.0.md) | [固定靶 JSON](archive/balance-v0.7.0.json) |
| **v0.4.5 ～ v0.6.0** | [早期版本数值归档](BALANCE.md) | — |

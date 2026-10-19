# 大喵桌宠 · Damao Desktop Pet

> 一个以角色一致性为核心的跨平台桌面伙伴实验。  
> A character-driven desktop companion experiment inspired by Momo from *Infinity Nikki*.

**当前版本 / Current version:** `v0.2.0`  
**平台 / Platforms:** macOS + Windows  
**技术栈 / Stack:** Electron · JavaScript · HTML/CSS · Open-Meteo

> **非商业同人项目 / Non-commercial fan project.** 本项目与《无限暖暖》官方、开发商、发行商及相关权利人没有隶属、授权或背书关系。代码与第三方/IP素材的许可范围不同，详见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

---

## 项目是什么？ · What is this?

大喵桌宠不是单纯把一张角色 PNG 放在桌面上，而是尝试把**角色语料、时间、天气和用户交互**组合成一个有持续人格感的桌面伙伴。

Rather than placing a static character image on the desktop, the project combines **character dialogue, time-based states, weather context, and user interaction** to create a more persistent sense of character presence.

核心设计方向：

- **角色驱动 / Character-driven**：根据整理过的大喵语料与角色特征设计互动，尽量避免 OOC。
- **时间感知 / Time-aware**：一天七个时段对应不同状态与动作。
- **天气感知 / Weather-aware**：通过 Open-Meteo 获取天气，在适合的条件下触发天气反应；失败时静默降级。
- **交互状态 / Interaction states**：单击、双击、拖拽、长按、长时间未互动等触发不同反应。
- **跨平台 / Cross-platform**：同一套 Electron 项目同时面向 macOS 与 Windows，并处理两端窗口、定位与托盘差异。

---

## 已实现功能 · Features

| 模块 | 当前实现 |
|---|---|
| 时段状态机 | 0–6 深夜 / 6–9 清晨 / 9–12 上午 / 12–14 午间 / 14–18 午后 / 18–21 傍晚 / 21–24 睡前 |
| 单击对话 | 随机台词、权重、冷却、防复读 |
| 双击 | 噗灵金币状态 + 对应语料 |
| 拖拽 | 手动移动窗口，结束后触发挥手/同行反应 |
| 长按 | 约 800ms 触发比心与加油语料 |
| 冷落反应 | 长时间没有互动后触发担心式反应，而不是“吃醋式”反应 |
| 天气 | Open-Meteo；Mac 优先系统定位，Windows 使用 IP 粗略定位并带兜底；支持天气相关语料触发 |
| 动画 | 呼吸浮动、随机眨眼、状态图片切换等 |
| 透明穿透 | 根据角色实心区域处理鼠标接管，透明区域可穿透 |
| 单实例 | 避免重复打开多个大喵实例 |
| 托盘 / Tray | 独立大喵托盘图像；Windows 支持托盘点击菜单 |
| 跨平台打包 | macOS DMG；Windows NSIS Installer + Portable |

### 平台差异 · Platform-specific handling

| 问题 | 处理方式 |
|---|---|
| Windows 系统定位限制 | Windows 使用 IP 粗略定位查天气；Mac 先尝试系统定位，失败后再使用 IP |
| Windows 高 DPI 拖拽 | 使用固定尺寸的 bounds 更新，避免窗口缩放异常 |
| 透明窗口鼠标阻挡 | 根据图片像素判断是否接管鼠标，其余透明区域穿透 |
| Windows 置顶稳定性 | 使用更高置顶层级并在需要时重新置顶 |
| 重复启动 | 单实例锁；再次启动会唤回已有窗口 |
| 托盘 | `assets/tray.png` / `tray@2x.png`；Windows 点击可打开菜单 |

---

## 运行源码 · Run from source

需要 Node.js / npm。

```bash
npm install
npm start
```

开发模式：

```bash
npm run dev
```

---

## 构建 · Build

### macOS

```bash
npm run dist:mac
```

当前配置生成 DMG，应用图标来自 `build/icon.png`。

### Windows

```bash
npm run dist:win
```

当前 Windows x64 配置生成：

- `DamaoPet-Setup-<version>.exe` — NSIS 安装版，可选择安装目录并创建快捷方式。
- `DamaoPet-Portable-<version>.exe` — 免安装 Portable 版。

Windows 图标来自 `build/icon.ico`。

> 二进制安装包建议放在 GitHub **Releases**，而不是提交到源码仓库。

---

## 项目结构 · Project structure

```text
damao-desktop-pet/
├── main.js               # Electron 主进程、窗口、托盘、跨平台处理
├── preload.js            # contextIsolation 安全桥接
├── package.json          # scripts + electron-builder 配置
├── renderer/
│   ├── index.html
│   ├── style.css
│   └── app.js            # 状态机、语料、交互、天气、动画
├── assets/               # 角色状态图、表情、托盘图像
├── build/
│   ├── icon.png          # macOS build icon
│   └── icon.ico          # Windows build icon
├── LICENSE               # 原创代码：MIT
└── THIRD_PARTY_NOTICES.md
```

---

## 设计方法 · Design approach

这个项目的一部分工作并不在“写代码”，而在**角色研究与交互映射**：收集大喵在暖暖系列中的可核对语料，区分不同作品时期的角色表达，再将合适的原句映射到时间、天气和用户行为中。

A significant part of the project is **character research and interaction mapping**, not only implementation: collecting verifiable Momo dialogue, distinguishing characterization across entries in the Nikki franchise, and mapping suitable lines to time, weather, and user actions.

设计原则包括：

- 大喵是暖暖的同行伙伴，而不是等待被照顾的普通“宠物”。
- 冷落反应以担心和陪伴为主，不设计成强烈占有或吃醋。
- 五花肉是高频角色梗，但避免让它覆盖全部人格。
- 重要情境下优先体现安全、计划、陪伴和对暖暖状态的关注。
- 尽量使用可核对的角色原句；自创文本应与原语料明确区分。

---

## 隐私与网络 · Privacy & network use

天气功能会根据平台尝试获取近似位置，并向天气/定位服务发起网络请求。项目源码中**不需要硬编码 Open-Meteo API Key**。

Weather features may obtain an approximate location depending on platform and make network requests to weather/location services. The project does **not require a hard-coded Open-Meteo API key**.

如果你 fork 本项目并加入自己的 API、Token 或 `.env`，请不要将密钥提交到公开仓库。

---

## Roadmap

- [ ] 继续扩充并核对大喵语料库及来源
- [ ] 完善风速等天气条件与天气语料映射
- [ ] 补充更多独立表情/动作状态
- [ ] 开机自启
- [ ] 多屏位置记忆
- [ ] 字号、气泡与行为设置
- [ ] 进一步测试 macOS / Windows 构建与签名流程

---

## License & IP

原创程序代码采用 **MIT License**，详见 [`LICENSE`](LICENSE)。

**MIT License 不覆盖《无限暖暖》/暖暖系列的角色、名称、台词、图像、官方素材或其他第三方知识产权内容。**相关说明见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

Original software code is licensed under the **MIT License**. Character/IP material and other third-party content are explicitly excluded from that software license; see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).


## 🌐 语言 / Language

- 默认中文；托盘/右键菜单可在 **中文 / English** 间切换。
- Default language is Chinese. Switch between **中文 / English** from the tray/context menu.
- 语言选择会保存在本机，下次启动自动沿用。 / The selected language is remembered across launches.

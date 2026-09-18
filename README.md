# Starcore-Voyage
Starcore Voyage is a polished, fully-tested, offline-capable HTML5 maze puzzle game with 15 sectors and a complete QA suite
---
## Starcore Voyage — Project Overview

**Starcore Voyage** (Chinese: 星核迷航, "Star Core Voyage") is a complete, self-contained web puzzle game project. It was built as a single-page HTML5 game using vanilla HTML/CSS/JavaScript and the Canvas API — no frameworks, no external dependencies, no network required. The whole game ships in one file, `outputs/index.html` (~66 KB), and runs offline by simply opening it in a browser.

**星核迷航** 是一个完整的网页益智游戏项目，使用原生 HTML/CSS/JavaScript 和 Canvas API 开发——零框架、零外部依赖、无需联网。整个游戏封装在单个文件 `outputs/index.html`（约 66 KB）中，用浏览器打开即可离线游玩。

### The Game / 游戏本体

- **Genre**: Grid-based maze puzzle adventure (益智迷宫冒险).
- **Visual style**: Dark sci-fi theme with a signature mint-green accent (#c6f785) and teal/gold/violet highlights; canvas-rendered board with animated starfield, nebula glow, and particle effects.
- **风格**：深色科幻风，标志性薄荷绿点缀，配有动态星空、星云光晕和粒子特效。
- **Levels**: 15 maze sectors (关卡), each a 13×9 grid, progressively introducing new mechanics: laser traps (激光机关, toggle every 2 moves), shield pickups (护盾补给), freeze clocks (冻结钟), blink boots (闪现靴), chasing Shadow Beasts (暗影兽), and a final Core Warden boss (暗核守卫 BOSS, 3 HP, must be lured onto active lasers 3 times).
- **Objective**: Collect all golden cores (星核) in a level, then reach the glowing green exit to unlock the next sector.
- **目标**：收集关卡内全部金色星核，再走进亮起的绿色出口以解锁下一星区。
- **Rating**: 3-star system — full shields + within the target step count = 3 stars; 2+ shields = 2 stars; otherwise 1 star. Local records are saved via localStorage, and the game degrades gracefully if storage is blocked.
- **评价**：三星评价系统——满护盾且在目标步数内通关得三星，2 格及以上护盾得二星，其余一星。通关纪录通过 localStorage 保存在本机，存储被禁用时仍可正常游玩。

### Controls / 操作方式

Keyboard (arrow keys / WASD / Space to wait / R to restart), on-screen D-pad buttons, mouse hover hints, and touch swipe on the canvas for mobile. A "航线提示" (route hint) button BFS-computes a damage-free next step without costing moves.

支持键盘（方向键 / WASD / 空格等待 / R 重开）、屏幕方向按钮、鼠标悬停提示，以及手机端棋盘滑动。航线提示按钮用广度优先搜索算出无伤下一步，且不消耗步数。

### Folder Structure / 目录结构

| Path 路径 | Purpose 用途 |
|---|---|
| `outputs/index.html` | The complete deliverable — the playable game (交付物：可游玩的游戏本体) |
| `tests/game-test.cjs` | Automated test script driving headless Chrome via CDP (自动化测试脚本，通过 CDP 驱动无头 Chrome) |
| `tests/results.json` | Test report: 23 cases, all passed (测试报告：23 项全部通过) |
| `tests/desktop.png` / `mobile.png` / `mobile-result.png` | Test screenshots (桌面 / 手机 / 通关弹层截图) |
| `tests/browser-profile/` | Temporary Chrome profile used by tests (测试用的临时浏览器配置) |
| `log/memory/2026-09-17.md` | Development memory log (开发日志) |

### Verification / 验证情况

The test suite (`game-test.cjs`, 23 checks) verifies real end-to-end playability: all 5 base levels beatable with no damage and 3 stars (22–34 steps vs. par 40–76), real keyboard input, real touch swipes, save persistence across refresh, laser timing & shield deduction, failure/retry flow, locked exits until all cores are collected, hint not costing moves, no horizontal overflow at 1440px / 390px / 320px widths, zero JS runtime exceptions, and playable fallback when storage is disabled. `results.json` confirms all passed.

测试套件（23 项）验证了真实的端到端可玩性：全部关卡可无伤三星通关（22–34 步 vs 目标 40–76 步）、真实键盘输入、真实触屏滑动、刷新后纪录保留、激光节奏与护盾扣减、失败重试流程、未集齐星核时出口锁定、提示不耗步、1440/390/320 像素宽度下均无横向溢出、零 JS 运行时异常，以及存储被禁用时的降级可玩。`results.json` 确认全部通过。

---

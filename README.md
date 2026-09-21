# Starcore Voyage (星核迷航)

Starcore Voyage is a polished, fully-tested, offline-capable HTML5 maze puzzle game with 15 sectors and a complete QA suite.

**星核迷航** 是一个完整的网页益智游戏项目，使用原生 HTML/CSS/JavaScript 和 Canvas API 开发——零框架、零外部依赖、无需联网。整个游戏封装在单个文件 `outputs/index.html` 中，用浏览器打开即可离线游玩。

---

## Project Overview / 项目概览

**Starcore Voyage** (Chinese: 星核迷航, "Star Core Voyage") is a complete, self-contained web puzzle game project. It was built as a single-page HTML5 game using vanilla HTML/CSS/JavaScript and the Canvas API — no frameworks, no external dependencies, no network required. The whole game ships in one file, `outputs/index.html` (~77 KB), and runs offline by simply opening it in a browser.

**星核迷航** 是一个完整的网页益智游戏项目，使用原生 HTML/CSS/JavaScript 和 Canvas API 开发——零框架、零外部依赖、无需联网。整个游戏封装在单个文件 `outputs/index.html`（约 77 KB）中，用浏览器打开即可离线游玩。

### The Game / 游戏本体

- **Genre**: Grid-based maze puzzle adventure (益智迷宫冒险).
- **Visual style**: Dark sci-fi theme with a signature mint-green accent (#c6f785) and teal/gold/violet highlights; canvas-rendered board with animated starfield, nebula glow, and particle effects.
- **风格**：深色科幻风，标志性薄荷绿点缀，配有动态星空、星云光晕和粒子特效。
- **Levels**: 15 maze sectors (关卡), each a 13×9 grid, progressively introducing new mechanics: laser traps (激光机关 — they hold each state for 2 steps, and a sector opens with them **on**), shield pickups (护盾补给), freeze clocks (冻结钟), blink boots (闪现靴), chasing Shadow Beasts (暗影兽), and a final Core Warden boss (暗核守卫 BOSS, 3 HP, must be lured onto active lasers 3 times).
- **Objective**: Collect all golden cores (星核) in a level, then reach the glowing green exit to unlock the next sector.
- **目标**：收集关卡内全部金色星核，再走进亮起的绿色出口以解锁下一星区。
- **Rating**: 3-star system — full shields + within the target step count = 3 stars; 2+ shields = 2 stars; otherwise 1 star. Local records are saved via localStorage, and the game degrades gracefully if storage is blocked.
- **评价**：三星评价系统——满护盾且在目标步数内通关得三星，2 格及以上护盾得二星，其余一星。通关纪录通过 localStorage 保存在本机，存储被禁用时仍可正常游玩。

### Controls / 操作方式

Keyboard (arrow keys / WASD / Space to wait / R to restart), on-screen D-pad buttons, mouse hover hints, and touch swipe on the canvas for mobile. The 航线提示 (route hint) button runs a heuristic A\* over the full rule set — lasers, beasts, boss and items included — and returns a damage-free next step in well under 200 ms without costing a move. 演示解法 (watch a solution) plays a whole verified no-damage route move by move; manual input is locked while it runs and the result is never written to your records. Sound effects are synthesised with Web Audio (no audio files) and the header mute toggle is remembered between visits.

支持键盘（方向键 / WASD / 空格等待 / R 重开）、屏幕方向按钮、鼠标悬停提示，以及手机端棋盘滑动。航线提示按钮在完整规则上运行启发式 A\*（含激光、暗影兽、守卫与道具），200ms 内给出无伤下一步且不消耗步数。演示解法会逐步播放一条已验证的无伤通关路线，播放期间锁定手动输入，且结果不计入纪录。音效由 Web Audio 现场合成（无音频文件），页头提供静音开关并记住偏好。

### Folder Structure / 目录结构

| Path 路径 | Purpose 用途 |
|---|---|
| `outputs/index.html` | The complete deliverable — the playable game (交付物：可游玩的游戏本体) |
| `tests/game-test.cjs` | Automated acceptance suite driving headless Chrome via CDP (自动化验收脚本，通过 CDP 驱动无头 Chrome) |
| `tests/screenshots.cjs` | Regenerates the feature close-ups without running the whole suite (单独重出功能特写截图) |
| `tests/results.json` | Test report: 32 cases, all passed (测试报告：32 项全部通过) |
| `tests/*.png` | Test screenshots: full pages plus header / progress / footer / help close-ups (截图) |
| `log/memory/` | Development memory logs (开发日志) |

### Verification / 验证情况

The test suite (`game-test.cjs`, 32 checks) verifies real end-to-end playability: all 15 sectors beatable with no damage and 3 stars (22–56 steps vs. par 40–96), real keyboard input, real touch swipes, save persistence across refresh, the laser cycle, beast pursuit, the boss (laser hits + collision stun), item pickups, failure/retry flow, locked exits until all cores are collected, the hint not costing moves, the demo leaving records untouched, no horizontal overflow at 1440px / 390px / 320px widths, zero JS runtime exceptions, and playable fallback when storage is disabled. `results.json` confirms all passed.

测试套件（32 项）验证了真实的端到端可玩性：全部 15 个星区均可无伤三星通关（22–56 步 vs 目标 40–96 步）、真实键盘输入、真实触屏滑动、刷新后纪录保留、激光节奏、暗影兽追击、暗核守卫（激光击溃 + 撞击晕眩）、道具拾取、失败重试流程、未集齐星核时出口锁定、提示不耗步、演示不计入纪录、1440/390/320 像素宽度下均无横向溢出、零 JS 运行时异常，以及存储被禁用时的降级可玩。`results.json` 确认全部通过。

### Running the tests / 运行测试

Requires Node 18+ and Google Chrome.

需要 Node 18+ 与 Google Chrome。

```
node tests/game-test.cjs      # acceptance suite, 32 checks / 验收套件，32 项
node tests/screenshots.cjs    # regenerate the feature screenshots / 重出功能截图
```

---

## Design note / 设计说明

Every movement rule lives in one pure function, `step(state, direction)`, which returns a new state plus a list of events and touches no DOM, animation or storage. The game loop (`move`), the in-game hint and demo (`planRoute`) and the test suite all search over that same `step`, so a route that is *computed* to be winnable is guaranteed to be *playable* — the two can never drift apart.

所有移动规则都收在一个纯函数 `step(state, direction)` 里：它只接收局面、返回新局面与事件列表，不碰 DOM、动画或存档。游戏主循环（`move`）、航线提示与演示（`planRoute`）以及测试套件都在同一个 `step` 上搜索，因此「算得出通关」与「真的走得通」不可能出现分歧。

`planRoute` runs a heuristic A\* first (tens to hundreds of nodes) and only falls back to an exhaustive breadth-first search if that fails, which is what keeps the hint instant even on the boss sectors.

`planRoute` 先跑启发式 A\*（几十到几百个节点即可收敛），只有未收敛时才退回完备的广度优先搜索兜底——这正是守卫关也能「按下即出」的原因。

That heuristic deliberately *over*-estimates, so its routes are not always the shortest — a measured trade-off, not an oversight. Swapping in an admissible heuristic produces optimal routes but makes the boss sectors cost one to two orders of magnitude more search (sector 14: ~8 ms → 0.7–1.9 s), and the hint has to answer the instant you press the button. The routes it does return run about 1.2–1.6× the true minimum and still land comfortably inside every sector's 3-star step target.

该启发式刻意高估，因此给出的路线不一定最短——这是实测后的取舍，不是疏忽。换成可采纳启发式确实能得到最短路线，但守卫关的搜索量要高出一到两个数量级（第 14 关：约 8ms → 0.7–1.9s），而航线提示必须按下即出。现用启发式给出的路线约为最短长度的 1.2–1.6 倍，且全部落在各关三星步数目标之内。

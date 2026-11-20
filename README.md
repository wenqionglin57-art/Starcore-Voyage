# Starcore Voyage (星核迷航)

Starcore Voyage is a polished, fully-tested, offline-capable HTML5 maze puzzle game with 26 sectors, 18 achievements, a date-seeded daily challenge and a complete QA suite.

**星核迷航** 是一个完整的网页益智游戏项目，使用原生 HTML/CSS/JavaScript 和 Canvas API 开发——零框架、零外部依赖、无需联网。整个游戏封装在单个文件 `outputs/index.html` 中，用浏览器打开即可离线游玩。

---

## Project Overview / 项目概览

**Starcore Voyage** (Chinese: 星核迷航, "Star Core Voyage") is a complete, self-contained web puzzle game project. It was built as a single-page HTML5 game using vanilla HTML/CSS/JavaScript and the Canvas API — no frameworks, no external dependencies, no network required. The whole game ships in one file, `outputs/index.html` (~150 KB), and runs offline by simply opening it in a browser.

**星核迷航** 是一个完整的网页益智游戏项目，使用原生 HTML/CSS/JavaScript 和 Canvas API 开发——零框架、零外部依赖、无需联网。整个游戏封装在单个文件 `outputs/index.html`（约 150 KB）中，用浏览器打开即可离线游玩。

### The Game / 游戏本体

- **Genre**: Grid-based maze puzzle adventure (益智迷宫冒险).
- **Visual style**: Dark sci-fi theme with a signature mint-green accent (#c6f785) and teal/gold/violet highlights; canvas-rendered board with animated starfield, nebula glow, and particle effects.
- **风格**：深色科幻风，标志性薄荷绿点缀，配有动态星空、星云光晕和粒子特效。
- **Levels**: 26 maze sectors (关卡), each a 13×9 grid, **ordered by player-visible hazard** rather than by authoring order (see 难度曲线 below) — the hazard curve rises from 0 to 22 instead of zig-zagging. Mechanics still arrive one at a time, in a fixed teaching sequence: plain movement (1 初次着陆), laser traps (2 微光回廊 — they hold each state for 2 steps, and a sector opens with them **on**), shield pickups (5 螺旋深井), freeze clocks and the first chasing Shadow Beast (10 暗影追猎 — you move one tile, it moves one tile), paired portals (8 星门跳转 — free teleport to the twin tile, the shortcut across half the board), the patrol sentinel (13 哨兵防线 — its position is a pure function of your step count, so it can be read and timed rather than chased), the Core Warden (19 暗核守卫 — 3 HP, lured onto active lasers), ice (3 冰河滑行 — ice `~` carries you along your direction of travel until something blocks you, the whole run costs exactly **one step**, and cores or items lying in the river are swept up as you pass instead of stopping you), the phase shifter (4 相位回廊 — press **Q** to spend a charge and flip every laser's on/off phase in a single step, often cheaper than waiting two), a laser sealed in ice (12 冻结光束 — sliding across it is harmless, but *stopping* on it while the beam is on costs a shield, so the last tile of a slide becomes a decision), and finally the pushable crate `X` + pressure plate `+` + gate `D` triple (26 推箱工坊 — the crate doubles as a wall that blocks a Shadow Beast, and the sector ships with a Beast, thirteen laser traps and three patrol sentinels, so pushing is something you do while being chased rather than a quiet box puzzle). The sectors in between are density, not novelty: 熔核走廊 (17 lasers, plus a shield pickup so the gauntlet is survivable), 守卫围城 (a Warden plus a Beast), 双生守卫 (two Wardens in a laser field), 交织猎影 (40 steps) and 镜面对称 / 交织猎影 / 迷雾裂谷 reuse the same rules at a higher tempo. No sector's name claims to be the ending any more: 归航星门, 交织猎影 and 孤守星门 describe their own mechanic instead, and the arc closes on a puzzle finale built around a pushable crate.
- **Daily challenge**: a new maze every day, and the same one for everyone. The map is generated from the date as a seed and then **verified by the same solver** — a candidate that cannot be finished, or whose optimum falls outside 20–52 steps, is discarded and the seed is advanced, so an unsolvable day cannot exist. The result lives in its own slot (it never touches sector records or the 满护盾 badge) and can be copied as a spoiler-free share card: date, stars, steps against par, and the streak. Weekends get one extra core.
- **每日挑战**：每天一张新迷宫，同一天所有人拿到的是同一张。地图以日期为种子生成，再由**同一个求解器验收**——走不通、或最优步数落在 20–52 之外的候选会被丢弃并顺延种子，因此不存在「无解日」。成绩单独存放（绝不写进星区纪录，也不影响「满护盾通关」徽章），并可复制成一张不剧透的战绩卡：日期、星级、步数与目标、连续天数。周末会多一枚星核。
- **Sector naming note**: no sector claims to be the end any more. Sector 20 was renamed 双生守卫 (TWIN WARDENS) so the two-Warden fight describes itself, and the arc now closes at sector 26, 推箱工坊 (CRATE WORKS) — a puzzle finale built around a pushable crate. Sectors that used to promise finality carry names describing their own mechanic instead: 归航星门 (18), 交织猎影 (22) and 孤守星门 (23).
- **Objective**: Collect all golden cores (星核) in a level, then reach the glowing green exit to unlock the next sector.
- **目标**：收集关卡内全部金色星核，再走进亮起的绿色出口以解锁下一星区。
- **Rating**: 3-star system — full shields + within the target step count = 3 stars; 2+ shields = 2 stars; otherwise 1 star. `par` is set at 1.3–1.45× the proven optimum (30–69 steps), so a 3-star clear is tight but always reachable. The daily challenge carries its own par at 1.2× that day's optimum. Local records are saved via localStorage, and the game degrades gracefully if storage is blocked.
- **评价**：三星评价系统——满护盾且在目标步数内通关得三星，2 格及以上护盾得二星，其余一星。目标步数设在实测最优解的 1.3–1.45 倍（30–69 步），三星通关有挑战但永远可达。每日挑战则用当天最优解的 1.2 倍作为自己的目标步数。通关纪录通过 localStorage 保存在本机，存储被禁用时仍可正常游玩。
- **Undo**: every step is snapshotted (state + lifetime counters + this sector's best record), so `Ctrl+Z` or the 撤销 button rewinds cleanly without letting anyone farm the "300 lifetime steps" badge by walking back and forth. Switching sectors clears the stack.
- **撤销**：每一步都会快照（局面 + 累计统计 + 本关最佳纪录），`Ctrl+Z` 或「撤销」按钮可干净回退，且不会让人靠来回走刷满「累计 300 步」。换关会清空撤销栈。
- **Achievements**: 18 badges (成就徽章) in the sidebar card, with the full collection in a dialog. They span progress (first sector, half the sky, every sector at 3 stars), skill (a flawless run, a no-mistake run through a sector with beasts, a win at 1 shield, 贴地飞行 — finishing within 1.15× the true optimum, a challenge above 3 stars) and discovery (all three item types, 3 Wardens destroyed), plus persistence (300 lifetime steps, 20 waits, 10 route hints) and mastery of the new mechanics (相位掌控 — phase-shift 10 times, 巧推星箱 — push a crate 15 times). Every badge is derived from the saved records plus lifetime counters, so nothing can be unlocked by accident — and the demo mode deliberately feeds neither, which keeps it purely observational.
- **成就**：18 枚徽章，侧栏卡片显示进度，弹窗展示完整收藏。覆盖进度（首个星区、半数星区、全三星）、技巧（满护盾通关、有暗影兽的星区零失误、仅剩 1 格护盾通关、「贴地飞行」——步数不超过真实最优的 1.15 倍，这是三星之上的挑战）与探索（三种道具集齐、击溃 3 名守卫）、坚持（累计 300 步、20 次等待、10 次航线提示）与机制精通（「相位掌控」累计调相 10 次、「巧推星箱」累计推动星箱 15 次）。所有徽章都由存档纪录与累计统计推导，不会误触发；演示解法既不写纪录也不累计统计，因此绝不会解锁成就。
- **Finale**: clearing sector 26 shows a dedicated ending screen instead of the usual sector panel — total stars, lifetime steps, sectors lit and badges earned, plus a particle celebration on the board.
- **终章**：通关第 26 关时展示专门的收尾结算层（累计星数、总步数、点亮星区、成就徽章），并在棋盘上撒出庆祝粒子。

### Controls / 操作方式

Keyboard (arrow keys / WASD / Space to wait / Q to phase-shift / R to restart / H for a hint / Ctrl+Z to undo), on-screen D-pad buttons, a dedicated 原地等待 button sitting directly under the board (the sidebar copy scrolls out of reach on phones), tap-any-adjacent-tile-to-move, and touch swipe on the canvas. On narrow screens the 26-sector tab wall collapses to just the current sector behind a toggle, so the board stays above the fold. The sidebar's 每日挑战 (daily challenge) card starts that day's generated maze and shows the streak and today's best; after a clear it offers a 复制战绩 button. The 航线提示 (route hint) button runs an A\* search over the full rule set — lasers, beasts, boss and items included — and returns a damage-free next step, using an *admissible* minimum-spanning-tree heuristic so the route it shows is the true shortest; repeat presses on the same position are served from a memo cache. 演示解法 (watch a solution) plays a whole verified no-damage route move by move; manual input is locked while it runs and the result is never written to your records. Sound effects are synthesised with Web Audio (no audio files) and the header mute toggle is remembered between visits. 玩法指南 (the rules dialog) opens automatically on a first visit and also carries a reset entry that clears records, achievements and counters.

支持键盘（方向键 / WASD / 空格等待 / Q 调相 / R 重开 / H 提示 / Ctrl+Z 撤销）、屏幕方向按钮、棋盘正下方的「原地等待」按钮（手机侧栏里的那个会被滚出视野）、点击相邻格即移动，以及手机端棋盘滑动。窄屏时 26 个星区的关卡墙会折叠成「当前关 + 展开按钮」，让棋盘留在首屏内。侧栏「每日挑战」卡片用来开始当天的生成迷宫，并显示连续天数与今日最佳；通关后会出现「复制战绩」按钮。航线提示按钮在完整规则上运行 A\*（含激光、暗影兽、守卫与道具），使用「可采纳的最小生成树启发式」，因此给出的就是真正的最短无伤路线；同一局面重复按下会直接命中记忆化缓存。演示解法会逐步播放一条已验证的无伤通关路线，播放期间锁定手动输入，且结果不计入纪录。音效由 Web Audio 现场合成（无音频文件），页头提供静音开关并记住偏好。「玩法指南」首次访问会自动展开，底部还提供清空本地进度的入口。

### Accessibility & robustness / 无障碍与健壮性

- **Keyboard**: full arrow/WASD play, space to wait, R to restart, H for a hint, Ctrl+Z to undo, Escape closes dialogs; gameplay keys are ignored while a dialog is open.
- **Screen readers**: the canvas carries a live `aria-label` describing sector, position, shields, cores and steps; the result overlay is an `aria-modal` dialog whose title takes focus; badges expose 「已解锁 / 未解锁」 as text rather than relying on opacity; the toast is a `role="status"` live region that is shown *before* its text is written, so the announcement actually fires.
- **Contrast**: locked sector numbers, the footer, the legend and the bottom strip were all below 4.5:1 against their backgrounds; they have been raised above it (and the mobile footer text enlarged from 9px to 10–11px).
- **Motion**: `prefers-reduced-motion` freezes the starfield, snapping and particles, and is verified by the suite.
- **No JavaScript**: a `<noscript>` panel explains that the game is local-only and needs JS enabled.
- **No storage**: when localStorage is blocked the game still plays and says so in the footer.

- **键盘**：方向键 / WASD 完整可玩，空格等待、R 重开、H 提示、Ctrl+Z 撤销，Esc 关闭弹窗；弹窗打开时屏蔽游戏按键。
- **读屏**：Canvas 持有一份实时更新的 `aria-label`（星区、坐标、护盾、星核、步数）；结算层是 `aria-modal` 对话框且标题自动获得焦点；徽章把「已解锁 / 未解锁」写成文字而不是只靠透明度；提示条是 `role="status"` 实时区域，且**先显示再写文本**，确保朗读真正触发。
- **对比度**：未解锁关号、页脚、图例与底部说明原本都不足 4.5:1，现已全部提升到该线以上（手机页脚字号从 9px 提到 10–11px）。
- **动效**：`prefers-reduced-motion` 会冻结星空、缓动与粒子，并有测试覆盖。
- **无脚本**：`<noscript>` 面板说明游戏完全在本机运行、需要启用 JavaScript。
- **无存储**：localStorage 被禁用时仍可正常游玩，并在页脚说明。

### Folder Structure / 目录结构

| Path 路径 | Purpose 用途 |
|---|---|
| `outputs/index.html` | The complete deliverable — the playable game (交付物：可游玩的游戏本体) |
| `tests/game-test.cjs` | Automated acceptance suite driving headless Chrome via CDP (自动化验收脚本，通过 CDP 驱动无头 Chrome) |
| `tests/plan-levels.cjs` | Level health check: structure rules + a solved no-damage route, step margin and a mechanics inventory per sector (关卡体检：结构校验 + 每关无伤解法步数、余量与机制清点) |
| `tests/preview-levels.cjs` | Renders every sector as ASCII art for level design review (把关卡画成字符画，便于设计校对) |
| `tests/gen-ice.cjs` | Ice-sector generator: carves a looped maze, converts corridors to ice and lets `planRoute` judge the result (冰面关卡生成器：凿环路迷宫 → 走廊改冰面 → 用 `planRoute` 验收) |
| `tests/difficulty.cjs` | Difficulty audit: scores every sector on the player-visible hazard score and reports inversions in the curve (难度体检：给每关算难度系数，报告曲线倒挂与 par 越界) |
| `tests/resequence.cjs` | Reorder solver: simulated annealing under the teaching-order constraints, with `--apply` to write the result back (关卡重排：在机制教学顺序约束下按难度求解排列) |
| `tests/try-map.cjs` | Map sandbox: swaps a candidate map in at runtime and immediately reports the proven optimum plus which mechanics the optimum actually uses, and whether removing the crate makes the map unsolvable — so a map can be judged before it is written into the page (地图试算器：临时替换候选地图，立刻给出最优解与最优解真正用到的机制，满意后再写进页面) |
| `tests/screenshots.cjs` | Regenerates the feature close-ups without running the whole suite (单独重出功能特写截图) |
| `tests/results.json` | Test report: 71 cases, all passed (测试报告：71 项全部通过) |
| `tests/*.png` | Test screenshots: full pages plus header / progress / footer / help / achievements close-ups the six new-mechanic boards and the daily card (截图：整页 + 页头 / 关卡墙 / 页脚 / 玩法指南 / 成就 / 每日挑战特写，以及六张新机制棋盘) |
| `log/memory/` | Development memory logs (开发日志) |

### Verification / 验证情况

The test suite (`game-test.cjs`, 71 checks) verifies real end-to-end playability: all 26 sectors beatable with no damage and 3 stars (22–52 steps vs. par 30–69), real keyboard input, real touch swipes, tap-to-move on the board, save persistence across refresh, the laser cycle, the phase bar never contradicting itself, beast pursuit, Warden deaths to lasers sector by sector (including the two-Warden finale), item pickups, failure/retry flow, locked exits until all cores are collected, the hint not costing moves, the demo leaving records *and* achievements untouched, undo restoring steps/position/counters and clearing on sector change, the one-shield-per-turn damage cap and entity mutual exclusion (exhaustively over all 26 maps), the achievement pipeline (progress badges after a full clear, counters unlocking on demand, panel and dialog rendering, input isolation while a dialog is open), the cached laser coordinates matching every map, the mobile tab wall collapsing and re-expanding, the board-side wait button being reachable, the finale screen showing the journey totals, no horizontal overflow at 1440px / 390px / 320px widths, zero JS runtime exceptions, and playable fallback when storage is disabled. On top of that it covers the four new mechanics: picking up the phase shifter and flipping the global laser phase in one step (and that 相位回廊's *optimum* actually uses it), pushing a crate onto a pressure plate to open a gate while being blocked when the tile behind the crate is solid, a crate standing between a Beast and the player forcing the Beast to detour rather than walk straight through it — the finale's tip makes exactly that promise, so the promise itself is pinned, the finale being unsolvable once its crate is removed (the gate is the only route to the exit and only the crate can hold it open, so the crate is a mandatory step rather than an optional shortcut), the paired portal being mutually inverse and free, the patrol sentinel's position being a pure function of the step count while still able to deal damage, the damage-budget downgrade (`planRouteAdaptive`) returning a "take N damage" route when no flawless one exists, the per-sector legend plus phase button appearing only where the mechanic is present, and the daily challenge end to end: the same date producing the same map while a different date produces a different one, every generated map being solvable with its par inside a sane band, the daily result never touching campaign records or the 满护盾 counter, the share text carrying the date and steps without leaking the map, the streak arithmetic (consecutive day +1, gap resets, same day idempotent), and the card resetting when you walk back into the campaign. It also covers the two ice mechanics: a slide across eight ice tiles costing exactly one step and stopping at the wall, a core lying in the river being swept up without braking the slide, a frozen laser being harmless to slide over but costing a shield when you stop on it during an *on* turn (and free again on an *off* turn), the per-sector legend showing 冰面 only on 冰河滑行 and 冻结激光 only on 冻结光束, and — the check that keeps both mechanics honest — 冰河滑行's optimum sliding 11 times with a 9-tile run, and 冻结光束's optimum *stopping on a frozen laser twice* while still taking zero damage. `results.json` confirms all passed.

测试套件（71 项）验证了真实的端到端可玩性：全部 26 个星区均可无伤三星通关（22–52 步 vs 目标 30–69 步）、真实键盘输入、真实触屏滑动、棋盘点击移动、刷新后纪录保留、激光节奏、状态栏文案永不自相矛盾、暗影兽追击、暗核守卫被激光逐格击溃（含双守卫的终局关）、道具拾取、失败重试流程、未集齐星核时出口锁定、提示不耗步、演示既不动纪录也不动成就、撤销能回退步数/位置/统计且换关清栈、单回合伤害上限与实体互斥占位（对 26 张地图穷举）、成就链路（通关后进度类徽章到手、累计统计按需解锁、卡片与弹窗渲染、弹窗打开时输入隔离）、激光坐标缓存与地图逐一吻合、窄屏关卡墙折叠与展开、棋盘旁等待按钮可达、终章结算层展示旅程总账、1440/390/320 像素宽度下均无横向溢出、零 JS 运行时异常，存储被禁用时的降级可玩；此外还覆盖四项新机制——拾取相位器后一步翻转全局激光相位（并验证「相位回廊」的**最优解**确实用到它）、把星箱推上压力板开门且箱后为实心墙时推不动、星箱挡在暗影兽与玩家之间时暗影兽必须绕行而不是径直穿过（终章提示就是这么承诺的，所以连这句承诺本身也被钉住了）、拿掉星箱后终章直接无解（闸门是通往出口的唯一通路，而闸门只有箱子压得住，因此推箱是必经一步而不是可选捷径）、成对传送门互逆且不额外耗步、巡逻哨兵位置由步数唯一决定但仍能造成伤害、无无伤解时 `planRouteAdaptive` 降档给出「承受 N 格伤害」的路线，机制图例与调相按钮只在对应关卡出现；以及每日挑战的完整链路——同一天生成同一张图、换一天换图、每张生成图都可解且目标步数落在合理区间、每日成绩绝不写进战役纪录与「满护盾通关」统计、分享文案含日期与步数且不泄漏地图、连续天数（连天 +1 / 断档重置 / 同日幂等）、返回战役后卡片复位；以及两项冰面机制——一次滑过 8 格冰面只算 1 步并停在墙前、躺在冰河里的星核被顺手收走且不刹停滑行、冻结激光滑过无害但停在开启的那一回合会掉 1 格护盾（关闭的回合则安全）、图例只在「冰河滑行」显示「冰面」且只在「冻结光束」显示「冻结激光」，还有让两个机制都无法退化成装饰的那条断言——「冰河滑行」的最优解滑行 11 次、最长一段 9 格，「冻结光束」的最优解**两次停在冻结激光上**却仍然零伤害。`results.json` 确认全部通过。

### Running the tests / 运行测试

Requires Node 18+ and Google Chrome.

需要 Node 18+ 与 Google Chrome。

```
node tests/game-test.cjs      # acceptance suite, 71 checks / 验收套件，71 项
node tests/screenshots.cjs    # regenerate the feature screenshots / 重出功能截图
node tests/plan-levels.cjs    # level health check, all sectors / 全部关卡体检
node tests/plan-levels.cjs 18 22   # only two named sectors / 只看指定的两关
node tests/preview-levels.cjs # ASCII preview of every sector / 全部关卡的字符画预览
node tests/optimal-levels.cjs # proven per-sector optimum + par margin / 各关实测最优解与目标余量
```

---

## Design note / 设计说明

Every movement rule lives in one pure function, `step(state, direction)`, which returns a new state plus a list of events and touches no DOM, animation or storage. The game loop (`move`), the in-game hint and demo (`planRoute`) and the test suite all search over that same `step`, so a route that is *computed* to be winnable is guaranteed to be *playable* — the two can never drift apart.

所有移动规则都收在一个纯函数 `step(state, direction)` 里：它只接收局面、返回新局面与事件列表，不碰 DOM、动画或存档。游戏主循环（`move`）、航线提示与演示（`planRoute`）以及测试套件都在同一个 `step` 上搜索，因此「算得出通关」与「真的走得通」不可能出现分歧。

`planRoute` runs an A\* search with an **admissible** heuristic — a minimum spanning tree over the remaining cores plus the exit, built from a lazily-computed all-pairs BFS distance table that is cached per sector. Because the heuristic never over-estimates, A\* returns the true shortest damage-free route, and it does so 10–37× faster than the previous over-estimating variant. A complete BFS fallback remains for the pathological cases.

`planRoute` 使用带**可采纳**启发式的 A\*：对「剩余星核 + 出口」求最小生成树，距离来自按关惰性构建并缓存的全局 BFS 距离表。由于启发式永不高估，A\* 返回的就是真正最短的无伤路线，且比之前的「刻意高估」版本快 10–37 倍。极端局面下仍有完备的广度优先搜索兜底。

The earlier design deliberately *over*-estimated the remaining cost, which made the hint fast but not always shortest — and once `par` was tightened to ~1.3× the optimum, following a 1.4× route could cost a player their 3rd star. That trade-off is no longer acceptable, so the heuristic was replaced rather than the par relaxed.

早先的实现刻意高估剩余代价，好处是提示够快，代价是路线不总是最短；而当目标步数收紧到最优解的约 1.3 倍后，「跟着提示走却掉到二星」就成了真问题。与其放宽目标步数，不如把启发式换掉——这条取舍已经不再成立。

The single biggest constraint on difficulty used to be that the rules recognised only one kind of success: taking *zero* damage. `planRoute` now takes a `damageBudget`, and `planRouteAdaptive` walks it down 0 → 1 → 2 — so when no flawless route exists, the hint and the demo still produce a playable route and say how much damage it costs, instead of failing outright. That is what finally lets a sector be *hard* rather than merely long.

过去限制难度的一条硬性前提是：规则只承认「零掉血」这一种成功。现在 `planRoute` 接受一个 `damageBudget`，`planRouteAdaptive` 会按 0 → 1 → 2 逐级降档——当确实不存在无伤解时，提示与演示依然能给出一条可执行的路线，并说明要承受多少伤害，而不是直接失效。这才让一关有可能「难」，而不只是「长」。

The four new mechanics follow the same discipline as the originals: everything that determines the future lives in the state, and nothing else does. The crate positions, the phase flag and the phase charges go into the search key; the gate's open/closed state is a pure function of the plates and the crates, and the patrol sentinel's position is a pure function of the step count, so neither of them costs the search a single extra node. Portals are modelled as zero-cost edges in the BFS distance table via 0-1 BFS, which keeps the heuristic admissible — the hint stays both fast and genuinely shortest.

Ice needed no new state at all: a slide is a deterministic function of the map, so `step` simply keeps advancing while the next tile is ice (or a core/item it may sweep up) and stops otherwise. The only thing that had to be got right was the *heuristic*: `slideStatic` reproduces the same slide for the BFS distance table while ignoring crates, gates and beasts, which can only ever make a distance **shorter**, so the heuristic stays admissible and the hint still returns the true optimum on the two ice sectors.

四项新机制沿用与原有规则完全相同的纪律：凡是决定未来的东西都放进状态，其余一律不进。星箱位置、相位标志与相位充能进搜索键；闸门开合由压力板与星箱唯一决定、巡逻哨兵位置由步数唯一决定，因此两者都不给搜索增加任何节点。传送门在 BFS 距离表里被建成 0 代价边（用 0-1 BFS），启发式的可采纳性得以保持——提示既快，又确实是真正最短的那条。

冰面则完全不需要新状态：滑行是地图的确定性函数，`step` 只要在下一格仍是冰面（或是可以顺手收走的星核/道具）时继续前进、否则停下即可。真正要小心的是**启发式**——`slideStatic` 为 BFS 距离表复刻同一套滑行，同时忽略星箱、闸门与暗影兽，而忽略只可能让距离**更短**，因此启发式依然可采纳，两个冰面关卡上提示给出的仍是真正的最优路线。

### The difficulty curve / 难度曲线

Difficulty here is not a matter of taste: `tests/difficulty.cjs` computes one number per sector, and `tests/resequence.cjs` solves the running order against it. The number is the hazard a player can literally count on the board:

```
hazard = 1 × laser tile  +  2 × patrol sentinel  +  3 × (Shadow Beast + Core Warden)
```

Lasers cycle on and off, sentinels move on a fixed step-count rhythm, and the two enemy types chase, block and have to be predicted, so they cost more than a static tile. The curve climbs from 0 to 22 across the 26 sectors; the only two adjacent dips are the ice tutorial (sector 3, deliberately hazard-free so sliding can be learned in isolation) and one debut pair (sector 11, −1). The finale closes at 22: 推箱工坊 stacks thirteen lasers, one Beast and three patrol sentinels on top of the crate / plate / gate puzzle, and still resolves in 52 steps with no damage. Sentinels were chosen over extra Beasts or Wardens for the last stretch because their position is a pure function of the step count — they add visible danger without adding search states, whereas piling on more lasers blocked the only route (the crate must stay mandatory: remove it and the sector is unsolvable) and adding chasing enemies made the searcher time out.

Earlier models were tried and rejected. Weighting a "learning load" bonus at 25 made the two-laser debut score higher than a three-laser, four-core sector — the bonus was manufacturing the inversions. Dropping it entirely stranded low-hazard tutorial sectors mid-curve, and folding step count into the score made long-but-safe sectors read as hard as short-but-deadly ones, so the step numbers players actually see jumped around. Hazard alone is the axis that can be read at a glance, so it is now the only sort key. Teaching order is a hard constraint instead of a score bonus: the finale is fixed last, ice precedes the frozen beam, and the debut sector of a mechanic must come before every sector using it. A bug once keyed those debuts by stale numeric indices from before an earlier reorder, so the solver was optimising against the wrong scores; debuts are now keyed by sector **name**.

Some weak sectors were **strengthened rather than reshuffled**, because reordering cannot fix a sector that is simply too easy. 暗影追猎 was the debut of the Beast yet the second-easiest sector in the game: 24 steps, zero lasers, and a four-corridor maze in which 24 was the structural floor — adding cores or rerouting the walls did not move the optimum. The fix was to raise danger *density* rather than length: three lasers plus the Beast, so "you move, it moves" is learned while counting laser phases. 星门跳转 went from zero to four lasers and the finale from two to thirteen lasers plus three sentinels, lifting the low end of the curve without breaking any sector identity.

**Saves are keyed by map fingerprint, not by sector number.** Reordering would otherwise shift every record onto a neighbouring sector, so `levelKey()` hashes the map, the save carries the fingerprint order it was written with, and loading maps each stored record back onto whichever slot that map occupies now. Old saves carry no fingerprint table, so they are migrated through a hard-coded copy of the first layout fingerprints — a reorder costs nobody their progress. `tests/game-test.cjs` pins both directions.

一关有多难不靠感觉：`tests/difficulty.cjs` 给每关算一个分数，`tests/resequence.cjs` 照着它解出关卡顺序。这个分数就是玩家在地图上能直接数出来的危险度：

```
hazard = 1 × 激光格  +  2 × 巡逻哨兵  +  3 × (暗影兽 + 暗核守卫)
```

激光按节奏开关，哨兵的位置只看步数，暗影兽与守卫会追、会挡、要预判，所以敌人比静态格子更贵。26 关的危险度从 0 爬到 22；仅有的两处相邻回撤是第 3 关「冰河滑行」（刻意不设危险，让滑行单独被学会）和第 11 关（−1）。终章以危险度 22 收尾：「推箱工坊」在墙、箱、压力板与闸门之上叠了 13 道激光、1 只暗影兽和 3 名巡逻哨兵，仍然能在 52 步内无伤通关。最后一段选哨兵而不是继续加兽或守卫，是因为哨兵位置由步数唯一决定——危险看得见，却不增加搜索状态；继续加激光会堵死唯一通路（箱子必须保持必经——拿掉它就必须无解），加追击敌人则会让求解器超时。

更早的模型都试过并否掉了：把「认知负担」按 25 加权，会让只有两道激光的首秀关比「3 激光 + 4 星核」还难，倒挂正是这份加分自己造出来的；完全去掉它，低危险的教学关又被卡在曲线中段；把步数折进去，则「长而安全」的关与「短而致命」的关分数一样，玩家真正看到的步数反而在跳。危险度是唯一能一眼读出来的轴，因此成了唯一排序键。教学顺序改为硬约束而不是加分：终章固定在最后，冰面必须在冻结激光之前，某机制的教学关必须排在所有使用该机制的关之前。曾经有个 bug 用重排前的旧数字索引记录教学关，求解器一直在错误的分数上优化；现在一律按关卡**名**查表。

弱关靠**加强**而不是再排一次——重排救不了一个本身就太简单的关。「暗影追猎」是暗影兽首秀，却曾是全游戏第二简单：24 步、零激光，而那座四通横廊的迷宫 24 步已是结构下限，加星核、改墙都纹丝不动。解法是提高危险的**密度**而不是长度：加 3 道激光、保留 1 只暗影兽，于是「你走一步它走一步」是在同时数激光节奏的情况下学会的。「星门跳转」从零激光加到 4 道，终章从 2 道加到 13 道并补上 3 名哨兵，抬起了曲线的低端而没有破坏任何关卡的身份。

**存档按地图指纹索引，而不是关卡序号。** 否则一重排，每条纪录都会串到隔壁关。`levelKey()` 对地图做哈希，存档里带着写入时的指纹顺序，加载时按「这张地图现在是第几关」把纪录放回去。旧存档没有指纹表，就用第一版布局的硬编码指纹表迁移，因此重排不会让任何人丢进度。`tests/game-test.cjs` 双向钉住了这个行为。

New sectors are designed against the same solver rather than by hand: `tests/plan-levels.cjs` loads the page, checks each map's structural invariants (13×9, exactly one start and one exit) and then asks `planRoute` for a no-damage route, reporting the step count, the margin to `par` and the search time. `tests/optimal-levels.cjs` then proves the exact per-sector minimum, and `OPTIMAL_STEPS` records that table in the page so `par` and the 贴地飞行 badge are both pinned to a *proven* number rather than a guess. `par` is set at 1.3–1.45× that optimum, so a 3-star run is always provably reachable — the whole 26-sector set is re-verified on every test run.

新关卡不是靠手感，而是对着同一个求解器设计的：`tests/plan-levels.cjs` 会加载页面，校验每张地图的结构不变量（13×9、单一起点与出口），再让 `planRoute` 求出一条无伤路线，输出步数、相对目标步数的余量与搜索耗时。`tests/optimal-levels.cjs` 进一步证明每关的精确最优解，页面里的 `OPTIMAL_STEPS` 就记着这张表，因此目标步数与「贴地飞行」徽章都钉在**已被证明**的数字上，而不是估出来的。目标步数设在最优解 1.3–1.45 倍，三星通关永远可证——整套 26 关在每次跑测试时都会重新验证一遍。

The daily challenge is the same discipline turned inward: instead of hand-authoring a level and then measuring it, the game generates a maze from the date and lets `planRoute` judge it. Because the generator only accepts candidates the solver can finish inside a fixed band, "procedural" never means "possibly broken" — and because the seed is the date itself, every player on a given day faces the identical board without a server.

每日挑战是同一套纪律的内向应用：不是先手写关卡再测量，而是用日期生成迷宫、让 `planRoute` 当裁判。生成器只接受求解器能在固定区间内走通的候选，所以「程序生成」不等于「可能坏掉」；而种子就是日期本身，因此在没有服务器的情况下，同一天的每位玩家面对的也是同一张棋盘。

The renderer keeps the per-frame work proportional to what actually changes: the static board layer (walls and floor) is cached per sector and per device-pixel-ratio, laser coordinates are precomputed per sector instead of rescanning the map every frame, the three nebula gradients are cached and only their radius is animated (they used to be rebuilt every frame), the canvas backing store follows the CSS width instead of a fixed 728×504, and the direction / wait / hint buttons are queried once instead of on every move. Repeated hint or demo requests on an unchanged position are served from a memo cache, so the second press is instant even on the search-heavy sectors.

渲染层的每帧开销只与实际变化的部分成正比：静态棋盘层（墙体与地面）按「关卡 + 像素比」缓存，激光坐标按关预计算而不再逐帧扫描地图，三团星云的渐变改为缓存、只对半径做动画（过去是逐帧重建），Canvas 后备缓冲区跟着 CSS 实际宽度走而不是写死 728×504，方向 / 等待 / 提示按钮只查询一次而不是每次移动都查。同一局面重复请求航线提示或演示会命中记忆化缓存，因此即便是搜索量最大的星区，第二次按下也是瞬时的。

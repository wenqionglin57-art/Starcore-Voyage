'use strict';

/*
 * Feature screenshots — a small companion to game-test.cjs.
 *
 * game-test.cjs already writes the three full-page shots (desktop / mobile /
 * mobile-result) as part of the acceptance run. This script exists for the
 * close-ups: the header controls, the sector tabs with their star badges, the
 * board footer (hint + demo buttons, idle and running), the achievements card
 * plus the full badge panel, the four new-mechanic boards (phase shifter,
 * pushable crate, portal pair, patrol sentinel), and the daily-challenge card
 * with its shareable result. It is handy when reviewing a UI change without
 * re-running the whole suite.
 *
 *   node tests/screenshots.cjs
 *
 * Requires Node 18+ (for the global WebSocket) and Google Chrome.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const GAME = path.join(ROOT, 'outputs/index.html');

const child = spawn(
  BROWSER,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    `--user-data-dir=${path.join(__dirname, 'browser-profile')}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] }
);

let socket;
let counter = 0;
const pending = new Map();
const events = [];

async function main() {
  const wsUrl = await new Promise((resolve, reject) => {
    let log = '';
    const t = setTimeout(() => reject(new Error('timeout ' + log.slice(-800))), 25000);
    child.on('error', reject);
    child.on('exit', (c) => {
      clearTimeout(t);
      reject(new Error('exited ' + c + ' ' + log.slice(-800)));
    });
    child.stderr.on('data', (d) => {
      log += d;
      const m = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(t);
        resolve(m[1]);
      }
    });
  });

  socket = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    socket.addEventListener('open', res, { once: true });
    socket.addEventListener('error', rej, { once: true });
  });

  socket.addEventListener('message', (ev) => {
    const d = JSON.parse(ev.data);
    if (d.id) {
      const p = pending.get(d.id);
      if (p) {
        pending.delete(d.id);
        clearTimeout(p.t);
        d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result);
      }
      return;
    }
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].method === d.method) {
        const e = events.splice(i, 1)[0];
        clearTimeout(e.t);
        e.res(d.params);
      }
    }
  });

  function send(method, params = {}, sessionId) {
    return new Promise((res, rej) => {
      const id = ++counter;
      const t = setTimeout(() => {
        pending.delete(id);
        rej(new Error('CDP timeout ' + method));
      }, 60000);
      pending.set(id, { res, rej, t });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  const created = await send('Target.createTarget', { url: 'about:blank' });
  const att = await send('Target.attachToTarget', { targetId: created.targetId, flatten: true });
  const sid = att.sessionId;
  const cmd = (m, p = {}) => send(m, p, sid);
  const waitEvent = (m) =>
    new Promise((res, rej) => {
      const e = { method: m, res, t: setTimeout(() => rej(new Error('event timeout ' + m)), 15000) };
      events.push(e);
    });

  const evaluate = async (expr) => {
    const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };

  const navigate = async () => {
    const loaded = waitEvent('Page.loadEventFired');
    await cmd('Page.navigate', { url: pathToFileURL(GAME).href });
    await loaded;
  };

  const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

  // CDP clips are in document coordinates, while getBoundingClientRect() is
  // viewport-relative — so we centre the element and add the scroll offset back.
  const clip = async (name, sel, scale = 2) => {
    await evaluate(`document.querySelector('${sel}').scrollIntoView({block:'center'})`);
    await settle(150);
    const box = await evaluate(`(()=>{const b=document.querySelector('${sel}').getBoundingClientRect();
      const x=Math.max(0,b.left+scrollX-12), y=Math.max(0,b.top+scrollY-12);
      return {x,y,width:b.width+24,height:b.height+24};})()`);
    const shot = await cmd('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { ...box, scale },
    });
    fs.writeFileSync(path.join(__dirname, name), Buffer.from(shot.data, 'base64'));
    console.log('  wrote', name, `${Math.round(box.width)}x${Math.round(box.height)}`);
  };

  const viewport = (width, height, mobile) =>
    cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });

  await cmd('Page.enable');
  await cmd('Runtime.enable');

  // Start from a clean save so the star badges show a realistic early state.
  // SEEN_KEY 也一并清掉再关弹窗：首次访问会自动展开玩法指南，留着它会把每个截图
  // 都盖上一层遮罩。
  await viewport(1440, 1200, false);
  await navigate();
  await evaluate('localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(SEEN_KEY)');
  await navigate();
  await evaluate("$('helpDialog').open&&$('helpDialog').close()");

  // Play a few sectors so the tabs show a mix of stars, then sit on a laser
  // sector where the footer tip carries the most information.
  // freshState() 由页面导出，随机制一起演进——这里不再手抄状态字段，
  // 否则新增机制（箱子 / 相位器 / 传送门…）时截图会静默少字段。
  await evaluate(`(()=>{
    for (let i=0;i<5;i++){
      loadLevel(i);
      const route=planRoute(freshState(i));
      if (route) for (const d of route) move(d);
    }
    save();
    // loadLevel() refuses locked sectors, so ask for the furthest one we own.
    loadLevel(Math.min(9, unlocked()));
  })()`);
  await settle(400);

  console.log('desktop 1440');
  await clip('header-desktop.png', '.site-header');
  await clip('progress-desktop.png', '.levels');
  await clip('footer-desktop.png', '.board-footer');
  // 「当前任务」卡片现在排在最前，三星条件 / 最佳纪录 / 激光相位都在这里。
  await clip('mission-desktop.png', '.mission');
  await clip('board-wait-desktop.png', '.board-wait');

  // The demo button should flip to a highlighted "stop" state.
  await evaluate("$('demoButton').click()");
  await settle(700);
  console.log(
    '  demo active:', await evaluate('demo.active'),
    '| label:', await evaluate("$('demoLabel').textContent"),
    '| pressed:', await evaluate("$('demoButton').getAttribute('aria-pressed')")
  );
  await clip('footer-demo.png', '.board-footer');
  await evaluate("$('demoButton').click()");
  console.log('  after stop:', await evaluate('demo.active'), await evaluate("$('demoLabel').textContent"));

  // The rules dialog — useful when checking the wording of the mechanics.
  await evaluate("$('helpButton').click()");
  await settle(350);
  await clip('help-desktop.png', '#helpDialog');
  await evaluate("$('closeHelp').click()");
  await settle(200);

  // Achievements: the sidebar card, then the full badge panel.
  console.log('  badges unlocked:', await evaluate("$('achCount').textContent"));
  await clip('achievements-desktop.png', '.achievements-card');
  await evaluate("$('achOpenButton').click()");
  await settle(350);
  await clip('badges-desktop.png', '#achievementDialog');
  await evaluate("$('closeAchievementsButton').click()");
  await settle(200);

  // 新机制特写（第 21–26 关）：相位器 / 可推箱 / 传送门 / 巡逻哨兵 / 冰面 / 冻结激光各截一张棋盘图。
  // 这几关默认锁着，loadLevel() 对未解锁星区会静默返回，所以先把前面各关的纪录补齐。
  await evaluate(`(()=>{
    for(let i=0;i<LEVELS.length-1;i++) if(!store.records[i]) store.records[i]={moves:1,stars:3};
    save(); renderTabs();
  })()`);
  // 按关卡名取索引：重排后写死的序号会截到别的关，截出来还是「通过」但内容是错的。
  for (const [levelName, name] of [
    ['相位回廊', 'mechanic-phase.png'],
    ['推箱工坊', 'mechanic-crate.png'],
    ['星门跳转', 'mechanic-portal.png'],
    ['哨兵防线', 'mechanic-sentinel.png'],
    ['冰河滑行', 'mechanic-ice.png'],
    ['冻结光束', 'mechanic-frozen.png'],
  ]) {
    await evaluate(`loadLevel(LEVELS.findIndex(l=>l.name===${JSON.stringify(levelName)}));state.hp=3;state.phaseCharges=1;updateUI();draw();`);
    await settle(300);
    console.log('  sector', await evaluate('state.level+1'), await evaluate('LEVELS[state.level].name'));
    await clip(name, '.game-panel', 1.5);
  }

  // 每日挑战：侧栏卡片、进入后的棋盘、通关后的分享按钮。
  await evaluate('genDaily(dailyStamp());loadDaily()');
  await settle(350);
  await clip('daily-card-desktop.png', '.daily-card');
  console.log('  daily par:', await evaluate('DAILY.par'), '| optimal:', await evaluate('DAILY.optimal'));
  await evaluate('(()=>{const r=planRoute(state);if(r)for(const d of r)move(d);})()');
  await settle(700);
  console.log('  daily cleared:', await evaluate('state.won'), '| share visible:', await evaluate("!$('shareButton').hidden"));
  await clip('daily-result-desktop.png', '#resultOverlay');
  await evaluate("$('resultOverlay').hidden=true");
  // 回到战役再切手机视口：每日模式下关卡墙是隐藏的，直接截会得到 0×0。
  await evaluate('loadLevel(0)');

  await viewport(390, 900, true);
  await settle(400);
  console.log('mobile 390  scrollWidth:', await evaluate('document.documentElement.scrollWidth'));
  await clip('header-mobile.png', '.site-header');
  // 折叠态下的关卡墙：只剩当前关 + 一个展开按钮。
  await clip('progress-mobile.png', '#levelTabs');
  await clip('levels-toggle-mobile.png', '.levels-toggle');
  await clip('footer-mobile.png', '.board-footer');
  await clip('board-wait-mobile.png', '.board-wait');
  await clip('achievements-mobile.png', '.achievements-card');
  await clip('daily-card-mobile.png', '.daily-card');

  // 终章结算层：把 1~19 关补齐后走完最后一关，抓一张「旅程总账」。
  await viewport(1440, 1200, false);
  await evaluate(`(async()=>{
    for(let i=0;i<LEVELS.length-1;i++){
      const r=planRoute(freshState(i),400000);
      if(r) store.records[i]={moves:r.length,stars:3};
    }
    save();loadLevel(LEVELS.length-1);
    const route=planRoute(state);
    for(const d of route) move(d);
  })()`);
  await settle(900);
  console.log('finale overlay open:', await evaluate("!$('resultOverlay').hidden"));
  await clip('finale-desktop.png', '#resultOverlay');

  await send('Browser.close');
  socket.close();
}

main()
  .catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const p of pending.values()) clearTimeout(p.t);
    for (const e of events) clearTimeout(e.t);
    if (socket) socket.close();
    if (child.exitCode === null) child.kill();
  });

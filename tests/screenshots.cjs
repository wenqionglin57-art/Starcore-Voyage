'use strict';

/*
 * Feature screenshots — a small companion to game-test.cjs.
 *
 * game-test.cjs already writes the three full-page shots (desktop / mobile /
 * mobile-result) as part of the acceptance run. This script exists for the
 * close-ups: the header controls, the sector tabs with their star badges, and
 * the board footer (hint + demo buttons, idle and running). It is handy when
 * reviewing a UI change without re-running the whole suite.
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
  await viewport(1440, 1200, false);
  await navigate();
  await evaluate('localStorage.removeItem(STORAGE_KEY)');
  await navigate();

  // Play a few sectors so the tabs show a mix of stars, then sit on a laser
  // sector where the footer tip carries the most information.
  await evaluate(`(()=>{
    const fresh=i=>{const p=parseMap(LEVELS[i]);return {level:i,x:p.start.x,y:p.start.y,moves:0,hp:3,mask:0,
      cores:p.cores,traps:p.traps,items:p.items,monsters:p.monsters,bosses:p.bosses,exit:p.exit,
      over:false,won:false,freezeTurns:0,bootsTurns:0};};
    for (let i=0;i<5;i++){
      loadLevel(i);
      const route=planRoute(fresh(i));
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

  await viewport(390, 900, true);
  await settle(400);
  console.log('mobile 390  scrollWidth:', await evaluate('document.documentElement.scrollWidth'));
  await clip('header-mobile.png', '.site-header');
  await clip('progress-mobile.png', '.levels');
  await clip('footer-mobile.png', '.board-footer');

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

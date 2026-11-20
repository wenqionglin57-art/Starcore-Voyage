'use strict';
// 冰面关卡生成器（开发期用）：生成「冰面滑行」候选地图，用页面里的 planRoute 当裁判验收。
//   node tests/gen-ice.cjs
// 收图条件：无伤可解 + 最优步数落在区间 + 滑行次数/最长滑行达标。
// 关键：迷宫必须凿环路——完美迷宫只有唯一解，冰面就没有任何取舍。
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '..');
const BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const child = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${path.join(ROOT, 'tests', 'browser-profile')}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket, counter = 0; const pending = new Map(), events = [];

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const W = 13, H = 9;
const isCell = (x, y) => x > 0 && x < W - 1 && y > 0 && y < H - 1 && x % 2 === 1 && y % 2 === 1;

function maze(rand, loopP) {
  const g = Array.from({ length: H }, () => Array(W).fill('#'));
  g[1][1] = '.';
  const visited = new Set(['1,1']); const stack = [[1, 1]];
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const nb = [];
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const nx = x + dx, ny = y + dy;
      if (isCell(nx, ny) && !visited.has(nx + ',' + ny)) nb.push([nx, ny, dx, dy]);
    }
    if (!nb.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = nb[(rand() * nb.length) | 0];
    g[y + dy / 2][x + dx / 2] = '.'; g[ny][nx] = '.';
    visited.add(nx + ',' + ny); stack.push([nx, ny]);
  }
  // 凿环路：打通夹在两块空地之间的墙，让同一目标有多条走法（冰面才有取舍）
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (g[y][x] !== '#') continue;
    const h = g[y][x - 1] !== '#' && g[y][x + 1] !== '#';
    const v = g[y - 1] && g[y - 1][x] !== '#' && g[y + 1] && g[y + 1][x] !== '#';
    if ((h || v) && rand() < loopP) g[y][x] = '.';
  }
  return g;
}

function bfs(g, sx, sy) {
  const d = Array.from({ length: H }, () => new Array(W).fill(-1));
  d[sy][sx] = 0; const q = [[sx, sy]];
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (g[ny] && g[ny][nx] && g[ny][nx] !== '#' && d[ny][nx] === -1) { d[ny][nx] = d[y][x] + 1; q.push([nx, ny]); }
    }
  }
  return d;
}

function build(rand, opt) {
  const g = maze(rand, opt.loop);
  const d0 = bfs(g, 1, 1);
  const cells = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (g[y][x] !== '#' && d0[y][x] > 0) cells.push([x, y, d0[y][x]]);
  cells.sort((a, b) => b[2] - a[2]);
  const [ex, ey] = cells[0];
  g[ey][ex] = 'E';
  const floor = cells.filter(([x, y]) => g[y][x] === '.' && !(x === 1 && y === 1));
  for (const [x, y] of floor) {
    if (rand() > opt.q) continue;
    if (g[y][x] !== '.') continue;
    g[y][x] = '~';
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => g[y + dy] && g[y + dy][x + dx] === '.');
    if (dirs.length && rand() < 0.8) {
      const [dx, dy] = dirs[(rand() * dirs.length) | 0];
      const len = 1 + ((rand() * opt.ext) | 0);
      for (let k = 1; k <= len; k++) {
        const nx = x + dx * k, ny = y + dy * k;
        if (!g[ny] || g[ny][nx] !== '.') break;
        g[ny][nx] = '~';
      }
    }
  }
  const far = cells.filter(([x, y]) => g[y][x] === '.' && d0[y][x] >= opt.coreMinD);
  for (let i = far.length - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0;[far[i], far[j]] = [far[j], far[i]]; }
  let placed = 0;
  for (const [x, y] of far) {
    if (placed >= opt.cores) break;
    if (g[y][x] !== '.') continue;
    g[y][x] = '*'; placed++;
  }
  if (placed < opt.cores) return null;
  g[1][1] = 'S';
  return g.map(r => r.join(''));
}

function show(map, trace) {
  const grid = map.map(r => [...r]);
  if (trace) trace.forEach((p, i) => { const [x, y] = p.split(',').map(Number); if (grid[y][x] === '.' || grid[y][x] === '~') grid[y][x] = String.fromCharCode(97 + (i % 26)); });
  return grid.map((r, i) => String(i).padStart(2) + ' ' + r.join('')).join('\n');
}

async function main() {
  const wsUrl = await new Promise((res, rej) => { let log = ''; const t = setTimeout(() => rej(new Error('startup ' + log.slice(-500))), 25000); child.on('error', rej); child.on('exit', c => { clearTimeout(t); rej(new Error('exit ' + c)); }); child.stderr.on('data', d => { log += d; const m = log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) { clearTimeout(t); res(m[1]); } }); });
  socket = new WebSocket(wsUrl);
  await new Promise((r, j) => { socket.addEventListener('open', r, { once: true }); socket.addEventListener('error', j, { once: true }); });
  socket.addEventListener('message', ev => { const d = JSON.parse(ev.data); if (d.id) { const p = pending.get(d.id); if (p) { pending.delete(d.id); clearTimeout(p.timer); d.error ? p.reject(new Error(JSON.stringify(d.error))) : p.resolve(d.result); } } else { for (let i = events.length - 1; i >= 0; i--) if (events[i].method === d.method) { const e = events.splice(i, 1)[0]; clearTimeout(e.timer); e.resolve(d.params); } } });
  const send = (m, p = {}, s) => new Promise((res, rej) => { const id = ++counter; const t = setTimeout(() => { pending.delete(id); rej(new Error('timeout ' + m)); }, 300000); pending.set(id, { resolve: res, reject: rej, timer: t }); socket.send(JSON.stringify({ id, method: m, params: p, ...(s ? { sessionId: s } : {}) })); });
  const created = await send('Target.createTarget', { url: 'about:blank' });
  const att = await send('Target.attachToTarget', { targetId: created.targetId, flatten: true }); const sid = att.sessionId;
  const cmd = (m, p = {}) => send(m, p, sid);
  const waitEvent = m => new Promise((res, rej) => { events.push({ method: m, resolve: res, timer: setTimeout(() => rej(new Error('ev ' + m)), 20000) }); });
  const ev = async e => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900)); return r.result.value; };
  await cmd('Page.enable'); await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
  const loaded = waitEvent('Page.loadEventFired');
  await cmd('Page.navigate', { url: pathToFileURL(path.join(ROOT, 'outputs/index.html')).href }); await loaded;
  await ev("localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(SEEN_KEY)");
  const loaded2 = waitEvent('Page.loadEventFired');
  await cmd('Page.navigate', { url: pathToFileURL(path.join(ROOT, 'outputs/index.html')).href }); await loaded2;
  await ev("$('helpDialog').open&&$('helpDialog').close()");

  await ev(`window.__evalMap=function(map){
    const saved=LEVELS[0].map; LEVELS[0].map=map; distTables.clear(); planCache.clear();
    let out={};
    try{
      const st=stateFromMap(map,0);
      const t0=performance.now();
      const route=planRoute(st,60000,0);
      out.ms=Math.round(performance.now()-t0);
      out.len=route?route.length:null;
      if(route){
        let cur=st,slides=0,trace=[],maxSlide=0;
        for(const d of route){const r=step(cur,d);cur=r.state;
          const sl=(r.events||[]).filter(e=>e.type==='slide');
          slides+=sl.length;sl.forEach(e=>{if(e.tiles>maxSlide)maxSlide=e.tiles;});
          trace.push(cur.x+','+cur.y);}
        out.slides=slides;out.maxSlide=maxSlide;out.hp=cur.hp;out.won=!!cur.won;out.trace=trace;
      }
    }catch(e){out.err=String(e&&e.message||e);}
    LEVELS[0].map=saved; distTables.clear(); planCache.clear();
    return out;
  };`);

  const hits = [];
  for (let seed = 1; seed <= 900 && hits.length < 8; seed++) {
    const rand = mulberry32((seed * 2654435761) % 4294967296);
    const opt = { loop: 0.10 + rand() * 0.18, q: 0.20 + rand() * 0.25, ext: 2 + ((rand() * 3) | 0), cores: 2 + ((rand() * 2) | 0), coreMinD: 8 + ((rand() * 8) | 0) };
    const map = build(rand, opt);
    if (!map) continue;
    const r = await ev(`__evalMap(${JSON.stringify(map)})`);
    if (!r || r.err) continue;
    if (r.len && r.won && r.hp === 3 && r.slides >= 5 && r.maxSlide >= 6 && r.len >= 30 && r.len <= 38) {
      hits.push({ seed, map, ...r });
      console.log('\n=== seed ' + seed + ' len=' + r.len + ' slides=' + r.slides + ' maxSlide=' + r.maxSlide + ' ms=' + r.ms);
      console.log(JSON.stringify(map));
      console.log(show(map, r.trace));
    }
  }
  console.log('\nhits', hits.length);
  await send('Browser.close'); socket.close();
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; }).finally(() => { for (const p of pending.values()) clearTimeout(p.timer); for (const e of events) clearTimeout(e.timer); if (socket) socket.close(); if (child.exitCode === null) child.kill(); });

'use strict';
// 关卡排序优化（开发期用）：难度系数是关卡的固有属性（与排列无关），
// 在「新机制首秀不能太早」的软约束下，找一个让难度曲线尽量单调的排列。
//   node tests/resequence.cjs            只打印建议
//   node tests/resequence.cjs --apply    写回 outputs/index.html
//
// 难度 D = 40*opt/optMax + 35*risk/riskMax + 25*learn/learnMax
//   risk  = 激光 + 敌人×3 + 冰面×0.5 + 星核×1.5
//   learn = 该关在「原始设计顺序」下首次引入的机制数（固定，不随排列变化）
const path = require('node:path');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const ROOT = path.resolve(__dirname, '..');
const BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TOL = 0;      // 严格单调：后一关绝不允许比前一关简单（浮点噪声除外）
const child = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${path.join(__dirname, 'browser-profile')}`, 'about:blank'], {stdio: ['ignore', 'ignore', 'pipe']});
let socket, counter = 0;
const pending = new Map(), events = [];
async function main() {
  const wsUrl = await new Promise((resolve, reject) => {
    let log = '';
    const t = setTimeout(() => reject(new Error('startup timeout ' + log.slice(-800))), 25000);
    child.on('error', reject);
    child.on('exit', c => { clearTimeout(t); reject(new Error('exited ' + c + ' ' + log.slice(-800))); });
    child.stderr.on('data', d => { log += d; const m = log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) { clearTimeout(t); resolve(m[1]); } });
  });
  socket = new WebSocket(wsUrl);
  await new Promise((res, rej) => { socket.addEventListener('open', res, {once: true}); socket.addEventListener('error', rej, {once: true}); });
  socket.addEventListener('message', ev => {
    const d = JSON.parse(ev.data);
    if (d.id) { const p = pending.get(d.id); if (p) { pending.delete(d.id); clearTimeout(p.timer); d.error ? p.reject(new Error(JSON.stringify(d.error))) : p.resolve(d.result); } }
    else { for (let i = events.length - 1; i >= 0; i--) if (events[i].method === d.method) { const e = events.splice(i, 1)[0]; clearTimeout(e.timer); e.resolve(d.params); } }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++counter; const timer = setTimeout(() => { pending.delete(id); reject(new Error('timeout ' + method)); }, 300000); pending.set(id, {resolve, reject, timer}); socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})})); });
  const created = await send('Target.createTarget', {url: 'about:blank'});
  const attached = await send('Target.attachToTarget', {targetId: created.targetId, flatten: true});
  const sid = attached.sessionId;
  const cmd = (m, p = {}) => send(m, p, sid);
  const waitEvent = m => new Promise((res, rej) => { events.push({method: m, resolve: res, timer: setTimeout(() => rej(new Error('event timeout ' + m)), 15000)}); });
  const evaluate = async e => { const r = await cmd('Runtime.evaluate', {expression: e, returnByValue: true, awaitPromise: true}); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  await cmd('Page.enable'); await cmd('Runtime.enable');
  const loaded = waitEvent('Page.loadEventFired');
  await cmd('Page.navigate', {url: pathToFileURL(path.join(ROOT, 'outputs/index.html')).href});
  await loaded;

  const raw = await evaluate(`(()=>{
    const c=(f,ch)=>f.split(ch).length-1;
    return LEVELS.map((l,i)=>{const f=l.map.join('');
      return {i,name:l.name,sub:l.subtitle,par:l.par,opt:OPTIMAL_STEPS[i],
        laser:c(f,'^')+c(f,'\\u2248'),ice:c(f,'~')+c(f,'\\u2248'),cores:c(f,'*'),
        crate:c(f,'X'),plate:c(f,'+'),gate:c(f,'D'),portal:c(f,'O'),
        phase:c(f,'%'),patrol:c(f,'P'),boss:c(f,'@'),wraith:c(f,'M')};
    });
  })()`);

  const optMax = Math.max(...raw.map(r => r.opt));
  const riskOf = r => r.laser + (r.boss + r.wraith) * 3 + r.ice * 0.5 + r.cores * 1.5;
  const riskMax = Math.max(...raw.map(riskOf));

  // 首秀关按「关卡名」指定，与排列无关（与 difficulty.cjs 用同一张表）。
  // 上一版用数字索引，重排后索引漂移、learn 加到了错误的关卡上，
  // 优化器等于在错误的目标函数上求解——这是必须修掉的 bug。
  // 星箱 / 压力板 / 闸门是三个独立概念，必须分开算，否则分母塌成 1。
  const FIRST = {
    激光: '微光回廊', 暗影兽: '暗影追猎', 守卫: '暗核守卫',
    星箱: '推箱工坊', 压力板: '推箱工坊', 闸门: '推箱工坊',
    传送门: '星门跳转', 相位器: '相位回廊', 哨兵: '哨兵防线', 冰面: '冰河滑行',
  };
  const idxOf = name => raw.findIndex(r => r.name === name);
  const learn = raw.map(r => Object.keys(FIRST).filter(k => FIRST[k] === r.name).length);

  const learnMax = Math.max(1, ...learn);
  const D = raw.map(r => r.laser + 2 * r.patrol + 3 * (r.wraith + r.boss)); // 玩家感知危险度：激光1 + 哨兵2 + 敌人3

  // 软约束：新机制首秀关不能太早（保持「激光 → 敌人 → 机关 → 冰面」的认知梯度）
  const floorOf = {};
  const FLOOR = {}; // 不再按固定槽位钉首秀关：教学靠 tip + 自然递增的难度梯度
  Object.keys(FLOOR).forEach(k => {
    const j = idxOf(FIRST[k]);
    if (j >= 0) floorOf[j] = Math.max(floorOf[j] || 0, FLOOR[k]);
  });
  // 冰河滑行（纯冰面）必须先于冻结光束（冰面 + 激光），否则「滑过安全 / 停下受伤」无从教起。
  const ICE = idxOf('冰河滑行'), FROZEN = idxOf('冻结光束');

  const penalty = perm => {
    let pen = 0;
    // 硬约束：第 1 关必须是无激光的纯教学关，第 2 关是激光首秀（否则新手第一关就挨打）
    if (perm[0] !== 0) pen += 1e7;
    if (perm[1] !== 1) pen += 1e7;
    // 逆序对：任何「后面的关比前面的关简单超过 TOL」都要罚，
    // 否则优化器会把大落差摊成许多小落差，整条曲线变成「先升后降」的双峰。
    for (let i = 0; i < perm.length; i++)
      for (let j = i + 1; j < perm.length; j++) {
        const d = D[perm[j]] - D[perm[i]];
        if (d < -TOL) pen += (d + TOL) ** 2;
      }
    perm.forEach((idx, pos) => { const f = floorOf[idx]; if (f !== undefined && pos < f) pen += (f - pos) ** 2 * 400; });
    if (perm.indexOf(ICE) > perm.indexOf(FROZEN)) pen += 1e7;
    // 终章固定最后；机制首秀关必须排在第一个出现该机制的关之前。
    if (perm[perm.length - 1] !== idxOf('推箱工坊')) pen += 1e7;
    const MECHF = {laser:'微光回廊', wraith:'暗影追猎', boss:'暗核守卫',
      crate:'推箱工坊', portal:'星门跳转', phase:'相位回廊', patrol:'哨兵防线', ice:'冰河滑行'};
    for (const k of Object.keys(MECHF)) {
      const fi = idxOf(MECHF[k]); if (fi < 0) continue;
      const fp = perm.indexOf(fi);
      for (let pp = 0; pp < fp; pp++) if ((raw[perm[pp]][k] || 0) > 0) pen += 1e7;
    }
    return pen;
  };

  let seed = 20261029;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let cur = raw.map((_, i) => i);
  let curP = penalty(cur), best = cur.slice(), bestP = curP;
  for (let it = 0; it < 1200000; it++) {
    const T = 80 * Math.pow(0.999997, it);
    const a = Math.floor(rnd() * cur.length), b = Math.floor(rnd() * cur.length);
    if (a === b) continue;
    const next = cur.slice();
    [next[a], next[b]] = [next[b], next[a]];
    const np = penalty(next);
    const d = np - curP;
    if (d <= 0 || rnd() < Math.exp(-d / Math.max(0.01, T))) { cur = next; curP = np; }
    if (curP < bestP - 1e-9) { best = cur.slice(); bestP = curP; }
  }

  console.log(`当前惩罚 ${penalty(raw.map((_, i) => i)).toFixed(1)} → 优化后 ${bestP.toFixed(1)}（TOL=${TOL}）`);
  console.log(`需要挪动 ${best.filter((v, i) => v !== i).length} 关\n`);
  console.log('新序  名称        原序   opt   D      新机制');
  best.forEach((idx, j) => {
    console.log(String(j + 1).padStart(3), raw[idx].name.padEnd(8, '　'), String(idx + 1).padStart(4),
      String(raw[idx].opt).padStart(4), String(D[idx]).padStart(6), ' ', learn[idx] ? '★' + learn[idx] : '');
  });
  console.log('\n新 D 序列:', best.map(i => D[i].toFixed(1)).join(' '));
  const bad = [];
  for (let i = 1; i < best.length; i++) { const d = D[best[i]] - D[best[i - 1]]; if (d < -TOL) bad.push(`L${i}→L${i + 1} ${d.toFixed(1)}（${raw[best[i - 1]].name}→${raw[best[i]].name}）`); }
  console.log(bad.length ? `\n仍有断崖 ${bad.length} 处：\n  ` + bad.join('\n  ') : `\n✓ 所有回撤都在 ${TOL} 分以内`);

  if (process.argv.includes('--apply')) {
    const fs = require('node:fs');
    const FILE = path.join(ROOT, 'outputs/index.html');
    const rawHtml = fs.readFileSync(FILE, 'utf8');
    const CRLF = rawHtml.includes('\r\n');
    let html = rawHtml.replace(/\r\n/g, '\n');
    const start = html.indexOf('const LEVELS = [');
    const end = html.indexOf('\n];', start);
    const head = html.slice(0, start) + 'const LEVELS = [';
    const body = html.slice(start + 'const LEVELS = ['.length, end);
    // 每块统一成「不带尾逗号」的形式再拼：原数组最后一块没有逗号，
    // 直接搬到中间就会粘成 `]} {name:...`，整个脚本语法错误。
    const blocks = body.split(/\n (?=\{name:')/).filter(x => x.trim())
      .map(b => b.trim().replace(/,$/, ''));
    if (blocks.length !== 26) throw new Error('关卡块数量异常 ' + blocks.length);
    html = head + '\n ' + best.map(idx => blocks[idx]).join(',\n ') + html.slice(end);
    const om = html.match(/const OPTIMAL_STEPS = \[([^\]]*)\]/);
    const oldOpt = om[1].split(',').map(x => x.trim());
    html = html.replace(om[0], `const OPTIMAL_STEPS = [${best.map(i => oldOpt[i]).join(', ')}]`);
    // RISK_STEPS：冒险路线的 one/two 两步数表，必须与 OPTIMAL_STEPS 同序重排。
    const rs = html.indexOf('const RISK_STEPS = {');
    const re = html.indexOf('};', rs);
    if (rs < 0 || re < 0) throw new Error('RISK_STEPS 结构未识别');
    const rblock = html.slice(rs, re + 2);
    const r1 = rblock.match(/one:\s*\[([^\]]*)\]/), r2 = rblock.match(/two:\s*\[([^\]]*)\]/);
    if (!r1 || !r2) throw new Error('RISK_STEPS 数组未识别');
    const oldOne = r1[1].split(',').map(x => x.trim()), oldTwo = r2[1].split(',').map(x => x.trim());
    const newBlock = `const RISK_STEPS = {\n one: [${best.map(i => oldOne[i]).join(', ')}],\n two: [${best.map(i => oldTwo[i]).join(', ')}]\n};`;
    html = html.slice(0, rs) + newBlock + html.slice(re + 2);
    fs.writeFileSync(FILE, CRLF ? html.replace(/\n/g, '\r\n') : html);
    // 测试里的精确最优基线同步重排。
    const TEST = path.join(__dirname, 'optimal-levels.cjs');
    let ts = fs.readFileSync(TEST, 'utf8');
    const tcrlf = ts.includes('\r\n');
    ts = ts.replace(/\r\n/g, '\n');
    const bm = ts.match(/const BASELINE = \[([^\]]*)\]/);
    if (!bm) throw new Error('BASELINE 结构未识别');
    const oldBase = bm[1].split(',').map(x => x.trim());
    ts = ts.replace(bm[0], `const BASELINE = [${best.map(i => oldBase[i]).join(', ')}]`);
    fs.writeFileSync(TEST, tcrlf ? ts.replace(/\n/g, '\r\n') : ts);
    fs.writeFileSync(path.join(__dirname, 'resequence-map.json'), JSON.stringify({tol: TOL, perm: best, from: raw.map(r => r.name), to: best.map(i => raw[i].name), D: best.map(i => +D[i].toFixed(1))}, null, 1));
    console.log('\n✓ 已写回 outputs/index.html');
  }
  socket.close(); child.kill();
}
main().catch(e => { console.error(e); child.kill(); process.exit(1); });

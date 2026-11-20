'use strict';
// 关卡体检工具（开发期迭代用，不属于验收套件）。
// 对 outputs/index.html 里的每一个关卡做结构校验，并用页面内的 planRoute()
// 求出一条“不受伤”的通关路线，输出步数与目标步数的余量。
//   node tests/plan-levels.cjs            # 全部关卡
//   node tests/plan-levels.cjs 15 16 17   # 只看指定关（从 0 开始的下标）
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const ROOT = path.resolve(__dirname, '..');
const BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const child = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${path.join(__dirname, 'browser-profile')}`, 'about:blank'], {stdio: ['ignore', 'ignore', 'pipe']});
let socket, counter = 0;
const pending = new Map(), events = [];
async function main() {
  const wsUrl = await new Promise((resolve, reject) => {
    let log = '';
    const timeout = setTimeout(() => reject(new Error('Browser startup timeout: ' + log.slice(-1500))), 25000);
    child.on('error', reject);
    child.on('exit', code => { clearTimeout(timeout); reject(new Error('Browser exited ' + code + ': ' + log.slice(-1500))); });
    child.stderr.on('data', data => { log += data; const m = log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) { clearTimeout(timeout); resolve(m[1]); } });
  });
  socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, {once: true}); socket.addEventListener('error', reject, {once: true}); });
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.id) { const p = pending.get(data.id); if (p) { pending.delete(data.id); clearTimeout(p.timer); data.error ? p.reject(new Error(JSON.stringify(data.error))) : p.resolve(data.result); } }
    else { for (let i = events.length - 1; i >= 0; i--) { if (events[i].method === data.method) { const e = events.splice(i, 1)[0]; clearTimeout(e.timer); e.resolve(data.params); } } }
  });
  function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++counter;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout ' + method)); }, 120000);
      pending.set(id, {resolve, reject, timer});
      socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
    });
  }
  const created = await send('Target.createTarget', {url: 'about:blank'});
  const attached = await send('Target.attachToTarget', {targetId: created.targetId, flatten: true});
  const sid = attached.sessionId;
  const cmd = (method, params = {}) => send(method, params, sid);
  const waitEvent = method => new Promise((resolve, reject) => { const entry = {method, resolve, timer: setTimeout(() => reject(new Error('Event timeout ' + method)), 15000)}; events.push(entry); });
  const evaluate = async expression => {
    const result = await cmd('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await cmd('Page.enable'); await cmd('Runtime.enable');
  const loaded = waitEvent('Page.loadEventFired');
  await cmd('Page.navigate', {url: pathToFileURL(path.join(ROOT, 'outputs/index.html')).href});
  await loaded;
  // 与验收套件同源的助手：按关卡构造初始局面，供 planRoute() 直接搜索。
  await evaluate("window.__fresh=i=>freshState(i);");

  const shape = await evaluate(`LEVELS.map((l,i)=>({i:i+1,name:l.name,rows:l.map.length,widths:[...new Set(l.map.map(r=>r.length))],cores:(l.map.join('').match(/\\*/g)||[]).length,traps:(l.map.join('').match(/[\\^\u2248]/g)||[]).length,monsters:(l.map.join('').match(/M/g)||[]).length,bosses:(l.map.join('').match(/@/g)||[]).length,items:(l.map.join('').match(/[HFB]/g)||[]).length,starts:(l.map.join('').match(/S/g)||[]).length,exits:(l.map.join('').match(/E/g)||[]).length,crates:(l.map.join('').match(/X/g)||[]).length,plates:(l.map.join('').match(/\\+/g)||[]).length,gates:(l.map.join('').match(/D/g)||[]).length,portals:(l.map.join('').match(/O/g)||[]).length,patrols:(l.map.join('').match(/P/g)||[]).length,phases:(l.map.join('').match(/%/g)||[]).length,ice:(l.map.join('').match(/[~\u2248]/g)||[]).length,frozen:(l.map.join('').match(/\u2248/g)||[]).length}))`);
  const problems = [];
  shape.forEach(s => {
    if (s.rows !== 9) problems.push(`L${s.i} 行数 ${s.rows} ≠ 9`);
    if (s.widths.length !== 1 || s.widths[0] !== 13) problems.push(`L${s.i} 列宽 ${s.widths.join(',')} ≠ 13`);
    if (s.starts !== 1) problems.push(`L${s.i} 起点数 ${s.starts} ≠ 1`);
    if (s.exits !== 1) problems.push(`L${s.i} 出口数 ${s.exits} ≠ 1`);
    if (s.cores < 2) problems.push(`L${s.i} 星核数 ${s.cores} < 2`);
    if (s.portals % 2) problems.push(`L${s.i} 传送门数 ${s.portals} 不是偶数（无法配对）`);
    if (s.gates && !s.plates) problems.push(`L${s.i} 有闸门却没有压力板（永远打不开）`);
    if (s.plates && !s.gates) problems.push(`L${s.i} 有压力板却没有闸门`);
    if (s.crates > 2) problems.push(`L${s.i} 星箱数 ${s.crates} > 2（状态空间过大）`);
    if (s.frozen > s.ice) problems.push(`L${s.i} 冻结激光 ${s.frozen} 多于冰面格 ${s.ice}（冻结激光本身就是冰面，不可能更多）`);
  });
  const wanted = process.argv.slice(2).map(Number).filter(n => Number.isInteger(n));
  const targets = wanted.length ? shape.filter(s => wanted.includes(s.i - 1)) : shape;
  const solved = await evaluate(`(${JSON.stringify(targets.map(t => t.i - 1))}).map(i=>{const t0=performance.now();const route=planRoute(__fresh(i));return {level:i+1,name:LEVELS[i].name,par:LEVELS[i].par,steps:route?route.length:null,ms:Math.round(performance.now()-t0)};})`);
  // §1.4：每关的伤害预算体检。三条档位分别对应「无伤 / 承受 1 格 / 承受 2 格」，
  // 差值就是「掉一格护盾能换多少步」——设计师从此有一个可量化的取舍指标，而不是靠手感。
  const budget = await evaluate(`(${JSON.stringify(targets.map(t => t.i - 1))}).map(i=>{
    const r=[0,1,2].map(b=>{const p=planRoute(__fresh(i),300000,b);return p?p.length:null;});
    return {level:i+1,name:LEVELS[i].name,declared:LEVELS[i].budget,opt:r};})`);
  const budgetOf = new Map(budget.map(b => [b.level, b]));
  console.log('关卡   名称          星核 激光 兽 守 道具 机制             步数   目标   余量   耗时   budget   -1格   -2格');
  solved.forEach(s => {
    const meta = shape.find(x => x.i === s.level);
    const slack = s.steps === null ? '—' : String(s.par - s.steps);
    const flag = s.steps === null ? '  ✗ 无解' : (s.steps > s.par ? '  ✗ 超目标' : '');
    const mech = [meta.crates ? '箱' + meta.crates : '', meta.gates ? '闸' + meta.gates : '', meta.portals ? '门' + meta.portals : '', meta.patrols ? '哨' + meta.patrols : '', meta.phases ? '相' + meta.phases : '', meta.ice ? '冰' + meta.ice : '', meta.frozen ? '冻' + meta.frozen : ''].filter(Boolean).join('') || '—';
    const b = budgetOf.get(s.level);
    const bcol = b ? `${String(b.declared ?? '—').padStart(6)} ${String(b.opt[1] ?? '—').padStart(6)} ${String(b.opt[2] ?? '—').padStart(6)}` : '';
    console.log(`${String(s.level).padStart(2, '0')}    ${s.name.padEnd(12, '　')}  ${meta.cores}   ${String(meta.traps).padStart(2)}  ${meta.monsters}  ${meta.bosses}  ${String(meta.items).padStart(2)}   ${mech.padEnd(8)}   ${String(s.steps ?? '—').padStart(4)}   ${String(s.par).padStart(4)}   ${slack.padStart(4)}   ${String(s.ms).padStart(5)}ms ${bcol}${flag}`);
  });
  const trades = budget.filter(b => b.opt[1] != null && b.opt[1] < b.opt[0]);
  const badBudget = budget.filter(b => !Number.isInteger(b.declared) || b.declared < 1);
  console.log(`\n掉血能换来步数的关：${trades.length}/${budget.length}` + (trades.length ? `（最多省 ${Math.max(...trades.map(b => b.opt[0] - b.opt[1]))} 步）` : ''));
  if (badBudget.length) console.log('✗ 缺少 budget 声明的关：' + badBudget.map(b => 'L' + b.level).join(', '));
  if (problems.length) { console.log('\n结构问题：'); problems.forEach(p => console.log('  ✗ ' + p)); }
  else console.log('\n结构校验通过（13×9 / 单一起点与出口 / 至少 3 枚星核）。');
  const unsolved = solved.filter(s => s.steps === null || s.steps > s.par);
  if (unsolved.length) { console.log('需要修正：' + unsolved.map(s => 'L' + s.level).join(', ')); process.exitCode = 1; }
  if (badBudget.length) process.exitCode = 1;
  await send('Browser.close'); socket.close();
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; }).finally(() => { for (const p of pending.values()) clearTimeout(p.timer); for (const e of events) clearTimeout(e.timer); if (socket) socket.close(); if (child.exitCode === null) child.kill(); });

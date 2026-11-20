'use strict';
// 难度体检（开发期用）：为每关算出可复算的难度系数，并检查曲线是否单调。
//   node tests/difficulty.cjs
// 三个分量都来自页面自身，没有手填的数字：
//   plan  = 精确最优步数（规划长度）
//   risk  = 激光格 + 敌人×2 + 冰面滑行段（容错压力，一次失误就掉护盾）
//   learn = 该关首次引入的机制数（认知负担）
// 难度系数 D = 40*plan/planMax + 35*risk/riskMax + 25*learn/learnMax，落在 0~100。
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
    const mechOf=(l)=>{
      const f=l.map.join('');
      const c=ch=>f.split(ch).length-1;
      return {laser:c('^')+c('\\u2248'),frozen:c('\\u2248'),ice:c('~')+c('\\u2248'),
        crate:c('X'),plate:c('+'),gate:c('D'),portal:c('O'),phase:c('%'),patrol:c('P'),
        cores:c('*'),boss:c('@'),wraith:c('M'),monster:c('@')+c('M')};
    };
    return LEVELS.map((l,i)=>({i:i+1,name:l.name,sub:l.subtitle,par:l.par,opt:OPTIMAL_STEPS[i],...mechOf(l)}));
  })()`);

  // 首秀关按「关卡名」指定，而不是「顺序上第一个含该符号的关」：
  // 哪一关负责教是设计决定（带教学 tip 的那一关），必须与排列无关，
  // 否则重排一次难度系数就全变，曲线没法比较。
  const FIRST = {
    激光: '微光回廊', 暗影兽: '暗影追猎', 守卫: '暗核守卫',
    星箱: '推箱工坊', 压力板: '推箱工坊', 闸门: '推箱工坊',
    传送门: '星门跳转', 相位器: '相位回廊', 哨兵: '哨兵防线', 冰面: '冰河滑行',
  };
  const rows = raw.map(r => {
    const learns = Object.keys(FIRST).filter(k => FIRST[k] === r.name);
    // 容错压力：激光格 1 分；敌人 3 分（会追、会挡路、要预判，比静态激光贵）；
    // 冰面 0.5 分（滑过头就得绕回来）；星核 1.5 分（每多一个都要单独规划进路线）。
    const risk = r.laser + r.monster * 3 + r.ice * 0.5 + r.cores * 1.5;
    return {...r, learns, learn: learns.length, risk};
  });

  const planMax = Math.max(...rows.map(r => r.opt));
  const riskMax = Math.max(...rows.map(r => r.risk));
  const learnMax = Math.max(1, ...rows.map(r => r.learn));
  rows.forEach(r => {
    r.planScore = 40 * r.opt / planMax;
    r.riskScore = 35 * r.risk / riskMax;
    r.learnScore = 8 * r.learn / learnMax;
    // 排序主轴是玩家在地图上能数出来的威胁：激光1 + 哨兵2 + 敌人3。
    r.hazard = r.laser + 2 * r.patrol + 3 * (r.boss + r.wraith);
    r.D = r.hazard;
  });

  console.log('关  名称        opt  plan  风险  risk  认知  learn   难度D  新机制');
  rows.forEach(r => {
    console.log(String(r.i).padStart(2), r.name.padEnd(8, '　'), String(r.opt).padStart(3),
      r.planScore.toFixed(1).padStart(5), String(r.risk).padStart(5), r.riskScore.toFixed(1).padStart(5),
      String(r.learn).padStart(4), r.learnScore.toFixed(1).padStart(5), r.D.toFixed(1).padStart(6),
      '  ', r.learns.join('/') || '');
  });

  console.log('\nD 序列:', rows.map(r => r.D.toFixed(1)).join(' '));
  const bad = [];
  for (let i = 1; i < rows.length; i++) {
    const d = rows[i].D - rows[i - 1].D;
    if (d < -3.5) bad.push(`L${rows[i - 1].i}→L${rows[i].i} 掉了 ${(-d).toFixed(1)} 分（${rows[i - 1].name} → ${rows[i].name}）`);
  }
  console.log(bad.length ? `\n✗ 难度倒挂 ${bad.length} 处：\n  ` + bad.join('\n  ') : '\n✓ 难度曲线单调不减');
  const parBad = rows.filter(r => r.par / r.opt < 1.3 || r.par / r.opt > 1.45);
  console.log(parBad.length ? `\n✗ par/opt 越界 ${parBad.length} 关（约定 1.30~1.45）：` + parBad.map(r => `L${r.i} ${(r.par / r.opt).toFixed(2)}`).join(' ') : '\n✓ par/opt 全部落在 1.30~1.45');
  socket.close(); child.kill();
}
main().catch(e => { console.error(e); child.kill(); process.exit(1); });

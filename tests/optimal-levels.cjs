'use strict';
// 求解器标定工具（开发期用）：把「精确 BFS」与「候选启发式 A*」都注入页面，
// 用同一套 step() 求出每关的无伤最优步数，并对比两者的结果与耗时。
//   node tests/optimal-levels.cjs
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

  await evaluate(`
window.__fresh=i=>freshState(i);
// 精确 BFS：按步数分层，第一个通关状态即最短。上限用于防止意外爆炸。
// floor 是允许掉到的最低护盾：3 = 无伤，2 = 允许承受 1 格，1 = 允许承受 2 格。
// 与 planRoute 的剪枝口径完全一致，因此两者的结果可以直接对账。
window.__exact=(i,cap,floor)=>{const lim=floor===undefined?3:floor;const start=__fresh(i),seen=new Set([planKey(start)]);let frontier=[start],depth=0,nodes=0;
 while(frontier.length){const next=[];
  for(const s of frontier){if(s.over&&s.won)return {steps:depth,nodes};
   for(const dir of Object.keys(DIRS)){const r=step(s,dir);
    if(!r.moved||r.state.hp<=0||r.state.hp<lim)continue;
    const k=planKey(r.state);if(seen.has(k))continue;seen.add(k);if(++nodes>(cap||900000))return {steps:null,nodes,aborted:true};next.push(r.state);}}
  frontier=next;depth++;}
 return {steps:null,nodes};};
// 候选：静态距离表 + MST 下界（可采纳），用来给 A* 提速
window.__mkMST=()=>{const W=13,H=9,dirs=[[0,-1],[1,0],[0,1],[-1,0]],cache=new Map();
 const dist=i=>{let d=cache.get(i);if(d)return d;const map=LEVELS[i].map;d=new Int16Array(W*H*W*H).fill(-1);
  for(let sy=0;sy<H;sy++)for(let sx=0;sx<W;sx++){if(map[sy][sx]==='#')continue;
   const base=(sy*W+sx)*W*H;d[base+sy*W+sx]=0;const q=[[sx,sy]];
   for(let qi=0;qi<q.length;qi++){const cx=q[qi][0],cy=q[qi][1],cd=d[base+cy*W+cx];
    for(const dd of dirs){const nx=cx+dd[0],ny=cy+dd[1];
     if(nx<0||ny<0||nx>=W||ny>=H||map[ny][nx]==='#')continue;
     const ni=base+ny*W+nx;if(d[ni]!==-1)continue;d[ni]=cd+1;q.push([nx,ny]);}}}
  cache.set(i,d);return d;};
 const td=(i,x1,y1,x2,y2)=>{const v=dist(i)[(y1*W+x1)*W*H+y2*W+x2];return v<0?999:v;};
 return st=>{const pts=[];st.cores.forEach((c,i)=>{if(!(st.mask&(1<<i)))pts.push(c);});pts.push(st.exit);
  const n=pts.length+1;if(n<=1)return 0;
  const inT=new Array(n).fill(false),best=new Array(n).fill(Infinity);inT[0]=true;
  for(let j=1;j<n;j++){const p=pts[j-1];best[j]=td(st.level,st.x,st.y,p.x,p.y);}
  let total=0;
  for(let k=1;k<n;k++){let pick=-1;for(let j=1;j<n;j++)if(!inT[j]&&(pick<0||best[j]<best[pick]))pick=j;
   inT[pick]=true;total+=best[pick];const q=pts[pick-1];
   for(let j=1;j<n;j++)if(!inT[j]){const p=pts[j-1],dd=td(st.level,q.x,q.y,p.x,p.y);if(dd<best[j])best[j]=dd;}}
  return total;};};
window.__mst=__mkMST();
// 候选 A*：可采纳启发式 + 同一套 seen 去重
window.__astar=(i,hf,cap)=>{const start=__fresh(i),seen=new Map([[planKey(start),0]]),heap=[];
 const push=n=>{heap.push(n);let j=heap.length-1;while(j>0){const p=(j-1)>>1;if(heap[p].f<=heap[j].f)break;const t=heap[p];heap[p]=heap[j];heap[j]=t;j=p;}};
 const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let j=0;for(;;){const l=2*j+1,r=l+1;let m=j;if(l<heap.length&&heap[l].f<heap[m].f)m=l;if(r<heap.length&&heap[r].f<heap[m].f)m=r;if(m===j)break;const t=heap[m];heap[m]=heap[j];heap[j]=t;j=m;}}return top;};
 push({s:start,g:0,f:hf(start),parent:null});let nodes=0;
 while(heap.length){const cur=pop();if(++nodes>(cap||200000))return {steps:null,nodes,aborted:true};
  if(cur.s.over&&cur.s.won){let n=cur,d=0;while(n.parent){d++;n=n.parent;}return {steps:d,nodes};}
  for(const dir of Object.keys(DIRS)){const r=step(cur.s,dir);
   if(!r.moved||r.state.hp<=0||r.state.hp<3)continue;
   const g=cur.g+1,k=planKey(r.state),b=seen.get(k);
   if(b!==undefined&&b<=g)continue;seen.set(k,g);push({s:r.state,g,f:g+hf(r.state),parent:cur});}}
 return {steps:null,nodes};};
`);

  // 回归基线：每关的精确无伤最优步数。前 20 关最初来自外部评审表，后来地图微调过，
  // 第 4/9/19 关的评审值（34/29/39）已与现地图不符，这里一律以精确 BFS 的结果为准。
  // 只要某一关的基线变了，就说明地图或 step() 规则被改动了——必须显式确认后再更新。
  // 按难度重排后的顺序（第十一轮）。每关的最优步数不变，只是位置变了。
  const BASELINE = [22, 24, 34, 42, 24, 28, 35, 30, 30, 24, 25, 33, 26, 26, 28, 30, 35, 36, 26, 29, 37, 40, 27, 29, 29, 52];
  const page = await evaluate(`OPTIMAL_STEPS`);
  const out = await evaluate(`LEVELS.map((l,i)=>{
    const t0=performance.now();const ex=__exact(i);const t1=performance.now();
    const t2=performance.now();const a1=__astar(i,__mst);const t3=performance.now();
    const t4=performance.now();const a2=__astar(i,planHeuristic);const t5=performance.now();
    return {level:i+1,name:l.name,par:l.par,exact:ex.steps,exactMs:Math.round(t1-t0),exactNodes:ex.nodes,
      mstA: a1.steps, mstMs:Math.round(t3-t2), mstNodes:a1.nodes,
      oldA: a2.steps, oldMs:Math.round(t5-t4), oldNodes:a2.nodes};});`);
  console.log('关卡 名称          基线   精确BFS  MST-A*  旧A*   par   BFS耗时/节点   MST-A*耗时/节点  旧A*耗时/节点');
  let mismatch = 0, tableBad = 0;
  out.forEach((r, i) => {
    const ok = BASELINE[i] === undefined || r.exact === BASELINE[i];
    if (!ok) mismatch++;
    const same = page[i] === r.exact;
    if (!same) tableBad++;
    console.log(`${String(r.level).padStart(2, '0')}   ${r.name.padEnd(10, '　')}  ${String(BASELINE[i] === undefined ? '—' : BASELINE[i]).padStart(6)} ${String(r.exact).padStart(6)} ${String(r.mstA).padStart(6)} ${String(r.oldA).padStart(6)} ${String(r.par).padStart(5)}   ${String(r.exactMs + 'ms/' + r.exactNodes).padStart(14)} ${String(r.mstMs + 'ms/' + r.mstNodes).padStart(16)} ${String(r.oldMs + 'ms/' + r.oldNodes).padStart(14)}${ok ? '' : '   ✗ 与基线不符'}${same ? '' : `   ✗ OPTIMAL_STEPS=${page[i]} 与精确最优不符`}`);
  });
  console.log(mismatch ? `\n✗ 有 ${mismatch} 关偏离回归基线` : `\n✓ ${out.length} 关精确最优全部命中基线`);
  console.log(tableBad ? `✗ OPTIMAL_STEPS 有 ${tableBad} 关写错` : `✓ OPTIMAL_STEPS（${page.length} 项）与精确最优逐关一致`);

  // ── 伤害预算：RISK_STEPS 必须被证明，不能是提示用的 A* 自说自话 ──
  // 三档 floor 分别对应「无伤 / 承受 1 格 / 承受 2 格」。任一档更短就说明掉血能换速度，
  // 这正是 budget 字段与任务卡「冒险路线」的数据来源。
  // 证明策略：全表用 planRoute（游戏自己用的 A*）——它的可采纳性已被上面 floor=3 的
  // 全表精确对账验证过；节点数便宜的关再用精确 BFS 交叉复核。重关（守卫围城/交织猎影等）
  // 在 floor=1 下状态空间翻数倍，精确 BFS 会跑到分钟级，因此不强行跑。
  // 只对「无伤档都极便宜」的关做精确 BFS 复核：floor=1 的状态空间比 floor=3 大一个量级，
  // 中等关卡（如双子猎场）也会跑到分钟级。这是抽样校验，不是全表证明——
  // 全表的可采纳性论证与 floor 无关，无伤档已经用全表精确对账验证过了。
  const CHEAP = 3000;
  const riskPage = await evaluate('RISK_STEPS');
  const risk = await evaluate(`LEVELS.map((l,i)=>{
    const p1=planRoute(freshState(i),300000,1), p2=planRoute(freshState(i),300000,2);
    return {name:l.name,budget:l.budget,one:p1?p1.length:null,two:p2?p2.length:null};})`);
  // 节点数直接复用上表的 exactNodes，不重算。
  const cheapIdx = out.map((r, i) => r.exactNodes <= CHEAP ? i : -1).filter(i => i >= 0);
  const cross = new Array(out.length).fill(null);
  for (const i of cheapIdx) {
    cross[i] = await evaluate(`(()=>{const r1=__exact(${i},400000,2),r2=__exact(${i},400000,1);
      return {one:r1.steps,two:r2.steps,abort:!!(r1.aborted||r2.aborted)};})()`);
  }
  console.log('\n关卡 名称           budget  无伤   -1格   -2格   1伤省下  2伤省下  冒险路线');
  let riskBad = 0, crossBad = 0, crossN = 0;
  risk.forEach((r, i) => {
    const clean = out[i].exact;
    const okOne = riskPage.one[i] === r.one, okTwo = riskPage.two[i] === r.two;
    if (!okOne || !okTwo) riskBad++;
    const c = cross[i];
    let mark = '';
    if (c && !c.abort) {
      crossN++;
      if (c.one !== r.one || c.two !== r.two) { crossBad++; mark = `   ✗ 精确BFS=${c.one}/${c.two}`; }
    }
    const s1 = r.one == null ? null : clean - r.one, s2 = r.two == null ? null : clean - r.two;
    const line = r.two != null && r.two < r.one ? `-2 格 → ${r.two} 步`
      : r.one != null && r.one < clean ? `-1 格 → ${r.one} 步` : '无（掉血换不到步数）';
    console.log(`${String(i + 1).padStart(2, '0')}   ${r.name.padEnd(10, '　')}  ${String(r.budget).padStart(4)} ${String(clean).padStart(6)} ${String(r.one ?? '—').padStart(6)} ${String(r.two ?? '—').padStart(6)}` +
      `${String(s1 ? '-' + s1 : '=0').padStart(9)}${String(s2 ? '-' + s2 : '=0').padStart(9)}   ${line}` +
      `${okOne && okTwo ? '' : `   ✗ 表里写的是 ${riskPage.one[i]}/${riskPage.two[i]}`}${mark}`);
  });
  // 结构性不变量：允许掉血只可能让路线更短，绝不可能更长。
  const mono = risk.every(r => r.two == null || r.one == null || r.two <= r.one)
    && risk.every((r, i) => r.one == null || r.one <= out[i].exact);
  const budgetOk = risk.every(r => Number.isInteger(r.budget) && r.budget >= 1 && r.budget <= 2);
  console.log(riskBad ? `\n✗ RISK_STEPS 有 ${riskBad} 关写错` : `✓ RISK_STEPS（one/two 各 ${risk.length} 项）与求解器逐关一致`);
  console.log(crossBad ? `✗ 有 ${crossBad} 关 A* 与精确 BFS 不一致` : `✓ ${crossN} 关另经精确 BFS 交叉复核，结果一致（其余关状态空间过大，以 A* 为准）`);
  console.log(mono ? '✓ 单调性成立：-2格 ≤ -1格 ≤ 无伤' : '✗ 单调性被破坏：出现「允许掉血反而更长」');
  console.log(budgetOk ? '✓ 每关 budget 都是 1~2 的整数' : '✗ 有关卡的 budget 缺失或越界');
  if (riskBad || crossBad || !mono || !budgetOk) process.exitCode = 1;
  if (tableBad || mismatch) process.exitCode = 1;
  await send('Browser.close'); socket.close();
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; }).finally(() => { for (const p of pending.values()) clearTimeout(p.timer); for (const e of events) clearTimeout(e.timer); if (socket) socket.close(); if (child.exitCode === null) child.kill(); });

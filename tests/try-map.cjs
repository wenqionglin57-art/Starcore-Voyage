'use strict';
// 地图试算器（开发期用）：临时替换某一关的地图，立刻算出最优解与机制使用情况。
//   node tests/try-map.cjs maps.json
// maps.json 形如 [{"name":"暗影追猎","map":["#############",...]}, ...]
// 不写回 outputs/index.html——确认满意后手工改页面里的 LEVELS。
const path = require('node:path');
const fs = require('node:fs');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const ROOT = path.resolve(__dirname, '..');
const BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const child = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${path.join(__dirname, 'browser-profile')}`, 'about:blank'], {stdio: ['ignore', 'ignore', 'pipe']});
let socket, counter = 0;
const pending = new Map(), events = [];

async function main() {
  const cands = JSON.parse(fs.readFileSync(process.argv[2] || path.join(__dirname, 'try-map.json'), 'utf8'));
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

  for (const cand of cands) {
    const rows = cand.map;
    const W = rows[0].length, H = rows.length;
    const bad = [];
    if (H !== 9 || W !== 13) bad.push(`尺寸 ${W}x${H}（应为 13x9）`);
    if ((rows.join('').match(/S/g) || []).length !== 1) bad.push('起点不是恰好一个');
    if ((rows.join('').match(/E/g) || []).length !== 1) bad.push('出口不是恰好一个');
    if (bad.length) { console.log(`\n=== ${cand.name}  ✗ ${bad.join(' / ')}`); continue; }

    const out = await evaluate(`(()=>{
      const i=LEVELS.findIndex(l=>l.name===${JSON.stringify(cand.name)});
      if(i<0)return {err:'页面里没有这一关'};
      const saved=LEVELS[i].map, savedPatrols=patrolsByLevel[i], savedCycle=patrolCyclesByLevel[i];
      LEVELS[i].map=${JSON.stringify(rows)};
      trapsByLevel[i]=[];
      LEVELS[i].map.forEach((row,y)=>[...row].forEach((t,x)=>{if(t==='^'||t==='\\u2248')trapsByLevel[i].push({x,y});}));
      // 候选地图可能新增哨兵：必须同步重建巡逻表，否则试算的是旧巡逻配置。
      patrolsByLevel[i]=[];
      LEVELS[i].map.forEach((row,y)=>[...row].forEach((c,x)=>{
        if(c!=='P')return;
        let a=x,b=x;while(a-1>=0&&row[a-1]!=='#')a--;while(b+1<13&&row[b+1]!=='#')b++;
        const seg=[];for(let k=a;k<=b;k++)seg.push({x:k,y});
        patrolsByLevel[i].push({seg,startIdx:seg.findIndex(cell=>cell.x===x),period:Math.max(1,2*seg.length-2)});
      }));
      patrolCyclesByLevel[i]=patrolsByLevel[i].reduce((c,p)=>lcm(c,p.period),1);
      distTables.clear();planCache.clear();
      const flat=LEVELS[i].map.join('');
      const c=ch=>flat.split(ch).length-1;
      const t0=performance.now();
      const route=planRoute(freshState(i),200000,0);
      const ms=Math.round(performance.now()-t0);
      let cur=freshState(i),slides=0,maxSlide=0,frozen=0,phases=0,pushed=0,damage=0;
      if(route){
        const before=cur.crates.map(k=>k.x+','+k.y).join('|');
        for(const d of route){
          const r=step(cur,d);cur=r.state;
          for(const e of r.events){
            if(e.type==='slide'){slides++;if(e.tiles>maxSlide)maxSlide=e.tiles;}
            if(e.type==='damage')damage++;
          }
          if(d==='phase')phases++;
          if(LEVELS[i].map[cur.y][cur.x]==='\\u2248')frozen++;
        }
        pushed=cur.crates.map(k=>k.x+','+k.y).join('|')!==before?1:0;
      }
      const res={opt:route?route.length:null,won:!!(cur&&cur.won),hp:cur?cur.hp:null,ms,
        cores:c('*'),laser:c('^')+c('\\u2248'),ice:c('~')+c('\\u2248'),monster:c('@')+c('M'),
        crate:c('X'),plate:c('+'),gate:c('D'),portal:c('O'),phase:c('%'),patrol:c('P'),
        slides,maxSlide,frozen,phases,pushed,damage};
      // 星箱必经性：拿掉箱子后是否仍可解（终章必须为 null，否则推箱退化成捷径）。
      if (c('X') > 0) {
        const s2=freshState(i);s2.crates=[];
        const nc=planRoute(s2,200000,0);
        res.noCrate = nc?nc.length:null;
      }
      LEVELS[i].map=saved;
      patrolsByLevel[i]=savedPatrols;patrolCyclesByLevel[i]=savedCycle;
      return res;
    })()`);

    if (out.err) { console.log(`\n=== ${cand.name}  ✗ ${out.err}`); continue; }
    const risk = out.laser + out.monster * 3 + out.ice * 0.5 + out.cores * 1.5;
    const flag = out.won && out.hp === 3 ? '✓ 无伤可解' : (out.opt ? '✗ 有解但掉血' : '✗ 无解');
    const hazard = out.laser + 2 * out.patrol + 3 * out.monster;
    console.log(`\n=== ${cand.name}  ${flag}`);
    console.log(`  最优 ${out.opt} 步  par(1.33)=${out.opt ? Math.round(out.opt * 1.33) : '—'}  risk=${risk}  hazard=${hazard}  用时 ${out.ms}ms`);
    console.log(`  星核 ${out.cores} / 激光 ${out.laser} / 敌人 ${out.monster} / 冰 ${out.ice} / 箱 ${out.crate} 板 ${out.plate} 门 ${out.gate} 传 ${out.portal} 相 ${out.phase} 哨 ${out.patrol}`);
    const used = [out.slides ? `滑行${out.slides}次(最长${out.maxSlide})` : '', out.frozen ? `停冻结激光${out.frozen}次` : '',
      out.phases ? `调相${out.phases}次` : '', out.pushed ? '推箱' : ''].filter(Boolean);
    console.log(`  机制使用: ${used.join(' / ') || '—'}`);
    if (out.noCrate !== undefined) console.log(`  星箱必经: ${out.noCrate === null ? '✓ 拿掉箱子无解' : '✗ 拿掉箱子仍可解(' + out.noCrate + '步)'}`);
  }
  socket.close(); child.kill();
}
main().catch(e => { console.error(e); child.kill(); process.exit(1); });

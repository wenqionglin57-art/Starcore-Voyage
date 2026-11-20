'use strict';
// 星核迷航 · 自动化验收：覆盖 26 个星区、每日挑战、激光机关、暗影兽、暗核守卫、道具、
// 相位器 / 可推箱 / 压力板与闸门 / 传送门 / 巡逻哨兵、成就徽章与响应式布局。路线由页面内的 planRoute()（与 step() 同一套规则）生成，
// 再以真实按键输入重放，保证“算得出来”与“真的走得通”完全一致。
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const ROOT = path.resolve(__dirname,'..');
const BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const child = spawn(BROWSER,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${path.join(__dirname,'browser-profile')}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
let socket,counter=0;const pending=new Map(),events=[],errors=[];const results=[];
function report(name,details){results.push({name,details});console.log('PASS '+name+(details?' | '+JSON.stringify(details):''));}
// 页面内助手：构造某关的初始局面；按方向数组重放并逐回合采集轨迹。
const HELPERS = "window.__fresh=i=>freshState(i);window.__lv=n=>LEVELS.findIndex(l=>l.name===n);window.__play=(route,probe)=>{const keys={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',wait:' ',phase:'q'};const trace=[];for(const d of route){game.dispatchEvent(new KeyboardEvent('keydown',{key:keys[d],bubbles:true}));trace.push(eval(probe));}return {won:state.won,hp:state.hp,moves:state.moves,stars:store.records[state.level]&&store.records[state.level].stars,overlay:!$('resultOverlay').hidden,unlocked:unlocked(),trace};};";
async function main(){
 const wsUrl=await new Promise((resolve,reject)=>{let log='';const timeout=setTimeout(()=>reject(new Error('Browser startup timeout: '+log.slice(-1500))),25000);child.on('error',reject);child.on('exit',code=>{clearTimeout(timeout);reject(new Error('Browser exited '+code+': '+log.slice(-1500)));});child.stderr.on('data',data=>{log+=data;const match=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});});
 socket=new WebSocket(wsUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id){const p=pending.get(data.id);if(p){pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(new Error(JSON.stringify(data.error))):p.resolve(data.result);}}else{if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails);for(let i=events.length-1;i>=0;i--){if(events[i].method===data.method){const e=events.splice(i,1)[0];clearTimeout(e.timer);e.resolve(data.params);}}}});
 function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++counter;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method));},60000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
 const created=await send('Target.createTarget',{url:'about:blank'});const attached=await send('Target.attachToTarget',{targetId:created.targetId,flatten:true});const sid=attached.sessionId;
 const cmd=(method,params={})=>send(method,params,sid);
 const waitEvent=method=>new Promise((resolve,reject)=>{const entry={method,resolve,timer:setTimeout(()=>reject(new Error('Event timeout '+method)),15000)};events.push(entry);});
 const evaluate=async expression=>{const result=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 // HELPERS 只活在当前文档里：每次导航后必须重新注入，否则 __lv / __play 会 undefined。
 const navigate=async()=>{const loaded=waitEvent('Page.loadEventFired');await cmd('Page.navigate',{url:pathToFileURL(path.join(ROOT,'outputs/index.html')).href});await loaded;await evaluate(HELPERS);};
 await cmd('Page.enable');await cmd('Runtime.enable');await cmd('Emulation.setDeviceMetricsOverride',{width:1440,height:1180,deviceScaleFactor:1,mobile:false});
 // 首次访问会自动弹出玩法说明（SEEN_KEY）。自动化脚本要的是「安静」的初始状态，
 // 所以这里连同 SEEN_KEY 一起清掉，再显式关闭弹窗——否则后面每一条依赖键盘输入的
 // 断言都会被 dialog 的输入隔离拦下。
 await navigate();await evaluate('localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(SEEN_KEY)');await navigate();await evaluate("$('helpDialog').open&&$('helpDialog').close()");await evaluate(HELPERS);
 // 1) 初始状态：26 个星区，仅第 1 关解锁
 const LEVEL_TOTAL=await evaluate('LEVELS.length');
 assert.equal(LEVEL_TOTAL,26);
 assert.equal(await evaluate('state.level'),0);
 assert.equal(await evaluate("document.querySelectorAll('.level-tab:disabled').length"),LEVEL_TOTAL-1);
 assert.equal(await evaluate("$('journeyCount').textContent"),`0/${LEVEL_TOTAL}`);
 report(`初始关卡与 ${LEVEL_TOTAL-1} 个未解锁星区`);
 // 1b) 静态 HTML 的默认文案必须和关卡数同步。renderTabs() 会在运行时覆盖它们，
 // 所以这类残留只有在读源码时才看得见——历史上就漏过一次：地图早已 15 关，
 // 页头却还写着「五个星区」、meta 描述还写着「十关」。
 const staticHtml=fs.readFileSync(path.join(ROOT,'outputs/index.html'),'utf8');
 const total=await evaluate('LEVELS.length');
 assert.ok(staticHtml.includes(`>0/${total}<`),`静态旅程计数不是 0/${total}`);
 assert.ok(staticHtml.includes(`${total} 个星区，等你点亮`),`静态旅程文案没有写成“${total} 个星区”`);
 assert.ok(staticHtml.includes(`${total} 个星区 · 随时出发`),`页脚文案没有写成“${total} 个星区”`);
 assert.ok(staticHtml.includes(`${total} 个星区、${await evaluate('ACHIEVEMENTS.length')} 项成就`),'meta 描述与关卡/成就数不同步');
 assert.ok(!/十五关/.test(staticHtml),'静态文案里仍残留「十五关」');
 report('静态默认文案与关卡数同步',{total});
 // 2) 每关都存在“不受伤”的三星路线（页面内搜索，与实际规则同源）
 const routes=await evaluate("LEVELS.map((level,i)=>{const route=planRoute(__fresh(i));const flat=level.map.join('');return {level:i+1,name:level.name,par:level.par,steps:route?route.length:null,route,monsters:(flat.match(/M/g)||[]).length,bosses:(flat.match(/@/g)||[]).length};})");
 routes.forEach(r=>{assert.ok(r.steps,r.name+' 无可行路线');assert.ok(r.steps<=r.par,`${r.name} 最短 ${r.steps} 步 > 目标 ${r.par} 步`);});
 report(`全部 ${LEVEL_TOTAL} 关均可无伤三星通关`,routes.map(({level,name,steps,par})=>({level,name,steps,par})));
 // 2b) 激光坐标缓存必须与地图一一对应（绘制时不再逐帧扫描地图）。
 // 冻结激光 `≈` 也是激光的一种，必须一并计入，否则第 26 关的缓存会多出 6 个。
 const trapCache=await evaluate('LEVELS.map((l,i)=>{const f=l.map.join("");return [(f.split("^").length-1)+(f.split("≈").length-1),trapsByLevel[i].length];})');
 trapCache.forEach(([fromMap,fromCache],i)=>assert.equal(fromCache,fromMap,`第 ${i+1} 关激光缓存数量不符：地图 ${fromMap} / 缓存 ${fromCache}`));
 report('激光坐标缓存与地图一致',{levels:trapCache.length,traps:trapCache.reduce((s,x)=>s+x[0],0)});
 // 3) 真实键盘输入
 await cmd('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
 await cmd('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
 assert.equal(await evaluate('state.x'),2);assert.equal(await evaluate('state.moves'),1);
 report('真实键盘移动');
 // 4) 重开本关 / 撞墙不计步
 await evaluate("$('restartButton').click();move('up')");
 assert.equal(await evaluate('state.moves'),0);
 report('重开本关与撞墙不计步');
 // 5) 玩法弹窗与输入隔离
 await evaluate("$('helpButton').click();game.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
 assert.equal(await evaluate('state.moves'),0);
 await evaluate("$('closeHelp').click()");
 report('玩法弹窗与输入隔离');
 // 演示解法：自动播放无伤路线、屏蔽手动输入、不计入纪录
 const statsBeforeDemo=await evaluate('JSON.stringify(store.stats)');
 await evaluate("$('demoButton').click()");
 assert.equal(await evaluate('demo.active'),true);
 assert.equal(await evaluate("$('demoButton').getAttribute('aria-pressed')"),'true');
 assert.equal(await evaluate("$('demoLabel').textContent"),'停止演示');
 assert.equal(await evaluate("document.querySelector('[data-move=right]').disabled"),true);
 assert.equal(await evaluate("(()=>{const before=state.moves;move('right');return state.moves===before;})()"),true,'演示期间手动输入未被屏蔽');
 let peak=0,finished=false;
 for(let i=0;i<48;i++){
  await new Promise(resolve=>setTimeout(resolve,250));
  const snap=await evaluate('({m:state.moves,active:demo.active})');
  if(snap.m>peak)peak=snap.m;
  if(!snap.active){finished=true;break;}
 }
 assert.ok(finished,'演示未在预期时间内结束');
 assert.ok(peak>=10,`演示几乎没有推进（峰值 ${peak} 步）`);
 assert.equal(await evaluate('state.moves'),0);
 assert.equal(await evaluate('state.over'),false);
 assert.equal(await evaluate('Object.keys(store.records).length'),0);
 // 演示既不写纪录，也不该累积统计或解锁成就
 assert.equal(await evaluate('JSON.stringify(store.stats)'),statsBeforeDemo,'演示模式污染了累计统计');
 assert.equal(await evaluate('Object.keys(store.achievements).length'),0,'演示模式解锁了成就');
 assert.equal(await evaluate("$('demoLabel').textContent"),'演示解法');
 report('演示解法可播放且不计入纪录/成就',{peakSteps:peak});
 // 6) 逐关以真实输入重放三星路线（同时解锁全部星区）
 const bossTraces={},monsterTraces={};
 for(const r of routes){
  assert.equal(await evaluate('state.level'),r.level-1,`应处于第 ${r.level} 关`);
  // 探针同时采集护盾与守卫血量：第 19 关两者都有，必须一次拿全。
  const probe='state.hp+"@"+state.bosses.map(b=>b.hp).join(",")';
  const played=await evaluate(`__play(${JSON.stringify(r.route)},${JSON.stringify(probe)})`);
  assert.equal(played.won,true,`第 ${r.level} 关未通关`);
  assert.equal(played.hp,3,`第 ${r.level} 关未保持满护盾`);
  assert.equal(played.stars,3,`第 ${r.level} 关未获得三星`);
  assert.ok(played.moves<=r.par,`第 ${r.level} 关 ${played.moves} 步超出目标 ${r.par}`);
  assert.equal(played.overlay,true);
  if(r.bosses)bossTraces['L'+r.level]=played.trace.map(v=>v.split('@')[1]);
  if(r.monsters)monsterTraces['L'+r.level]=played.trace.map(v=>Number(v.split('@')[0]));
  if(r.level===1)assert.equal(await evaluate("document.querySelector('[data-level=\"0\"] .level-stars').textContent"),'★★★');
  await evaluate("$('nextButton').click()");
 }
 report(`实际输入通关全部 ${LEVEL_TOTAL} 关`,routes.map(r=>({level:r.level,steps:r.steps,par:r.par})));
 // 7) 暗核守卫确由激光逐格击溃：开局满血，终局全部阵亡（含双守卫的第 20 关）
 assert.ok(Object.keys(bossTraces).length>=4,'守卫关数量异常');
 Object.entries(bossTraces).forEach(([k,trace])=>{
  const full=trace[0].split(',').map(()=>'3').join(',');
  assert.equal(trace[0],full,k+' 守卫开局不是满血：'+trace[0]);
  assert.equal(trace[trace.length-1],'',k+' 守卫未被全部击溃：'+trace.join(' '));
  assert.ok(trace.some(v=>v!==full),k+' 守卫全程未掉血');
 });
 report('暗核守卫由激光逐格击溃',Object.keys(bossTraces));
 // 8) 暗影兽关全程未被抓住
 Object.entries(monsterTraces).forEach(([k,trace])=>assert.ok(trace.every(hp=>hp===3),k+' 被暗影兽抓住'));
 report('暗影兽关全程未被抓住',{levels:Object.keys(monsterTraces)});
 // 9) 全通关与回到起点
 assert.equal(await evaluate("$('journeyCount').textContent"),`${LEVEL_TOTAL}/${LEVEL_TOTAL}`);
 assert.equal(await evaluate("$('journeyText').textContent"),`全部星区三星达成 · ★${LEVEL_TOTAL*3}`);
 assert.equal(await evaluate('state.level'),0);
 report('全通关与返回起点');
 // 10) 刷新后纪录保留
 await navigate();
 assert.equal(await evaluate('Object.keys(store.records).length'),LEVEL_TOTAL);
 await evaluate(HELPERS);
 report('刷新后通关纪录保留');
 // 10b) 成就徽章：与进度直接挂钩的那批应当全部到手
 const ach=await evaluate(`({total:ACHIEVEMENTS.length,got:Object.keys(store.achievements).sort(),count:$('achCount').textContent,titleCount:$('achTitleCount').textContent,bar:$('achBar').style.width,items:document.querySelectorAll('#achGrid .ach-item').length,gotItems:document.querySelectorAll('#achGrid .ach-item.got').length,chips:document.querySelectorAll('#achLatest .ach-chip').length})`);
 assert.equal(ach.total,18);
 assert.equal(ach.items,18);
 assert.equal(ach.gotItems,ach.got.length);
 assert.ok(ach.chips>=1&&ach.chips<=3,`最近解锁徽章数异常：${ach.chips}`);
 assert.equal(ach.count,ach.got.length+'/'+ach.total);
 assert.equal(ach.titleCount,ach.got.length+' / '+ach.total);
 ['first-contact','flawless','stars-10','stars-30','half-sky','all-sky','perfect-chart','boss-slayer','boss-master','untouchable','half-par','marathon'].forEach(id=>assert.ok(ach.got.includes(id),'缺少成就 '+id));
 report('成就徽章随通关进度解锁',{got:ach.got.length,total:ach.total,bar:ach.bar,missing:await evaluate("ACHIEVEMENTS.filter(a=>!store.achievements[a.id]).map(a=>a.id)")});
 // 10c) 成就弹窗：可打开、列出全部徽章、隔离键盘输入
 await evaluate("$('achOpenButton').click()");
 assert.equal(await evaluate("$('achievementDialog').open"),true);
 assert.equal(await evaluate("document.querySelectorAll('#achGrid .ach-item').length"),18);
 await evaluate("game.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
 assert.equal(await evaluate('state.moves'),0,'成就弹窗未隔离键盘输入');
 await evaluate("$('closeAchievementsButton').click()");
 assert.equal(await evaluate("$('achievementDialog').open"),false);
 await evaluate("$('achOpenButton').click();$('closeAchievements').click()");
 assert.equal(await evaluate("$('achievementDialog').open"),false);
 report('成就弹窗可打开并隔离输入');
 // 10d) 累计统计驱动成就：航线提示 10 次、原地等待 20 次
 await evaluate("for(let i=0;i<10;i++)$('hintButton').click()");
 assert.equal(await evaluate('store.stats.hints'),10);
 assert.equal(await evaluate("!!store.achievements['pathfinder']"),true,'未解锁「航线大师」');
 await evaluate("game.dispatchEvent(new KeyboardEvent('keydown',{key:'h',bubbles:true}))");
 assert.equal(await evaluate('store.stats.hints'),11,'H 快捷键没有触发航线提示');
 await evaluate("loadLevel(__lv('初次着陆'));for(let i=0;i<20;i++)move('wait')");
 const waits=await evaluate('store.stats.waits');
 assert.ok(waits>=20,`等待次数未累计：${waits}`);
 assert.equal(await evaluate("!!store.achievements['patient']"),true,'未解锁「静候时机」');
 await evaluate("loadLevel(__lv('初次着陆'));loadLevel(__lv('微光回廊'))");
 assert.ok(await evaluate('staticCache.size>=2'),'静态棋盘缓存未生效：切换关卡后仍应保留各自的静态层');
 report('累计统计驱动成就解锁',{hints:11,waits,staticCache:await evaluate('staticCache.size')});
 // 11) 出口锁定：星核未集齐
 await evaluate("loadLevel(__lv('初次着陆'));state.x=10;state.y=1;move('right')");
 assert.equal(await evaluate('state.won'),false);
 assert.equal(await evaluate("$('exitNote').textContent"),'出口尚未激活');
 report('未集齐星核时出口保持锁定');
 // 12) 出口锁定：守卫未击溃
 await evaluate("loadLevel(__lv('暗核守卫'));state.x=10;state.y=1;state.mask=(1<<state.cores.length)-1;move('right')");
 assert.equal(await evaluate('state.won'),false);
 assert.equal(await evaluate('state.moves'),1);
 assert.match(await evaluate("$('toast').textContent"),/击败暗核守卫/);
 report('暗核守卫未击溃时出口保持锁定');
 // 13) 航线提示不增加步数，且计入暗影兽与守卫
 await evaluate("loadLevel(__lv('初次着陆'));$('hintButton').click()");
 assert.equal(await evaluate('hintDirection!==null'),true);assert.equal(await evaluate('state.moves'),0);
 await evaluate("loadLevel(__lv('暗核守卫'));$('hintButton').click()");
 assert.equal(await evaluate('hintDirection!==null'),true);assert.equal(await evaluate('state.moves'),0);
 assert.match(await evaluate("$('toast').textContent"),/已计入暗影兽与暗核守卫/);
 report('航线提示不增加步数且计入守卫');
 // 14) 激光节奏、护盾扣减、失败与重试
 // 节奏（laserActive = floor(moves/2)%2===0，移动后才判定）：
 //   第 1 步 开启（受伤）→ 第 2、3 步 关闭 → 第 4、5 步 开启 → …
 // 即“每 2 步切换一次”，且关卡开局就是开启状态，所以第一步一定是危险的。
 await evaluate("loadLevel(__lv('微光回廊'));state.x=5;state.y=3;move('right')");
 assert.equal(await evaluate('state.hp'),2);assert.equal(await evaluate('state.moves'),1);
 await evaluate("move('wait')");assert.equal(await evaluate('state.hp'),2);
 await evaluate("move('wait');move('wait');move('wait')");
 assert.equal(await evaluate('state.hp'),0);
 assert.equal(await evaluate('state.over&&!state.won'),true);
 await evaluate("$('nextButton').click()");
 assert.equal(await evaluate('state.hp'),3);assert.equal(await evaluate('state.moves'),0);
 report('激光节奏、护盾扣减、失败与重试');
 // 14b) P0-2 回归：pathFirstStep 的起点与终点重合时必须立即返回 null。
 // 修复前 while(prev.get(k)!==startK) 会取到 undefined 并永远循环，直接把页面卡死。
 const selfPath=await evaluate("pathFirstStep(LEVELS[0],{x:1,y:1},{x:1,y:1})");
 assert.equal(selfPath,null,'起点=终点时应当返回 null');
 assert.equal(await evaluate("pathFirstStep(LEVELS[0],{x:1,y:1},{x:2,y:1}).x"),2);
 report('pathFirstStep 起点=终点不死循环');
 // 14c) P1-5 回归：激光状态栏只描述「下一步」，不能自相矛盾。
 // 修复前前半句用当前相位、后半句用下一步相位，约一半回合会显示
 // 「激光：开启 · 下步安全，可以通过」这种把玩家带沟里的提示。
 const barCopy=await evaluate(`(()=>{
  loadLevel(__lv('微光回廊'));
  const out=[];
  for(let m=0;m<8;m++){
   state.moves=m;updateUI();
   // 相位在页面内算好一并带出，Node 侧只做纯文本比对。
   out.push({m,next:laserActive(m+1),txt:$('trapPhase').textContent});
  }
  loadLevel(__lv('初次着陆'));
  return out;
 })()`);
 barCopy.forEach(({m,next,txt})=>{
  const expectHead=next?'激光：下一步开启':'激光：下一步关闭';
  assert.ok(txt.startsWith(expectHead),`第 ${m} 步激光状态栏文案不符：${txt}`);
  assert.ok(next?txt.includes('危险，勿踩入'):txt.includes('安全，可以通过'),`第 ${m} 步激光状态栏建议与相位矛盾：${txt}`);
 });
 assert.ok(!barCopy.some(({txt})=>txt.includes('开启')&&txt.includes('安全，可以通过')),'状态栏出现了自相矛盾的提示');
 report('激光状态栏只描述下一步且不自相矛盾',{samples:barCopy.slice(0,4).map(o=>o.txt)});
 // 15) 暗影兽按最短路径追击玩家
 await evaluate("loadLevel(__lv('暗影追猎'))");
 const before=await evaluate('({mx:state.monsters[0].x,my:state.monsters[0].y,x:state.x,y:state.y})');
 await evaluate("move('down');move('down')");
 const after=await evaluate('({mx:state.monsters[0].x,my:state.monsters[0].y})');
 const d1=Math.abs(before.mx-after.mx)+Math.abs(before.my-after.my);
 const d0=Math.abs(before.mx-before.x)+Math.abs(before.my-before.y);
 assert.ok(d1<d0,'暗影兽没有靠近玩家');
 report('暗影兽按最短路径追击玩家',{from:[before.mx,before.my],to:[after.mx,after.my]});
 // 16) 撞上暗影兽：扣 1 护盾、退回巢穴附近（玩家不在的那一格），且不重复扣血
 await evaluate("loadLevel(__lv('暗影追猎'));state.x=3;state.y=4;move('right')");
 assert.equal(await evaluate('state.hp'),2);
 const rehomed=await evaluate('({x:state.monsters[0].x,y:state.monsters[0].y,d:Math.abs(state.monsters[0].x-state.monsters[0].spawnX)+Math.abs(state.monsters[0].y-state.monsters[0].spawnY)})');
 assert.ok(rehomed.d<=1,`暗影兽退回的位置离巢穴太远：${rehomed.d} 格`);
 assert.equal(await evaluate('state.monsters[0].x===state.x&&state.monsters[0].y===state.y'),false,'暗影兽退回了玩家所在的格子');
 report('撞上暗影兽扣 1 护盾并退回巢穴附近',rehomed);
 // 16b) P0-1 回归：撞上暗影兽后必须退回巢穴附近的**玩家之外**的格子，并重整 1 回合。
 // 修复前它退回巢穴（= 玩家脚下），下一回合走一格就又扑上来，于是每次原地等待都掉血，
 // 6 步内必死，而画面上完全看不出原因（精灵被玩家挡住，气泡还写着「它退回巢穴」）。
 await evaluate("loadLevel(__lv('暗影追猎'));state.x=3;state.y=4;move('right')");
 assert.equal(await evaluate('state.hp'),2);
 const afterCatch=await evaluate('({x:state.monsters[0].x,y:state.monsters[0].y,refit:state.monsters[0].refit})');
 assert.notEqual(`${afterCatch.x},${afterCatch.y}`,'4,4','暗影兽没有退回玩家之外的格子');
 assert.ok(afterCatch.refit>0,'被撞退的暗影兽没有进入重整状态');
 // 撞兽后原地等待 4 步：第 1 步必须完全安全（这就是「重整」给的喘息之机）。
 // 之后被重新追上属于正常追击行为——玩家原地不动本来就该被抓住。
 // 修复前的症状是「每一步都在掉血」，所以这里只需锁死第 1 步。
 const hpTrace=[];
 for(let i=0;i<4;i++){await evaluate("move('wait')");hpTrace.push(await evaluate('state.hp'));}
 assert.equal(hpTrace[0],2,`撞兽后第 1 步不应掉血（重整缓冲失效）：${hpTrace.join('→')}`);
 report('撞兽后暗影兽退回相邻格并重整 1 回合',{afterCatch,hpTrace});
 // 16c) P1-4 回归：同一回合最多只结算 1 格护盾。
 // 修复前「激光 + 暗影兽」「守卫 + 守卫」这类同回合叠加会一次掉 2 血，
 // 而画面上只看得见一次受击。第 20 关的双守卫正是靠这条规则才立得住。
 const perStep=await evaluate(`(()=>{
  const hits=[];
  for(let i=0;i<LEVELS.length;i++){
   for(let y=1;y<8;y++)for(let x=1;x<12;x++){
    if(LEVELS[i].map[y][x]==='#')continue;
    for(let m=0;m<4;m++){
     const s=__fresh(i),d=['up','right','down','left'][m],dx=DIRS[d][0],dy=DIRS[d][1];
     if(LEVELS[i].map[s.y+dy][s.x+dx]==='#')continue;
     s.x=x;s.y=y;s.hp=9;
     const r=step(s,d);
     if(!r.moved)continue;
     const dmg=r.events.filter(e=>e.type==='damage').length;
     if(dmg>1)hits.push({level:i+1,x,y,dir:d,dmg});
    }
   }
  }
  return hits;
 })()`);
 assert.deepEqual(perStep,[],'存在单回合扣多格护盾的组合：'+JSON.stringify(perStep.slice(0,5)));
 report('单回合伤害上限为 1 格护盾（全关卡穷举）',{levels:LEVEL_TOTAL});
 // 16d) P1-4 回归：暗影兽与守卫互斥占位，不会叠在同一格上。
 // 修复前第 20 关第 11 步两名守卫会重叠到 (7,6)，画面上只有一个，撞上去却掉 2 血。
 const overlap=await evaluate(`(()=>{
  const bad=[];
  for(let i=0;i<LEVELS.length;i++){
   for(let m=0;m<4;m++){
    const r=step(__fresh(i),['up','right','down','left'][m]);
    if(!r.moved)continue;
    const all=[...r.state.monsters.map(o=>'M'+o.x+','+o.y),...(r.state.bosses||[]).map(o=>'B'+o.x+','+o.y)];
    if(new Set(all).size!==all.length)bad.push({level:i+1,dir:m,all});
   }
  }
  return bad;
 })()`);
 assert.deepEqual(overlap,[],'暗影兽/守卫出现同格叠加：'+JSON.stringify(overlap.slice(0,3)));
 report('暗影兽与守卫互斥占位（全关卡穷举）');
 // 17) 撞上暗核守卫：扣 1 护盾、退回原点并晕眩 2 回合
 await evaluate("loadLevel(__lv('暗核守卫'));state.bosses[0].x=6;state.bosses[0].y=4;state.x=5;state.y=4;move('right')");
 assert.equal(await evaluate('state.hp'),2);
 assert.equal(await evaluate('state.bosses[0].stunned'),2);
 assert.equal(await evaluate('state.bosses[0].x===state.bosses[0].spawnX&&state.bosses[0].y===state.bosses[0].spawnY'),true);
 report('撞上暗核守卫扣 1 护盾并晕眩 2 回合');
 // 18) 道具：护盾补给 / 冻结钟 / 闪现靴
 await evaluate("loadLevel(__lv('暗影追猎'));state.hp=2;state.x=3;state.y=1;move('right')");
 assert.equal(await evaluate('state.hp'),3);
 assert.equal(await evaluate("store.stats.items.H>=1"),true,'护盾补给未计入统计');
 report('护盾补给恢复 1 格护盾');
 await evaluate("loadLevel(__lv('暗影追猎'));state.x=9;state.y=4;move('right')");
 const frozen=await evaluate('state.freezeTurns');
 assert.ok(frozen>0,'冻结钟未生效');
 const monBefore=await evaluate('({x:state.monsters[0].x,y:state.monsters[0].y})');
 await evaluate("move('wait');move('wait')");
 const monAfter=await evaluate('({x:state.monsters[0].x,y:state.monsters[0].y})');
 assert.deepEqual(monAfter,monBefore,'冻结期间暗影兽仍在移动');
 report('冻结钟让暗影兽静止',{freezeTurns:frozen});
 await evaluate("loadLevel(__lv('孤守星门'));state.x=7;state.y=4;move('right')");
 // P1-2 回归：文案承诺「接下来 2 步免疫激光」，实际必须是 2 步。
 // 修复前拾取当回合就会递减一次，只剩 1 步，玩家按文案走第二步就受伤。
 assert.equal(await evaluate('state.bootsTurns'),2,'拾取闪现靴的当回合不该递减');
 await evaluate("state.x=2;state.y=1;state.moves=3;move('right')");
 assert.equal(await evaluate('state.hp'),3);
 assert.equal(await evaluate('state.bootsTurns'),1,'第二步仍应在免疫保护中');
 await evaluate("state.x=2;state.y=1;state.moves=7;move('right')");
 assert.equal(await evaluate('state.hp'),3,'第二步仍免疫激光');
 assert.equal(await evaluate("store.stats.items.B>=1"),true,'闪现靴未计入统计');
 report('闪现靴免疫激光且足 2 步');
 // 19) 关卡选择、方向按钮与等待按钮
 await evaluate("document.querySelector('[data-level=\"0\"]').click();document.querySelector('[data-move=right]').click();$('waitButton').click()");
 assert.equal(await evaluate('state.moves'),2);
 report('关卡选择、方向按钮与等待按钮');
 // 19b) 撤销：Ctrl+Z 与按钮都能退回上一步，且完整还原步数、护盾与累计统计。
 // 统计必须一起回退，否则「走一步→撤销→再走一步」就能把「长途跋涉」刷满。
 await evaluate("loadLevel(__lv('初次着陆'));move('right');move('right')");
 const beforeUndo=await evaluate('({x:state.x,moves:state.moves,statMoves:store.stats.moves,stack:undoStack.length})');
 assert.equal(beforeUndo.moves,2);
 await evaluate("game.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))");
 const afterUndo=await evaluate('({x:state.x,moves:state.moves,statMoves:store.stats.moves,stack:undoStack.length})');
 assert.equal(afterUndo.moves,1,'Ctrl+Z 未撤销步数');
 assert.equal(afterUndo.x,beforeUndo.x-1,'Ctrl+Z 未撤回位置');
 assert.equal(afterUndo.statMoves,beforeUndo.statMoves-1,'撤销未回退累计统计');
 assert.equal(afterUndo.stack,beforeUndo.stack-1,'撤销栈未出栈');
 await evaluate("$('undoButton').click()");
 assert.equal(await evaluate('state.moves'),0,'撤销按钮未生效');
 assert.equal(await evaluate('undoStack.length'),0);
 await evaluate("$('undoButton').click()");
 assert.equal(await evaluate('state.moves'),0,'空栈撤销不应改变局面');
 // 撤销后重走同一步，应得到与之前完全一致的记录，不存在「倒带刷纪录」
 await evaluate("move('right');move('right')");
 assert.deepEqual(await evaluate('({x:state.x,moves:state.moves})'),{x:beforeUndo.x,moves:beforeUndo.moves});
 // 换关必须清空撤销栈，否则会跨关回退到别的星区
 await evaluate("loadLevel(__lv('微光回廊'))");
 assert.equal(await evaluate('undoStack.length'),0,'换关后撤销栈未清空');
 report('撤销可回退步数/位置/统计且换关清栈',{beforeUndo,afterUndo});
 // 20) 桌面布局
 await evaluate('localStorage.removeItem(STORAGE_KEY)');await navigate();await evaluate("$('toast').hidden=true");
 const desktopLayout=await evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,canvasWidth:game.getBoundingClientRect().width,height:document.documentElement.scrollHeight})');
 assert.ok(desktopLayout.scrollWidth<=desktopLayout.width);
 report('桌面布局无水平溢出',desktopLayout);
 const desktop=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(__dirname,'desktop.png'),Buffer.from(desktop.data,'base64'));
 // 21) 手机布局与真实触摸
 await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate('draw()');
 const mobileLayout=await evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,canvasWidth:game.getBoundingClientRect().width,buttons:[...document.querySelectorAll("[data-move]")].map(b=>({w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height}))})');
 assert.ok(mobileLayout.scrollWidth<=390);assert.ok(mobileLayout.canvasWidth>280);
 report('手机布局无水平溢出',mobileLayout);
 const mobile=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(__dirname,'mobile.png'),Buffer.from(mobile.data,'base64'));
// 21b) P2 回归：窄屏 20 个星区会堆成一面墙，把棋盘挤到首屏之外。
// 折叠态必须只剩当前关，并且展开按钮要能真正把墙放回来。
const tabWall=await evaluate(`(()=>{
 const wall=$('levelTabs'),btn=$('levelsToggle');
 const visible=()=>[...document.querySelectorAll('.level-tab')].filter(t=>t.offsetParent!==null&&t.getBoundingClientRect().height>0).length;
 const collapsed={toggleHidden:btn.hidden,expanded:btn.getAttribute('aria-expanded'),visible:visible(),boardTop:game.getBoundingClientRect().top};
 btn.click();
 const expanded={expanded:btn.getAttribute('aria-expanded'),visible:visible(),boardTop:game.getBoundingClientRect().top};
 btn.click();
 return {collapsed,expanded,back:visible()};
})()`);
assert.equal(tabWall.collapsed.toggleHidden,false,'窄屏没有显示星区折叠按钮');
assert.equal(tabWall.collapsed.expanded,'false');
assert.equal(tabWall.collapsed.visible,1,'折叠态下仍显示了多余星区');
assert.ok(tabWall.collapsed.boardTop<520,`折叠后棋盘仍在首屏之外（top=${tabWall.collapsed.boardTop}）`);
// 展开态应当把棋盘推到更下面——这就是折叠真正省下的高度。
assert.ok(tabWall.collapsed.boardTop<tabWall.expanded.boardTop-100,`折叠没有省下高度：折叠 ${tabWall.collapsed.boardTop} / 展开 ${tabWall.expanded.boardTop}`);
assert.equal(tabWall.expanded.visible,LEVEL_TOTAL,`展开后应恢复全部 ${LEVEL_TOTAL} 个星区`);
assert.equal(tabWall.back,1,'再次折叠失败');
report('窄屏星区列表折叠/展开',tabWall);
// 21c) P2 回归：「原地等待」在手机侧栏里会被滚到看不见，棋盘下方必须有一个可达的等待按钮。
const waitBtn=await evaluate(`(()=>{const b=$('boardWaitButton'),r=b.getBoundingClientRect();return {h:r.height,w:r.width,withinBoard:r.bottom<=document.querySelector('.game-panel').getBoundingClientRect().bottom+1};})()`);
assert.ok(waitBtn.h>=44&&waitBtn.withinBoard,'棋盘下方缺少可用的原地等待按钮');
await evaluate("loadLevel(__lv('初次着陆'));$('boardWaitButton').click()");
assert.equal(await evaluate('state.moves'),1,'棋盘等待按钮没有走一步');
await evaluate("loadLevel(__lv('初次着陆'))");
report('棋盘下方原地等待按钮（≥44px）',waitBtn);
// 21d) P2 回归：轻点棋盘 = 「点哪走哪」。过去鼠标点在棋盘上毫无反应，
// 悬停却会画一个虚线框，等于给了个空头承诺。
const tap=await evaluate(`(()=>{
 loadLevel(__lv('初次着陆'));
 const r=game.getBoundingClientRect(),T=r.width/13;
 const fire=(gx,gy,type)=>game.dispatchEvent(new MouseEvent(type,{clientX:r.left+(gx+0.5)*T,clientY:r.top+(gy+0.5)*T*(r.height/(r.width/13*9)),bubbles:true}));
 // 起点 (1,1)：点右邻格 (2,1) 应当向右走一步
 fire(2,1,'click');
 const afterAdjacent={x:state.x,y:state.y,moves:state.moves};
 return afterAdjacent;
})()`);
assert.equal(tap.moves,1,'轻点相邻格没有移动');
assert.equal(tap.x,2,'轻点相邻格走错了方向');
report('鼠标点击相邻格即可移动',tap);
await evaluate("loadLevel(__lv('初次着陆'))");
 const box=await evaluate('(()=>{const r=game.getBoundingClientRect();return{x:r.left+50,y:r.top+50};})()');
 await cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x,y:box.y}]});
 await cmd('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+65,y:box.y}]});
 await cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.equal(await evaluate('state.x'),2);
 report('手机真实触摸滑动方向识别');
 // 22) 手机通关弹层完整可见
 await evaluate("loadLevel(__lv('初次着陆'));planRoute(state).forEach(d=>move(d))");
 const mobileResult=await evaluate("(()=>{const overlay=$('resultOverlay').getBoundingClientRect(),next=$('nextButton').getBoundingClientRect();return {overlayBottom:overlay.bottom,nextBottom:next.bottom,nextTop:next.top,overlayTop:overlay.top};})()");
 assert.ok(mobileResult.nextBottom<=mobileResult.overlayBottom);assert.ok(mobileResult.nextTop>=mobileResult.overlayTop);
 report('手机通关弹层按钮完整可见',mobileResult);
 const resultShot=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(__dirname,'mobile-result.png'),Buffer.from(resultShot.data,'base64'));
// 22b) P2 回归：第 20 关是终章，过去和普通关共用同一个结算层，玩家看不到整段旅程的总账。
// 终章必须额外摊开「累计星数 / 总步数 / 点亮星区 / 成就徽章」，并且要有粒子庆祝。
await cmd('Emulation.setDeviceMetricsOverride',{width:1440,height:1180,deviceScaleFactor:1,mobile:false});
await evaluate(HELPERS);
// 先把 1~19 关补成三星，让终章的统计有意义
await evaluate(`(()=>{
 for(let i=0;i<LEVELS.length-1;i++){
  const r=planRoute(__fresh(i),400000);
  if(r&&!store.records[i])store.records[i]={moves:r.length,stars:3};
 }
 save();renderTabs();
})()`);
const finale=await evaluate(`(()=>{
 loadLevel(LEVELS.length-1);
 planRoute(state).forEach(d=>move(d));
 const rs=$('resultStats');
 return {
  overlay:!$('resultOverlay').hidden,
  statsHidden:rs.hidden,
  statsText:rs.textContent,
  blocks:rs.querySelectorAll('div').length,
  particles:anim.particles.length,
  label:$('resultLabel').textContent,
  title:$('resultTitle').textContent,
  focus:document.activeElement&&document.activeElement.id,
  nextLabel:$('nextButton').textContent
 };
})()`);
assert.equal(finale.overlay,true,'终章没有弹出结算层');
assert.equal(finale.statsHidden,false,'终章结算层没有展示旅程总账');
assert.equal(finale.blocks,4,`终章总账条目数异常：${finale.blocks}`);
assert.match(finale.statsText,/累计星数|总步数|点亮星区|成就徽章/);
assert.equal(finale.label,'MISSION ACCOMPLISHED');
assert.ok(/群星/.test(finale.title),'终章标题文案不符：'+finale.title);
// 最后一关不再提示「前往下一星区」，而是引导回头刷满星
assert.match(finale.nextLabel,/回到起点/);
// 通关有庆祝粒子（reduceMotion 时会被清空，此处媒体偏好为默认值，应当有）
assert.ok(finale.particles>0,`终章没有庆祝粒子（${finale.particles}）`);
report('终章展示旅程总账与庆祝粒子',{label:finale.label,title:finale.title,next:finale.nextLabel,blocks:finale.blocks,particles:finale.particles});
// 22c) 终章之后普通关的结算层不应显示总账
const nonFinale=await evaluate(`(()=>{loadLevel(__lv('初次着陆'));planRoute(state).forEach(d=>move(d));return {statsHidden:$('resultStats').hidden,label:$('resultLabel').textContent,nextLabel:$('nextButton').textContent};})()`);
assert.equal(nonFinale.statsHidden,true,'普通关不该显示终章总账');
assert.equal(nonFinale.label,'SECTOR COMPLETE');
assert.match(nonFinale.nextLabel,/前往下一星区/);
report('普通关结算层不显示终章总账');
await evaluate("localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(SEEN_KEY)");await navigate();await evaluate("$('helpDialog').open&&$('helpDialog').close()");await evaluate(HELPERS);
report('测试后状态复位（清除 1~19 关补齐的纪录）');
 // 23) 320 像素窄屏
 await cmd('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:true});
 assert.ok(await evaluate('document.documentElement.scrollWidth<=320'));
 report('320像素窄屏无水平溢出');
 // 24) 存储被禁用仍可游玩
 const fallback=await cmd('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(Storage.prototype,'getItem',{value(){throw new Error('storage unavailable')}});Object.defineProperty(Storage.prototype,'setItem',{value(){throw new Error('storage unavailable')}});"});
 await navigate();
 assert.equal(await evaluate('state.level'),0);
 await evaluate("move('right')");
 assert.equal(await evaluate('state.moves'),1);
 assert.match(await evaluate("$('saveNote').textContent"),/未允许存储/);
 report('存储被禁用仍可游玩并显示说明');
 await cmd('Page.removeScriptToEvaluateOnNewDocument',{identifier:fallback.identifier});
 // 25) 尊重系统“减少动态效果”偏好
 await cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await navigate();
 assert.equal(await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"),true);
 assert.equal(await evaluate('reduceMotion'),true);
 await evaluate("move('right');move('right')");
 assert.equal(await evaluate('state.moves'),2);
 await new Promise(resolve=>setTimeout(resolve,260));
 assert.equal(await evaluate('anim.time'),0);
 assert.equal(await evaluate('anim.playerRX'),await evaluate('state.x'));
 await cmd('Emulation.setEmulatedMedia',{features:[]});
 report('尊重系统减少动态效果偏好');
 // 26) 音效开关可切换、可持久化，且不影响玩法
 await navigate();
 assert.equal(await evaluate("$('soundButton').getAttribute('aria-pressed')"),'true');
 await evaluate("$('soundButton').click()");
 assert.equal(await evaluate('soundOn'),false);
 assert.equal(await evaluate("$('soundButton').getAttribute('aria-pressed')"),'false');
 assert.equal(await evaluate("$('soundIcon').getAttribute('href')"),'#i-mute');
 await navigate();
 assert.equal(await evaluate('soundOn'),false);
 await evaluate("$('soundButton').click()");
 assert.equal(await evaluate('soundOn'),true);
 assert.equal(await evaluate("$('soundIcon').getAttribute('href')"),'#i-sound');
 await evaluate("move('up')");
 assert.equal(await evaluate('state.moves'),0);
 await evaluate("move('right')");
 assert.equal(await evaluate('state.moves'),1);
 report('音效开关可切换并持久化');
 // 28) 新机制之一：相位器（第三个动词「调相」）
 // 先补出 1~23 关的纪录，把第 21~24 关解锁出来（前面几条用例清过存档）。
 await evaluate(`(()=>{for(let i=0;i<23;i++)if(!store.records[i])store.records[i]={moves:1,stars:3};save();renderTabs();})()`);
 assert.equal(await evaluate('unlocked()'),23,'未能解锁到第 24 关');
 // 拾取后获得 1 次充能；调相花 1 步、翻转全局激光相位；没有充能时不该耗步。
 const phaseBasic=await evaluate(`(()=>{
  loadLevel(__lv('相位回廊'));
  const startCharges=state.phaseCharges,startPhase=state.phase;
  move('right');move('right');            // (1,1)->(3,1) 拾取相位器
  const gotCharges=state.phaseCharges;
  const flip0=laserActive(5,0),flip1=laserActive(5,1);
  const mBefore=state.moves;move('phase');
  const used={charges:state.phaseCharges,phase:state.phase,delta:state.moves-mBefore,statPhases:store.stats.phases};
  loadLevel(__lv('初次着陆'));                            // 第 1 关没有相位器
  const noChargeMoves=state.moves;move('phase');
  const noop={moves:state.moves,charges:state.phaseCharges};
  loadLevel(__lv('相位回廊'));
  return {startCharges,startPhase,gotCharges,flip0,flip1,used,noChargeMoves,noop};
 })()`);
 assert.equal(phaseBasic.startCharges,0);
 assert.equal(phaseBasic.gotCharges,1,'拾取相位器后没有获得充能');
 assert.equal(phaseBasic.used.charges,0,'调相没有消耗充能');
 assert.equal(phaseBasic.used.phase,1,'调相没有翻转相位');
 assert.equal(phaseBasic.used.delta,1,'调相没有消耗一步');
 assert.notEqual(phaseBasic.flip0,phaseBasic.flip1,'相位没有改变激光的开关');
 assert.equal(phaseBasic.noop.moves,0,'没有充能时调相不该走步');
 report('相位器：拾取充能 / 调相耗一步并翻转激光相位',{gotCharges:phaseBasic.gotCharges,phase:phaseBasic.used.phase,statPhases:phaseBasic.used.statPhases});
 // 28b) 相位器不能是装饰：「相位回廊」的最优解必须真的用到它。
 const phaseOptimal=await evaluate("planRoute(freshState(__lv('相位回廊'))).filter(d=>d==='phase').length");
 assert.ok(phaseOptimal>=1,'相位回廊的最优解没有用到相位器，这个机制就成了装饰');
 report('相位回廊最优解确实用到相位器',{phaseSteps:phaseOptimal});
 // 29) 新机制之二：可推箱 / 压力板 / 闸门
 const crateTest=await evaluate(`(()=>{
  // ① 推箱：玩家 (2,3) 向右 -> 箱子 (3,3) 移到 (4,3)，玩家占据 (3,3)
  let s=freshState(__lv('推箱工坊'));s.x=2;s.y=3;
  const r1=step(s,'right');
  const push={moved:r1.moved,crate:r1.state.crates[0].x+','+r1.state.crates[0].y,player:r1.state.x+','+r1.state.y};
  // ② 箱后是墙时推不动，且不计步
  let s2=freshState(__lv('推箱工坊'));s2.crates[0].x=1;s2.crates[0].y=3;s2.x=2;s2.y=3;
  const r2=step(s2,'left');
  const blocked={moved:r2.moved,crate:r2.state.crates[0].x+','+r2.state.crates[0].y,moves:r2.state.moves};
  // ③ 箱子压上压力板 -> 闸门打开；推离 -> 关闭
  let s3=freshState(__lv('推箱工坊'));s3.crates[0].x=5;s3.crates[0].y=4;
  const onPlate=gateOpen(s3);
  s3.crates[0].x=4;s3.crates[0].y=4;
  const offPlate=gateOpen(s3);
  // ④ 闸门关闭时阻挡通行
  let s4=freshState(__lv('推箱工坊'));s4.x=5;s4.y=3;
  const r4=step(s4,'right');
  // ⑤ 玩家自己站在压力板上也会打开闸门
  let s6=freshState(__lv('推箱工坊'));s6.x=5;s6.y=4;
  const playerOnPlate=gateOpen(s6);
  // ⑥ 用真实推箱把箱子推上压力板：玩家 (5,2) 向下推 (5,3) 的箱子 -> (5,4)
  let s7=freshState(__lv('推箱工坊'));s7.crates[0].x=5;s7.crates[0].y=3;s7.x=5;s7.y=2;
  const r7=step(s7,'down');
  const pushOntoPlate={crate:r7.state.crates[0].x+','+r7.state.crates[0].y,gate:gateOpen(r7.state)};
  return {push,blocked,onPlate,offPlate,gateBlocked:!r4.moved,playerOnPlate,pushOntoPlate,plate:freshState(__lv('推箱工坊')).plates[0].x+','+freshState(__lv('推箱工坊')).plates[0].y};
 })()`);
 assert.equal(crateTest.push.moved,true);
 assert.equal(crateTest.push.crate,'4,3','箱子没有被推动');
 assert.equal(crateTest.push.player,'3,3','玩家没有跟进箱子原来的格子');
 assert.equal(crateTest.blocked.moved,false,'箱子后面是墙时不该推得动');
 assert.equal(crateTest.blocked.crate,'1,3','推不动时箱子不该移动');
 assert.equal(crateTest.blocked.moves,0,'推不动不该计步');
 assert.equal(crateTest.onPlate,true,'箱子压上压力板后闸门没有打开');
 assert.equal(crateTest.offPlate,false,'箱子离开压力板后闸门没有关闭');
 assert.equal(crateTest.gateBlocked,true,'闸门关闭时没有阻挡通行');
 assert.equal(crateTest.playerOnPlate,true,'玩家站在压力板上时闸门没有打开');
 assert.equal(crateTest.pushOntoPlate.crate,'5,4','箱子没有被推到压力板上');
 assert.equal(crateTest.pushOntoPlate.gate,true,'箱子压上压力板后闸门没有打开');
 report('可推箱 / 压力板 / 闸门',crateTest);
 // 29b) 「箱子能挡住暗影兽」不能只是提示文案里的空头承诺：同一几何下仅切换箱子，
 //      暗影兽的首步必须由「直扑」变成「绕行」。终章的 tip 明确写了这句话。
 const crateBlockTest=await evaluate(`(()=>{
  const IDX=__lv('推箱工坊');
  // 这是隔离验证「箱子挡兽」的几何测试。终章那格 (4,6) 现在站着一个守卫，
  // 会让「首回合不扣血」的断言失败——临时把该格清成空地，保留其余墙体
  // （墙体决定绕行方向为 (2,7)），测完恢复。
  const savedMap=LEVELS[IDX].map, savedTraps=trapsByLevel[IDX];
  const tmp=savedMap.map(row=>row.split('')); tmp[6][4]='.';
  LEVELS[IDX].map=tmp.map(row=>row.join('')); trapsByLevel[IDX]=[];
  const run=crate=>{
   // 用 freshState 直接造状态：loadLevel() 对未解锁星区会静默 return，会把断言测到别的关上。
   const s=freshState(IDX);
   // 暗影兽 (2,6)，玩家 (4,6)，箱子可选放在正中间的 (3,6)。
   s.monsters=[{x:2,y:6,spawnX:2,spawnY:6,frozen:0,refit:0}];
   s.bosses=[]; s.traps=[]; s.patrols=[]; // 隔离掉终章其它守卫/激光/哨兵，只留测试兽
   s.crates=crate?[{x:3,y:6}]:[];
   s.x=4;s.y=6;s.hp=3;
   const ns=step(s,'wait').state;
   const m=ns.monsters[0];
   return {at:m?[m.x,m.y]:null,hp:ns.hp};
  };
  const out={free:run(false),blocked:run(true)};
  LEVELS[IDX].map=savedMap; trapsByLevel[IDX]=savedTraps;
  return out;
 })()`);
 assert.deepEqual(crateBlockTest.free.at,[3,6],'没有箱子时暗影兽应当沿直线逼近玩家');
 assert.deepEqual(crateBlockTest.blocked.at,[2,7],'箱子挡在中间时暗影兽没有绕行，说明「推箱堵路」是空头承诺');
 assert.equal(crateBlockTest.free.hp,3,'直线逼近不该在首回合就扣血');
 assert.equal(crateBlockTest.blocked.hp,3,'绕行也不该在首回合扣血');
 report('星箱确实挡住暗影兽并迫使绕行',crateBlockTest);
 // 29c) 星箱不是装饰：终章的闸门是通往出口的唯一通路，而闸门只能被箱子压住。
 //      拿掉箱子后必须无解——否则「推箱」就退化成一条可选捷径。
 const crateRequired=await evaluate(`(()=>{
  const IDX=__lv('推箱工坊');
  const withCrate=planRoute(freshState(IDX),200000,0);
  const s=freshState(IDX);s.crates=[];
  const noCrate=planRoute(s,200000,0);
  return {withCrate:withCrate?withCrate.length:null,noCrate:noCrate?noCrate.length:null};
 })()`);
 assert.ok(crateRequired.withCrate,'终章在保留星箱时应当可解');
 assert.equal(crateRequired.noCrate,null,'拿掉星箱后终章仍能通关，说明闸门不是唯一通路，星箱沦为装饰');
 report('终章的星箱是必经之路（拿掉即无解）',crateRequired);
 // 30) 新机制之三：传送门（成对、互逆、不额外耗步）
 const portalTest=await evaluate(`(()=>{
  const IDX=__lv('星门跳转');const pairs=LEVELS[IDX].map.join('').split('O').length-1;
  let s=freshState(__lv('星门跳转'));s.x=3;s.y=4;const before=s.moves;
  const r=step(s,'left');            // 踩入 (2,4) 的门，应立刻出现在 (10,4)
  const twin=portalPairsByLevel[IDX].get('2,4');
  return {pairs,landed:r.state.x+','+r.state.y,expected:twin.x+','+twin.y,delta:r.state.moves-before,
   back:portalPairsByLevel[IDX].get(twin.x+','+twin.y).x+','+portalPairsByLevel[IDX].get(twin.x+','+twin.y).y};
 })()`);
 assert.equal(portalTest.pairs%2,0,'传送门必须成对出现');
 assert.equal(portalTest.landed,portalTest.expected,'踩入传送门后没有从配对的门出来');
 assert.equal(portalTest.delta,1,'传送门不该额外耗步');
 assert.equal(portalTest.back,'2,4','传送门不是互逆的');
 report('传送门成对互逆且不额外耗步',portalTest);
 // 31) 新机制之四：巡逻哨兵（外生型——位置只由步数决定）
 const patrolTest=await evaluate(`(()=>{
  const PIDX=__lv('哨兵防线');
  const seq=[0,1,2,3,4,5].map(m=>patrolAt(PIDX,m).map(p=>p.x+','+p.y).join(' '));
  const cycle=patrolCyclesByLevel[PIDX];
  // 玩家 (5,4) 在第 1 步时向右走一格 -> 第 2 步落在哨兵所在格 (6,4)
  let hit=freshState(__lv('哨兵防线'));hit.x=5;hit.y=4;hit.moves=1;hit.hp=3;
  const rh=step(hit,'right');
  // 同样走一步但落在别处 -> 安全
  let safe=freshState(__lv('哨兵防线'));safe.x=1;safe.y=4;safe.moves=1;safe.hp=3;
  const rs=step(safe,'right');
  return {seq,cycle,hitHp:rh.state.hp,safeHp:rs.state.hp,sentinelAt0:patrolAt(PIDX,0).map(p=>p.x+','+p.y).join(' ')};
 })()`);
 assert.equal(patrolTest.seq[0],patrolTest.seq[4],'巡逻哨兵的位置没有按周期重复');
 assert.equal(patrolTest.cycle,4,'巡逻哨兵的周期应为 4');
 assert.equal(patrolTest.hitHp,2,'走进巡逻哨兵所在格没有受伤');
 assert.equal(patrolTest.safeHp,3,'没碰到巡逻哨兵却受伤了');
 report('巡逻哨兵位置由步数决定且能造成伤害',patrolTest);
 // 32) 伤害预算：无伤无解时提示不该彻底失效，而是降档给出「需承受 N 格伤害」的路线。
 // 临时把第 1 关换成一串连续 3 格激光（周期 4 里最多 2 格安全，所以必然要挨 1 下）。
 const budgetTest=await evaluate(`(()=>{
  const saved=LEVELS[0].map;
  LEVELS[0].map=['#############','#S..*..^^^.E#','#############','#############','#############','#############','#############','#############','#############'];
  distTables.clear();planCache.clear();
  const noBudget=planRoute(freshState(0),20000,0);
  const withBudget=planRoute(freshState(0),20000,1);
  const adaptive=planRouteAdaptive(freshState(0));
  LEVELS[0].map=saved;distTables.clear();planCache.clear();
  return {noBudget:noBudget?noBudget.length:null,withBudget:withBudget?withBudget.length:null,
   adaptiveBudget:adaptive.budget,adaptiveLen:adaptive.path?adaptive.path.length:null};
 })()`);
 assert.equal(budgetTest.noBudget,null,'无伤无解时 budget=0 应当返回 null');
 assert.ok(budgetTest.withBudget>0,'budget=1 时应当给出「需承受 1 格伤害」的路线');
 assert.equal(budgetTest.adaptiveBudget,1,'自适应求解没有降档到 1 格伤害');
 report('伤害预算：无伤无解时降档给出带伤害的路线',budgetTest);
 // 33) 新机制的图例与「调相」按钮只在当前关卡真的出现时才显示。
 // 先把 1~25 关的纪录补齐，否则 loadLevel(24/25) 会因为未解锁而静默返回，用例会假绿。
 await evaluate(`(()=>{for(let i=0;i<25;i++)if(!store.records[i])store.records[i]={moves:1,stars:3};save();renderTabs();})()`);
 assert.equal(await evaluate('unlocked()'),25,'未能解锁到第 26 关');
 // 32b) 伤害预算：budget 字段必须真的决定二星，而不是一个没人读的摆设。
 // 用纯函数 rateStars 逐档验证，不必真的通关，也就不会污染存档。
 const starTest=await evaluate(`(()=>{
  const L1=LEVELS[__lv('微光回廊')],L2=LEVELS[__lv('交织猎影')];
  return {b1:L1.budget,b2:L2.budget,par1:L1.par,
   three:rateStars(true,3,L1.par,L1),
   slowClean:rateStars(true,3,L1.par+1,L1),
   dmg1:rateStars(true,2,1,L1),
   overBudget:rateStars(true,3-L1.budget-1,1,L1),
   budget2ok:L2.budget===2?rateStars(true,1,1,L2):null,
   lost:rateStars(false,3,1,L1)};})()`);
 assert.equal(starTest.b1,1,'微光回廊的 budget 应为 1');
 assert.equal(starTest.b2,2,'交织猎影的 budget 应为 2');
 assert.equal(starTest.three,3,'满护盾且在目标步数内应得三星');
 assert.equal(starTest.slowClean,2,'满护盾但超出目标步数应得二星');
 assert.equal(starTest.dmg1,2,'掉 1 格在 budget=1 的关应仍得二星');
 assert.equal(starTest.overBudget,1,'掉血超过 budget 应降到一星');
 assert.equal(starTest.budget2ok,2,'budget=2 的关掉 2 格应仍得二星');
 assert.equal(starTest.lost,0,'未通关应为 0 星');
 report('伤害预算决定二星容错（不再写死 1 格）',starTest);
 // 32c) 冒险路线表自洽：只有掉血真的换来步数时才存在，且永远不会比无伤更慢。
 const riskTest=await evaluate(`(()=>{
  const rows=LEVELS.map((l,i)=>({name:l.name,clean:OPTIMAL_STEPS[i],one:RISK_STEPS.one[i],two:RISK_STEPS.two[i],line:riskLine(i)}));
  const bad=rows.filter(r=>r.one>r.clean||r.two>r.one).map(r=>r.name);
  const wrong=rows.filter(r=>{const l=r.line;
   if(!l)return !(r.one===r.clean&&r.two===r.one);
   if(l.damage===1)return !(l.steps===r.one&&r.one<r.clean);
   return !(l.damage===2&&l.steps===r.two&&r.two<r.one);}).map(r=>r.name);
  const s=rows.find(r=>r.name==='失控回路');
  return {total:rows.length,bad,wrong,withLine:rows.filter(r=>r.line).length,sample:s.line};})()`);
 assert.deepEqual(riskTest.bad,[],'RISK_STEPS 出现「允许掉血反而更长」');
 assert.deepEqual(riskTest.wrong,[],'riskLine 与 RISK_STEPS 不自洽');
 assert.ok(riskTest.withLine>=8,`只有 ${riskTest.withLine} 关存在冒险路线，伤害预算几乎没被用到`);
 assert.equal(riskTest.sample.steps,22,'失控回路的冒险路线应为 22 步');
 report('冒险路线表自洽且有实际取舍',riskTest);
 // 32d) 任务卡必须把这个取舍说出来：关卡标签同时展示 ★ 与 BEST 步数，
 // 所以「拿三星」和「刷最快纪录」本来就是两条不同的追求。
 const riskUi=await evaluate(`(()=>{
  loadLevel(__lv('失控回路'));const a={hidden:$('riskNote').hidden,text:$('riskNote').textContent};
  loadLevel(__lv('初次着陆'));const b={hidden:$('riskNote').hidden};
  return {a,b};})()`);
 assert.equal(riskUi.a.hidden,false,'有冒险路线的关没有在任务卡上显示');
 assert.ok(/22/.test(riskUi.a.text),'冒险路线没有给出步数：'+riskUi.a.text);
 assert.equal(riskUi.b.hidden,true,'没有冒险路线的关不该显示这一行');
 report('任务卡展示冒险路线取舍',riskUi);
 const mechUi=await evaluate(`(()=>{
  const vis=k=>!document.querySelector('[data-legend="'+k+'"]').hidden;
  loadLevel(__lv('相位回廊'));const a={phase:vis('phase'),crate:vis('crate'),btn:!$('phaseButton').hidden};
  loadLevel(__lv('推箱工坊'));const b={crate:vis('crate'),gate:vis('gate'),plate:vis('plate'),phase:vis('phase'),btn:!$('phaseButton').hidden};
  loadLevel(__lv('星门跳转'));const c={portal:vis('portal'),phase:vis('phase'),btn:!$('phaseButton').hidden};
  loadLevel(__lv('哨兵防线'));const d={patrol:vis('patrol')};
  loadLevel(__lv('冰河滑行'));const f={ice:vis('ice'),frozen:vis('frozen'),phase:vis('phase'),patrol:vis('patrol')};
  loadLevel(__lv('冻结光束'));const g={ice:vis('ice'),frozen:vis('frozen'),patrol:vis('patrol')};
  loadLevel(__lv('初次着陆'));const e={crate:vis('crate'),phase:vis('phase'),patrol:vis('patrol'),ice:vis('ice'),frozen:vis('frozen'),btn:!$('phaseButton').hidden};
  return {a,b,c,d,e,f,g};
 })()`);
 assert.deepEqual(mechUi.a,{phase:true,crate:false,btn:true});
 assert.deepEqual(mechUi.b,{crate:true,gate:true,plate:true,phase:false,btn:false});
 assert.deepEqual(mechUi.c,{portal:true,phase:false,btn:false});
 assert.deepEqual(mechUi.d,{patrol:true});
 assert.deepEqual(mechUi.f,{ice:true,frozen:false,phase:false,patrol:false},'第 25 关应只显示「冰面」图例');
 assert.deepEqual(mechUi.g,{ice:true,frozen:true,patrol:false},'第 26 关应额外显示「冻结激光」图例');
 assert.deepEqual(mechUi.e,{crate:false,phase:false,patrol:false,ice:false,frozen:false,btn:false});
 report('新机制图例与调相按钮按关显示',mechUi);
 // 33b) 新机制之五：冰面滑行。整段只算 1 步、撞墙停下、沿途的星核「穿过即拾取」。
 // 这里用临时替换 LEVELS[24].map 的方式造小棋盘：step() 只认 levelOf(level).map，
 // 所以换图之后必须同时清掉 distTables / planCache，否则会读到上一张图的距离表。
 const iceTest=await evaluate(`(()=>{
  const SLOT=24,saved=LEVELS[SLOT].map;
  const withMap=(rows,fn)=>{LEVELS[SLOT].map=rows;distTables.clear();planCache.clear();
   try{return fn();}finally{LEVELS[SLOT].map=saved;distTables.clear();planCache.clear();}};
  const blank=['#############','#S..........#','#.~~~~~~~~#.#','#...........#','#...........#','#...........#','#...........#','#.....E.....#','#############'];
  const slide=withMap(blank,()=>{const s=stateFromMap(blank,SLOT);s.x=1;s.y=2;s.moves=0;
   const r=step(s,'right');const sl=r.events.filter(e=>e.type==='slide');
   return {moves:r.state.moves,x:r.state.x,y:r.state.y,slides:sl.length,tiles:sl[0]?sl[0].tiles:0};});
  // 冰河正中放一颗星核：滑过去要把它收走，而且不能被它刹停。
  const core=blank.map((row,y)=>y===2?row.slice(0,5)+'*'+row.slice(6):row);
  const scoop=withMap(core,()=>{const s=stateFromMap(core,SLOT);s.x=1;s.y=2;s.moves=0;
   const r=step(s,'right');return {moves:r.state.moves,x:r.state.x,mask:r.state.mask,
    got:r.events.some(e=>e.type==='core'),slides:r.events.filter(e=>e.type==='slide').length};});
  return {slide,scoop,coreCount:core.join('').split('*').length-1};
 })()`);
 assert.equal(iceTest.slide.moves,1,'滑过 8 格冰面应只算 1 步');
 assert.equal(iceTest.slide.x,9,'滑行没有停在墙前（应为 x=9）');
 assert.equal(iceTest.slide.slides,1,'一次滑行不应产生多个 slide 事件');
 assert.equal(iceTest.slide.tiles,8,'滑行格数应为 8（进入冰面的那一格也要算）');
 assert.equal(iceTest.scoop.got,true,'滑行途中的星核没有被拾取');
 assert.equal(iceTest.scoop.mask,1,'星核掩码没有置位');
 assert.equal(iceTest.scoop.x,9,'星核不该刹停滑行（应继续滑到 x=9）');
 assert.equal(iceTest.scoop.moves,1,'收星核的那一段仍应只算 1 步');
 report('冰面滑行：整段 1 步 / 撞墙停下 / 沿途星核穿过即拾取',iceTest);
 // 33c) 新机制之六：冻结激光。滑过安全，停在上面才按激光节奏结算伤害。
 // 同一张图、同一次向右滑行，只差「最后一格是不是冻结激光」与「落点回合激光开不开」。
 const beamTest=await evaluate(`(()=>{
  const SLOT=24,saved=LEVELS[SLOT].map;
  const withMap=(rows,fn)=>{LEVELS[SLOT].map=rows;distTables.clear();planCache.clear();
   try{return fn();}finally{LEVELS[SLOT].map=saved;distTables.clear();planCache.clear();}};
  const base=['#############','#S..........#','#.~~~~~~~~#.#','#...........#','#...........#','#...........#','#...........#','#.....E.....#','#############'];
  const toBeam=(row,lastIce)=>row.slice(0,9).replace(/~/g,'≈')+lastIce+row.slice(10);
  const over=base.map((row,y)=>y===2?toBeam(row,'~'):row);   // 滑过 7 格冻结激光，停在普通冰面
  const stop=base.map((row,y)=>y===2?toBeam(row,'≈'):row);   // 停在冻结激光上
  const run=(map,moves)=>withMap(map,()=>{const s=stateFromMap(map,SLOT);s.x=1;s.y=2;s.moves=moves;
   const r=step(s,'right');return {hp:r.state.hp,x:r.state.x,moves:r.state.moves,laser:laserActive(r.state.moves,0)};});
  return {over:run(over,0),stopOn:run(stop,0),stopOff:run(stop,1),
   traps:(over.join('').split('≈').length-1)+'/'+(stop.join('').split('≈').length-1)};
 })()`);
 assert.equal(beamTest.over.laser,true,'第一组应当落在激光开启的回合');
 assert.equal(beamTest.over.hp,3,'滑过冻结激光不该受伤');
 assert.equal(beamTest.stopOn.laser,true,'第二组应当落在激光开启的回合');
 assert.equal(beamTest.stopOn.hp,2,'停在开启的冻结激光上应掉 1 格护盾');
 assert.equal(beamTest.stopOff.laser,false,'第三组应当落在激光关闭的回合');
 assert.equal(beamTest.stopOff.hp,3,'停在关闭的冻结激光上不该受伤');
 report('冻结激光：滑过安全 / 停在上面按节奏掉血',beamTest);
 // 33d) 冰面与冻结激光都不能是装饰：这两关的最优解必须真的滑行、真的停在冻结激光上。
 const iceOptimal=await evaluate(`(()=>{
  const stats=i=>{const route=planRoute(freshState(i));if(!route)return null;
   let cur=freshState(i),slides=0,maxSlide=0,frozen=0;
   for(const d of route){const r=step(cur,d);cur=r.state;
    r.events.filter(e=>e.type==='slide').forEach(e=>{slides++;if(e.tiles>maxSlide)maxSlide=e.tiles;});
    if(LEVELS[i].map[cur.y][cur.x]==='≈')frozen++;}
   return {steps:route.length,slides,maxSlide,frozen,hp:cur.hp,won:cur.won};};
  const A=__lv('冰河滑行'),B=__lv('冻结光束');
  return {l25:stats(A),l26:stats(B),want:[OPTIMAL_STEPS[A],OPTIMAL_STEPS[B]]};
 })()`);
 assert.equal(iceOptimal.l25.won,true,'第 25 关没有无伤通关路线');
 assert.equal(iceOptimal.l25.hp,3,'第 25 关最优解掉血了');
 assert.equal(iceOptimal.l25.steps,iceOptimal.want[0],'第 25 关最优步数与 OPTIMAL_STEPS 不符');
 assert.ok(iceOptimal.l25.slides>=3,`第 25 关最优解只滑行 ${iceOptimal.l25.slides} 次，冰面成了摆设`);
 assert.ok(iceOptimal.l25.maxSlide>=6,`第 25 关最长滑行只有 ${iceOptimal.l25.maxSlide} 格，没有「一次滑很远」的体验`);
 assert.equal(iceOptimal.l26.won,true,'第 26 关没有无伤通关路线');
 assert.equal(iceOptimal.l26.hp,3,'第 26 关最优解掉血了');
 assert.equal(iceOptimal.l26.steps,iceOptimal.want[1],'第 26 关最优步数与 OPTIMAL_STEPS 不符');
 assert.ok(iceOptimal.l26.frozen>=1,'第 26 关最优解从未停在冻结激光上，这个机制成了摆设');
 report('第 25/26 关最优解确实用到冰面与冻结激光',iceOptimal);

 // 34) 每日挑战：日期做种，同一天全球同一张图；换一天必须换图。
 // 这一条同时守住「生成的地图一定可解」——裁判就是页面里的 planRoute。
 const dailyDet=await evaluate(`(()=>{
  const a=genDaily('2026-10-27');
  const solvable=!!planRoute(stateFromMap(a.map,DAILY_SLOT),80000,0);
  const b=genDaily('2026-10-27'),c=genDaily('2026-10-28');
  return {same:a.map.join('/')===b.map.join('/'),diff:a.map.join('/')!==c.map.join('/'),
   par:a.par,opt:a.optimal,attempt:a.attempt,cores:a.map.join('').split('*').length-1,
   parOk:a.par>=a.optimal&&a.par<=Math.ceil(a.optimal*1.3),solvable};
 })()`);
 assert.equal(dailyDet.same,true,'同一天两次生成的地图不一致');
 assert.equal(dailyDet.diff,true,'不同日期生成了同一张地图');
 assert.equal(dailyDet.solvable,true,'每日地图无伤不可解');
 assert.equal(dailyDet.parOk,true,'每日目标步数不在合理区间');
 assert.ok(dailyDet.cores>=4,'每日星核数量不足');
 report('每日挑战：日期做种、同图可解且目标步数合理',dailyDet);
 // 35) 每日挑战进入后，标题/标签/图例/关卡高亮都要切到「每日」语境。
 const dailyUi=await evaluate(`(()=>{
  genDaily('2026-10-27');loadDaily();
  return {level:state.level,title:$('levelTitle').textContent,tag:$('sectorTag').textContent,
   cores:state.cores.length,par:DAILY.par,active:$('dailyCard').classList.contains('active'),
   tabs:document.querySelectorAll('.level-tab.current').length,
   legendCrate:!document.querySelector('[data-legend="crate"]').hidden,
   wallHidden:$('levelTabs').hidden,backVisible:!$('dailyBack').hidden,
   aria:canvas.getAttribute('aria-label')};
 })()`);
 assert.equal(dailyUi.level,LEVEL_TOTAL,'每日挑战应占用虚拟关卡号');
 assert.equal(dailyUi.title,'每日挑战');
 assert.equal(dailyUi.tag,'DAILY');
 assert.ok(dailyUi.cores>=4);
 assert.equal(dailyUi.active,true,'每日卡片未进入激活态');
 assert.equal(dailyUi.tabs,0,'每日挑战不应高亮任何战役关卡');
 assert.equal(dailyUi.legendCrate,false,'每日挑战不该出现星箱图例');
 assert.equal(dailyUi.wallHidden,true,'每日挑战应隐藏战役关卡墙');
 assert.equal(dailyUi.backVisible,true,'每日挑战应提供返回星区的入口');
 assert.ok(dailyUi.aria.includes('每日挑战'),'棋盘 aria-label 没切到每日挑战');
 report('每日挑战的标题、图例与关卡高亮',dailyUi);
 // 36) 通关只写每日纪录：战役纪录与「满护盾通关」统计都不能被污染。
 const dailyClear=await evaluate(`(()=>{
  const before=JSON.stringify(store.records),flawless0=store.stats.flawless,moves0=store.stats.moves;
  const route=planRoute(state);if(!route)return {err:'no route'};
  for(const d of route)move(d);
  return {won:state.won,moves:state.moves,hp:state.hp,route:route.length,
   stars:store.daily.best?store.daily.best.stars:0,dailyMoves:store.daily.best?store.daily.best.moves:0,
   streak:store.daily.streak,recordsSame:JSON.stringify(store.records)===before,
   flawlessDelta:store.stats.flawless-flawless0,movesDelta:store.stats.moves-moves0,
   shareHidden:$('shareButton').hidden,label:$('resultLabel').textContent};
 })()`);
 assert.equal(dailyClear.won,true,'每日挑战没有走通');
 assert.equal(dailyClear.recordsSame,true,'每日挑战污染了战役纪录');
 assert.equal(dailyClear.flawlessDelta,0,'每日挑战不该计入「满护盾通关」');
 assert.equal(dailyClear.shareHidden,false,'每日通关后分享按钮应出现');
 assert.equal(dailyClear.label,'DAILY CLEARED');
 assert.equal(dailyClear.dailyMoves,dailyClear.moves,'每日最佳步数没有落库');
 assert.ok(dailyClear.movesDelta>0,'每日挑战的步数应计入累计步数');
 report('每日挑战通关只写每日纪录',dailyClear);
 // 37) 分享文案要能独立读懂，且不能把地图本身泄漏出去。
 const shareText=await evaluate('dailyShareText()');
 // 日期必须是「今天」，不能写死：写死的话这个用例过一天就会自己变红。
 const today=await evaluate('dailyStamp()');
 assert.ok(shareText.includes(today),'分享文案缺少日期');
 assert.ok(shareText.includes(String(dailyClear.moves)),'分享文案缺少步数');
 assert.ok(shareText.includes('★'),'分享文案缺少星级');
 assert.equal(/[#*SE]/.test(shareText),false,'分享文案泄漏了地图字符');
 report('每日挑战战绩可分享且不泄漏地图',{text:shareText.replace(/\n/g,' / ')});
 // 38) 连续天数：昨天玩过 +1，断档重置，同一天不重复累加。
 const streakTest=await evaluate("({cont:streakAfter('2026-10-26','2026-10-27',3),gap:streakAfter('2026-10-20','2026-10-27',3),same:streakAfter('2026-10-27','2026-10-27',3),first:streakAfter('','2026-10-27',0)})");
 assert.deepEqual(streakTest,{cont:4,gap:1,same:3,first:1});
 report('每日挑战连续天数计算',streakTest);
 // 39) 回到战役后状态必须干净，每日卡片要显示「今日最佳」。
 const backCampaign=await evaluate(`(()=>{
  loadLevel(__lv('初次着陆'));
  const out={level:state.level,title:$('levelTitle').textContent,active:$('dailyCard').classList.contains('active'),btn:$('dailyButtonLabel').textContent,best:$('dailyBest').textContent,wallHidden:$('levelTabs').hidden,backVisible:!$('dailyBack').hidden};
  store.daily=emptyDaily();save();renderDaily();
  out.cleared=$('dailyBest').textContent;out.btnCleared=$('dailyButtonLabel').textContent;
  return out;
 })()`);
 assert.equal(backCampaign.level,0);
 assert.equal(backCampaign.title,'初次着陆');
 assert.equal(backCampaign.active,false,'返回战役后每日卡片仍是激活态');
 assert.equal(backCampaign.wallHidden,false,'返回战役后关卡墙应重新显示');
 assert.equal(backCampaign.backVisible,false,'返回战役后不该再显示每日返回按钮');
 assert.equal(backCampaign.btn,'再挑战一次');
 assert.ok(backCampaign.best.includes('今日最佳'),'每日卡片没有显示今日最佳');
 assert.equal(backCampaign.cleared,'今日未挑战');
 assert.equal(backCampaign.btnCleared,'开始今日挑战');
 report('返回战役后每日状态复位',backCampaign);
 // 40) 存档按地图指纹迁移：重排关卡不该把已点亮的星区串到别的关。
 // 造一个「第一版格式」的存档（只有数字键、没有 keys 字段），把当时的第 4 关记成三星通关。
 // 那关是「静默深空」，重排后在第 11 位——如果直接沿用序号，进度就会落到「螺旋深井」头上。
 await evaluate(`localStorage.setItem(STORAGE_KEY, JSON.stringify({records:{3:{moves:35,stars:3}},lastLevel:3,achievements:{},stats:{},daily:emptyDaily()}))`);
 await navigate();
 const migrated=await evaluate(`(()=>{
  const j=LEVELS.findIndex(l=>l.name==='静默深空');
  return {j,hit:!!store.records[j],stars:store.records[j]&&store.records[j].stars,
   wrong:!!store.records[3],wrongName:LEVELS[3].name,last:store.lastLevel,
   unlocked:unlocked(),lastName:LEVELS[store.lastLevel].name};
 })()`);
 assert.equal(migrated.hit,true,'旧存档没有按指纹迁移到「静默深空」');
 assert.equal(migrated.stars,3,'迁移后的星级丢了');
 assert.equal(migrated.wrong,false,`旧序号被直接沿用，进度串到了「${migrated.wrongName}」`);
 // 只通关了这一关、前面全空，所以它不该被解锁，lastLevel 也要被钳制回第 1 关。
 assert.equal(migrated.unlocked,0,'前置关卡未通关却解锁了后面的星区');
 assert.equal(migrated.last,0,'lastLevel 应被钳制在已解锁范围内');
 report('存档按地图指纹迁移，重排不串关',migrated);
 // 41) 存一次再读一次，指纹要能自我维持（新格式存档的往返一致性）。
 await evaluate('save()');
 await navigate();
 const roundTrip=await evaluate(`(()=>{const j=LEVELS.findIndex(l=>l.name==='静默深空');
  const raw=JSON.parse(localStorage.getItem(STORAGE_KEY));
  return {j,hit:!!store.records[j],stars:store.records[j]&&store.records[j].stars,
   keys:Array.isArray(raw.keys)?raw.keys.length:0,
   lastKeyOk:raw.lastKey===LEVEL_KEYS[store.lastLevel]};})()`);
 assert.equal(roundTrip.hit,true,'新格式存档往返后丢失了纪录');
 assert.equal(roundTrip.keys,26,'新格式存档没有写入关卡指纹表');
 assert.equal(roundTrip.lastKeyOk,true,'新格式存档的 lastKey 与 lastLevel 不一致');
 report('新格式存档往返一致',roundTrip);
 // 27) 无脚本异常
 assert.deepEqual(errors,[]);
 report('浏览器无脚本异常');
 fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify({passed:true,tests:results},null,2));
 await send('Browser.close');socket.close();console.log('ALL '+results.length+' TESTS PASSED');
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(()=>{for(const p of pending.values())clearTimeout(p.timer);for(const e of events)clearTimeout(e.timer);if(socket)socket.close();if(child.exitCode===null)child.kill();});

'use strict';
// 星核迷航 · 自动化验收：覆盖 15 个星区、激光机关、暗影兽、暗核守卫、道具与响应式布局。
// 路线由页面内的 planRoute()（与 step() 同一套规则）生成，再以真实按键输入重放，
// 保证“算得出来”与“真的走得通”完全一致。
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
const HELPERS = "window.__fresh=i=>{const p=parseMap(LEVELS[i]);return {level:i,x:p.start.x,y:p.start.y,moves:0,hp:3,mask:0,cores:p.cores,traps:p.traps,items:p.items,monsters:p.monsters,bosses:p.bosses,exit:p.exit,over:false,won:false,freezeTurns:0,bootsTurns:0};};window.__play=(route,probe)=>{const keys={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',wait:' '};const trace=[];for(const d of route){game.dispatchEvent(new KeyboardEvent('keydown',{key:keys[d],bubbles:true}));trace.push(eval(probe));}return {won:state.won,hp:state.hp,moves:state.moves,stars:store.records[state.level]&&store.records[state.level].stars,overlay:!$('resultOverlay').hidden,unlocked:unlocked(),trace};};";
async function main(){
 const wsUrl=await new Promise((resolve,reject)=>{let log='';const timeout=setTimeout(()=>reject(new Error('Browser startup timeout: '+log.slice(-1500))),25000);child.on('error',reject);child.on('exit',code=>{clearTimeout(timeout);reject(new Error('Browser exited '+code+': '+log.slice(-1500)));});child.stderr.on('data',data=>{log+=data;const match=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});});
 socket=new WebSocket(wsUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id){const p=pending.get(data.id);if(p){pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(new Error(JSON.stringify(data.error))):p.resolve(data.result);}}else{if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails);for(let i=events.length-1;i>=0;i--){if(events[i].method===data.method){const e=events.splice(i,1)[0];clearTimeout(e.timer);e.resolve(data.params);}}}});
 function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++counter;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method));},60000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
 const created=await send('Target.createTarget',{url:'about:blank'});const attached=await send('Target.attachToTarget',{targetId:created.targetId,flatten:true});const sid=attached.sessionId;
 const cmd=(method,params={})=>send(method,params,sid);
 const waitEvent=method=>new Promise((resolve,reject)=>{const entry={method,resolve,timer:setTimeout(()=>reject(new Error('Event timeout '+method)),15000)};events.push(entry);});
 const evaluate=async expression=>{const result=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const navigate=async()=>{const loaded=waitEvent('Page.loadEventFired');await cmd('Page.navigate',{url:pathToFileURL(path.join(ROOT,'outputs/index.html')).href});await loaded;};
 await cmd('Page.enable');await cmd('Runtime.enable');await cmd('Emulation.setDeviceMetricsOverride',{width:1440,height:1180,deviceScaleFactor:1,mobile:false});
 await navigate();await evaluate('localStorage.removeItem(STORAGE_KEY)');await navigate();await evaluate(HELPERS);
 // 1) 初始状态：15 个星区，仅第 1 关解锁
 assert.equal(await evaluate('LEVELS.length'),15);
 assert.equal(await evaluate('state.level'),0);
 assert.equal(await evaluate("document.querySelectorAll('.level-tab:disabled').length"),14);
 assert.equal(await evaluate("$('journeyCount').textContent"),'0/15');
 report('初始关卡与 14 个未解锁星区');
 // 1b) 静态 HTML 的默认文案必须和关卡数同步。renderTabs() 会在运行时覆盖它们，
 // 所以这类残留只有在读源码时才看得见——历史上就漏过一次：地图早已 15 关，
 // 页头却还写着「五个星区」、meta 描述还写着「十关」。
 const staticHtml=fs.readFileSync(path.join(ROOT,'outputs/index.html'),'utf8');
 const total=await evaluate('LEVELS.length');
 assert.ok(staticHtml.includes(`>0/${total}<`),`静态旅程计数不是 0/${total}`);
 assert.ok(staticHtml.includes(`${total} 个星区，等你点亮`),`静态旅程文案没有写成“${total} 个星区”`);
 assert.ok(!/十关/.test(staticHtml),'meta 描述里仍残留「十关」');
 report('静态默认文案与关卡数同步',{total});
 // 2) 每关都存在“不受伤”的三星路线（页面内 BFS，与实际规则同源）
 const routes=await evaluate("LEVELS.map((level,i)=>{const route=planRoute(__fresh(i));return {level:i+1,name:level.name,par:level.par,steps:route?route.length:null,route};})");
 routes.forEach(r=>{assert.ok(r.steps,r.name+' 无可行路线');assert.ok(r.steps<=r.par,`${r.name} 最短 ${r.steps} 步 > 目标 ${r.par} 步`);});
 report('全部 15 关均可无伤三星通关',routes.map(({level,name,steps,par})=>({level,name,steps,par})));
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
 assert.equal(await evaluate("$('demoLabel').textContent"),'演示解法');
 report('演示解法可播放且不计入纪录',{peakSteps:peak});
 // 6) 逐关以真实输入重放三星路线（同时解锁全部星区）
 const bossTrace={},monsterTrace={};
 for(const r of routes){
  assert.equal(await evaluate('state.level'),r.level-1,`应处于第 ${r.level} 关`);
  const probe=r.level===14?'state.bosses.map(b=>b.hp).join(",")':(r.level>=11&&r.level<=13)?'state.hp':'0';
  const played=await evaluate(`__play(${JSON.stringify(r.route)},${JSON.stringify(probe)})`);
  assert.equal(played.won,true,`第 ${r.level} 关未通关`);
  assert.equal(played.hp,3,`第 ${r.level} 关未保持满护盾`);
  assert.equal(played.stars,3,`第 ${r.level} 关未获得三星`);
  assert.ok(played.moves<=r.par,`第 ${r.level} 关 ${played.moves} 步超出目标 ${r.par}`);
  assert.equal(played.overlay,true);
  if(r.level===14)bossTrace.hp=played.trace;
  if(r.level>=11&&r.level<=13)monsterTrace['L'+r.level]=played.trace;
  if(r.level===1)assert.equal(await evaluate("document.querySelector('[data-level=\"0\"] .level-stars').textContent"),'★★★');
  await evaluate("$('nextButton').click()");
 }
 report('实际输入通关全部 15 关',routes.map(r=>({level:r.level,steps:r.steps,par:r.par})));
 // 7) 暗核守卫确由激光逐格击溃（3→2→1→0），玩家全程满血
 assert.equal(bossTrace.hp[0],'3');
 assert.ok(bossTrace.hp.includes('2')&&bossTrace.hp.includes('1'),'守卫未经历 3→2→1 掉血');
 assert.equal(bossTrace.hp[bossTrace.hp.length-1],'',`守卫未被击溃：${bossTrace.hp.join(' ')}`);
 report('暗核守卫由激光逐格击溃');
 // 8) 暗影兽关全程未被抓住
 Object.entries(monsterTrace).forEach(([k,trace])=>assert.ok(trace.every(hp=>hp===3),k+' 被暗影兽抓住'));
 report('暗影兽关全程未被抓住',{levels:Object.keys(monsterTrace)});
 // 9) 全通关与回到起点
 assert.equal(await evaluate("$('journeyCount').textContent"),'15/15');
 assert.equal(await evaluate("$('journeyText').textContent"),'全部星区三星达成 · ★45');
 assert.equal(await evaluate('state.level'),0);
 report('全通关与返回起点');
 // 10) 刷新后纪录保留
 await navigate();
 assert.equal(await evaluate('Object.keys(store.records).length'),15);
 await evaluate(HELPERS);
 report('刷新后通关纪录保留');
 // 11) 出口锁定：星核未集齐
 await evaluate("loadLevel(0);state.x=10;state.y=1;move('right')");
 assert.equal(await evaluate('state.won'),false);
 assert.equal(await evaluate("$('exitNote').textContent"),'出口尚未激活');
 report('未集齐星核时出口保持锁定');
 // 12) 出口锁定：守卫未击溃
 await evaluate("loadLevel(13);state.x=10;state.y=1;state.mask=(1<<state.cores.length)-1;move('right')");
 assert.equal(await evaluate('state.won'),false);
 assert.equal(await evaluate('state.moves'),1);
 assert.match(await evaluate("$('toast').textContent"),/击败暗核守卫/);
 report('暗核守卫未击溃时出口保持锁定');
 // 13) 航线提示不增加步数，且计入暗影兽与守卫
 await evaluate("loadLevel(0);$('hintButton').click()");
 assert.equal(await evaluate('hintDirection!==null'),true);assert.equal(await evaluate('state.moves'),0);
 await evaluate("loadLevel(13);$('hintButton').click()");
 assert.equal(await evaluate('hintDirection!==null'),true);assert.equal(await evaluate('state.moves'),0);
 assert.match(await evaluate("$('toast').textContent"),/已计入暗影兽与暗核守卫/);
 report('航线提示不增加步数且计入守卫');
 // 14) 激光节奏、护盾扣减、失败与重试
 // 节奏（laserActive = floor(moves/2)%2===0，移动后才判定）：
 //   第 1 步 开启（受伤）→ 第 2、3 步 关闭 → 第 4、5 步 开启 → …
 // 即“每 2 步切换一次”，且关卡开局就是开启状态，所以第一步一定是危险的。
 await evaluate("loadLevel(1);state.x=5;state.y=3;move('right')");
 assert.equal(await evaluate('state.hp'),2);assert.equal(await evaluate('state.moves'),1);
 await evaluate("move('wait')");assert.equal(await evaluate('state.hp'),2);
 await evaluate("move('wait');move('wait');move('wait')");
 assert.equal(await evaluate('state.hp'),0);
 assert.equal(await evaluate('state.over&&!state.won'),true);
 await evaluate("$('nextButton').click()");
 assert.equal(await evaluate('state.hp'),3);assert.equal(await evaluate('state.moves'),0);
 report('激光节奏、护盾扣减、失败与重试');
 // 15) 暗影兽按最短路径追击玩家
 await evaluate("loadLevel(10)");
 const before=await evaluate('({mx:state.monsters[0].x,my:state.monsters[0].y,x:state.x,y:state.y})');
 await evaluate("move('down');move('down')");
 const after=await evaluate('({mx:state.monsters[0].x,my:state.monsters[0].y})');
 const d1=Math.abs(before.mx-after.mx)+Math.abs(before.my-after.my);
 const d0=Math.abs(before.mx-before.x)+Math.abs(before.my-before.y);
 assert.ok(d1<d0,'暗影兽没有靠近玩家');
 report('暗影兽按最短路径追击玩家',{from:[before.mx,before.my],to:[after.mx,after.my]});
 // 16) 撞上暗影兽：扣 1 护盾、退回巢穴，且不重复扣血
 await evaluate("loadLevel(10);state.x=3;state.y=4;move('right')");
 assert.equal(await evaluate('state.hp'),2);
 assert.equal(await evaluate('state.monsters[0].x'),4);assert.equal(await evaluate('state.monsters[0].y'),4);
 report('撞上暗影兽扣 1 护盾并退回巢穴');
 // 17) 撞上暗核守卫：扣 1 护盾、退回原点并晕眩 2 回合
 await evaluate("loadLevel(13);state.bosses[0].x=6;state.bosses[0].y=4;state.x=5;state.y=4;move('right')");
 assert.equal(await evaluate('state.hp'),2);
 assert.equal(await evaluate('state.bosses[0].stunned'),2);
 assert.equal(await evaluate('state.bosses[0].x===state.bosses[0].spawnX&&state.bosses[0].y===state.bosses[0].spawnY'),true);
 report('撞上暗核守卫扣 1 护盾并晕眩 2 回合');
 // 18) 道具：护盾补给 / 冻结钟 / 闪现靴
 await evaluate("loadLevel(10);state.hp=2;state.x=3;state.y=1;move('right')");
 assert.equal(await evaluate('state.hp'),3);
 report('护盾补给恢复 1 格护盾');
 await evaluate("loadLevel(10);state.x=9;state.y=4;move('right')");
 const frozen=await evaluate('state.freezeTurns');
 assert.ok(frozen>0,'冻结钟未生效');
 const monBefore=await evaluate('({x:state.monsters[0].x,y:state.monsters[0].y})');
 await evaluate("move('wait');move('wait')");
 const monAfter=await evaluate('({x:state.monsters[0].x,y:state.monsters[0].y})');
 assert.deepEqual(monAfter,monBefore,'冻结期间暗影兽仍在移动');
 report('冻结钟让暗影兽静止',{freezeTurns:frozen});
 await evaluate("loadLevel(14);state.x=7;state.y=4;move('right')");
 assert.ok(await evaluate('state.bootsTurns')>0);
 await evaluate("state.x=2;state.y=1;state.moves=3;move('right')");
 assert.equal(await evaluate('state.hp'),3);
 report('闪现靴免疫激光');
 // 19) 关卡选择、方向按钮与等待按钮
 await evaluate("document.querySelector('[data-level=\"0\"]').click();document.querySelector('[data-move=right]').click();$('waitButton').click()");
 assert.equal(await evaluate('state.moves'),2);
 report('关卡选择、方向按钮与等待按钮');
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
 const box=await evaluate('(()=>{const r=game.getBoundingClientRect();return{x:r.left+50,y:r.top+50};})()');
 await cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x,y:box.y}]});
 await cmd('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+65,y:box.y}]});
 await cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.equal(await evaluate('state.x'),2);
 report('手机真实触摸滑动方向识别');
 // 22) 手机通关弹层完整可见
 await evaluate("loadLevel(0);planRoute(state).forEach(d=>move(d))");
 const mobileResult=await evaluate("(()=>{const overlay=$('resultOverlay').getBoundingClientRect(),next=$('nextButton').getBoundingClientRect();return {overlayBottom:overlay.bottom,nextBottom:next.bottom,nextTop:next.top,overlayTop:overlay.top};})()");
 assert.ok(mobileResult.nextBottom<=mobileResult.overlayBottom);assert.ok(mobileResult.nextTop>=mobileResult.overlayTop);
 report('手机通关弹层按钮完整可见',mobileResult);
 const resultShot=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(__dirname,'mobile-result.png'),Buffer.from(resultShot.data,'base64'));
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
 // 27) 无脚本异常
 assert.deepEqual(errors,[]);
 report('浏览器无脚本异常');
 fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify({passed:true,tests:results},null,2));
 await send('Browser.close');socket.close();console.log('ALL '+results.length+' TESTS PASSED');
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(()=>{for(const p of pending.values())clearTimeout(p.timer);for(const e of events)clearTimeout(e.timer);if(socket)socket.close();if(child.exitCode===null)child.kill();});

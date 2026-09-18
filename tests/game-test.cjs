'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const ROOT = path.resolve(__dirname,'..');
const BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const child = spawn(BROWSER,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${path.join(__dirname,'browser-profile')}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
let socket, counter=0;const pending=new Map(),events=[],errors=[];const results=[];
function report(name,details){results.push({name,details});console.log('PASS '+name+(details?' | '+JSON.stringify(details):''));}
async function main(){
 const wsUrl=await new Promise((resolve,reject)=>{let log='';const timeout=setTimeout(()=>reject(new Error('Browser startup timeout: '+log.slice(-1500))),25000);child.on('error',reject);child.on('exit',(code)=>{clearTimeout(timeout);reject(new Error('Browser exited '+code+': '+log.slice(-1500)));});child.stderr.on('data',data=>{log+=data;const match=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});});
 socket=new WebSocket(wsUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id){const p=pending.get(data.id);if(p){pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(new Error(JSON.stringify(data.error))):p.resolve(data.result);}}else{if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails);for(let i=events.length-1;i>=0;i--){if(events[i].method===data.method){const e=events.splice(i,1)[0];clearTimeout(e.timer);e.resolve(data.params);}}}});
 function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++counter;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
 const created=await send('Target.createTarget',{url:'about:blank'});const attached=await send('Target.attachToTarget',{targetId:created.targetId,flatten:true});const sid=attached.sessionId;
 const cmd=(method,params={})=>send(method,params,sid);
 const waitEvent=method=>new Promise((resolve,reject)=>{const entry={method,resolve,timer:setTimeout(()=>reject(new Error('Event timeout '+method)),15000)};events.push(entry);});
 const evaluate=async expression=>{const result=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const navigate=async()=>{const loaded=waitEvent('Page.loadEventFired');await cmd('Page.navigate',{url:pathToFileURL(path.join(ROOT,'outputs/index.html')).href});await loaded;};
 await cmd('Page.enable');await cmd('Runtime.enable');await cmd('Emulation.setDeviceMetricsOverride',{width:1440,height:1180,deviceScaleFactor:1,mobile:false});await navigate();
 await evaluate("localStorage.removeItem(STORAGE_KEY)");await navigate();
 assert.equal(await evaluate('state.level'),0);assert.equal(await evaluate("document.querySelectorAll('.level-tab:disabled').length"),4);report('初始关卡与锁定状态');
 const solutions=await evaluate(`LEVELS.map((level,i)=>{const p=parseMap(level);const route=solve({level:i,x:p.start.x,y:p.start.y,mask:0,moves:0,cores:p.cores,exit:p.exit});return {level:i+1,name:level.name,widths:level.map.map(row=>row.length),stars:p.cores.length,steps:route?.length,par:level.par,route};})`);
 solutions.forEach(s=>{assert.ok(s.widths.every(w=>w===13));assert.ok(s.steps>0);assert.ok(s.steps<=s.par,`${s.name} shortest ${s.steps} > target ${s.par}`);});report('全部关卡可无伤三星通关',solutions.map(({level,steps,par})=>({level,steps,par})));
 await cmd('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await cmd('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});assert.equal(await evaluate('state.x'),2);assert.equal(await evaluate('state.moves'),1);report('真实键盘移动');
 await evaluate("$('restartButton').click();move('up')");assert.equal(await evaluate('state.moves'),0);report('重开本关与撞墙不计步');
 await evaluate("['down','down',...Array(10).fill('right'),'up','up'].forEach(move)");assert.equal(await evaluate('state.won'),false);assert.equal(await evaluate("$('exitNote').textContent"),'出口尚未激活');assert.equal(await evaluate('state.x===state.exit.x&&state.y===state.exit.y'),true);report('未收集完整时出口保持锁定');
 await evaluate("$('restartButton').click();$('hintButton').click()");assert.equal(await evaluate('hintDirection!==null'),true);assert.equal(await evaluate('state.moves'),0);report('无伤航线提示不增加步数');
 await evaluate("$('helpButton').click();document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");assert.equal(await evaluate('state.moves'),0);await evaluate("$('closeHelp').click()");report('玩法弹窗与输入隔离');
 for(const s of solutions){
  const achieved=await evaluate(`(()=>{const route=${JSON.stringify(s.route)};const keys={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',wait:' '};for(const direction of route){document.dispatchEvent(new KeyboardEvent('keydown',{key:keys[direction],bubbles:true}));}return {won:state.won,hp:state.hp,moves:state.moves,stars:store.records[state.level]?.stars,overlay:!$('resultOverlay').hidden,unlocked:unlocked()};})()`);
  assert.equal(achieved.won,true,JSON.stringify({s,achieved}));assert.equal(achieved.hp,3);assert.equal(achieved.stars,3);assert.equal(achieved.overlay,true);report('实际输入通关第 '+s.level+' 关',achieved);
  await evaluate("$('nextButton').click()");
 }
 assert.equal(await evaluate("$('journeyCount').textContent"),'5/5');assert.equal(await evaluate('state.level'),0);report('全通关与返回起点');
 await navigate();assert.equal(await evaluate('Object.keys(store.records).length'),5);report('刷新后通关纪录保留');
 await evaluate("loadLevel(1);state.x=5;state.y=3;move('right')");assert.equal(await evaluate('state.hp'),2);assert.equal(await evaluate('state.moves'),1);await evaluate("move('wait')");assert.equal(await evaluate('state.hp'),2);await evaluate("move('wait');move('wait');move('wait')");assert.equal(await evaluate('state.hp'),0);assert.equal(await evaluate('state.over&&!state.won'),true);await evaluate("$('nextButton').click()");assert.equal(await evaluate('state.hp'),3);assert.equal(await evaluate('state.moves'),0);report('激光节奏、护盾扣减、失败与重试');
 await evaluate("document.querySelector('[data-level=\"0\"]').click();document.querySelector('[data-move=right]').click();$('waitButton').click()");assert.equal(await evaluate('state.moves'),2);report('关卡选择、方向按钮与等待按钮');
 await evaluate('localStorage.removeItem(STORAGE_KEY)');await navigate();
 await evaluate("$('toast').hidden=true");
 const desktopLayout=await evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,canvasWidth:game.getBoundingClientRect().width,height:document.documentElement.scrollHeight})');assert.ok(desktopLayout.scrollWidth<=desktopLayout.width);report('桌面布局无水平溢出',desktopLayout);
 const desktop=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(__dirname,'desktop.png'),Buffer.from(desktop.data,'base64'));
 await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate('draw()');
 const mobileLayout=await evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,canvasWidth:game.getBoundingClientRect().width,buttons:[...document.querySelectorAll("[data-move]")].map(b=>({w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height}))})');assert.ok(mobileLayout.scrollWidth<=390);assert.ok(mobileLayout.canvasWidth>280);report('手机布局无水平溢出',mobileLayout);
 const mobile=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(__dirname,'mobile.png'),Buffer.from(mobile.data,'base64'));
 const box=await evaluate('(()=>{const r=game.getBoundingClientRect();return{x:r.left+50,y:r.top+50};})()');await cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x,y:box.y}]});await cmd('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+65,y:box.y}]});await cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.equal(await evaluate('state.x'),2);report('手机真实触摸滑动方向识别');
 await evaluate('loadLevel(0);solve().forEach(move)');
 const mobileResult=await evaluate("(()=>{const overlay=$('resultOverlay').getBoundingClientRect(),next=$('nextButton').getBoundingClientRect();return {overlayBottom:overlay.bottom,nextBottom:next.bottom,nextTop:next.top,overlayTop:overlay.top};})()");assert.ok(mobileResult.nextBottom<=mobileResult.overlayBottom);assert.ok(mobileResult.nextTop>=mobileResult.overlayTop);report('手机通关弹层按钮完整可见',mobileResult);
 const resultShot=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(__dirname,'mobile-result.png'),Buffer.from(resultShot.data,'base64'));
 await cmd('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:true});assert.ok(await evaluate('document.documentElement.scrollWidth<=320'));report('320像素窄屏无水平溢出');
 assert.deepEqual(errors,[]);report('浏览器无脚本异常');
 const fallback=await cmd('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(Storage.prototype,'getItem',{value(){throw new Error('storage unavailable')}});Object.defineProperty(Storage.prototype,'setItem',{value(){throw new Error('storage unavailable')}});"});
 await navigate();assert.equal(await evaluate('state.level'),0);await evaluate("move('right')");assert.equal(await evaluate('state.moves'),1);assert.match(await evaluate("$('saveNote').textContent"),/未允许存储/);report('存储被禁用仍可游玩并显示说明');await cmd('Page.removeScriptToEvaluateOnNewDocument',{identifier:fallback.identifier});
 fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify({passed:true,tests:results},null,2));
 await send('Browser.close');socket.close();console.log('ALL '+results.length+' TESTS PASSED');
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(()=>{for(const p of pending.values())clearTimeout(p.timer);for(const e of events)clearTimeout(e.timer);if(socket)socket.close();if(child.exitCode===null)child.kill();});

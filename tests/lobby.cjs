const fs=require('node:fs'),assert=require('node:assert/strict');
const original=fs.readFileSync('tests/social.cjs','utf8');
const prefix=original.slice(0,original.indexOf(" await check('no microphone request"));
const tail=String.raw`
 await check('mobile lobby opens with primary room actions and all optional sections collapsed',async()=>{
  for(const p of pages){
   assert.equal(await p.locator('#btn-coop-direct-test,#btn-coop-direct-copy,#coop-direct-result').count(),0);
   assert.equal(await p.locator('#coop-modal details[open]').count(),0);
   assert(await p.locator('#btn-coop-start-now').isVisible());
   assert(!await p.locator('#coop-node-select').isVisible());
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await host.locator('#coop-modal .modal-card').screenshot({path:'test-results/v26_4简洁大厅.png'});
 });
 await check('room messages appear above the lobby before battle without blocking clicks',async()=>{
  await host.evaluate(()=>{document.getElementById('social-input').value='收到消息了吗？';CoopSocial.send()});
  await a.waitForFunction(()=>document.querySelector('.coop-danmaku-message'));
  await pause(1500);
  const state=await a.evaluate(()=>{const el=document.querySelector('.coop-danmaku-message'),r=el.getBoundingClientRect();el.style.pointerEvents='auto';const top=document.elementFromPoint(Math.min(innerWidth-5,Math.max(5,r.left+r.width/2)),r.top+r.height/2)===el;el.style.pointerEvents='';return {top,body:el.parentElement.parentElement===document.body,pointer:getComputedStyle(el).pointerEvents,text:el.textContent};});
  assert.equal(state.top,true);assert.equal(state.body,true);assert.equal(state.pointer,'none');assert(state.text.includes('收到消息了吗'));
  await a.screenshot({path:'test-results/top-layer-chat.png'});for(const p of pages)await p.evaluate(()=>CoopDanmaku.clear());
 });
 await check('actual direct route is marked current with per-player echo RTT and the slowest summary',async()=>{
  await host.evaluate(()=>{
   const now=performance.now();for(const [i,p]of CoopManager.allies.entries()){
    const e=CoopDirect.currentEntry(p.id);e.directRttMs=i===0?37.4:84.6;e.directRttAt=now;
    const meta=CoopDirect.metadata.get(e.pc);meta.info={label:'IPv6公网直连',family:6,relay:false};
   }CoopLobby.renderRoutes();
  });
  await host.locator('#coop-connection-details>summary').click();
  const text=await host.locator('#coop-route-summary').textContent();assert(text.includes('当前：IPv6公网直连'));assert(text.includes('85ms'));
  assert.equal(await host.locator('[data-route="direct"] .coop-route-badge').textContent(),'当前 2人');
  assert((await host.locator('#coop-current-routes').textContent()).includes('37ms'));
  assert.equal(await host.locator('#coop-node-metrics .coop-route-badge').count(),1);
  await host.locator('#coop-connection-details').screenshot({path:'test-results/v26_4连接线路.png'});
 });
 await check('mixed routes mark both actual paths, not the configured fallback',async()=>{
  const state=await host.evaluate(()=>{
   const saved=CoopManager.routeFor;CoopManager.routeFor=function(id,state){return id===this.allies[1].id?{kind:'mqtt',url:CoopNodes.nodes[0].url}:saved.call(this,id,state)};
   const route=CoopManager.routes.get(CoopManager.allies[1].id);route.latency.set(CoopNodes.nodes[0].url,{ms:123,at:performance.now()});
   CoopLobby.renderRoutes();const result={count:document.querySelectorAll('#coop-node-metrics .coop-route-badge').length,relay:document.querySelector('[data-route="'+CoopNodes.nodes[0].url+'"] .coop-route-badge')?.textContent,summary:document.getElementById('coop-route-summary').textContent};
   CoopManager.routeFor=saved;return result;
  });
  assert.equal(state.count,2);assert.equal(state.relay,'当前 1人');assert(state.summary.includes('多条线路'));
  await host.locator('#coop-node-select').selectOption('hive');assert.equal(await host.evaluate(()=>CoopManager.relayMode),'hive');
  assert(await host.evaluate(()=>CoopManager.allies.every(p=>CoopManager.routeFor(p.id,true).kind==='rtc')));
  await a.locator('#coop-connection-details>summary').click();assert(await a.locator('#coop-node-select').isDisabled());
 });
 await check('unmeasured or stale direct latency is never presented as a fabricated zero',async()=>{
  const value=await host.evaluate(()=>{for(const p of CoopManager.allies){const e=CoopDirect.currentEntry(p.id);e.directRttAt=-Infinity;e.directRttMs=0;}CoopLobby.renderRoutes();return document.querySelector('[data-route="direct"]').textContent});
  assert(value.includes('等待测速'));assert(!value.includes('0ms'));
 });
 await host.evaluate(()=>WorldCoop.startOrResume());await Promise.all([a,b].map(p=>p.waitForFunction(()=>WorldCoop.active()&&WorldCoop.receivedFrame>0)));
 for(const p of pages)await p.evaluate(()=>{closeCoopModal();GameState.autoAttack=false;GameState.godMode=true;player.expToNext=100000;CoopSocial.toggle(false)});
 await host.evaluate(()=>{spawnEnemyBatch=()=>{};enemies.length=0;WorldCoop.broadcastWorld()});
 await check('received chat animates across gameplay while the drawer is closed and cannot intercept controls',async()=>{
  await host.evaluate(()=>{document.getElementById('social-input').value='我来救你，先向左走！';CoopSocial.send()});
  await a.waitForFunction(()=>document.querySelectorAll('.coop-danmaku-message').length>0);
  const item=a.locator('.coop-danmaku-message').first(),x1=(await item.boundingBox()).x;await pause(500);const x2=(await item.boundingBox()).x;
  assert(x2<x1-10);assert.equal(await a.evaluate(()=>CoopSocial.open),false);assert.equal(await a.locator('#coop-danmaku').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
  assert((await item.textContent()).includes('我来救你'));
  await pause(2000);await a.screenshot({path:'test-results/v26_4聊天弹幕.png'});
 });
 await check('chat animations deduplicate, render literal text and keep a bounded live queue',async()=>{
  const state=await a.evaluate(()=>{
   CoopDanmaku.clear();CoopSocial.add({id:'safe:1',name:'队友',text:'<img src=x onerror="window.danmakuXss=1">',own:false});
   CoopSocial.add({id:'safe:1',name:'队友',text:'duplicate',own:false});const one=document.querySelectorAll('.coop-danmaku-message').length;
   for(let i=0;i<30;i++)CoopSocial.add({id:'burst:'+i,name:'队友',text:'消息 '+i,own:false});
   return {one,active:document.querySelectorAll('.coop-danmaku-message').length,queue:CoopDanmaku.queue.length,images:document.querySelectorAll('#coop-danmaku img').length,xss:window.danmakuXss};
  });
  assert.equal(state.one,1);assert.equal(state.active,3);assert.equal(state.queue,8);assert.equal(state.images,0);assert.equal(state.xss,undefined);
 });
 await check('danmaku can be disabled and room cleanup immediately removes animations and pending text',async()=>{
  assert(await a.evaluate(()=>{CoopDanmaku.set(false);CoopDanmaku.show({name:'队友',text:'hidden'});return !document.querySelector('.coop-danmaku-message')&&CoopDanmaku.queue.length===0}));
  await a.evaluate(()=>{CoopDanmaku.set(true);CoopDanmaku.show({name:'队友',text:'重新显示'});CoopSocial.cleanup()});
  assert.equal(await a.locator('.coop-danmaku-message').count(),0);assert.equal(await a.evaluate(()=>CoopDanmaku.queue.length),0);
 });
 await check('simulated content and insecure contexts explain why no microphone prompt is available',async()=>{
  for(const env of [{protocol:'content:',secure:false,api:false},{protocol:'http:',secure:false,api:false},{protocol:'https:',secure:true,api:false},{protocol:'https:',secure:true,api:true,policy:false}]){
   const problem=await b.evaluate(env=>CoopVoice.capability(env),env);assert(problem&&problem.help.length>10);assert(problem.help.includes('HTTPS')||problem.help.includes('microphone'));
  }
  assert.equal(await b.evaluate(()=>CoopVoice.capability({protocol:'https:',secure:true,api:true,policy:true})),null);
  await b.evaluate(()=>{window.originalCapability=CoopVoice.capability;CoopVoice.capability=function(){return originalCapability.call(this,{protocol:'content:',secure:false,api:false})};CoopSocial.toggle(true)});
  await b.locator('#voice-mic').click();assert((await b.locator('#voice-help-text').textContent()).includes('content://'));assert((await b.locator('#voice-help-text').textContent()).includes('HTTPS'));
  assert.equal(await b.evaluate(()=>mediaRequests.length),0);await b.evaluate(()=>CoopVoice.capability=originalCapability);
  await b.locator('#coop-social-panel').screenshot({path:'test-results/v26_4麦克风打开提示.png'});
 });
 await check('cancelling an unanswered permission request safely stops any late stream',async()=>{
  await b.evaluate(()=>{window.fakeContext=new AudioContext();window.lateStream=fakeContext.createMediaStreamDestination().stream;window.originalMic=navigator.mediaDevices.getUserMedia;navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>window.releaseMic=resolve)});
  await b.locator('#voice-mic').click();assert(await b.locator('#voice-cancel').isVisible());await b.locator('#voice-cancel').click();
  await b.evaluate(()=>releaseMic(lateStream));await b.waitForFunction(()=>lateStream.getTracks().every(t=>t.readyState==='ended'));
  assert(await b.evaluate(()=>!CoopVoice.busy&&!CoopVoice.mic&&!CoopVoice.joined));await b.evaluate(()=>navigator.mediaDevices.getUserMedia=originalMic);
 });
 await check('the compact lobby remains usable on small portrait and landscape viewports',async()=>{
  for(const viewport of [{width:320,height:568},{width:844,height:390}]){
   await host.setViewportSize(viewport);await host.evaluate(()=>{document.querySelectorAll('#coop-modal details').forEach(e=>e.open=false);openCoopModal()});
   const start=host.locator('#btn-coop-start-now');assert(await start.isVisible());const rect=await start.boundingBox();assert(rect.y>=0&&rect.y+rect.height<=viewport.height+1);
   assert.equal(await host.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
 });
 assert.deepEqual(errors,[]);
})().catch(e=>{report.failure=String(e);console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close();fs.writeFileSync('test-results/v32-lobby-r4-results.json',JSON.stringify(report,null,2))});
`;
new Function('require',prefix+tail)(require);

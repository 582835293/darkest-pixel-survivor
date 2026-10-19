const {chromium}=require('playwright');
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
fs.mkdirSync('test-results',{recursive:true});
const html=fs.readFileSync('index.html');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html)});
let browser;const errors=[],results=[],pages=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function check(name,fn){await fn();results.push(name);console.log('PASS',name);}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 async function makePage(viewport={width:1200,height:800}){
  const p=await(await browser.newContext({viewport})).newPage();pages.push(p);
  p.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message)});
  await p.exposeFunction('relay',async pkt=>{for(const other of pages)if(other!==p)await other.evaluate(pkt=>CoopManager.onReceivePacket(pkt,{kind:'mqtt',url:'test'}),pkt).catch(()=>{})});
  await p.goto(url);
  await p.evaluate(()=>{
   LiteMQTTClient.prototype.startAllTransports=function(){this.activeSockets=[{_brokerUrl:'test',_isSubscribed:true,readyState:1,close(){}}]};
   LiteMQTTClient.prototype.publish=function(pkt){window.relay(pkt);return true};
   CoopManager.createSafePeerConnection=()=>new RTCPeerConnection({iceServers:[]});
  });return p;
 }
 const host=await makePage(),guest=await makePage();
 await host.evaluate(()=>{document.getElementById('coop-my-name').value='房主';CoopManager.createRoom()});
 const room=await host.evaluate(()=>CoopManager.roomCode);
 await guest.evaluate(room=>{document.getElementById('coop-my-name').value='队友';CoopManager.joinRoom(room)},room);
 await Promise.all([host,guest].map(p=>p.waitForFunction(()=>CoopManager.allies.length===1&&CoopManager.routeFor(CoopManager.allies[0].id,true).kind==='rtc')));
 await host.evaluate(()=>WorldCoop.startOrResume());
 await guest.waitForFunction(()=>GameState.isStarted&&WorldCoop.active()&&WorldCoop.receivedFrame>0);
 async function clean(){
  for(const p of [host,guest])await p.evaluate(()=>{
   UpgradeChoice.end();player.pendingLevelUps=0;document.getElementById('level-modal').style.display='none';
   GameState.isPaused=false;GameState.autoAttack=false;GameState.godMode=true;player.x=0;player.y=0;player.vx=player.vy=0;
   player.exp=0;player.expToNext=10000;input.keys={};input.x=input.y=0;CoopManager.sendPresenceNow();
  });
  await host.evaluate(()=>{spawnEnemyBatch=()=>{};enemies.length=0;projectiles.length=0;gems.length=0;goldDrops.length=0;fieldPickups.length=0;destructibles.length=0;shrines.length=0;mapRelicDrops.length=0;dropSpawnTimer=shrineSpawnTimer=0;WorldCoop.broadcastWorld()});
  await pause(300);
  for(const p of [host,guest])await p.evaluate(()=>{player.exp=0;player.expToNext=10000});
 }
 await clean();
 if(process.argv.includes('--rewards-only')){
  await check('1/2/3 players grant exactly 100/160/220 percent monster XP and gold',async()=>{
   const data=await host.evaluate(()=>{
    GameState.isPaused=true;const originalCount=CoopManager.getActivePlayerCount,random=Math.random,rows=[];
    try{
     Math.random=()=>0;
     for(const count of [1,2,3])for(const spec of [{name:'normal',xp:2,gold:1},{name:'elite',xp:20,gold:10,isElite:true},{name:'shiny',xp:24,gold:18,isShiny:true},{name:'boss',xp:55,gold:45,isBoss:true}]){
      CoopManager.getActivePlayerCount=()=>count;WorldCoop.rewardCarry={xp:0,gold:0};gems.length=goldDrops.length=0;
      for(let i=0;i<5;i++)WorldCoop.reward({...spec,x:500+i*150,y:0},spec.xp,spec.isBoss?4:1);
      rows.push({count,type:spec.name,xp:gems.reduce((a,g)=>a+g.expValue,0),gold:goldDrops.reduce((a,g)=>a+g.val,0),baseXp:spec.xp*5,baseGold:spec.gold*5});
     }
    }finally{CoopManager.getActivePlayerCount=originalCount;Math.random=random;gems.length=goldDrops.length=fieldPickups.length=0;GameState.isPaused=false;WorldCoop.rewardCarry={xp:0,gold:0}}
    return rows;
   });
   for(const row of data){assert.equal(row.xp,Math.round(row.baseXp*(1+(row.count-1)*.6)));assert.equal(row.gold,Math.round(row.baseGold*(1+(row.count-1)*.6)))}
   console.log(JSON.stringify(data));
  });
  await check('count changes apply to newly killed monsters, never existing drops or twice on pickup',async()=>{
   const result=await host.evaluate(()=>{
    GameState.isPaused=true;const originalCount=CoopManager.getActivePlayerCount,random=Math.random;
    try{
     Math.random=()=>0;gems.length=goldDrops.length=0;WorldCoop.rewardCarry={xp:0,gold:0};
     CoopManager.getActivePlayerCount=()=>2;
     const e=createEnemy(500,0,'imp');e.expReward=10;killEnemy(e);
     const first=gems[0].expValue;killEnemy(e);const duplicateTotal=gems.reduce((n,g)=>n+g.expValue,0);
     CoopManager.getActivePlayerCount=()=>3;const f=createEnemy(800,0,'imp');f.expReward=10;killEnemy(f);
     const second=gems.find(g=>g.x===800).expValue;
     return {first,duplicateTotal,second,total:gems.reduce((n,g)=>n+g.expValue,0)};
    }finally{CoopManager.getActivePlayerCount=originalCount;Math.random=random;GameState.isPaused=false}
   });assert.deepEqual(result,{first:16,duplicateTotal:16,second:22,total:38});
   await guest.waitForFunction(()=>gems.length===2);
   await guest.evaluate(()=>{player.x=500;player.y=0;CoopManager.sendPresenceNow()});
   await guest.waitForFunction(()=>player.exp===16&&gems.length===1);
   assert.equal(await host.evaluate(()=>player.exp),0);
  });
  await check('reward fractional carry resets for a new battle',async()=>{
   await host.evaluate(()=>{WorldCoop.rewardCarry={xp:4,gold:-4};WorldCoop.reset()});
   assert.deepEqual(await host.evaluate(()=>WorldCoop.rewardCarry),{xp:0,gold:0});
  });
  assert.deepEqual(errors,[]);fs.writeFileSync('test-results/v32-rewards-test-results.json',JSON.stringify({results,errors},null,2));return;
 }

 if(process.argv.includes('--relic-only')){
  await check('full relic inventory leaves unclaimed relic on ground, including after ACK and stale presence',async()=>{
   await guest.evaluate(()=>{player.x=500;CoopManager.sendPresenceNow()});await pause(200);
   await host.evaluate(()=>{mapRelicDrops.push(...STAGE_SPECIAL_RELICS.dungeon.map(r=>({...r,x:0,y:0,radius:22})));WorldCoop.broadcastWorld()});
   await host.waitForFunction(()=>player.mapRelics.length===2);await pause(300);
   assert.equal(await host.evaluate(()=>mapRelicDrops.length),1);
   await host.evaluate(()=>{player.x=2000;CoopManager.sendPresenceNow()});
   await guest.evaluate(()=>{player.x=0;CoopManager.sendPresenceNow()});
   await guest.waitForFunction(()=>player.mapRelics.length===1);
   await host.evaluate(()=>mapRelicDrops.push(...STAGE_SPECIAL_RELICS.dungeon.slice(1).map(r=>({...r,x:0,y:0,radius:22}))));
   await guest.waitForFunction(()=>player.mapRelics.length===2);await pause(300);
   const r=await host.evaluate(()=>{const actor=WorldCoop.participants.get(CoopManager.allies[0].id);actor.relicIds=[];CoopLoot.step(.05);return {count:mapRelicDrops.length,reserved:CoopLoot.account(actor.id).reservedRelics.length}});
   assert.equal(r.count,1);assert.equal(r.reserved,2);assert.deepEqual(errors,[]);
  });
  fs.writeFileSync('test-results/v32-relic-test-results.json',JSON.stringify({results,errors},null,2));return;
 }
 await check('RTC uses protocol 32 and one shared enemy authority',async()=>{
  assert.equal(await host.evaluate(()=>WorldCoop.session),await guest.evaluate(()=>WorldCoop.session));
  assert.equal(await guest.evaluate(()=>createEnemy(0,0,'imp')),null);
  await host.evaluate(()=>{const e=createEnemy(350,0,'imp');e.hp=e.maxHp=500;e.freezeTimer=999;WorldCoop.broadcastWorld()});
  await guest.waitForFunction(()=>enemies.length===1&&enemies[0].hp===500);
  const dmg=await guest.evaluate(()=>damageEnemy(enemies[0],20,0,0).finalDmg);
  await host.waitForFunction(d=>enemies[0].hp===500-d,dmg);
  await guest.waitForFunction(d=>enemies[0].hp===500-d,dmg);
 });
 await check('kills leave shared physical crystals; no automatic team XP',async()=>{
  await host.evaluate(()=>{enemies[0].x=500;enemies[0].y=0;killEnemy(enemies[0]);WorldCoop.broadcastWorld()});
  await guest.waitForFunction(()=>gems.length===1);
  assert.equal(await guest.evaluate(()=>player.exp),0);assert.equal(await host.evaluate(()=>player.exp),0);
  assert.equal(await guest.evaluate(()=>gems[0].lootId),await host.evaluate(()=>gems[0].lootId));
 });
 await check('same crystal is won once by guest, disappears on both',async()=>{
  const xp=await guest.evaluate(()=>gems[0].expValue);
  await guest.evaluate(()=>{player.x=500;player.y=0;CoopManager.sendPresenceNow()});
  await guest.waitForFunction(xp=>player.exp===xp&&gems.length===0,xp);
  assert.equal(await host.evaluate(()=>player.exp),0);
  await pause(500);assert.equal(await guest.evaluate(()=>player.exp),xp);
 });
 await clean();
 await check('consumable competition gives one heal and grants are idempotent',async()=>{
  await Promise.all([host,guest].map(p=>p.evaluate(()=>{player.hp=10})));
  await host.evaluate(()=>fieldPickups.push({x:0,y:0,type:'chicken',icon:'🍗',color:'#10b981',label:'烤鸡',radius:18}));
  await pause(500);
  const hp=await Promise.all([host,guest].map(p=>p.evaluate(()=>player.hp)));
  assert.equal(hp.filter(n=>n===55).length,1);assert.equal(hp.filter(n=>n===10).length,1);
  assert.equal(await guest.evaluate(()=>fieldPickups.length),0);
  const once=await guest.evaluate(()=>{
   const seq=CoopLoot.received+1;const rows=[[CoopManager.myPeerId,[[seq,'gold',7]]]];
   const before=GameState.goldCollected;CoopLoot.receiveRewards(rows);CoopLoot.receiveRewards(rows);return GameState.goldCollected-before;
  });assert.equal(once,7);
  // Keep test-injected sequence aligned with authority for subsequent grants.
  const seq=await guest.evaluate(()=>CoopLoot.received);
  await host.evaluate(seq=>{const a=CoopLoot.account(CoopManager.allies[0].id);a.next=a.ack=seq;a.pending=[]},seq);
 });
 await clean();
 await check('lost item delivery repaired by world snapshot; contiguous order enforced',async()=>{
  await guest.evaluate(()=>{window.originalReceive=WorldCoop.receive;WorldCoop.receive=function(pkt){if(pkt.type==='WORLD_LOOT_GRANT')return true;return window.originalReceive.call(this,pkt)}});
  await guest.evaluate(()=>{player.x=500;CoopManager.sendPresenceNow()});await pause(150);
  await host.evaluate(()=>fieldPickups.push({x:500,y:0,type:'fire_breath',icon:'🌶️',color:'#ea580c',label:'龙椒',radius:18}));
  await guest.waitForFunction(()=>GameState.fireBreathTimer>0);
  await guest.evaluate(()=>{WorldCoop.receive=window.originalReceive;GameState.fireBreathTimer=0});
  assert.equal(await host.evaluate(()=>GameState.fireBreathTimer||0),0);
 });
 await clean();
 await check('shared barrels break once, and remote bombs settle on host once',async()=>{
  await host.evaluate(()=>{destructibles.push({x:150,y:0,radius:16,hp:1,color:'#d97706'});WorldCoop.broadcastWorld()});
  await guest.waitForFunction(()=>destructibles.length===1);
  await guest.evaluate(()=>checkDestructiblesHit(150,0,20));
  await host.waitForFunction(()=>destructibles.length===0&&fieldPickups.length===1);
  await guest.waitForFunction(()=>destructibles.length===0&&fieldPickups.length===1);
  await guest.evaluate(()=>{player.x=500;CoopManager.sendPresenceNow()});await pause(200);
  await host.evaluate(()=>{fieldPickups.length=0;const e=createEnemy(700,0,'imp');e.hp=e.maxHp=500;e.isBoss=true;e.freezeTimer=999;
    fieldPickups.push({x:500,y:0,type:'bomb',icon:'💣',color:'#ef4444',label:'炸弹',radius:18})});
  await host.waitForFunction(()=>enemies[0]?.hp===400);await pause(450);
  assert.equal(await host.evaluate(()=>enemies[0].hp),400);
 });
 await clean();
 await check('map relics and shrines are shared, with one recipient',async()=>{
  await guest.evaluate(()=>{player.x=500;CoopManager.sendPresenceNow()});await pause(200);
  await host.evaluate(()=>{mapRelicDrops.push({...STAGE_SPECIAL_RELICS.dungeon[0],x:500,y:0,radius:22});shrines.push({x:900,y:0,type:'speed',radius:24,used:false});WorldCoop.broadcastWorld()});
  await guest.waitForFunction(()=>player.mapRelics.length===1&&shrines.length===1);
  assert.equal(await host.evaluate(()=>player.mapRelics.length),0);
  await guest.evaluate(()=>{player.x=900;CoopManager.sendPresenceNow()});
  await guest.waitForFunction(()=>GameState.speedShrineTimer>0&&shrines.length===0);
  assert.equal(await host.evaluate(()=>GameState.speedShrineTimer||0),0);
 });
 await clean();
 await check('guest upgrade is isolated: no pause, movement, damage, attacks or pickup',async()=>{
  await guest.evaluate(()=>{player.x=300;player.expToNext=10;addExp(10);CoopManager.sendPresenceNow()});
  await host.waitForFunction(()=>WorldCoop.participants.get(CoopManager.allies[0].id)?.upgrading);
  const before=await host.evaluate(()=>GameState.gameTime);
  await host.evaluate(()=>{const e=createEnemy(310,0,'imp');e.hp=e.maxHp=1000;spawnGemCrystal(300,0,3);fieldPickups.push({x:300,y:0,type:'chicken',radius:18,color:'#10b981',icon:'🍗'});WorldCoop.broadcastWorld()});
  const stats=await guest.evaluate(()=>{const x=player.x,hp=player.hp;input.keys.KeyD=true;GameState.godMode=false;damagePlayer(99999);executeAttack();update(.05);return {x,after:player.x,hp,afterHp:player.hp,paused:GameState.isPaused,active:UpgradeChoice.active}});
  assert.equal(stats.x,stats.after);assert.equal(stats.hp,stats.afterHp);assert.equal(stats.paused,false);assert(stats.active);
  await pause(450);assert((await host.evaluate(()=>GameState.gameTime))>before+.2);
  assert.equal(await host.evaluate(()=>WorldCoop.target(enemies[0]).id===CoopManager.myPeerId),true);
  assert.equal(await guest.evaluate(()=>player.exp),0);assert.equal(await host.evaluate(()=>fieldPickups.length),1);
  await host.screenshot({path:'test-results/v32-ghost.png'});
  await guest.screenshot({path:'test-results/v32-upgrade.png'});
  await guest.evaluate(()=>{input.keys={};document.querySelector('#upgrade-options .upgrade-card').click()});
  await host.waitForFunction(()=>!WorldCoop.phased(WorldCoop.participants.get(CoopManager.allies[0].id)));
 });
 await clean();
 await check('host upgrade keeps AI and guest rewards running, all phased preserves enemies',async()=>{
  await host.evaluate(()=>{player.pendingLevelUps=1;triggerLevelUp();createEnemy(400,0,'imp');spawnGemCrystal(600,0,9);WorldCoop.broadcastWorld()});
  await guest.evaluate(()=>{player.x=600;CoopManager.sendPresenceNow()});
  try { await guest.waitForFunction(()=>player.exp===9,null,{timeout:4000}); } catch(e) {
   for(const p of [host,guest])console.log('DEBUG_REWARD',await p.evaluate(()=>({xp:player.exp,phase:UpgradeChoice.active,paused:GameState.isPaused,worldPaused:WorldCoop.paused(),over:GameState.isOver,gems,accounts:[...CoopLoot.accounts],received:CoopLoot.received,inbox:[...CoopLoot.inbox],actors:[...WorldCoop.participants],pos:[player.x,player.y]})));
   throw e;
  }
  const x=await host.evaluate(()=>enemies[0].x);await pause(300);assert((await host.evaluate(()=>enemies[0].x))>x);
  await guest.evaluate(()=>{player.pendingLevelUps=1;triggerLevelUp()});await pause(300);
  assert.equal(await host.evaluate(()=>WorldCoop.actors().length),0);
  assert.equal(await host.evaluate(()=>enemies.length),1);assert.equal(await host.evaluate(()=>GameState.isOver),false);
 });
 await clean();
 await check('20 seconds hard deadline, reroll cannot extend, stale click cannot double apply',async()=>{
  const deadline=await guest.evaluate(()=>{player.pendingLevelUps=2;player.rerolls=2;triggerLevelUp();window.staleCard=document.querySelector('#upgrade-options .upgrade-card');const d=UpgradeChoice.deadline;renderUpgradeCards([]);return {d,after:UpgradeChoice.deadline}});
  assert.equal(deadline.d,deadline.after);
  const stale=await guest.evaluate(()=>{window.staleCard.click();return player.pendingLevelUps});assert.equal(stale,2);
  const start=Date.now();
  await guest.waitForFunction(()=>!UpgradeChoice.active,null,{timeout:22000});
  assert(Date.now()-start>18500);assert.equal(await guest.evaluate(()=>player.pendingLevelUps),0);
  assert.equal(await guest.evaluate(()=>document.getElementById('level-modal').style.display),'none');
 });
 await clean();
 await check('manual pause freezes everyone, including while host upgrades',async()=>{
  await host.evaluate(()=>{player.pendingLevelUps=1;triggerLevelUp()});
  await guest.evaluate(()=>togglePause());await host.waitForFunction(()=>WorldCoop.paused());
  const time=await host.evaluate(()=>GameState.gameTime);await pause(300);assert.equal(await host.evaluate(()=>GameState.gameTime),time);
  await guest.evaluate(()=>togglePause());await host.waitForFunction(()=>!WorldCoop.paused());
  await pause(150);assert((await host.evaluate(()=>GameState.gameTime))>time);
  assert.equal(await host.evaluate(()=>UpgradeChoice.active),true);
 });
 await clean();
 await check('revive requires ten continuous seconds, leaving resets, upgrade cannot rescue',async()=>{
  await host.evaluate(()=>{player.x=400;player.pendingLevelUps=1;triggerLevelUp();CoopManager.sendPresenceNow()});
  await guest.evaluate(()=>{player.x=400;GameState.godMode=false;player.reviveLeft=0;player.invulnerableTimer=0;damagePlayer(100000)});
  await host.waitForFunction(()=>WorldCoop.participants.get(CoopManager.allies[0].id)?.downed);
  await pause(350);assert.equal(await host.evaluate(()=>WorldCoop.participants.get(CoopManager.allies[0].id).progress),0);
  await host.evaluate(()=>{document.querySelector('#upgrade-options .upgrade-card').click()});
  await host.waitForFunction(()=>WorldCoop.participants.get(CoopManager.allies[0].id).progress>.4);
  await host.evaluate(()=>{player.x=800;CoopManager.sendPresenceNow()});
  await host.waitForFunction(()=>WorldCoop.participants.get(CoopManager.allies[0].id).progress===0);
  await host.evaluate(()=>{player.x=400;CoopManager.sendPresenceNow()});
  const start=Date.now();await pause(3500);assert.equal(await guest.evaluate(()=>player.isDowned),true);
  await guest.waitForFunction(()=>!player.isDowned,null,{timeout:9000});assert(Date.now()-start>=9500);
  assert.equal(await guest.evaluate(()=>player.hp),await guest.evaluate(()=>Math.round(player.maxHp*.4)));
 });
 await clean();
 await check('late join sees current shared loot but receives no previous pickups',async()=>{
  await host.evaluate(()=>{spawnGemCrystal(500,0,5);fieldPickups.push({x:650,y:0,type:'freeze',radius:18,icon:'⏱️',color:'#0284c7'});WorldCoop.broadcastWorld()});
  const third=await makePage();await third.evaluate(room=>CoopManager.joinRoom(room),room);
  await third.waitForFunction(()=>WorldCoop.active()&&gems.length===1&&fieldPickups.length===1);
  assert.equal(await third.evaluate(()=>player.exp),0);
  assert.equal(await third.evaluate(()=>gems[0].lootId),await host.evaluate(()=>gems[0].lootId));
  await third.evaluate(()=>CoopManager.leaveRoom());
 });
 await clean();
 await check('large loot fields preserve all XP/gold and keep world frames below queue limit',async()=>{
  const result=await host.evaluate(()=>{
   GameState.isPaused=true;enemies.length=0;
   for(let i=0;i<420;i++)createEnemy(100+i%20*20,100+Math.floor(i/20)*20,'imp');
   gems.length=0;goldDrops.length=0;
   for(let i=0;i<1500;i++){gems.push({...GEM_TIER_SPECS[4],x:3000+i%50*5,y:Math.floor(i/50)*5,expValue:7});goldDrops.push({x:3000+i%50*5,y:Math.floor(i/50)*5,val:3})}
   CoopLoot.compactPiles(gems,512,'expValue');CoopLoot.compactPiles(goldDrops,200,'val');
   const frame=WorldCoop.encodeWorld();WorldCoop.broadcastWorld();
   return {gems:gems.length,gold:goldDrops.length,xp:gems.reduce((s,g)=>s+g.expValue,0),money:goldDrops.reduce((s,g)=>s+g.val,0),bytes:JSON.stringify(frame).length};
  });assert.equal(result.gems,512);assert.equal(result.gold,200);assert.equal(result.xp,10500);assert.equal(result.money,4500);assert(result.bytes<128000);console.log('STRESS_FRAME',result.bytes);
  await guest.waitForFunction(()=>gems.length===512&&goldDrops.length===200&&enemies.length===420);
  assert.equal(await guest.evaluate(()=>gems.reduce((s,g)=>s+g.expValue,0)),10500);
 });
 await check('0-100 slider is continuous, presets work, 100% persists after reload',async()=>{
  const mobile=await makePage({width:390,height:844});
  await mobile.evaluate(()=>{document.getElementById('coop-modal').style.display='flex';setAllyTransparency(37)});
  assert.equal(await mobile.evaluate(()=>CoopManager.allyVfxAlpha),.63);
  if(await mobile.locator('#coop-effects-details').count())await mobile.locator('#coop-effects-details>summary').click();
  await mobile.locator('.coop-alpha-preset[data-value="100"]').click();
  assert.equal(await mobile.evaluate(()=>CoopManager.allyVfxAlpha),0);
  await mobile.screenshot({path:'test-results/v32-mobile-slider.png'});
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await mobile.reload();assert.equal(await mobile.evaluate(()=>CoopManager.allyVfxAlpha),0);
 });
 await clean();
 await check('new session resets pending loot and upgrade state; old grants rejected',async()=>{
  const old=await host.evaluate(()=>WorldCoop.session);
  await host.evaluate(()=>{player.pendingLevelUps=1;triggerLevelUp();resetGameSession(false);WorldCoop.beginHost();WorldCoop.broadcastWorld()});
  await guest.waitForFunction(old=>WorldCoop.session!==old,old);
  assert.equal(await host.evaluate(()=>UpgradeChoice.active),false);
  await guest.evaluate(old=>WorldCoop.receive({type:'WORLD_LOOT_GRANT',peerId:WorldCoop.hostId,session:old,rewards:[[CoopManager.myPeerId,[[1,'xp',100000]]]]}),old);
  assert.equal(await guest.evaluate(()=>player.exp),0);
 });
 await check('single player can still select upgrades and die normally',async()=>{
  const solo=await makePage();await solo.evaluate(()=>{resetGameSession(false);player.pendingLevelUps=1;triggerLevelUp()});
  assert.equal(await solo.evaluate(()=>GameState.isPaused),true);
  await solo.evaluate(()=>document.querySelector('#upgrade-options .upgrade-card').click());
  assert.equal(await solo.evaluate(()=>GameState.isPaused),false);
  await solo.evaluate(()=>{player.reviveLeft=0;player.invulnerableTimer=0;GameState.godMode=false;damagePlayer(100000)});
  assert.equal(await solo.evaluate(()=>GameState.isOver),true);
 });
 await check('leaving during an upgrade retains a usable selection in solo mode',async()=>{
  await guest.evaluate(()=>{player.pendingLevelUps=1;triggerLevelUp();CoopManager.leaveRoom()});
  assert.equal(await guest.evaluate(()=>UpgradeChoice.active&&GameState.isPaused),true);
  await guest.evaluate(()=>document.querySelector('#upgrade-options .upgrade-card').click());
  assert.equal(await guest.evaluate(()=>!UpgradeChoice.active&&player.pendingLevelUps===0),true);
 });
 await check('no browser JavaScript errors',async()=>assert.deepEqual(errors,[]));
 fs.writeFileSync('test-results/v32-test-results.json',JSON.stringify({results,errors},null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});

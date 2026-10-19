const fs=require('node:fs'),assert=require('node:assert/strict');
const original=fs.readFileSync('tests/gameplay.cjs','utf8');
const prefix=original.slice(0,original.indexOf(' await clean();'));
const tail=String.raw`
 await clean();
 const guestId=await guest.evaluate(()=>CoopManager.myPeerId);
 async function targets(count,hp=1){
  const ids=await host.evaluate(({count,hp})=>{
   const ids=[];for(let i=0;i<count;i++){const en=createEnemy(520+i*6,20,'imp');en.hp=en.maxHp=hp;en.speed=0;en.damage=0;en.expReward=1;enemies.push(en);ids.push(WorldCoop.identify(en))}
   WorldCoop.broadcastWorld();return ids;
  },{count,hp});
  await guest.waitForFunction(ids=>ids.every(id=>enemies.some(e=>e.netId===id)),ids);return ids;
 }
 async function killFrom(p,ids){
  await p.evaluate(ids=>{for(const id of ids){const en=enemies.find(e=>e.netId===id);if(en)damageEnemy(en,1000,0,0)}if(WorldCoop.guest())WorldCoop.flushHits(performance.now()+60)},ids);
 }
 for(const [i,p]of [host,guest].entries())await p.evaluate(i=>{GameState.selectedHero='warrior';player.hp=50;player.maxHp=100;player.shield=0;player.passives.bloodPact=i+1;player.critChance=0;CoopManager.sendPresenceNow();updateHpUI()},i);
 await host.waitForFunction(id=>WorldCoop.participants.get(id)?.bloodPact===2,guestId);
 const ids=await targets(10);
 await check('team kill count does not trigger host healing for guest kills',async()=>{
  await killFrom(guest,ids.slice(0,9));await host.waitForFunction(id=>WorldCoop.participants.get(id)?.personalKills===9,guestId);
  assert.equal(await host.evaluate(()=>player.hp),50);assert.equal(await guest.evaluate(()=>player.hp),50);
  const [mine]=await targets(1);await killFrom(host,[mine]);
  assert.equal(await host.evaluate(()=>GameState.kills),10);assert.equal(await host.evaluate(()=>player.hp),50);
 });
 await check('guest tenth personal kill heals its own warrior and survives lost grants and duplicate hits',async()=>{
  await host.evaluate(()=>{
   window.oldBroadcast=WorldCoop.broadcastWorld;WorldCoop.broadcastWorld=()=>{};
   window.oldSend=CoopManager.sendPacket;window.droppedAck=0;window.droppedHeal=0;
   CoopManager.sendPacket=function(p,...args){if(p.type==='WORLD_HIT_ACK'&&droppedAck++<2)return;if(p.type==='WORLD_LOOT_GRANT'&&droppedHeal++<1)return;return oldSend.call(this,p,...args)};
  });
  await killFrom(guest,[ids[9]]);await guest.waitForFunction(()=>player.hp===58);
  await pause(1300);assert.equal(await guest.evaluate(()=>player.hp),58);assert.equal(await host.evaluate(()=>player.hp),50);
  assert.equal(await host.evaluate(id=>WorldCoop.participants.get(id).personalKills,guestId),10);
  await host.evaluate(()=>{CoopManager.sendPacket=oldSend;WorldCoop.broadcastWorld=oldBroadcast;WorldCoop.broadcastWorld()});
 });
 await check('host heals only on its own tenth kill using its own passive level',async()=>{
  const mine=await targets(9);await killFrom(host,mine);await host.waitForFunction(()=>player.hp===54);
  assert.equal(await guest.evaluate(()=>player.hp),58);
 });
 await check('a third warrior receives independent healing without healing either teammate',async()=>{
  const third=await makePage();await third.evaluate(code=>CoopManager.joinRoom(code),room);await third.waitForFunction(()=>CoopManager.allies.length===2);
  await third.evaluate(()=>WorldCoop.startOrResume());await third.waitForFunction(()=>WorldCoop.active()&&WorldCoop.receivedFrame>0);
  await third.evaluate(()=>{GameState.autoAttack=false;GameState.godMode=true;player.hp=50;player.maxHp=100;player.shield=0;player.passives.bloodPact=3;player.expToNext=100000;CoopManager.sendPresenceNow()});
  const id=await third.evaluate(()=>CoopManager.myPeerId);await host.waitForFunction(id=>WorldCoop.participants.get(id)?.bloodPact===3,id);
  const batch=await targets(10);await third.waitForFunction(ids=>ids.every(id=>enemies.some(e=>e.netId===id)),batch);
  await killFrom(third,batch);await third.waitForFunction(()=>player.hp===62);
  assert.equal(await host.evaluate(()=>player.hp),54);assert.equal(await guest.evaluate(()=>player.hp),58);
  await third.evaluate(()=>CoopManager.leaveRoom());
 });
 await check('host-simulated bleed death retains the guest attacker as healing owner',async()=>{
  await host.evaluate(id=>WorldCoop.participants.get(id).personalKills=19,guestId);
  const [id]=await targets(1,30);
  await guest.evaluate(id=>{const en=enemies.find(e=>e.netId===id);damageEnemy(en,1,0,0);en.bleedStacks=1;en.bleedTimer=4;WorldCoop.markBleed(en);WorldCoop.flushHits(performance.now()+60)},id);
  await host.waitForFunction(({id,owner})=>enemies.some(e=>e.netId===id&&e.bleedOwnerId===owner),{id,owner:guestId});
  // Real host AI tick performs the bleed calculation and calls damageEnemy.
  await host.evaluate(id=>{const en=enemies.find(e=>e.netId===id);en.hp=1;en.dotTickTimer=0},id);
  await guest.waitForFunction(()=>player.hp===66);assert.equal(await host.evaluate(()=>player.hp),54);
 });
 await check('ordinary later hits do not reclaim bleed ownership from another player',async()=>{
  const [id]=await targets(1,100);
  await guest.evaluate(id=>{const en=enemies.find(e=>e.netId===id);damageEnemy(en,1,0,0);en.bleedStacks=1;en.bleedTimer=4;WorldCoop.markBleed(en);WorldCoop.flushHits(performance.now()+60)},id);
  await host.waitForFunction(({id,owner})=>enemies.some(e=>e.netId===id&&e.bleedOwnerId===owner),{id,owner:guestId});
  const seq=await host.evaluate(({id,peer})=>{WorldCoop.markBleed(enemies.find(e=>e.netId===id));return WorldCoop.receivedHits.get(peer).max},{id,peer:guestId});
  await guest.evaluate(id=>{damageEnemy(enemies.find(e=>e.netId===id),1,0,0);WorldCoop.flushHits(performance.now()+60)},id);
  await host.waitForFunction(({seq,peer})=>WorldCoop.receivedHits.get(peer).max>seq,{seq,peer:guestId});
  assert(await host.evaluate(id=>enemies.find(e=>e.netId===id).bleedOwnerId===CoopManager.myPeerId,id));
  await host.evaluate(id=>enemies.splice(enemies.findIndex(e=>e.netId===id),1),id);
 });
 await check('healing recovered from a later world frame applies once and overheal becomes the guest shield',async()=>{
  await guest.evaluate(()=>{player.hp=98;player.shield=0;CoopManager.sendPresenceNow()});
  await host.evaluate(id=>WorldCoop.participants.get(id).personalKills=29,guestId);
  const [id]=await targets(1);await host.evaluate(()=>{
   window.savedSend=CoopManager.sendPacket;CoopManager.sendPacket=function(p,...args){if(p.type==='WORLD_LOOT_GRANT')return;return savedSend.call(this,p,...args)};
  });
  await killFrom(guest,[id]);await guest.waitForFunction(()=>player.hp===100&&player.shield===6);
  await pause(400);assert.equal(await guest.evaluate(()=>player.shield),6);
  await host.evaluate(()=>CoopManager.sendPacket=savedSend);
 });
 await check('old-life healing cannot restore HP or block the reward queue after revival',async()=>{
  const r=await guest.evaluate(()=>{
   const before=player.hp,seq=CoopLoot.received+1;CoopLoot.receiveRewards([[CoopManager.myPeerId,[[seq,'killHeal',{amount:100,lifeEpoch:(player.lifeEpoch||0)-1},0]]]]);
   return {before,after:player.hp,applied:CoopLoot.received===seq};
  });assert.equal(r.after,r.before);assert.equal(r.applied,true);
 });
 await check('normal battle has no persistent banner and the top badge does not contain the scaling paragraph',async()=>{
  await host.evaluate(()=>{CoopManager.updateHUD();WorldCoop.lastUiAt=-Infinity;WorldCoop.tick(0)});
  assert.equal(await host.locator('#hud-coop-text').textContent(),'联机 2/3');
  assert.equal(await host.locator('#btn-hud-coop').getAttribute('title'),null);
  assert(!await host.locator('#coop-battle-notice').isVisible());
  assert((await host.locator('#coop-member-list').locator('..').textContent()).includes('怪物伤害不增加'));
 });
 await check('toast replacement gets its own expiration and fades away without blocking input',async()=>{
  await host.evaluate(()=>showToast('旧提示'));await pause(1500);await host.evaluate(()=>showToast('新的60%说明测试'));
  await pause(500);assert.equal(await host.locator('#toast-msg').evaluate(e=>getComputedStyle(e).opacity),'1');
  assert.equal(await host.locator('#toast-msg').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
  await pause(1700);assert.equal(await host.locator('#toast-msg').evaluate(e=>getComputedStyle(e).opacity),'0');
  await host.screenshot({path:'test-results/healing-compact-hud.png'});
 });
 assert.deepEqual(errors,[]);
 fs.writeFileSync('test-results/healing-ui.json',JSON.stringify({results,errors,scope:'Real local WebRTC, simulated public discovery, three isolated browser contexts.'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
`;
new Function('require',prefix+tail)(require);

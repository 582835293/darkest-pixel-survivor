const fs=require('node:fs'),assert=require('node:assert/strict');
const original=fs.readFileSync('tests/gameplay.cjs','utf8'),prefix=original.slice(0,original.indexOf(' await clean();'));
const tail=String.raw`
 await clean();const third=await makePage({width:390,height:844});
 await third.evaluate(code=>CoopManager.joinRoom(code),room);await third.waitForFunction(()=>WorldCoop.active()&&WorldCoop.receivedFrame>0);
 await Promise.all(pages.map(p=>p.waitForFunction(()=>CoopManager.allies.length===2&&CoopManager.allies.every(a=>CoopManager.routeFor(a.id,true).kind==='rtc'))));
 for(const p of pages)await p.evaluate(()=>{GameState.autoAttack=false;GameState.godMode=true;player.expToNext=100000;player.pendingLevelUps=0;player.x=2000;player.y=0;CoopManager.sendPresenceNow()});
 const bodyId=await guest.evaluate(()=>CoopManager.myPeerId),thirdId=await third.evaluate(()=>CoopManager.myPeerId);
 await guest.evaluate(()=>{player.x=400;CoopManager.sendPresenceNow()});
 // Exact authoritative 100 ms steps; real RTC transports snapshots and revival.
 await host.evaluate(()=>{window.rescueStep=WorldCoop.rescue.bind(WorldCoop);WorldCoop.rescue=()=>{}});
 async function helpers(hostX,thirdX){
  await host.evaluate(x=>{player.x=x;CoopManager.sendPresenceNow()},hostX);await third.evaluate(x=>{player.x=x;CoopManager.sendPresenceNow()},thirdX);
  await host.waitForFunction(({hostX,thirdX,thirdId})=>WorldCoop.participants.get(CoopManager.myPeerId)?.x===hostX&&WorldCoop.participants.get(thirdId)?.x===thirdX,{hostX,thirdX,thirdId});
 }
 async function down(){
  await guest.evaluate(()=>{player.hp=0;WorldCoop.down()});await host.waitForFunction(id=>WorldCoop.participants.get(id)?.downed,bodyId);
  await host.evaluate(id=>{const p=WorldCoop.participants.get(id);p.progress=0;p.helpers=0},bodyId);
 }
 async function step(n){return host.evaluate(({n,id})=>{for(let i=0;i<n;i++)rescueStep(.1);WorldCoop.broadcastWorld();const p=WorldCoop.participants.get(id);return {down:p.downed,progress:p.progress,helpers:p.helpers,epoch:p.epoch,hp:p.hp}},{n,id:bodyId});}
 await check('one helper needs six seconds and spectator progress uses the same six-second scale',async()=>{
  await helpers(400,2000);await down();const p=await step(59);
  assert.equal(p.down,true);assert.equal(p.helpers,1);assert(Math.abs(p.progress-5.9)<1e-6);
  await guest.waitForFunction(()=>player.rescueProgress===5.9&&player.rescueHelpers===1);await guest.evaluate(()=>CoopSpectate.tick());
  assert((await guest.locator('#spectate-status').textContent()).includes('98%'));
  assert.equal((await step(1)).down,false);await guest.waitForFunction(()=>!player.isDowned);
  assert.equal(await guest.evaluate(()=>player.hp),await guest.evaluate(()=>Math.round(player.maxHp*.4)));
 });
 await check('two simultaneous helpers revive in three seconds and their count reaches the downed client',async()=>{
  await helpers(400,400);await down();const p=await step(29);assert.equal(p.down,true);assert.equal(p.helpers,2);assert(Math.abs(p.progress-5.8)<1e-6);
  await guest.waitForFunction(()=>player.rescueHelpers===2&&player.rescueProgress===5.8);await guest.evaluate(()=>CoopSpectate.tick());
  assert((await guest.locator('#spectate-status').textContent()).includes('2人救援'));
  assert.equal((await step(1)).down,false);await guest.waitForFunction(()=>!player.isDowned&&player.rescueHelpers===0);
  await third.waitForFunction(id=>!CoopManager.allies.find(a=>a.id===id)?.downed,bodyId);
 });
 await check('helper departure slows remaining progress; only all helpers leaving resets it',async()=>{
  await down();assert(Math.abs((await step(10)).progress-2)<1e-6);
  await helpers(400,2000);const p=await step(10);assert.equal(p.helpers,1);assert(Math.abs(p.progress-3)<1e-6);
  await helpers(2000,2000);const empty=await step(1);assert.equal(empty.progress,0);assert.equal(empty.helpers,0);
  await helpers(2000,400);assert(Math.abs((await step(10)).progress-1)<1e-6);
 });
 await check('upgrading, downed, distant and stale players do not add rescue speed',async()=>{
  await helpers(400,400);await down();
  const p=await host.evaluate(({bodyId,thirdId})=>{
   const me=WorldCoop.participants.get(CoopManager.myPeerId),other=WorldCoop.participants.get(thirdId),body=WorldCoop.participants.get(bodyId);
   me.upgrading=true;me.upgradeUntil=performance.now()+20000;other.downed=true;rescueStep(.1);const downed=body.progress;
   other.downed=false;other.seen=performance.now()-6001;rescueStep(.1);const stale=body.progress;
   other.seen=performance.now();other.x=2000;rescueStep(.1);const distant=body.progress;
   me.upgrading=false;rescueStep(.1);return {downed,stale,distant,one:body.progress,count:body.helpers};
  },{bodyId,thirdId});assert.equal(p.downed,0);assert.equal(p.stale,0);assert.equal(p.distant,0);assert.equal(p.one,.1);assert.equal(p.count,1);
 });
 await check('manual team pause freezes collaborative rescue progress',async()=>{
  await helpers(400,400);await down();
  const progress=await host.evaluate(id=>{
   WorldCoop.rescue=rescueStep;WorldCoop.manualPaused=true;for(let i=0;i<30;i++)WorldCoop.tick(.1);
   const progress=WorldCoop.participants.get(id).progress;WorldCoop.rescue=()=>{};WorldCoop.manualPaused=false;WorldCoop.observe(CoopManager.myPeerId,WorldCoop.localProfile());return progress;
  },bodyId);assert.equal(progress,0);
 });
 await check('collaborative revival clears progress and repeated life packets cannot heal twice',async()=>{
  const r=await step(30);assert.equal(r.down,false);assert.equal(r.progress,0);assert.equal(r.helpers,0);
  await guest.waitForFunction(()=>!player.isDowned&&player.rescueHelpers===0&&player.rescueProgress===0);
  const life=await host.evaluate(id=>WorldCoop.packLife(WorldCoop.participants.get(id)),bodyId);
  const r2=await guest.evaluate(life=>{player.hp=51;const epoch=player.lifeEpoch;WorldCoop.applyLife(WorldCoop.unpackLife(life));WorldCoop.applyLife(WorldCoop.unpackLife(life));return {hp:player.hp,epoch:player.lifeEpoch,original:epoch}},life);
  assert.equal(r2.hp,51);assert.equal(r2.epoch,r2.original);
 });
 assert.deepEqual(errors,[]);fs.writeFileSync('test-results/rescue.json',JSON.stringify({results,errors,scope:'Three isolated browsers, real local RTC, exact authoritative rescue steps plus replicated UI/life state.'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
`;
new Function('require',prefix+tail)(require);

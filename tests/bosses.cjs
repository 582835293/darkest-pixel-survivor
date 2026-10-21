const fs=require('node:fs');
const original=fs.readFileSync('tests/gameplay.cjs','utf8'),prefix=original.slice(0,original.indexOf(' await clean();'));
const tail=String.raw`
 await clean();const solo=await makePage({width:390,height:844});
 await solo.evaluate(()=>{GameState.isStarted=true;spawnEnemyBatch=()=>{};document.getElementById('lobby-modal').style.display='none';setupHero('warrior');GameState.autoAttack=false;GameState.godMode=true;});
 async function fresh(){await solo.evaluate(()=>{UpgradeChoice.end();GameState.isOver=GameState.isPaused=false;GameState.globalFreezeTimer=0;GameState.autoAttack=false;GameState.godMode=true;player.x=player.y=0;player.hp=player.maxHp=1000;player.armor=0;player.shield=0;player.invulnerableTimer=0;player.vx=player.vy=0;input.keys={};input.x=input.y=0;for(const a of [enemies,projectiles,groundEffects,telegraphs,skyBeams,particles])a.length=0;BossCombat.impacts=[];});}
 const profiles=await solo.evaluate(()=>Object.keys(BossCombat.profiles));assert.equal(profiles.length,24);const signatures=[];
 for(const key of profiles)await check(key+' has its own two attacks, working shapes/projectiles and phase-two changes',async()=>{
  await fresh();const r=await solo.evaluate(key=>{const [biome,mark]=key.split('_');GameState.activeBiome=biome;spawnBoss(Number(mark));const boss=enemies.find(e=>e.isBoss);boss.x=-160;boss.y=0;boss.damage=20;boss.hp=boss.maxHp=1e9;const sig=[],phases=[];
   for(const phase of [false,true]){const both=[];boss.isPhase2=phase;for(let i=0;i<2;i++){for(const e of [...enemies])if(e!==boss)enemies.splice(enemies.indexOf(e),1);projectiles.length=telegraphs.length=0;boss.x=-160;boss.y=0;boss.bossCast={cd:999,step:i,busy:0,jobs:[],dash:null,phaseSeen:phase};const moves=BossCombat.profile(boss).moves;BossCombat.cast(boss,{x:160,y:50},moves[i]);const seen=new Set(),shots=new Set();let summons=0;
    for(let step=0;step<48;step++){for(const w of telegraphs)seen.add(JSON.stringify([w.type,w.x,w.y,w.x1,w.y1,w.x2,w.y2,w.radius,w.innerRadius,w.width,w.angle,w.arc,w.safeAngle,w.safeArc,Math.round(w.maxLife*100)]));for(const p of projectiles)if(p.isEnemy)shots.add([Math.round(p.vx),Math.round(p.vy)].join(','));summons=Math.max(summons,enemies.filter(e=>e!==boss).length);update(.1);}
    both.push({move:moves[i],warnings:seen.size,shots:shots.size,summons,geometry:[...seen].sort()});}
    phases.push(both);
   }return{key:boss.bossProfile,phases,phaseCd:BossCombat.profile(boss).cd*.8,normalCd:BossCombat.profile(boss).cd};},key);
  assert.equal(r.key,key);assert(r.phaseCd<r.normalCd);for(const row of r.phases.flat())assert(row.warnings>0||row.shots>0||row.summons>0,row.move);assert.notEqual(r.phases[0][0].move,r.phases[0][1].move);assert.notDeepEqual(r.phases[0],r.phases[1]);signatures.push(JSON.stringify(r.phases[0]));
 });assert.equal(new Set(signatures).size,24);
 await fresh();
 await check('damage geometry matches circle, corridor, sector and annulus including the visible safe gap',async()=>{
  const r=await solo.evaluate(()=>{const p=(x,y)=>({x,y,radius:1});return[
   BossCombat.contains({type:'circle',x:0,y:0,radius:50},p(40,0)),!BossCombat.contains({type:'circle',x:0,y:0,radius:50},p(70,0)),
   BossCombat.contains({type:'corridor',x1:0,y1:0,x2:200,y2:0,width:40},p(100,10)),!BossCombat.contains({type:'corridor',x1:0,y1:0,x2:200,y2:0,width:40},p(100,40)),
   BossCombat.contains({type:'sector',x:0,y:0,radius:200,angle:0,arc:Math.PI/2},p(100,10)),!BossCombat.contains({type:'sector',x:0,y:0,radius:200,angle:0,arc:Math.PI/2},p(-100,0)),
   BossCombat.contains({type:'ring',x:0,y:0,innerRadius:80,radius:200,safeAngle:0,safeArc:.8},p(-120,0)),!BossCombat.contains({type:'ring',x:0,y:0,innerRadius:80,radius:200,safeAngle:0,safeArc:.8},p(120,0)),!BossCombat.contains({type:'ring',x:0,y:0,innerRadius:80,radius:200,safeAngle:0,safeArc:.8},p(0,0))]});assert(r.every(Boolean));
 });
 await fresh();
 await check('warnings deal no early damage and land once at expiry without a wall-clock timeout',async()=>{
  const r=await solo.evaluate(()=>{spawnBoss(5);const b=enemies[0];b.x=-400;b.y=0;b.damage=30;b.bossCast={cd:999,step:0,busy:10,jobs:[],dash:null};GameState.godMode=false;const w=BossCombat.circle(b,0,0,60,.9,1);for(const dt of [.3,.3,.29])update(dt);const before=player.hp;update(.02);const hit=player.hp;player.invulnerableTimer=0;BossCombat.resolve(w);return{before,hit,after:player.hp}});assert.equal(r.before,1000);assert.equal(r.hit,970);assert.equal(r.after,970);
 });
 await fresh();
 await check('dash advances over simulation steps and finishes at its endpoint rather than teleporting on cast',async()=>{
  const r=await solo.evaluate(()=>{spawnBoss(5);const b=enemies[0];b.x=b.y=0;BossCombat.dash(b,300,0);const start=b.x;BossCombat.tick(b,player,.1);const middle=b.x;BossCombat.tick(b,player,.4);const end=b.x,done=!b.bossCast.dash;b.x=b.y=0;b.bossCast.cd=999;player.x=200;player.y=0;BossCombat.cast(b,player,'bloodHunt');BossCombat.tick(b,player,.01);const w=telegraphs.find(t=>t.bossAttack&&t.type==='circle');player.x=500;player.y=100;BossCombat.resolve(w);return{start,middle,end,done,locked:b.bossCast.dash.tx===200&&b.bossCast.dash.ty===0}});assert.equal(r.start,0);assert(r.middle>0&&r.middle<300);assert.equal(r.end,300);assert(r.done&&r.locked);
 });
 await fresh();
 await check('solo pause and global freeze stop cast clocks, telegraph expiry and delayed summon actions',async()=>{
  const r=await solo.evaluate(()=>{spawnBoss(5);const b=enemies[0];b.x=-300;b.bossCast={cd:2,step:0,busy:0,jobs:[],dash:null};let jobs=0;BossCombat.later(b,.5,()=>jobs++);const w=BossCombat.circle(b,0,0,50,1);GameState.isPaused=true;update(1);const paused=[w.life,b.bossCast.cd,jobs];GameState.isPaused=false;GameState.globalFreezeTimer=2;update(.5);const frozen=[w.life,b.bossCast.cd,jobs];return{paused,frozen}});assert.deepEqual(r.paused,[1,2,0]);assert.deepEqual(r.frozen,[1,2,0]);
 });
 await fresh();
 await check('killing a boss cancels queued warnings, dashes and summons so no ghost attack lands afterwards',async()=>{
  const r=await solo.evaluate(()=>{GameState.activeBiome='graveyard';spawnBoss(10);const b=enemies[0];b.isFinalBoss=false;b.x=-300;b.damage=40;BossCombat.cast(b,player,'boneCourt');BossCombat.later(b,.2,()=>BossCombat.summon(b,0,0,'skeleton',4));killEnemy(b);const before=player.hp;for(let i=0;i<30;i++)update(.1);return{hp:player.hp===before,helpers:enemies.filter(e=>e.bossSummoner===b.netId).length,warnings:telegraphs.filter(t=>t.bossAttack&&!t.cancelled).length,jobs:b.bossCast.jobs.length}});assert.deepEqual(r,{hp:true,helpers:0,warnings:0,jobs:0});
 });
 await fresh();
 await check('boss warning renderers stay visible when own and teammate VFX opacity are both zero',async()=>{
  const r=await solo.evaluate(()=>{const list=[{type:'circle',x:0,y:0,radius:70},{type:'corridor',x1:-120,y1:0,x2:120,y2:30,width:40},{type:'sector',x:0,y:0,radius:130,angle:0,arc:1.4},{type:'ring',x:0,y:0,radius:140,innerRadius:70,safeAngle:0,safeArc:.8}],out=[];const old=VisualSettings.selfTransparency,a=CoopManager.allyVfxAlpha;VisualSettings.selfTransparency=100;CoopManager.allyVfxAlpha=0;for(const w of list){const canvas=document.createElement('canvas');canvas.width=canvas.height=400;const c=canvas.getContext('2d');c.translate(200,200);BossCombat.draw(c,{...w,life:.5,maxLife:1,color:'#7dd3fc'});out.push(c.getImageData(0,0,400,400).data.some(v=>v!==0))}VisualSettings.selfTransparency=old;CoopManager.allyVfxAlpha=a;return out});assert(r.every(Boolean));
 });
 await fresh();
 await check('boss helper summons and enemy bullets have explicit population caps',async()=>{
  const r=await solo.evaluate(()=>{spawnBoss(5);const b=enemies[0];for(let i=0;i<120;i++)BossCombat.summon(b,500,0,'skeleton',4);for(let i=0;i<200;i++)BossCombat.bullet(b,0,0,i,150);return{enemies:enemies.length,bullets:projectiles.filter(p=>p.isEnemy).length}});assert.equal(r.enemies,320);assert.equal(r.bullets,120);
 });
 await clean();
 await check('real RTC snapshots carry the exact boss profile, move and noncircular warning; guests run no boss AI',async()=>{
  await host.evaluate(()=>{GameState.activeBiome='tundra';spawnBoss(15);const b=enemies.find(e=>e.isBoss);b.x=0;b.y=0;b.damage=20;b.bossCast={cd:999,step:0,busy:100,jobs:[],dash:null};b.bossMove='极寒龙息';BossCombat.sector(b,0,0,0,1.05,420,2,1);WorldCoop.broadcastWorld()});await guest.waitForFunction(()=>enemies.some(e=>e.bossProfile==='tundra_15')&&telegraphs.some(w=>w.bossAttack&&w.type==='sector'));
  const r=await guest.evaluate(()=>{const b=enemies.find(e=>e.isBoss),w=telegraphs.find(w=>w.bossAttack);return{profile:b.bossProfile,move:b.bossMove,ui:document.getElementById('boss-move-text').textContent,ai:Boolean(b.bossCast),type:w.type,angle:w.angle,arc:w.arc,radius:w.radius}});assert.deepEqual(r,{profile:'tundra_15',move:'极寒龙息',ui:'极寒龙息',ai:false,type:'sector',angle:0,arc:1.05,radius:420});
 });
 await clean();
 async function netBoss(){await host.evaluate(()=>{telegraphs.length=0;spawnBoss(5);const b=enemies.find(e=>e.isBoss);b.x=-200;b.y=0;b.damage=20;b.bossCast={cd:999,step:0,busy:100,jobs:[],dash:null};WorldCoop.broadcastWorld()});await guest.waitForFunction(()=>enemies.some(e=>e.isBoss));await guest.evaluate(()=>{player.x=300;player.y=0;player.hp=player.maxHp=200;player.shield=0;player.armor=0;player.invulnerableTimer=0;GameState.godMode=false;CoopManager.sendPresenceNow()});}
 await check('guest resolves its visible corridor once despite duplicate impact packets and replayed world frames',async()=>{
  await netBoss();await host.evaluate(()=>{const b=enemies.find(e=>e.isBoss);window.testBossWarning=BossCombat.line(b,200,0,400,0,60,1.1,1);WorldCoop.broadcastWorld()});await guest.waitForFunction(()=>player.hp===180);const pkt=await host.evaluate(()=>WorldCoop.packet({type:'WORLD_BOSS_IMPACT',warning:BossCombat.pack(testBossWarning)}));await pause(800);await host.evaluate(pkt=>{CoopManager.sendPacket(pkt);CoopManager.sendPacket(pkt);WorldCoop.broadcastWorld()},pkt);await pause(350);assert.equal(await guest.evaluate(()=>player.hp),180);
 });
 await check('lost impact control still resolves an already received warning at the guest',async()=>{
  await guest.evaluate(()=>{player.hp=200;player.invulnerableTimer=0});await host.evaluate(()=>{window.bossSend=CoopManager.sendPacket;CoopManager.sendPacket=function(p,...a){if(p.type==='WORLD_BOSS_IMPACT')return;return bossSend.call(this,p,...a)};const b=enemies.find(e=>e.isBoss);BossCombat.circle(b,300,0,70,1.1,1);WorldCoop.broadcastWorld()});await guest.waitForFunction(()=>player.hp===180);await host.evaluate(()=>CoopManager.sendPacket=bossSend);
 });
 await check('lost warning snapshots recover through an impact cue before damage instead of an invisible instant hit',async()=>{
  await guest.evaluate(()=>{player.hp=200;player.invulnerableTimer=0;window.bossArrival=null;window.bossExpected=null;window.receiveBossImpact=BossCombat.receive;BossCombat.receive=function(p){const hp=player.hp;receiveBossImpact.call(this,p);if(p.warning.netId===bossExpected)bossArrival={hpBefore:hp,hpAfter:player.hp,cue:telegraphs.some(w=>w.netId===p.warning.netId&&w.life>0)}}});
  const id=await host.evaluate(()=>{window.bossEncode=WorldCoop.encodeWorld;WorldCoop.encodeWorld=function(){const f=bossEncode.call(this);f.warnings=f.warnings.filter(w=>!w.bossAttack);return f};const b=enemies.find(e=>e.isBoss);return BossCombat.circle(b,300,0,70,.9,1).netId});await guest.evaluate(id=>bossExpected=id,id);await guest.waitForFunction(()=>bossArrival!==null);const arrival=await guest.evaluate(()=>bossArrival);assert.deepEqual(arrival,{hpBefore:200,hpAfter:200,cue:true});await guest.waitForFunction(()=>player.hp===180);await host.evaluate(()=>WorldCoop.encodeWorld=bossEncode);await guest.evaluate(()=>BossCombat.receive=receiveBossImpact);
 });
 await check('stale-round impacts, invalid shape payloads and guest-originated boss commands cannot damage another player',async()=>{
  await guest.evaluate(()=>{player.hp=200;player.invulnerableTimer=0});await host.evaluate(()=>{CoopManager.sendPacket({...WorldCoop.packet({type:'WORLD_BOSS_IMPACT',warning:{bossAttack:true,bossId:enemies[0].netId,netId:999991,type:'circle',x:300,y:0,radius:70,damage:20}}),session:'retired-boss-round'});CoopManager.sendPacket(WorldCoop.packet({type:'WORLD_BOSS_IMPACT',warning:{bossAttack:true,bossId:enemies[0].netId,netId:999992,type:'sector',x:300,y:0,radius:70,angle:0,arc:99,damage:20}}))});await guest.evaluate(()=>CoopManager.sendPacket(WorldCoop.packet({type:'WORLD_BOSS_IMPACT',warning:{bossAttack:true,bossId:1,netId:999993,type:'circle',x:0,y:0,radius:70,damage:20}})));await pause(400);assert.equal(await guest.evaluate(()=>player.hp),200);
 });
 assert.deepEqual(errors,[]);fs.writeFileSync('test-results/bosses.json',JSON.stringify({results,errors,scope:'All eighteen actual boss spawns and both-phase casts, shape/hit boundaries, simulation clocks and local RTC loss/duplicate recovery. No Android hardware or carrier latency claim.'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
`;
new Function('require',prefix+tail)(require);

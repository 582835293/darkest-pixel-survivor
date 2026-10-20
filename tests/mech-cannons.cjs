const fs=require('node:fs');
const original=fs.readFileSync('tests/gameplay.cjs','utf8'),prefix=original.slice(0,original.indexOf(' await clean();'));
const tail=String.raw`
 await clean();const solo=await makePage();for(const p of [host,guest,solo])await p.evaluate(()=>{window.realUpdate=update;update=()=>{};});
 async function fresh(p=solo){await p.evaluate(()=>{setupHero('engineer');GameState.isStarted=true;GameState.isOver=false;GameState.isPaused=false;GameState.autoAttack=false;GameState.godMode=true;GameState.gameTime=0;GameState.globalFreezeTimer=0;GameState.berserkTimer=0;GameState.powerShrineTimer=0;UpgradeChoice.reset();MenuPause.reset();player.x=player.y=player.vx=player.vy=0;player.level=1;player.hp=50;player.maxHp=100;player.isDowned=false;player.lifeEpoch=0;player.pendingLevelUps=0;player.critChance=0;player.catchBuffTimer=0;player.expToNext=1e8;player.isCharging=false;player.chargeTimer=0;input.x=input.y=0;input.keys={};input.isHoldingAttack=false;spawnEnemyBatch=()=>{};for(const a of [enemies,projectiles,groundEffects,skyBeams,telegraphs,gems,goldDrops])a.length=0;for(const el of document.querySelectorAll('.modal-overlay'))el.style.display='none';});}
 await check('base ultimate immediately fires four real secondary explosive shells from the four visible cannon ports',async()=>{
  await fresh();const r=await solo.evaluate(()=>{executeUlt();return{shells:projectiles.filter(p=>p.forgeCannon).map(p=>({r:Math.hypot(p.x,p.y),damage:p.damage,secondary:p.isSecondary,grenade:p.isGrenade,angle:Math.atan2(p.vy,p.vx)})),flashes:skyBeams.filter(s=>s.type==='forge_muzzle').length}});assert.equal(r.shells.length,4);assert.equal(r.flashes,4);for(const p of r.shells){assert(Math.abs(p.r-115)<1e-6);assert(p.secondary&&p.grenade);assert.equal(p.damage,31.5);}assert.equal(new Set(r.shells.map(p=>p.angle.toFixed(1))).size,4);
 });
 await check('awakened cannons fire eight shells per volley and repeat every .45s within the existing projectile budget',async()=>{
  await fresh();const r=await solo.evaluate(()=>{player.skills.ult.isEvolved=true;executeUlt();const first=projectiles.filter(p=>p.forgeCannon).length;EngineerKit.tick(.44);const before=projectiles.filter(p=>p.forgeCannon).length;EngineerKit.tick(.02);const after=projectiles.filter(p=>p.forgeCannon).length;for(let i=0;i<100;i++)EngineerKit.cannons();return{first,before,after,total:projectiles.filter(p=>p.isRivet).length}});assert.deepEqual([r.first,r.before,r.after],[8,8,16]);assert(r.total<=150);
 });
 await check('a cannon shell crosses space and causes actual direct and explosion damage beyond the initial ultimate burst',async()=>{
  await fresh();const r=await solo.evaluate(()=>{const e=createEnemy(200,0,'imp');e.hp=e.maxHp=1000;e.speed=0;e.freezeTimer=5;executeUlt();const burst=e.hp;realUpdate(.2);return{burst,hp:e.hp,blast:skyBeams.some(s=>s.type==='forge_blast'&&s.radius===70)}});assert.equal(r.burst,1000);assert(r.hp<1000&&r.blast);
 });
 await check('overdrive shortens primary interval by 35% and charge time by 30%, then restores both without altering base stats',async()=>{
  await fresh();const r=await solo.evaluate(()=>{const base=player.chargeMax,cd=player.skills.attack.cd;executeUlt();executeAttack();const boosted={attack:player.skills.attack.timer,charge:chargeDuration()};GameState.forgeOverdriveTimer=0;player.skills.attack.timer=0;executeAttack();return{base,cd,boosted,after:chargeDuration(),attack:player.skills.attack.timer,stored:player.chargeMax}});assert(Math.abs(r.boosted.attack-r.cd*.65)<1e-8);assert(Math.abs(r.boosted.charge-r.base*.7)<1e-8);assert.equal(r.after,r.base);assert.equal(r.stored,r.base);assert.equal(r.attack,r.cd);
 });
 await check('held attack uses the shorter charged-release threshold during overdrive and the normal threshold afterwards',async()=>{
  await fresh();const r=await solo.evaluate(()=>{executeUlt();GameState.autoAttack=true;input.isHoldingAttack=true;player.isCharging=true;for(let i=0;i<10;i++)realUpdate(.05);const boosted=projectiles.some(p=>p.forgeRocket);GameState.forgeOverdriveTimer=0;projectiles.length=0;player.chargeTimer=0;for(let i=0;i<10;i++)realUpdate(.05);return{boosted,normal:projectiles.some(p=>p.forgeRocket),progress:player.chargeTimer}});assert(r.boosted);assert(!r.normal);assert(r.progress>=.49&&r.progress<.68);
 });
 await check('menus, upgrade phasing, death and expired overdrive cannot create cannon rounds',async()=>{
  await fresh();const r=await solo.evaluate(()=>{const rows=[];for(const mode of ['menu','upgrade','down','expired']){GameState.forgeOverdriveTimer=mode==='expired'?0:5;GameState.isPaused=mode==='menu';UpgradeChoice.active=mode==='upgrade';player.isDowned=mode==='down';projectiles.length=0;EngineerKit.cannons();rows.push(projectiles.length);}return rows});assert.deepEqual(r,[0,0,0,0]);
 });
 await check('cannon visual packing preserves native shells without creating a second combat projectile',async()=>{
  await fresh();const r=await solo.evaluate(()=>{executeUlt();const p=projectiles.find(p=>p.forgeCannon),before=projectiles.length,v=CoopSkillVfx.unpack(CoopSkillVfx.pack('projectile',1,p)).obj;return{before,after:projectiles.length,shell:v.forgeCannon,explosive:v.isGrenade,color:v.color,radius:v.radius}});assert.equal(r.before,r.after);assert(r.shell&&r.explosive);assert.equal(r.color,'#fb923c');assert.equal(r.radius,11);
 });
 async function team(){await clean();for(const p of [host,guest])await fresh(p);await host.evaluate(()=>{player.x=1000;CoopManager.sendPresenceNow()});await guest.evaluate(()=>CoopManager.sendPresenceNow());await pause(150);}
 async function target(hp){const id=await host.evaluate(hp=>{const e=createEnemy(200,0,'imp');e.hp=e.maxHp=hp;e.speed=0;e.freezeTimer=5;WorldCoop.broadcastWorld();return WorldCoop.identify(e)},hp);await guest.waitForFunction(id=>enemies.some(e=>e.netId===id),id);return id;}
 await check('real guest cannon damage reaches the host once and its shell visuals do not damage twice on the host',async()=>{
  await team();const id=await target(1000);await guest.evaluate(()=>{executeUlt();realUpdate(.2);WorldCoop.flushHits(performance.now()+100)});await host.waitForFunction(id=>enemies.find(e=>e.netId===id)?.hp<1000,id);const hp=await host.evaluate(id=>enemies.find(e=>e.netId===id).hp,id);await pause(500);assert.equal(await host.evaluate(id=>enemies.find(e=>e.netId===id).hp,id),hp);assert.equal(await host.evaluate(()=>player.hp),50);
 });
 await check('a cannon kill grants only the actual guest its tenth-kill healing, never the host',async()=>{
  await team();const id=await target(5),peer=await guest.evaluate(()=>CoopManager.myPeerId);await host.evaluate(peer=>WorldCoop.participants.get(peer).personalKills=9,peer);await guest.evaluate(()=>{player.passives.bloodPact=2;executeUlt();realUpdate(.2);WorldCoop.flushHits(performance.now()+100)});await guest.waitForFunction(()=>player.hp===58);assert.equal(await host.evaluate(()=>player.hp),50);assert.equal(await host.evaluate(peer=>WorldCoop.participants.get(peer).personalKills,peer),10);
 });
 assert.deepEqual(errors,[]);
})().catch(e=>{console.error(e);results.failure=String(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close();fs.writeFileSync('test-results/mech-cannons.json',JSON.stringify({results,errors,failure:results.failure,scope:'Real explosive projectiles, held-input timing, temporary buffs, native VFX and two-client RTC damage/healing ownership.'},null,2))});
`;
new Function('require',prefix+tail)(require);

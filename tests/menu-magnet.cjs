const fs=require('node:fs');
const original=fs.readFileSync('tests/gameplay.cjs','utf8'),prefix=original.slice(0,original.indexOf(' await clean();'));
const tail=String.raw`
 await clean();const guestId=await guest.evaluate(()=>CoopManager.myPeerId);
 async function clearMenus(){for(const p of [host,guest])await p.evaluate(()=>{for(const el of document.querySelectorAll('.modal-overlay'))el.style.display='none';CoopMap.toggle(false);GameState.isPaused=false;MenuPause.sync();CoopManager.sendPresenceNow()});await clean();}
 await check('guest magnet receives far-away crystal ownership in compact snapshots and earns all its XP',async()=>{
  await guest.evaluate(()=>{player.x=600;CoopManager.sendPresenceNow()});await pause(150);
  await host.evaluate(()=>{for(let i=0;i<5;i++)spawnGemCrystal(1300+i*200,100,7+i);fieldPickups.push({x:600,y:0,type:'magnet',radius:18,color:'#c084fc',icon:'🧲'});WorldCoop.broadcastWorld()});
  await host.waitForFunction(id=>gems.length>0&&gems.every(g=>g.magnetOwner===id),guestId);
  await guest.waitForFunction(()=>gems.some(g=>g.magnetOwner===CoopManager.myPeerId));
  await guest.waitForFunction(()=>player.exp===45&&gems.length===0,null,{timeout:6000});await host.waitForFunction(()=>gems.length===0);
  assert.equal(await host.evaluate(()=>player.exp),0);
 });
 await clearMenus();
 await check('host magnet also credits only its picker; snapshot/reward replay cannot duplicate XP',async()=>{
  await guest.evaluate(()=>{player.x=2000;CoopManager.sendPresenceNow()});await pause(150);
  await host.evaluate(()=>{spawnGemCrystal(-900,0,17);fieldPickups.push({x:0,y:0,type:'magnet',radius:18,color:'#c084fc',icon:'🧲'});WorldCoop.broadcastWorld()});
  await host.waitForFunction(()=>player.exp===17&&gems.length===0);assert.equal(await guest.evaluate(()=>player.exp),0);
  const r=await host.evaluate(()=>{const a=CoopLoot.account(CoopManager.myPeerId),xp=player.exp;CoopLoot.receiveRewards([[CoopManager.myPeerId,[[a.next,'xp',17]]]]);return {xp,after:player.exp}});assert.equal(r.xp,r.after);
 });
 await clearMenus();
 await check('crystals remain competitive: another player can intercept by actual contact',async()=>{
  await guest.evaluate(()=>{player.x=600;CoopManager.sendPresenceNow()});await pause(150);
  await host.evaluate(id=>{spawnGemCrystal(0,0,11);CoopLoot.applyWorldItem({type:'magnet'},WorldCoop.participants.get(id));CoopLoot.step(.01)},guestId);
  await host.waitForFunction(()=>player.exp===11);assert.equal(await guest.evaluate(()=>player.exp),0);
 });
 await clearMenus();
 await check('HUD opens Menu; guest has no team-pause button and cannot trigger it',async()=>{
  assert.equal((await guest.locator('#btn-pause').textContent()).trim(),'☰菜单');
  await guest.locator('#btn-pause').click();await guest.waitForFunction(()=>MenuPause.open);
  assert(!await guest.locator('#btn-team-pause').isVisible());assert.equal(await guest.evaluate(()=>WorldCoop.toggleTeamPause()),false);
  assert.equal(await host.evaluate(()=>WorldCoop.manualPaused),false);
 });
 await check('guest menu is stationary/protected while host AI and time continue',async()=>{
  await host.evaluate(()=>{const e=createEnemy(1000,0,'imp');e.hp=e.maxHp=5000;WorldCoop.broadcastWorld()});
  const before=await host.evaluate(()=>({time:GameState.gameTime,x:enemies[0].x}));
  const r=await guest.evaluate(()=>{GameState.godMode=false;player.shield=0;player.invulnerableTimer=0;const hp=player.hp,x=player.x;input.keys.KeyD=true;damagePlayer(20);executeAttack();update(.05);return{hp,after:player.hp,x,afterX:player.x,canAct:WorldCoop.canAct(),protection:MenuPause.remaining()}});
  assert.equal(r.hp,r.after);assert.equal(r.x,r.afterX);assert.equal(r.canAct,false);assert(r.protection>8&&r.protection<=10);
  await pause(250);const after=await host.evaluate(()=>({time:GameState.gameTime,x:enemies[0].x}));assert(after.time>before.time+.1);assert(after.x!==before.x);
 });
 await clearMenus();
 await check('host menu leaves guest movement, attacks, XP pickup and enemy AI running',async()=>{
  await host.locator('#btn-pause').click();await host.waitForFunction(()=>MenuPause.open);
  assert(await host.locator('#btn-team-pause').isVisible());
  await guest.evaluate(()=>{player.x=500;CoopManager.sendPresenceNow()});await pause(150);
  await host.evaluate(()=>{const e=createEnemy(900,0,'imp');e.hp=e.maxHp=5000;spawnGemCrystal(500,0,13);WorldCoop.broadcastWorld()});
  await guest.waitForFunction(()=>player.exp===13&&enemies.length===1);
  const hp=await host.evaluate(()=>enemies[0].hp);await guest.evaluate(()=>damageEnemy(enemies[0],25,0,0));await host.waitForFunction(hp=>enemies[0].hp<hp,hp);
  const r=await guest.evaluate(()=>{const x=player.x;input.keys.KeyD=true;update(.05);input.keys={};return{x,after:player.x}});assert(r.after>r.x);
  assert.equal(await host.evaluate(()=>WorldCoop.encodeWorld().paused),false);
 });
 await check('only the host explicit pause freezes both worlds and closing Menu does not resume the team',async()=>{
  await host.locator('#btn-team-pause').click();await guest.waitForFunction(()=>WorldCoop.teamPaused);
  const before=await host.evaluate(()=>GameState.gameTime);await host.locator('#btn-resume').click();await pause(250);
  assert.equal(await host.evaluate(()=>GameState.gameTime),before);assert.equal(await guest.evaluate(()=>WorldCoop.canAct()),false);
  await host.locator('#btn-pause').click();assert((await host.locator('#btn-team-pause').textContent()).includes('恢复'));
  await host.locator('#btn-team-pause').click();await guest.waitForFunction(()=>!WorldCoop.teamPaused);
  await pause(200);assert((await host.evaluate(()=>GameState.gameTime))>before);
  assert.equal(await host.evaluate(()=>GameState.isPaused),true);
  const revision=await guest.evaluate(()=>WorldCoop.pauseRevision);await guest.evaluate(rev=>WorldCoop.receivePause(true,rev-1),revision);assert.equal(await guest.evaluate(()=>WorldCoop.teamPaused),false);
 });
 await clearMenus();
 await check('world snapshots repair lost host pause controls; guest-originated pause packets are ignored',async()=>{
  await host.evaluate(()=>{window.originalSend=CoopManager.sendPacket;CoopManager.sendPacket=function(p,...args){if(p.type==='WORLD_PAUSE')return false;return originalSend.call(this,p,...args)};WorldCoop.toggleTeamPause()});
  await guest.waitForFunction(()=>WorldCoop.teamPaused);await host.evaluate(()=>WorldCoop.toggleTeamPause());await guest.waitForFunction(()=>!WorldCoop.teamPaused);
  await host.evaluate(()=>{CoopManager.sendPacket=originalSend;const rev=WorldCoop.pauseRevision;WorldCoop.receive({type:'WORLD_PAUSE',peerId:CoopManager.allies[0].id,session:WorldCoop.session,paused:true,pauseRevision:rev+99})});assert.equal(await host.evaluate(()=>WorldCoop.manualPaused),false);
 });
 await check('multiplayer big map protects only its viewer, stops local actions and does not freeze the team',async()=>{
  await guest.evaluate(()=>CoopMap.toggle(true));await guest.waitForFunction(()=>MenuPause.open);
  const r=await guest.evaluate(()=>({remaining:MenuPause.remaining(),act:WorldCoop.canAct(),paused:GameState.isPaused,profile:WorldCoop.localProfile().paused}));assert(r.remaining>9);assert.equal(r.act,false);assert.equal(r.paused,false);assert.equal(r.profile,true);
  const time=await host.evaluate(()=>GameState.gameTime);await pause(200);assert((await host.evaluate(()=>GameState.gameTime))>time);await guest.evaluate(()=>CoopMap.toggle(false));await guest.waitForFunction(()=>!MenuPause.open);assert.equal(await guest.evaluate(()=>WorldCoop.canAct()),true);
 });
 await check('direct skill tree, shop, save, developer and system menus share non-pausing protection semantics',async()=>{
  const menus=[['openSkillTreeModal','closeSkillTreeModal'],['openShopModal','closeShopModal'],['openSaveModal','closeSaveModal'],['openDevModal','closeDevModal']];
  for(const [open,close]of menus){await guest.evaluate(open=>window[open](),open);await guest.waitForFunction(()=>MenuPause.remaining()>0);const before=await host.evaluate(()=>GameState.gameTime);await pause(100);assert((await host.evaluate(()=>GameState.gameTime))>before);assert.equal(await host.evaluate(()=>WorldCoop.paused()),false);await guest.evaluate(close=>window[close](),close);await guest.waitForFunction(()=>!MenuPause.open);}
  await guest.evaluate(()=>AudioSettings.open());await guest.waitForFunction(()=>MenuPause.open);assert.equal(await host.evaluate(()=>WorldCoop.paused()),false);await guest.evaluate(()=>AudioSettings.close());await guest.waitForFunction(()=>!MenuPause.open);
 });
 await clearMenus();
 await check('nested menus keep one wall-clock 10-second deadline; expiry permits contact, bullet and area damage',async()=>{
  await guest.locator('#btn-pause').click();await guest.waitForFunction(()=>MenuPause.open);
  const deadline=await guest.evaluate(()=>MenuPause.deadline),start=Date.now();
  await guest.locator('#btn-pause-skilltree').click();await pause(100);await guest.locator('#btn-close-skilltree').click();
  await guest.locator('#btn-pause-settings').click();await pause(100);await guest.locator('#btn-settings-back').click();
  assert.equal(await guest.evaluate(()=>MenuPause.deadline),deadline);
  await guest.evaluate(()=>{GameState.godMode=false;player.armor=0;player.hp=player.maxHp=300;player.shield=0;player.invulnerableTimer=0;damagePlayer(12)});assert.equal(await guest.evaluate(()=>player.hp),300);
  await guest.waitForFunction(()=>MenuPause.remaining()===0,null,{timeout:11000});assert(Date.now()-start>9000);
  const r=await guest.evaluate(()=>{enemies.length=0;const e={x:player.x,y:player.y,radius:12,damage:12,hp:100};enemies.push(e);player.invulnerableTimer=0;WorldCoop.localCombat(.05);const contact=player.hp;player.invulnerableTimer=0;WorldCoop.localProjectileHit({x:player.x,y:player.y,radius:5,damage:12,life:1});const bullet=player.hp;player.invulnerableTimer=0;WorldCoop.resolveWarning({netId:987654,radius:100,x:player.x,y:player.y,damage:12});return{contact,bullet,area:player.hp,paused:GameState.isPaused}});
  assert.deepEqual(r,{contact:288,bullet:276,area:264,paused:true});await guest.waitForFunction(()=>document.getElementById('menu-protection-status').textContent.includes('已结束'));
 });
 await clearMenus();
 await check('a menu player cannot collect drops or rescue, while another helper still advances rescue',async()=>{
  const r=await host.evaluate(id=>{GameState.isPaused=true;MenuPause.sync();WorldCoop.observe(CoopManager.myPeerId,WorldCoop.localProfile());const me=WorldCoop.participants.get(CoopManager.myPeerId),guest=WorldCoop.participants.get(id);guest.x=0;guest.y=0;const body={id:'test-body',started:true,x:0,y:0,downed:true,epoch:0,hp:0,maxHp:100,seen:performance.now(),progress:0};WorldCoop.participants.set(body.id,body);WorldCoop.rescue(.1);WorldCoop.participants.delete(body.id);return{eligible:CoopLoot.eligible(me),helpers:body.helpers,progress:body.progress}},guestId);
  assert.equal(r.eligible,false);assert.equal(r.helpers,1);assert.equal(r.progress,.1);
 });
 await clearMenus();
 await check('death while a menu remains open closes every nested panel and retains spectator/rescue',async()=>{
  await guest.locator('#btn-pause').click();await guest.locator('#btn-pause-settings').click();
  await guest.evaluate(()=>{MenuPause.deadline=performance.now()-1;GameState.godMode=false;player.reviveLeft=0;player.hp=10;player.shield=0;player.invulnerableTimer=0;damagePlayer(10000)});
  await guest.waitForFunction(()=>player.isDowned);assert.equal(await guest.evaluate(()=>GameState.isPaused),false);assert(!await guest.locator('#settings-modal').isVisible());assert(!await guest.locator('#pause-modal').isVisible());
  await host.waitForFunction(id=>WorldCoop.participants.get(id)?.downed,guestId);
 });
 assert.deepEqual(errors,[]);fs.writeFileSync('test-results/menu-magnet.json',JSON.stringify({results,errors,scope:'Isolated browsers, actual local RTC data channels, real 10-second wall-clock expiry, no public player rooms.'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
`;
new Function('require',prefix+tail)(require);

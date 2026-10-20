const fs=require('node:fs');
const original=fs.readFileSync('tests/gameplay.cjs','utf8'),prefix=original.slice(0,original.indexOf(' await clean();'));
const tail=String.raw`
 await clean();const solo=await makePage();
 for(const p of [solo,host,guest])await p.evaluate(()=>{window.realUpdate=update;update=()=>{};});
 async function fresh(p=solo,hero='warrior') {await p.evaluate(hero=>{
  setupHero(hero);GameState.isStarted=true;GameState.isOver=false;GameState.isPaused=false;GameState.autoAttack=false;GameState.godMode=true;GameState.timeScale=1;GameState.activeBiome='dungeon';GameState.globalFreezeTimer=0;GameState.forgeOverdriveTimer=0;MenuPause.reset();UpgradeChoice.reset();CoopMap.toggle(false);CombatKeys.reset();player.x=player.y=player.vx=player.vy=0;player.isDowned=false;player.invulnerableTimer=0;player.expToNext=1e9;player.pendingLevelUps=0;spawnEnemyBatch=()=>{};
  for(const a of [enemies,projectiles,groundEffects,skyBeams,telegraphs,destructibles])a.length=0;for(const e of document.querySelectorAll('.modal-overlay'))e.style.display='none';CoopSocial.toggle(false);CombatKeys.focus();
 },hero);}
 await check('clicking the actual expedition button focuses the battlefield and WASD works immediately',async()=>{
  await solo.evaluate(()=>{GameState.isStarted=false;document.querySelectorAll('.modal-overlay').forEach(e=>e.style.display='none');document.getElementById('lobby-modal').style.display='flex'});await solo.locator('#btn-start-game').click();assert.equal(await solo.evaluate(()=>document.activeElement===canvas),true);await solo.keyboard.down('w');const y=await solo.evaluate(()=>{const y=player.y;realUpdate(.1);return player.y-y});await solo.keyboard.up('w');assert(y<0);
 });
 await check('real WASD and arrow keyboard events move all five heroes in all four directions',async()=>{
  for(const hero of Object.keys(await solo.evaluate(()=>HERO_CONFIGS)))for(const [key,axis,sign]of [['w','y',-1],['a','x',-1],['s','y',1],['d','x',1],['ArrowUp','y',-1],['ArrowRight','x',1]]){await fresh(solo,hero);await solo.keyboard.down(key);await solo.evaluate(()=>{for(let i=0;i<10;i++)realUpdate(.02)});await solo.keyboard.up(key);const r=await solo.evaluate(axis=>({pos:player[axis],keys:Object.values(input.keys).some(Boolean)}),axis);assert(r.pos*sign>15,hero+' '+key+' '+JSON.stringify(r));assert(!r.keys);}
 });
 await check('J/Space attack and charge; K/L/U/I cast actual skills for all five heroes',async()=>{
  for(const hero of Object.keys(await solo.evaluate(()=>HERO_CONFIGS))){await fresh(solo,hero);for(const [key,skill]of [['j','attack'],['k','skill1'],['l','skill2'],['u','ult'],['i','item']]){await solo.keyboard.press(key);const timer=await solo.evaluate(skill=>player.skills[skill].timer,skill);assert(timer>0,hero+' '+key);}
   await fresh(solo,hero);await solo.keyboard.down('Space');await solo.evaluate(()=>{for(let i=0;i<24;i++)realUpdate(.05)});const charged=await solo.evaluate(()=>player.chargeTimer>=chargeDuration());await solo.keyboard.up('Space');assert(charged,hero);assert.equal(await solo.evaluate(()=>player.isCharging),false);
  }
 });
 await check('missing code falls back to key/keyCode and Chinese IME physical codes still control combat',async()=>{
  await fresh();const r=await solo.evaluate(()=>{const rows=[];for(const data of [{key:'w'},{key:'W'},{key:'Unidentified',keyCode:87},{key:'Process',code:'KeyW',isComposing:true}]){CombatKeys.reset();window.dispatchEvent(new KeyboardEvent('keydown',{...data,bubbles:true,cancelable:true}));rows.push(input.keys.KeyW===true);window.dispatchEvent(new KeyboardEvent('keyup',{...data,bubbles:true}));rows.push(!input.keys.KeyW);}window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'k',bubbles:true}));return{rows,s1:player.skills.skill1.timer}});assert(r.rows.every(Boolean));assert(r.s1>0);
 });
 await check('typing chat, room fields and editable text never moves or casts; key release into a field cannot stick movement',async()=>{
  await fresh();await solo.keyboard.down('w');await solo.evaluate(()=>{const e=document.createElement('input');e.id='keyboard-test-field';document.body.append(e);e.focus()});await solo.keyboard.up('w');await solo.keyboard.type('wasdjklui');assert.deepEqual(await solo.evaluate(()=>({keys:Object.values(input.keys).some(Boolean),timer:player.skills.skill1.timer,charge:player.isCharging})),{keys:false,timer:0,charge:false});await solo.evaluate(()=>document.getElementById('keyboard-test-field').remove());
  for(const id of ['social-input','coop-room-input']){await solo.evaluate(id=>{const e=document.getElementById(id);e.closest('.modal-overlay')&&(e.closest('.modal-overlay').style.display='flex');if(id==='social-input')document.getElementById('coop-social-panel').style.display='block';e.disabled=false;e.style.display='block';e.focus();e.dispatchEvent(new KeyboardEvent('keydown',{key:'k',code:'KeyK',bubbles:true}));},id);assert.equal(await solo.evaluate(()=>player.skills.skill1.timer),0);}
 });
 await check('losing focus clears movement and charge; repeat cannot repeatedly toggle the menu',async()=>{
  await fresh();await solo.keyboard.down('w');await solo.keyboard.down('j');await solo.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.deepEqual(await solo.evaluate(()=>[Object.values(input.keys).some(Boolean),input.isHoldingAttack,player.isCharging]),[false,false,false]);await solo.keyboard.up('w');await solo.keyboard.up('j');await solo.keyboard.down('p');const paused=await solo.evaluate(()=>GameState.isPaused);await solo.keyboard.down('p');assert.equal(await solo.evaluate(()=>GameState.isPaused),paused);await solo.keyboard.up('p');await solo.keyboard.press('p');assert.equal(await solo.evaluate(()=>GameState.isPaused),false);
 });
 await check('audio initialization failure cannot disable movement or skill shortcuts',async()=>{
  await fresh();await solo.evaluate(()=>{window.savedInit=audio.init;audio.init=()=>{throw Error('test device unavailable')}});await solo.keyboard.down('d');await solo.evaluate(()=>realUpdate(.1));await solo.keyboard.up('d');await solo.keyboard.press('k');assert(await solo.evaluate(()=>player.x>0&&player.skills.skill1.timer>0),JSON.stringify(await solo.evaluate(()=>({x:player.x,timer:player.skills.skill1.timer,focus:document.activeElement.id,keys:input.keys,blocked:WorldCoop.canAct(),paused:GameState.isPaused,menu:MenuPause.deadline}))));await solo.evaluate(()=>audio.init=savedInit);
 });
 await check('a real RTC guest can move and cast K/L without pausing the host',async()=>{
  await clean();await fresh(host,'warrior');await fresh(guest,'healer');await guest.keyboard.down('d');await guest.evaluate(()=>{for(let i=0;i<5;i++)realUpdate(.04);CoopManager.sendPresenceNow()});await guest.keyboard.up('d');await guest.keyboard.press('k');await guest.keyboard.press('l');assert(await guest.evaluate(()=>player.x>0&&player.skills.skill1.timer>0&&player.skills.skill2.timer>0));assert.equal(await host.evaluate(()=>WorldCoop.paused()),false);
 });
 assert.deepEqual(errors,[]);
})().catch(e=>{console.error(e);results.failure=String(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close();fs.writeFileSync('test-results/keyboard.json',JSON.stringify({results,errors,failure:results.failure,scope:'Actual Playwright desktop keyboard events, all five heroes, real local two-client RTC, key/code/keyCode and IME-compatible event data, focus and audio failure cases.'},null,2))});
`;
new Function('require',prefix+tail)(require);

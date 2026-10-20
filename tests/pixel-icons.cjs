const fs=require('node:fs');
const original=fs.readFileSync('tests/gameplay.cjs','utf8'),prefix=original.slice(0,original.indexOf(' await clean();'));
const tail=String.raw`
 await clean();const solo=await makePage({width:390,height:844});
 async function flush(p=solo){await p.evaluate(()=>new Promise(r=>setTimeout(r,0)));}
 async function raw(p=solo){return p.evaluate(()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),bad=[];for(let n=w.nextNode();n;n=w.nextNode())if(!PixelIcons.skip(n.parentElement)&&(/\[px:[a-z-]+\]/.test(n.data)||/\p{Extended_Pictographic}/u.test(n.data)))bad.push(n.data.slice(0,100));return bad;});}
 await check('original atlas contains 127 drawn icons and every legacy glyph and source token resolves to real art',async()=>{
  const keys=[...fs.readFileSync('index.html','utf8').matchAll(/\[px:([a-z-]+)\]/g)].map(m=>m[1]);const r=await solo.evaluate(keys=>({count:PixelIcons.defs.size,legacy:Object.keys(PixelIcons.aliases).length,missing:keys.filter(k=>!PixelIcons.cache.has(k)),missingLegacy:Object.values(PixelIcons.aliases).filter(k=>!PixelIcons.cache.has(k))}),keys);assert.equal(r.count,127);assert.equal(r.legacy,119);assert.deepEqual(r.missing,[]);assert.deepEqual(r.missingLegacy,[]);
 });
 await check('atlas artwork has integer opaque pixels, transparent margins and distinct nonempty silhouettes',async()=>{
  const r=await solo.evaluate(()=>{const signatures=new Set(),bad=[];for(const [key,canvas]of PixelIcons.cache){const d=canvas.getContext('2d').getImageData(0,0,20,20).data;let n=0,h=2166136261;for(let i=0;i<d.length;i++){h=Math.imul(h^d[i],16777619);if(i%4===3&&d[i]){n++;if(d[i]!==255)bad.push(key);}}if(n<8||n>256)bad.push(key);signatures.add(h>>>0);}return{bad,unique:signatures.size,format:PixelIcons.atlas.toDataURL().slice(0,22),css:document.documentElement.style.getPropertyValue('--pixel-atlas')}});assert.deepEqual(r.bad,[]);assert.equal(r.unique,127);assert.equal(r.format,'data:image/png;base64,');assert(r.css.startsWith('url(data:image/png;base64,'));
 });
 await check('camp and co-op picker use four actual hero portraits with readable names on a phone viewport',async()=>{
  for(const h of ['warrior','mage','ranger','engineer']){assert.equal(await solo.locator('.hero-card[data-hero='+h+'] [data-pixel-icon=hero-'+h+']').count(),1);assert.equal(await solo.locator('.coop-hero-pick[data-hero='+h+'] [data-pixel-icon=hero-'+h+']').count(),1)}assert.deepEqual(await raw(),[]);assert(await solo.locator('#btn-start-game').isVisible());
 });
 await check('all four heroes get their own pixel weapon and skill icons after live switching',async()=>{
  const expected={warrior:['cleave','blood-dash','sword-vortex','holy-sword'],mage:['orb','ice-blink','galaxy','meteor'],ranger:['bow','web','boomerang','party'],engineer:['rivet','magnetic-mine','turret','reactor']};for(const h of Object.keys(expected)){await solo.locator('.hero-card[data-hero='+h+']').click();await flush();const actual=await solo.locator('#icon-attack .pixel-icon,#icon-skill1 .pixel-icon,#icon-skill2 .pixel-icon,#icon-ult .pixel-icon').evaluateAll(xs=>xs.map(x=>x.dataset.pixelIcon));assert.deepEqual(actual,expected[h]);}assert.deepEqual(await raw(),[]);
 });
 await solo.locator('#btn-start-game').click();await solo.evaluate(()=>{GameState.godMode=true;GameState.autoAttack=false;spawnEnemyBatch=()=>{};enemies.length=0;});
 await check('dynamic upgrade cards and paid rerolls hydrate icons before display without losing their click handlers',async()=>{
  await solo.evaluate(()=>{player.rerolls=3;triggerLevelUp()});await flush();assert.equal(await solo.locator('#upgrade-options .upgrade-card').count(),3);assert(await solo.locator('#upgrade-options .pixel-icon').count()>0);assert.deepEqual(await raw(),[]);await solo.locator('#btn-reroll-upgrades').click();await flush();assert.equal(await solo.evaluate(()=>player.rerolls),2);await solo.locator('#upgrade-options .upgrade-card').first().click();assert(!await solo.locator('#level-modal').isVisible());
 });
 await check('skill tree tabs and loadout badges use atlas icons rather than rendered Unicode or placeholder tokens',async()=>{
  for(const tab of ['active','synergy','equip','relic']){await solo.evaluate(tab=>{player.passives.emberEcho=1;updateLoadoutHUD();renderSkillTreeModal(tab)},tab);await flush();assert.deepEqual(await raw(),[]);}assert(await solo.locator('#loadout-synergy-group [data-pixel-icon=burst]').count()>0);
 });
 await check('menu, system settings and voice controls keep text, accessible icon labels and touch targets',async()=>{
  await solo.locator('#btn-pause').click();await solo.locator('#btn-pause-settings').click();await flush();assert.equal(await solo.locator('#btn-pause-settings [data-pixel-icon=gear]').count(),1);assert.equal(await solo.locator('#settings-modal input[type=range]').count(),5);const icons=await solo.locator('.pixel-icon').evaluateAll(xs=>xs.every(e=>e.getAttribute('role')==='img'&&e.getAttribute('aria-label')&&getComputedStyle(e).pointerEvents==='none'));assert(icons);await solo.locator('#btn-close-settings').click();assert(await solo.locator('#pause-modal').isVisible());await solo.locator('#btn-resume').click();assert.equal(await solo.evaluate(()=>GameState.isPaused),false);assert.equal(await solo.locator('#voice-mic').evaluate(e=>e.classList.contains('pixel-button')),true);
 });
 await check('canvas loot, relic distance and navigation markers draw pixel images and keep correct mixed-text width',async()=>{
  const r=await solo.evaluate(()=>{const c=document.createElement('canvas').getContext('2d');c.font='bold 10px sans-serif';const names=[],texts=[],od=PixelIcons.draw,of=c.fillText;PixelIcons.draw=function(c,key,...args){names.push(this.key(key));return od.call(this,c,key,...args)};c.fillText=function(t,...args){texts.push(String(t));return of.call(this,t,...args)};try{PixelIcons.text(c,'[px:star] 300m',0,0);PixelIcons.text(c,'🧲',0,20);PixelIcons.draw(c,'[px:shrine]',30,30,14,'#38bdf8');return{names,texts,width:PixelIcons.measure(c,'[px:star] 300m').width,expected:PixelIcons.fontSize(c)+c.measureText(' 300m').width,smoothing:c.imageSmoothingEnabled}}finally{PixelIcons.draw=od;}});assert.deepEqual(r.names,['star','magnet','shrine']);assert.deepEqual(r.texts,[' 300m']);assert.equal(r.width,r.expected);assert(r.smoothing);
 });
 await check('legacy relic icons from old saves render through the new atlas without modifying their saved identity',async()=>{
  await solo.evaluate(()=>{player.mapRelics=[{...STAGE_SPECIAL_RELICS.dungeon[0],icon:'🔥',level:1,maxLevel:5}];SaveManager.saveBattleSnapshot(true);restoreBattleSnapshot();updateLoadoutHUD()});await flush();assert.equal(await solo.evaluate(()=>player.mapRelics[0].icon),'🔥');assert.equal(await solo.locator('#loadout-relic-group [data-pixel-icon=fire]').count(),1);assert.deepEqual(await raw(),[]);
 });
 await check('literal chat text, user emoji, token-looking text and HTML-looking text never become game markup',async()=>{
  const message='你好 🔥 [px:sword] <img src=x onerror=alert(1)>';await solo.evaluate(message=>{CoopSocial.add({id:'icon-user-text',text:message,name:'访客 🔥',own:false,at:Date.now()})},message);await flush();const row=solo.locator('#social-messages .social-message').last();assert((await row.textContent()).includes(message));assert.equal(await row.locator('.pixel-icon,img').count(),0);
 });
 await check('repeated dynamic notices keep one current icon, with no accumulated wrappers or observer loop',async()=>{
  await solo.evaluate(()=>{for(let i=0;i<150;i++)showToast('[px:check] 更新 '+i)});await flush();assert.equal(await solo.locator('#toast-msg .pixel-icon').count(),1);assert.equal((await solo.locator('#toast-msg').textContent()).trim(),'更新 149');await pause(250);assert(await solo.locator('.pixel-icon').count()<400);assert.deepEqual(await raw(),[]);
 });
 await clean();
 await check('both real RTC clients use the same artwork and guest UI swaps never change the host selected hero',async()=>{
  await guest.evaluate(()=>setupHero('engineer'));await flush(guest);assert.equal(await guest.locator('#icon-skill2 [data-pixel-icon=turret]').count(),1);assert.equal(await host.evaluate(()=>GameState.selectedHero),'warrior');const hashes=await Promise.all([host,guest].map(p=>p.evaluate(()=>PixelIcons.atlas.toDataURL())));assert.equal(hashes[0],hashes[1]);
 });
 await check('shared pickups retain a renderable icon key after actual world-frame delivery',async()=>{
  await host.evaluate(()=>{fieldPickups.push({x:800,y:0,type:'magnet',icon:'[px:magnet]',color:'#c084fc',label:'磁铁',radius:18,floatY:0});WorldCoop.broadcastWorld()});await guest.waitForFunction(()=>fieldPickups.length===1);const r=await guest.evaluate(()=>({icon:fieldPickups[0].icon,key:PixelIcons.key(fieldPickups[0].icon),exists:PixelIcons.cache.has(PixelIcons.key(fieldPickups[0].icon))}));assert.deepEqual(r,{icon:'[px:magnet]',key:'magnet',exists:true});
 });
 await check('microphone state icons follow mute/listen status without requesting microphone permission on load',async()=>{
  const r=await guest.evaluate(()=>{CoopVoice.mic=false;CoopVoice.deaf=true;CoopVoice.render();return{mic:document.getElementById('voice-mic').style.getPropertyValue('--pixel-button-position'),mute:document.getElementById('voice-deaf').style.getPropertyValue('--pixel-button-position'),expectedMic:PixelIcons.position('mic-off'),expectedMute:PixelIcons.position('mute'),stream:Boolean(CoopVoice.stream)}});assert.equal(r.mic,r.expectedMic);assert.equal(r.mute,r.expectedMute);assert.equal(r.stream,false);
 });
 assert.deepEqual(errors,[]);fs.writeFileSync('test-results/pixel-icons.json',JSON.stringify({results,errors,scope:'Original integer-grid icon artwork, DOM/canvas UI, 390px browser controls, legacy saves, literal chat and isolated real local RTC snapshots. No external icon download or font dependency.'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
`;
new Function('require',prefix+tail)(require);

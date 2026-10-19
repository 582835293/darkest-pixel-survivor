const {chromium}=require('playwright');
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html'),server=http.createServer((q,r)=>{r.setHeader('content-type','text/html;charset=utf-8');r.end(html)});
let browser;const results=[],errors=[],report={results,errors,scope:'Solo browser sessions using actual mouse/touch hit testing on portrait/landscape mobile emulation and desktop. No simulated room or network connection.'};
async function check(name,fn){await fn();results.push(name);console.log('PASS',name)}
fs.mkdirSync('test-results',{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,headless:true});
 for(const spec of [{name:'portrait touch',viewport:{width:390,height:844},touch:true},{name:'landscape touch',viewport:{width:844,height:390},touch:true},{name:'desktop',viewport:{width:1280,height:800},touch:false}]){
  const ctx=await browser.newContext({viewport:spec.viewport,hasTouch:spec.touch,isMobile:spec.touch});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:'+server.address().port);
  const press=async(id,opts)=>spec.touch?p.locator(id).tap(opts):p.locator(id).click(opts);
  await check(spec.name+': audio and VFX have one pause-system entry and no outside speaker buttons',async()=>{
   assert.equal(await p.locator('#game-build').textContent(),'R10');
   assert.equal(await p.locator('#btn-lobby-settings-top,#btn-lobby-settings,#btn-hud-settings,#top-hud #btn-bgm-toggle,#coop-effects-details').count(),0);
   assert.equal(await p.locator('#settings-modal #btn-bgm-toggle,#settings-modal #coop-alpha-slider,#settings-modal #self-alpha-slider').count(),3);
   assert.equal(await p.locator('#btn-pause-settings').textContent(),'⚙️ 系统设置');assert.equal(await p.evaluate(()=>CoopManager.roomCode),null);
  });
  await press('#btn-start-game');await p.waitForFunction(()=>GameState.isStarted&&!GameState.isPaused);await p.evaluate(()=>{GameState.godMode=true;GameState.autoAttack=false;spawnEnemyBatch=()=>{};enemies.length=0});
  await check(spec.name+': all tested minimap hit areas open the map and never open pause',async()=>{
   const bounds=await p.evaluate(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}};return{map:rect('minimap-box'),pause:rect('btn-pause')}});
   assert(await p.locator('#minimap-box .minimap-legend').first().evaluate(e=>e.scrollWidth<=e.clientWidth));
   for(const other of [bounds.pause])assert(other.y+other.h<bounds.map.y);
   for(const point of [{x:.25,y:.1},{x:.5,y:.45},{x:.85,y:.8}]){
    const pos={x:bounds.map.x+bounds.map.w*point.x,y:bounds.map.y+bounds.map.h*point.y};if(spec.touch)await p.touchscreen.tap(pos.x,pos.y);else await p.mouse.click(pos.x,pos.y);
    assert.equal(await p.evaluate(()=>CoopMap.open),true);assert.equal(await p.evaluate(()=>GameState.isPaused),false);assert(!await p.locator('#pause-modal').isVisible());await press('#btn-close-map');
   }
  });
  await check(spec.name+': pause system contains audio and both VFX sliders, volume taps respond',async()=>{
   await press('#btn-pause');await press('#btn-pause-settings');assert(await p.locator('#settings-modal').isVisible());assert.equal(await p.evaluate(()=>GameState.isPaused),true);assert.equal(await p.locator('#settings-modal input[type=range]').count(),5);
   const range=await p.locator('#volume-effects').boundingBox();const x=range.x+range.width*.3,y=range.y+range.height/2;if(spec.touch)await p.touchscreen.tap(x,y);else await p.mouse.click(x,y);
   const v=await p.evaluate(()=>AudioSettings.values.effects);assert(v>15&&v<45,'range hit changes volume: '+v);assert.equal(await p.locator('#volume-effects-value').textContent(),v+'%');
   await press('#btn-close-settings');assert.equal(await p.evaluate(()=>GameState.isPaused),true);assert(await p.locator('#pause-modal').isVisible());await press('#btn-resume');assert.equal(await p.evaluate(()=>GameState.isPaused),false);
   await p.screenshot({path:'test-results/r10-solo-'+spec.name.replaceAll(' ','-')+'.png'});
  });
  await check(spec.name+': solo pause audio preserves pause and settings survive reload',async()=>{
   await press('#btn-pause');assert(await p.locator('#pause-modal').isVisible());await press('#btn-pause-settings');assert(await p.locator('#settings-modal').isVisible());await press('#btn-close-settings');assert.equal(await p.evaluate(()=>GameState.isPaused),true);assert(await p.locator('#pause-modal').isVisible());await press('#btn-resume');assert.equal(await p.evaluate(()=>GameState.isPaused),false);
   const v=await p.evaluate(()=>AudioSettings.values.effects);await p.reload();assert.equal(await p.evaluate(()=>AudioSettings.values.effects),v);
  });
  if(spec.name==='portrait touch')await check('relic direction guidance renders only icon and distance while the full name stays in the compendium',async()=>{
   const r=await p.evaluate(()=>{document.getElementById('lobby-modal').style.display='none';setupHero('warrior');GameState.isStarted=true;GameState.isPaused=true;GameState.autoAttack=false;player.x=player.y=0;camera.x=-innerWidth/2;camera.y=-innerHeight/2;mapRelicDrops.length=0;mapRelicDrops.push({id:'relic-demon-skull',icon:'⭐',name:'不该出现在方向提示的秘宝名字',x:3000,y:0,rarity:'rare'});const rows=[],original=ctx.fillText;ctx.fillText=function(text,x,y){rows.push({text:String(text),x,y});return original.call(this,text,x,y)};try{draw();}finally{ctx.fillText=original;}return rows;});
   const label=r.find(v=>v.text==='⭐ 300m');assert(label);assert(!r.some(v=>v.text.includes('不该出现在方向提示的秘宝名字')&&v.x===0&&v.y===4));
   await p.screenshot({path:'test-results/r10-relic-direction.png'});
  });
  if(spec.name==='portrait touch'){
   await check('self and ally opacity are independent, presets work and saved ally settings migrate to system settings',async()=>{
    await p.evaluate(()=>{GameState.isPaused=false;document.getElementById('pause-modal').style.display='none'});await press('#btn-pause');await press('#btn-pause-settings');
    await press('.self-alpha-preset[data-value="50"]');assert.equal(await p.evaluate(()=>VisualSettings.selfAlpha),.5);assert(Math.abs(await p.evaluate(()=>CoopManager.allyVfxAlpha)-.3)<.001);
    await press('.coop-alpha-preset[data-value="100"]');assert.equal(await p.evaluate(()=>CoopManager.allyVfxAlpha),0);assert.equal(await p.evaluate(()=>VisualSettings.selfAlpha),.5);
    await press('.self-alpha-preset[data-value="100"]');await p.evaluate(()=>{const e=document.getElementById('coop-alpha-slider');e.value=37;e.dispatchEvent(new Event('input',{bubbles:true}))});assert.equal(await p.evaluate(()=>VisualSettings.selfAlpha),0);assert.equal(await p.evaluate(()=>CoopManager.allyVfxAlpha),.63);
    await p.locator('#settings-modal .modal-card').screenshot({path:'test-results/r10-system-settings.png'});await p.reload();assert.equal(await p.evaluate(()=>VisualSettings.selfAlpha),0);assert.equal(await p.evaluate(()=>CoopManager.allyVfxAlpha),.63);
   });
   await check('hiding self VFX preserves teammate effects, player sprite and enemy projectile or warning visibility',async()=>{
    const r=await p.evaluate(()=>{setupHero('warrior');CoopManager.myColorIdx=0;player.invulnerableTimer=0;GameState.hurtFlashTimer=0;GameState.isStarted=true;GameState.isPaused=true;GameState.autoAttack=false;player.isDowned=false;UpgradeChoice.active=false;VisualSettings.setSelf(100);setAllyTransparency(50);projectiles.length=0;enemies.length=0;telegraphs.length=0;groundEffects.length=0;orbitingBlades.length=0;boomerangs.length=0;
     for(const [color,flags]of [['#112233',{}],['#223344',{isEnemy:true}],['#334455',{isAlly:true}]])projectiles.push({x:player.x+70,y:player.y,vx:1,vy:0,radius:10,life:1,damage:73,color,applyBleed:true,...flags});
     telegraphs.push({type:'circle',x:700,y:650,radius:137,life:1,maxLife:2});const strokes=[],body=[],warnings=[],os=ctx.stroke,od=ctx.drawImage,oa=ctx.arc;ctx.stroke=function(){strokes.push({color:this.strokeStyle,alpha:this.globalAlpha});return os.call(this)};ctx.drawImage=function(img,...args){if(img===SpriteCache.warrior_0.normal)body.push(this.globalAlpha);return od.call(this,img,...args)};ctx.arc=function(x,y,r,...rest){if(x===700&&y===650&&r===137)warnings.push(this.globalAlpha);return oa.call(this,x,y,r,...rest)};try{draw();}finally{ctx.stroke=os;ctx.drawImage=od;ctx.arc=oa;}return{strokes,body,warnings,damage:projectiles.map(v=>v.damage)};});
    assert(r.strokes.some(v=>v.color==='#112233'&&v.alpha===0));assert(r.strokes.some(v=>v.color==='#223344'&&v.alpha===1));assert(r.strokes.some(v=>v.color==='#334455'&&v.alpha===.5));assert(r.body.some(a=>a===1));assert(r.warnings.length>0&&r.warnings.every(a=>a===1));assert.deepEqual(r.damage,[73,73,73]);
   });
   await check('expanded map omits ordinary loot markers while preserving real loot and navigation landmarks',async()=>{
    const r=await p.evaluate(()=>{gems.length=goldDrops.length=fieldPickups.length=0;for(let i=0;i<500;i++){gems.push({x:i+500,y:500,expValue:3});goldDrops.push({x:i+600,y:600,val:4});fieldPickups.push({x:i+700,y:700,color:'#f0abfc',radius:14,floatY:0,icon:'🧲',label:'道具'});}shrines.length=0;shrines.push({x:1000,y:0,used:false});mapRelicDrops.length=0;mapRelicDrops.push({x:0,y:1400,icon:'⭐',name:'秘宝',radius:20,floatY:0});const c=document.getElementById('world-map-canvas').getContext('2d'),rows=[],original=c.fillText;c.fillText=function(text,...args){rows.push({text,color:this.fillStyle});return original.call(this,text,...args)};try{CoopMap.toggle(true);CoopMap.draw(true);}finally{c.fillText=original;}return{rows,legend:document.querySelector('.map-legend').textContent,counts:[gems.length,goldDrops.length,fieldPickups.length]};});
    assert(!r.rows.some(v=>['◆','♦'].includes(v.text)||(v.text==='●'&&v.color==='#facc15')));assert(r.rows.some(v=>v.text==='▲'));assert(r.rows.some(v=>v.text==='★'));assert(!/经验|金币|道具/.test(r.legend));assert.deepEqual(r.counts,[500,500,500]);await p.locator('#world-map-modal .modal-card').screenshot({path:'test-results/r10-clean-map.png'});
   });
  }
  await ctx.close();
 }
 assert.deepEqual(errors,[]);
})().catch(e=>{report.failure=String(e);console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.close();fs.writeFileSync('test-results/solo-ui.json',JSON.stringify(report,null,2))});

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
  await check(spec.name+': solo lobby exposes a working audio entry above hero selection',async()=>{
   const b=await p.locator('#btn-lobby-settings-top').boundingBox();assert(b&&b.y>=0&&b.y+b.height<spec.viewport.height);assert.equal(await p.locator('#game-build').textContent(),'R9');
   await press('#btn-lobby-settings-top');assert(await p.locator('#settings-modal').isVisible());assert.equal(await p.locator('#settings-modal input[type=range]').count(),3);assert.equal(await p.evaluate(()=>CoopManager.roomCode),null);await press('#btn-close-settings');
  });
  await press('#btn-start-game');await p.waitForFunction(()=>GameState.isStarted&&!GameState.isPaused);await p.evaluate(()=>{GameState.godMode=true;GameState.autoAttack=false;spawnEnemyBatch=()=>{};enemies.length=0});
  await check(spec.name+': all tested minimap hit areas open the map and never open pause',async()=>{
   const bounds=await p.evaluate(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}};return{map:rect('minimap-box'),pause:rect('btn-pause'),sound:rect('btn-hud-settings')}});
   assert(await p.locator('#minimap-box .minimap-legend').first().evaluate(e=>e.scrollWidth<=e.clientWidth));
   for(const other of [bounds.pause,bounds.sound])assert(other.y+other.h<bounds.map.y);
   for(const point of [{x:.25,y:.1},{x:.5,y:.45},{x:.85,y:.8}]){
    const pos={x:bounds.map.x+bounds.map.w*point.x,y:bounds.map.y+bounds.map.h*point.y};if(spec.touch)await p.touchscreen.tap(pos.x,pos.y);else await p.mouse.click(pos.x,pos.y);
    assert.equal(await p.evaluate(()=>CoopMap.open),true);assert.equal(await p.evaluate(()=>GameState.isPaused),false);assert(!await p.locator('#pause-modal').isVisible());await press('#btn-close-map');
   }
  });
  await check(spec.name+': solo HUD audio opens directly, sliders respond and closing resumes without pause menu',async()=>{
   await press('#btn-hud-settings');assert(await p.locator('#settings-modal').isVisible());assert.equal(await p.evaluate(()=>GameState.isPaused),true);assert(!await p.locator('#pause-modal').isVisible());
   const range=await p.locator('#volume-effects').boundingBox();const x=range.x+range.width*.3,y=range.y+range.height/2;if(spec.touch)await p.touchscreen.tap(x,y);else await p.mouse.click(x,y);
   const v=await p.evaluate(()=>AudioSettings.values.effects);assert(v>15&&v<45,'range hit changes volume: '+v);assert.equal(await p.locator('#volume-effects-value').textContent(),v+'%');
   await press('#btn-close-settings');assert.equal(await p.evaluate(()=>GameState.isPaused),false);assert(!await p.locator('#pause-modal').isVisible());
   await p.screenshot({path:'test-results/r9-solo-'+spec.name.replaceAll(' ','-')+'.png'});
  });
  await check(spec.name+': solo pause audio preserves pause and settings survive reload',async()=>{
   await press('#btn-pause');assert(await p.locator('#pause-modal').isVisible());await press('#btn-pause-settings');assert(await p.locator('#settings-modal').isVisible());await press('#btn-close-settings');assert.equal(await p.evaluate(()=>GameState.isPaused),true);assert(await p.locator('#pause-modal').isVisible());await press('#btn-resume');assert.equal(await p.evaluate(()=>GameState.isPaused),false);
   const v=await p.evaluate(()=>AudioSettings.values.effects);await p.reload();assert.equal(await p.evaluate(()=>AudioSettings.values.effects),v);
  });
  if(spec.name==='portrait touch')await check('relic direction guidance renders only icon and distance while the full name stays in the compendium',async()=>{
   const r=await p.evaluate(()=>{document.getElementById('lobby-modal').style.display='none';setupHero('warrior');GameState.isStarted=true;GameState.isPaused=true;GameState.autoAttack=false;player.x=player.y=0;camera.x=-innerWidth/2;camera.y=-innerHeight/2;mapRelicDrops.length=0;mapRelicDrops.push({id:'relic-demon-skull',icon:'⭐',name:'不该出现在方向提示的秘宝名字',x:3000,y:0,rarity:'rare'});const rows=[],original=ctx.fillText;ctx.fillText=function(text,x,y){rows.push({text:String(text),x,y});return original.call(this,text,x,y)};try{draw();}finally{ctx.fillText=original;}return rows;});
   const label=r.find(v=>v.text==='⭐ 300m');assert(label);assert(!r.some(v=>v.text.includes('不该出现在方向提示的秘宝名字')&&v.x===0&&v.y===4));
   await p.screenshot({path:'test-results/r9-relic-direction.png'});
  });
  await ctx.close();
 }
 assert.deepEqual(errors,[]);
})().catch(e=>{report.failure=String(e);console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.close();fs.writeFileSync('test-results/solo-ui.json',JSON.stringify(report,null,2))});

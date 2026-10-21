const {chromium}=require('playwright');
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html'),server=http.createServer((q,r)=>{r.setHeader('content-type','text/html;charset=utf-8');r.end(html)});
let browser;const results=[],errors=[],report={results,errors,scope:'Actual portrait/landscape touch and desktop camp buttons, old persisted saves and explicit manual restore. Separate party-rounds suite exercises real local RTC.'};
async function check(name,fn){await fn();results.push(name);console.log('PASS',name)}
fs.mkdirSync('test-results',{recursive:true});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,headless:true});
 for(const spec of [{name:'portrait',viewport:{width:390,height:844},touch:true},{name:'landscape',viewport:{width:844,height:390},touch:true},{name:'desktop',viewport:{width:1280,height:800},touch:false}]){
  const context=await browser.newContext({viewport:spec.viewport,hasTouch:spec.touch,isMobile:spec.touch});const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{window.requestAnimationFrame=()=>0});await p.goto('http://127.0.0.1:'+server.address().port);await p.evaluate(()=>FrontDoor.enter());
  const press=async id=>{await p.locator(id).scrollIntoViewIfNeeded();await p.locator(id)[spec.touch?'tap':'click']()};
  await check(spec.name+': returning from an unfinished saved battle removes the old round, keeps permanent progress and exposes one start button',async()=>{
   await press('#btn-start-game');await p.evaluate(()=>{SaveManager.data.gold=9876;SaveManager.data.talents.might=2;player.level=27;player.skills.attack.level=5;player.mapRelics=[{...STAGE_SPECIAL_RELICS.dungeon[0],level:2}];GameState.gameTime=500;GameState.kills=321;gems.push({x:20,y:0});SaveManager.saveBattleSnapshot(true)});
   await press('#btn-pause');await press('#btn-pause-lobby');assert(await p.locator('#lobby-modal').isVisible());assert.equal(await p.locator('#btn-lobby-resume').count(),0);assert.equal(await p.evaluate(()=>SaveManager.hasBattleSnapshot()),null);assert.equal(await p.evaluate(()=>localStorage.getItem(SaveManager.BATTLE_KEY)),null);assert.equal(await p.evaluate(()=>GameState.isStarted||GameState.isOver||GameState.isPaused),false);assert.equal(await p.evaluate(()=>enemies.length+gems.length+projectiles.length+groundEffects.length+telegraphs.length+mapRelicDrops.length),0);assert.equal(await p.evaluate(()=>SaveManager.data.gold),9876);assert.equal(await p.evaluate(()=>SaveManager.data.talents.might),2);
   await press('#btn-start-game');assert.equal(await p.locator('.modal-overlay:visible').count(),0);assert.equal(await p.evaluate(()=>GameState.gameTime+GameState.kills+player.exp+player.mapRelics.length),0);assert.equal(await p.evaluate(()=>player.level),1);assert.equal(await p.evaluate(()=>player.skills.attack.level),1);assert(await p.evaluate(()=>GameState.isStarted&&!GameState.isOver&&!GameState.isPaused));
  });
  await check(spec.name+': defeat return and the next departure cannot reopen results or reuse the defeated world',async()=>{
   await p.evaluate(()=>{GameState.gameTime=99;GameState.kills=88;gameOver()});assert(await p.locator('#over-modal').isVisible());await press('#btn-over-lobby');assert(await p.locator('#lobby-modal').isVisible());await press('#btn-start-game');assert.equal(await p.evaluate(()=>GameState.gameTime+GameState.kills),0);assert.equal(await p.locator('.modal-overlay:visible').count(),0);assert(await p.evaluate(()=>GameState.isStarted&&!GameState.isOver));
  });
  if(spec.name==='portrait'){
   await check('a previous-version auto-save stays out of camp and entering the battlefield starts fresh after a reload',async()=>{
    await p.evaluate(()=>{player.level=42;GameState.gameTime=888;SaveManager.saveBattleSnapshot(true)});await p.reload();await p.evaluate(()=>FrontDoor.enter());assert.equal(await p.evaluate(()=>SaveManager.hasBattleSnapshot().player.level),42);assert.equal(await p.locator('#btn-lobby-resume').count(),0);await press('#btn-start-game');assert.equal(await p.evaluate(()=>player.level),1);assert.equal(await p.evaluate(()=>GameState.gameTime),0);assert.equal(await p.evaluate(()=>SaveManager.hasBattleSnapshot()),null);
   });
   await check('an explicit save-center restore still recovers an interrupted run without hijacking the main camp action',async()=>{
    await p.evaluate(()=>{player.level=19;GameState.gameTime=444;SaveManager.saveBattleSnapshot(true)});await p.reload();await p.evaluate(()=>FrontDoor.enter());await press('#btn-lobby-save');await press('#btn-load-battle-snapshot');assert.equal(await p.evaluate(()=>player.level),19);assert.equal(await p.evaluate(()=>GameState.gameTime),444);assert.equal(await p.locator('.modal-overlay:visible').count(),0);
   });
   await check('winning then returning preserves the reward exactly once while the next round resets all round counters',async()=>{
    const before=await p.evaluate(()=>SaveManager.data.gold);await p.evaluate(()=>triggerVictory());const after=await p.evaluate(()=>SaveManager.data.gold);assert.equal(after-before,500);await press('#btn-over-lobby');await press('#btn-start-game');assert.equal(await p.evaluate(()=>SaveManager.data.gold),after);assert.equal(await p.evaluate(()=>GameState.gameTime+GameState.kills+GameState.goldCollected),0);
   });
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);
})().catch(e=>{report.failure=String(e);console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close();fs.writeFileSync('test-results/camp-flow.json',JSON.stringify(report,null,2))});

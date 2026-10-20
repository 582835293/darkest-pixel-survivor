const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8'),draftCode=html.slice(html.indexOf('    var UpgradeDraft = {'),html.indexOf('    let lastShownUpgradeIds'));
const draftResults=[];function logic(name,fn){fn();draftResults.push(name);console.log('PASS',name)}
function draft(seed=1){const math=Object.create(Math);math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);const c={Math:math};vm.createContext(c);vm.runInContext(draftCode,c);return c.UpgradeDraft}
const pool=n=>Array.from({length:n},(_,i)=>({id:'card_'+i,name:'选项'+i,type:i<8?'super':'passive',isTrueSuper:i<4}));
logic('every eligible option appears within one pass, even when supers outnumber the offer slots',()=>{
 for(let seed=1;seed<=500;seed++)for(let n=4;n<=36;n++){
  const d=draft(seed),p=pool(n),seen=new Set();let previous=[];
  for(let i=0;i<Math.ceil(n/3);i++){const cards=d.draw(p,previous);assert.equal(cards.length,3);for(const c of cards)seen.add(c.id);previous=cards.map(c=>c.id)}
  assert.equal(seen.size,n,'seed '+seed+' pool '+n);
 }
});
logic('adjacent rerolls share no cards whenever six or more options are eligible',()=>{
 for(let seed=1;seed<=200;seed++)for(const n of [6,7,8,11,16]){
  const d=draft(seed),p=pool(n);let previous=[];
  for(let i=0;i<30;i++){const cards=d.draw(p,previous),ids=cards.map(c=>c.id);if(previous.length)assert(ids.every(id=>!previous.includes(id)));assert.equal(new Set(ids).size,3);previous=ids}
 }
});
logic('tiny pools terminate without duplicate cards and changing eligibility never shows a stale upgrade',()=>{
 for(let n=0;n<=5;n++){const d=draft(),p=pool(n);let previous=[];for(let i=0;i<30;i++){const ids=d.draw(p,previous).map(c=>c.id);assert.equal(ids.length,Math.min(3,n));assert.equal(new Set(ids).size,ids.length);previous=ids}}
 const d=draft(),p=pool(9);const first=d.draw(p);const nextPool=p.filter(c=>!first.some(a=>a.id===c.id));nextPool.push({id:'new',name:'刚解锁的技能',type:'super'});
 assert(d.draw(nextPool,first.map(c=>c.id)).every(c=>nextPool.includes(c)));
});
logic('a fresh choice keeps attack guidance and both unlocked charge branches without fixing rerolls',()=>{
 const d=draft(),p=[...pool(12),{id:'atk_up',name:'普通攻击',type:'active'},{id:'charge_branch_a',name:'A',isTrueSuper:true},{id:'charge_branch_b',name:'B',isTrueSuper:true}];
 const first=d.draw(p).map(c=>c.id);assert(first.includes('atk_up')&&first.includes('charge_branch_a')&&first.includes('charge_branch_b'));
 const next=d.draw(p,first).map(c=>c.id);assert(next.every(id=>!first.includes(id)));
});
const original=fs.readFileSync('tests/gameplay.cjs','utf8'),prefix=original.slice(0,original.indexOf(' await clean();'));
const tail=String.raw`
 await clean();const solo=await makePage({width:390,height:844});
 await check('actual warrior, mage and ranger pools are fully covered within a single reroll pass',async()=>{
  for(const hero of ['warrior','mage','ranger']){
   const r=await solo.evaluate(hero=>{
    GameState.selectedHero=hero;resetGameSession(false);GameState.godMode=true;GameState.autoAttack=false;spawnEnemyBatch=()=>{};
    player.pendingLevelUps=1;player.rerolls=100;triggerLevelUp();const eligible=generateUpgradePool().map(c=>c.id),seen=new Set(lastShownUpgradeIds);
    for(let i=1;i<Math.ceil(eligible.length/3);i++){document.getElementById('btn-reroll-upgrades').click();for(const id of lastShownUpgradeIds)seen.add(id)}
    const result={eligible,seen:[...seen],count:document.querySelectorAll('.upgrade-card').length};UpgradeChoice.end();document.getElementById('level-modal').style.display='none';return result;
   },hero);assert.equal(r.count,3);assert(r.eligible.every(id=>r.seen.includes(id)),hero);
  }
 });
 await check('multiple unlocked awakenings cannot starve ordinary upgrades after rerolling',async()=>{
  const r=await solo.evaluate(()=>{
   GameState.selectedHero='warrior';resetGameSession(false);GameState.godMode=true;GameState.autoAttack=false;
   player.skills.attack.level=4;player.skills.skill1.level=4;player.skills.skill2.level=4;player.skills.ult.level=3;player.skills.charge.level=5;
   player.passives.critGlove=player.passives.swiftBoots=player.passives.lavaHeart=1;
   player.pendingLevelUps=1;player.rerolls=100;triggerLevelUp();const pool=generateUpgradePool(),seen=new Set(lastShownUpgradeIds),first=[...lastShownUpgradeIds];
   for(let i=1;i<Math.ceil(pool.length/3);i++){document.getElementById('btn-reroll-upgrades').click();lastShownUpgradeIds.forEach(id=>seen.add(id))}
   return {pool:pool.map(c=>c.id),seen:[...seen],first,supers:pool.filter(c=>c.isTrueSuper).length};
  });assert(r.supers>=4);assert(r.pool.every(id=>r.seen.includes(id)));assert(r.first.includes('charge_branch_a')&&r.first.includes('charge_branch_b'));
 });
 await check('slot caps explain ineligible skills instead of spending rerolls on impossible candidates',async()=>{
  const r=await solo.evaluate(()=>{
   UpgradeChoice.end();player.passives.thunderChain=1;player.passives.iceShatter=player.passives.huntPulse=1;player.passives.bloodPact=player.passives.fireTrail=0;player.pendingLevelUps=1;triggerLevelUp();
   return {ids:generateUpgradePool().map(c=>c.id),hint:document.getElementById('upgrade-draft-hint').textContent};
  });assert(!r.ids.includes('syn_blood')&&!r.ids.includes('syn_fire'));assert(r.hint.includes('流派已满'));assert(r.hint.includes('配件已满'));
  await solo.locator('#level-modal .modal-card').screenshot({path:'test-results/fair-upgrade-draft.png'});
 });
 await check('paid rerolls cost once, reject stale cards and keep the multiplayer twenty-second deadline',async()=>{
  await host.evaluate(()=>{player.pendingLevelUps=1;player.rerolls=2;triggerLevelUp();window.initialDeadline=UpgradeChoice.deadline;window.oldCard=document.querySelector('.upgrade-card');window.previousHpMax=player.maxHp;window.previousGeneration=UpgradeChoice.generation;});
  await host.locator('#btn-reroll-upgrades').click();
  const r=await host.evaluate(()=>{oldCard.click();return {rerolls:player.rerolls,deadline:UpgradeChoice.deadline,original:initialDeadline,active:UpgradeChoice.active,pending:player.pendingLevelUps,paused:GameState.isPaused,generation:UpgradeChoice.generation>previousGeneration}});
  assert.equal(r.rerolls,1);assert.equal(r.deadline,r.original);assert.equal(r.active,true);assert.equal(r.pending,1);assert.equal(r.paused,false);assert.equal(r.generation,true);
  await host.evaluate(()=>UpgradeChoice.deadline=performance.now()-1);await host.waitForFunction(()=>!UpgradeChoice.active&&player.pendingLevelUps===0);
 });
 assert.deepEqual(errors,[]);fs.writeFileSync('test-results/upgrades.json',JSON.stringify({results:[...draftResults,...results],errors,scope:'Seeded selection logic checks plus real browser upgrade/RTC behavior; no changes to skill unlock conditions.'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
`;
new Function('require','draftResults',prefix+tail)(require,draftResults);

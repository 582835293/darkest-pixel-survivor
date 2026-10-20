// Deterministic combat lab. Uses real upgrades, cooldowns, projectiles, fields and damage.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const arg=(key,fallback)=>process.argv.find(v=>v.startsWith('--'+key+'='))?.split('=').slice(1).join('=')||fallback;
const repo=path.resolve(__dirname,'..'),source=path.resolve(arg('source',path.join(repo,'index.html'))),label=arg('label','current'),seeds=Number(arg('seeds','2')),scenes=arg('scenes','boss,crowd').split(',');
const html=fs.readFileSync(source),server=http.createServer((q,r)=>{r.setHeader('content-type','text/html;charset=utf-8');r.end(html)});let browser;const errors=[],rows=[];
const stages=[{id:'early',minute:2,level:6},{id:'middle',minute:10,level:20},{id:'late',minute:22,level:38},{id:'complete',minute:28,level:49}];
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,headless:true});const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{requestAnimationFrame=()=>0});await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(()=>{
  window.Lab={time:0,jobs:new Map(),seq:0};setTimeout=(fn,ms=0,...args)=>{const id=++Lab.seq;Lab.jobs.set(id,{at:Lab.time+Math.max(0,Number(ms)||0)/1000,fn:()=>fn(...args)});return id;};clearTimeout=id=>Lab.jobs.delete(id);
  for(const name of Object.keys(audio))if(name.startsWith('play'))audio[name]=()=>{};audio.init=()=>{};
  Lab.target=WorldCoop.target;Lab.damagePlayer=damagePlayer;Lab.heal=HealerKit.applyGrant;
  damagePlayer=function(...args){const hp=player.hp,shield=player.shield;const r=Lab.damagePlayer(...args);Lab.received+=(Math.max(0,hp-player.hp)+Math.max(0,shield-player.shield));if(player.hp<=0&&Lab.diedAt===null)Lab.diedAt=Lab.time;return r;};
  HealerKit.applyGrant=function(...args){const hp=player.hp;const r=Lab.heal.apply(this,args);Lab.healed+=Math.max(0,player.hp-hp);return r;};
  window.labRun=({hero,stage,scene,build,seed})=>{
   Lab.time=0;Lab.jobs.clear();Lab.received=0;Lab.healed=0;Lab.diedAt=null;let rng=seed>>>0;Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
   resetGameSession(false);for(const k of Object.keys(SaveManager.data.talents))SaveManager.data.talents[k]=0;setupHero(hero);HealerKit.reset();EngineerKit.reset();NewSynergies.reset();MenuPause.reset();UpgradeChoice.reset();
   GameState.isStarted=true;GameState.isOver=false;GameState.isPaused=false;GameState.godMode=true;GameState.autoAttack=true;GameState.gameTime=stage.minute*60;GameState.timeScale=1;GameState.totalDamageDealt=0;GameState.kills=0;GameState.activeBiome='dungeon';GameState.curseLevel=0;GameState.globalFreezeTimer=0;GameState.powerShrineTimer=0;GameState.speedShrineTimer=0;GameState.berserkTimer=0;GameState.starfallTimer=0;GameState.phantomCloneTimer=0;GameState.fireBreathTimer=0;GameState.forgeOverdriveTimer=0;
   player.x=player.y=player.vx=player.vy=0;player.level=stage.level;player.exp=0;player.expToNext=1e12;player.pendingLevelUps=0;player.isDowned=false;player.invulnerableTimer=0;player.catchBuffTimer=0;player.isCharging=false;player.chargeTimer=0;player.shield=0;player.aimAngle=0;input.x=input.y=0;input.keys={};input.isHoldingAttack=false;spawnEnemyBatch=()=>{};WorldCoop.target=()=>null;for(const a of [enemies,projectiles,groundEffects,skyBeams,orbitingBlades,boomerangs,telegraphs,gems,goldDrops,fieldPickups,mapRelicDrops,shrines,destructibles,particles,lightningArcs,slashVisuals,afterimages])a.length=0;for(const e of document.querySelectorAll('.modal-overlay'))e.style.display='none';
   for(const k of SYNERGY_KEYS)player.passives[k]=0;player.mapRelics=[];
   const chosen=[],pick=id=>{const c=generateUpgradePool().find(c=>c.id===id);if(!c)throw new Error('Unavailable upgrade '+hero+' '+stage.id+' '+id);c.apply();chosen.push(id);},many=(id,n)=>{for(let i=0;i<n;i++)pick(id);};
   const gear=hero==='mage'?['p_frost_aura','p_swift_boots','p_lava_heart']:hero==='ranger'?['p_pierce_quiver','p_swift_boots','p_crit_glove']:['p_crit_glove','p_swift_boots','p_lava_heart'];
   if(stage.id==='early'){many('atk_up',2);pick('charge_base_up');pick('s1_up');pick('s2_up');}
   else if(stage.id==='middle'){
    many('atk_up',4);many('charge_base_up',3);many('s1_up',2);many('s2_up',3);pick('ult_up');for(const id of gear)pick(id);pick('syn_thunder');pick('syn_ice');const c=generateUpgradePool().find(c=>c.isTrueSuper&&c.id.includes(hero==='warrior'?'blade':hero==='mage'?'missile':hero==='ranger'?'bow':hero==='engineer'?'rivet':'healer_atk'));if(!c)throw new Error('Missing attack awakening '+hero);pick(c.id);
   }else{
    for(const [id,n]of [['atk_up',4],['charge_base_up',4],['s1_up',4],['s2_up',4],['ult_up',4]])many(id,n);
    for(const id of gear)many(id,stage.id==='complete'?5:3);many('syn_thunder',stage.id==='complete'?3:2);many('syn_ice',stage.id==='complete'?3:2);
    for(let i=0;i<4;i++){const c=generateUpgradePool().find(c=>c.isTrueSuper);if(!c)throw new Error('Missing awakening '+hero);pick(c.id);}
    if(stage.id==='complete'){pick(build==='A'?'charge_branch_a':'charge_branch_b');many('charge_branch_up',2);}
   }
   if(chosen.length!==stage.level-1)throw new Error('Unequal upgrade budget '+chosen.length+' '+stage.level);
   Lab.jobs.clear();player.level=stage.level;player.pendingLevelUps=0;UpgradeChoice.reset();GameState.isPaused=false;player.hp=player.maxHp;updateHpUI();
   const anchors=[];const create=(x,y)=>{const e=createEnemy(x,y,'imp');Object.assign(e,{hp:1e10,maxHp:1e10,speed:0,damage:0,expReward:0,isElite:false,isShiny:false,tier:1,affixes:['unstoppable'],radius:scene==='boss'?26:10});if(scene==='boss'){e.isBoss=true;e.bossProfile='';}anchors.push({e,x:e.x,y:e.y});};
   if(scene==='boss')create(65,0);else for(let x=0;x<5;x++)for(let y=0;y<5;y++)create(65+x*32,(y-2)*32);
   const live=scene==='skirmish';GameState.godMode=!live;WorldCoop.target=live?Lab.target:()=>null;
   const dt=1/30,duration=live?45:20;let wasHolding=false,spawned=0;
   if(live){enemies.length=0;anchors.length=0;}
   for(let frame=0;frame<duration/dt;frame++){
    if(live){
     if(frame%60===0){const types=getCurrentWaveInfo().types;for(let i=0;i<10;i++){const a=i*Math.PI*2/10+frame*.01,e=createEnemy(Math.cos(a)*220,Math.sin(a)*220,types[i%types.length]);if(e)spawned++;}}
     const angle=frame*dt*.65;input.x=Math.cos(angle);input.y=Math.sin(angle);
    }else{for(const {e,x,y}of anchors){e.x=x;e.y=y;e.vx=e.vy=0;}player.x=player.y=player.vx=player.vy=0;player.skills.skill1.isDashing=false;}
    const t=frame*dt,phase=t%3,hold=phase>=1.5&&phase<1.5+Math.min(1.4,chargeDuration()+.08);
    if(hold&&!wasHolding){input.isHoldingAttack=true;player.isCharging=true;player.chargeTimer=0;executeAttack();}else if(!hold&&wasHolding){input.isHoldingAttack=false;releaseChargeAttack();}wasHolding=hold;
    if(player.skills.skill1.timer<=0)executeSkill1();if(player.skills.skill2.timer<=0)executeSkill2();if(player.skills.ult.timer<=0)executeUlt();
    update(dt);Lab.time+=dt;for(const [id,job]of [...Lab.jobs])if(job.at<=Lab.time){Lab.jobs.delete(id);job.fn();}
    if(live&&GameState.isOver)break;
   }
   const damage=anchors.reduce((n,{e})=>n+e.maxHp-e.hp,0),control=anchors.filter(({e})=>e.freezeTimer>0).length/anchors.length;
   return{hero,stage:stage.id,minute:stage.minute,level:stage.level,scene,branch:build,seed,cards:chosen.length,damage:Math.round(damage),dps:Math.round(damage/duration),controlAtEnd:control,armor:player.armor,maxHp:player.maxHp,hitsToDie:Math.ceil(player.maxHp/Math.max(2,Math.round(16*(1+stage.minute*.08)*(1-Math.min(.6,player.armor))))),encounter:live?{duration,spawned,kills:GameState.kills,survived:Lab.diedAt===null,diedAt:Lab.diedAt,hp:player.hp,damageTaken:Math.round(Lab.received),effectiveHealing:Math.round(Lab.healed)}:null,cooldowns:{attack:player.skills.attack.cd,charge:chargeDuration(),s1:player.skills.skill1.cd,s2:player.skills.skill2.cd,ult:player.skills.ult.cd},chosen};
  };
 });
 for(const stage of stages)for(const scene of scenes)for(const build of (stage.id==='complete'?['A','B']:['A']))for(let seed=1;seed<=seeds;seed++)for(const hero of ['warrior','mage','ranger','engineer','healer']){const row=await page.evaluate(p=>labRun(p),{hero,stage,scene,build,seed:seed*1879});rows.push(row);console.log(label,stage.id,scene,build,seed,hero,scene==='skirmish'?JSON.stringify(row.encounter):'DPS '+row.dps);}
 assert.deepEqual(errors,[]);
})().catch(e=>{errors.push(String(e));console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close();fs.mkdirSync(path.join(repo,'test-results'),{recursive:true});fs.writeFileSync(path.join(repo,'test-results','balance-'+label+'.json'),JSON.stringify({label,source,sourceHash:require('node:crypto').createHash('sha256').update(html).digest('hex'),rows,errors,scope:'20-second fixed-position high-HP boss/25-target combat lab, deterministic virtual timers and seeds, no talents/relics/curse, equal actual upgrade-card budgets at levels 6/20/38/49. Real combat code and mixed primary/charge/active-skill rotation. Lab DPS is not a claim about live clear speed or human survival.'},null,2));});

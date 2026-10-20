const fs=require('node:fs');const original=fs.readFileSync('tests/gameplay.cjs','utf8'),prefix=original.slice(0,original.indexOf(' await clean();'));
const tail=String.raw`
 await clean();const solo=await makePage({width:390,height:844});await solo.evaluate(()=>{document.getElementById('btn-start-game').click();GameState.autoAttack=false;GameState.godMode=true;spawnEnemyBatch=()=>{};enemies.length=0;});
 await check('tundra has fixed width and infinite north/south while graveyard has fixed height and infinite east/west',async()=>{
  const r=await solo.evaluate(()=>{const out=[];for(const biome of ['dungeon','tundra','graveyard']){GameState.activeBiome=biome;out.push(Arena.clamp({x:1e7,y:-1e7},12));}return out});assert.deepEqual(r,[{x:1e7,y:-1e7},{x:628,y:-1e7},{x:1e7,y:-468}]);
 });
 await check('procedural walls and obstacles stay inside the playable strips and leave an unbroken traversable spine',async()=>{
  const r=await solo.evaluate(()=>{const bad=[];for(const biome of ['tundra','graveyard']){const axis=Arena.shape(biome).axis;for(let k=-25;k<=25;k++)for(let side=-2;side<=2;side++){const [cx,cy]=axis==='x'?[side,k]:[k,side];for(const o of generateChunkObstacles(cx,cy,biome))for(const c of o.colliders)if(!Arena.inside(c.x,c.y,c.r+32,biome)||Math.abs(c[axis])<120+c.r)bad.push(biome);const p=axis==='x'?{x:0,y:k*380}:{x:k*380,y:0};if(!Arena.clear(p.x,p.y,50,biome))bad.push('spine');}}return bad});assert.deepEqual(r,[]);
 });
 await check('hundreds of treasure placements in all three maps are inside the arena and clear of every neighboring wall collider',async()=>{
  const r=await solo.evaluate(()=>{const bad=[];player.x=player.y=0;for(const biome of ['dungeon','tundra','graveyard']){GameState.activeBiome=biome;for(let n=0;n<100;n++){spawnMapSpecialRelics();for(const item of mapRelicDrops){if(!Arena.clear(item.x,item.y,50)||Math.hypot(item.x,item.y)<9000)bad.push({biome,x:item.x,y:item.y});}}}return{bad,cache:obstacleChunkCache.size}});assert.deepEqual(r.bad,[]);assert(r.cache<=512);
 });
 await check('far traveling origins retain remote treasures on the open route rather than clamping them onto a side wall',async()=>{
  const r=await solo.evaluate(()=>{const rows=[];for(const biome of ['tundra','graveyard']){GameState.activeBiome=biome;const a=Arena.shape();player.x=a.axis==='x'?600:-200000;player.y=a.axis==='y'?-440:200000;spawnMapSpecialRelics();rows.push(mapRelicDrops.every(p=>Arena.clear(p.x,p.y,50)&&Math.abs(p[a.axis])<=50));}return rows});assert.deepEqual(r,[true,true]);
 });
 await check('normal monsters, bosses and items spawned outside either strip are placed on reachable interior ground',async()=>{
  const r=await solo.evaluate(()=>{const rows=[];for(const biome of ['tundra','graveyard']){GameState.activeBiome=biome;player.x=player.y=0;enemies.length=0;fieldPickups.length=0;for(let i=0;i<20;i++){const e=createEnemy((i%2?1:-1)*12000,(i%3?1:-1)*12000,'imp');if(!Arena.inside(e.x,e.y,e.radius))rows.push('monster');}spawnBoss(5);if(enemies.some(e=>!Arena.inside(e.x,e.y,e.radius)))rows.push('boss');spawnRandomPickup(1e5,-1e5);if(fieldPickups.some(p=>!Arena.clear(p.x,p.y,26)))rows.push('pickup');}return rows});assert.deepEqual(r,[]);
 });
 await check('player dashes and flying enemies cannot cross a side boundary but keep movement along the infinite axis',async()=>{
  const r=await solo.evaluate(()=>{const rows=[];for(const biome of ['tundra','graveyard']){GameState.activeBiome=biome;setupHero('warrior');player.x=player.y=2000;player.skills.skill1.isDashing=true;player.skills.skill1.dashTimer=1;player.vx=player.vy=200;enemies.length=0;update(.05);rows.push(Arena.inside(player.x,player.y,player.radius));const en={x:5000,y:-5000,radius:20};Arena.clamp(en,en.radius);rows.push(Arena.inside(en.x,en.y,en.radius));}return rows});assert.deepEqual(r,[true,true,true,true]);
 });
 await check('both minimap orientations draw real wall lines and forbidden-side shading at their coordinate projections',async()=>{
  const r=await solo.evaluate(()=>{const rows=[];for(const biome of ['tundra','graveyard']){GameState.activeBiome=biome;player.x=player.y=0;activeObstacles.length=0;enemies.length=0;mapRelicDrops.length=0;shrines.length=0;drawMinimap();const c=document.getElementById('minimapCanvas'),before=c.toDataURL(),draw=Arena.drawMap;Arena.drawMap=()=>{};drawMinimap();const after=c.toDataURL();Arena.drawMap=draw;drawMinimap();rows.push(before!==after);}return rows});assert.deepEqual(r,[true,true]);
 });
 await check('expanded radial maps show both wall curves and the correct endless orientation without adding ordinary loot',async()=>{
  const r=await solo.evaluate(()=>{const rows=[];for(const biome of ['tundra','graveyard']){GameState.activeBiome=biome;player.x=player.y=0;CoopMap.toggle(true);CoopMap.draw(true);const c=document.getElementById('world-map-canvas'),before=c.toDataURL(),draw=Arena.drawMap;Arena.drawMap=()=>{};CoopMap.draw(true);const after=c.toDataURL();Arena.drawMap=draw;CoopMap.draw(true);rows.push({changed:before!==after,label:document.getElementById('world-map-shape').textContent});}CoopMap.toggle(false);return rows});assert(r.every(x=>x.changed));assert(r[0].label.includes('纵向'));assert(r[1].label.includes('横向'));
 });
 await check('only the finite axis has walls and the dungeon retains its previous four-direction endless geometry',async()=>{
  const r=await solo.evaluate(()=>{const rows=[];for(const biome of ['dungeon','tundra','graveyard']){GameState.activeBiome=biome;let calls=0;const c=document.createElement('canvas').getContext('2d'),stroke=c.stroke;c.stroke=function(){calls++;return stroke.call(this)};Arena.drawMap(c,(x,y)=>({x:x/100,y:y/100}),8000);rows.push(calls);}return rows});assert.deepEqual(r,[0,2,2]);
 });
 await check('directional map identity and safe shared treasure coordinates stay identical over actual RTC',async()=>{
  for(const biome of ['tundra','graveyard']){await host.evaluate(biome=>{WorldCoop.finish(false);returnToCampOrParty();GameState.activeBiome=biome;WorldCoop.startOrResume()},biome);await guest.waitForFunction(b=>GameState.activeBiome===b&&GameState.isStarted&&!GameState.isOver,biome);await host.evaluate(()=>{GameState.godMode=true;GameState.autoAttack=false;player.expToNext=1e8;spawnEnemyBatch=()=>{};WorldCoop.broadcastWorld()});await guest.waitForFunction(()=>mapRelicDrops.length>0);const a=await host.evaluate(()=>mapRelicDrops.map(p=>({id:p.id,x:Math.round(p.x*10)/10,y:Math.round(p.y*10)/10}))),b=await guest.evaluate(()=>mapRelicDrops.map(p=>({id:p.id,x:p.x,y:p.y})));assert.deepEqual(a,b);assert(await guest.evaluate(()=>mapRelicDrops.every(p=>Arena.clear(p.x,p.y,50))));}
 });
 assert.deepEqual(errors,[]);
})().catch(e=>{console.error(e);results.failure=String(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close();fs.writeFileSync('test-results/arena.json',JSON.stringify({results,errors,failure:results.failure,scope:'Actual procedural geometry and browser Canvas, mobile and local RTC. No nationwide/phone performance claim.'},null,2))});
`;new Function('require',prefix+tail)(require);

const fs=require('node:fs');
const original=fs.readFileSync('tests/social.cjs','utf8');
const prefix=original.slice(0,original.indexOf(' const [host,a,b]=pages;'));
const tail=String.raw`
 const [host,a,b]=pages;await host.locator('#coop-room-name').fill('朋友连续出征');await host.evaluate(()=>CoopManager.createRoom());const room=await host.evaluate(()=>CoopManager.roomCode);
 for(const p of [a,b])await p.evaluate(room=>CoopManager.joinRoom(room),room);
 await Promise.all(pages.map(p=>p.waitForFunction(()=>CoopManager.allies.length===2&&CoopManager.allies.every(a=>CoopManager.routeFor(a.id,true).kind==='rtc'))));
 const identity=await host.evaluate(()=>RoomHub.identity());
 await host.evaluate(()=>WorldCoop.startOrResume());await Promise.all([a,b].map(p=>p.waitForFunction(()=>WorldCoop.active()&&WorldCoop.receivedFrame>0)));
 async function quiet(){for(const p of pages)await p.evaluate(()=>{GameState.autoAttack=false;GameState.godMode=true;player.expToNext=100000;CoopManager.sendPresenceNow()});await host.evaluate(()=>{spawnEnemyBatch=()=>{};enemies.length=0;WorldCoop.broadcastWorld()});}
 await quiet();
 for(const p of pages){await p.evaluate(()=>{window.originalGamePCs=[...CoopManager.autoRtcMap.values()].map(e=>e.pc);CoopVoice.toggleMic()});await p.waitForFunction(()=>CoopVoice.mic&&!CoopVoice.busy);}
 await audioEvidence(a,'peer_m');await audioEvidence(b,'peer_a');
 for(const p of pages)await p.evaluate(()=>{window.originalVoicePCs=[...CoopVoice.peers.values()].map(e=>e.pc);window.originalCapture=CoopVoice.stream.getAudioTracks()[0]});
 async function ended(victory){await host.evaluate(v=>WorldCoop.finish(v),victory);await Promise.all(pages.map(p=>p.waitForFunction(()=>GameState.isOver&&Boolean(WorldCoop.ended))));}
 async function returnAll(){for(const p of pages)await p.locator('#btn-over-lobby').click();}
 async function sameParty(){for(const p of pages){assert.equal(await p.evaluate(()=>RoomHub.identity()),identity);assert.equal(await p.evaluate(()=>CoopManager.roomCode),room);assert.equal(await p.evaluate(()=>RoomHub.members.size),3);assert.equal(await p.evaluate(()=>CoopManager.allies.length),2);}}
 const first=await host.evaluate(()=>WorldCoop.session);
 const oldFrame=await host.evaluate(()=>WorldCoop.encodeWorld());
 await check('defeat return opens the original party for guest and host without changing members or closing game/audio RTC',async()=>{
  await ended(false);for(const p of pages)assert.equal(await p.locator('#btn-over-lobby').textContent(),'返回队伍房间');
  await returnAll();await sameParty();
  for(const p of pages){assert(await p.locator('#coop-modal').isVisible());assert(!await p.locator('#over-modal').isVisible());assert.equal(await p.evaluate(()=>WorldCoop.session),first);assert.equal(await p.evaluate(()=>RoomHub.roomName),'朋友连续出征');assert(await p.evaluate(()=>originalCapture.readyState==='live'&&originalVoicePCs.every(pc=>[...CoopVoice.peers.values()].some(e=>e.pc===pc))&&originalGamePCs.every(pc=>[...CoopManager.autoRtcMap.values()].some(e=>e.pc===pc))));}
  await audioEvidence(a,'peer_m');
 });
 await check('camp clears the completed battle and delayed snapshots cannot repopulate or resume it',async()=>{
  for(const p of pages){assert.equal(await p.evaluate(()=>GameState.isStarted||GameState.isOver||GameState.isPaused),false);assert.equal(await p.evaluate(()=>GameState.gameTime+GameState.kills+enemies.length+projectiles.length+gems.length+groundEffects.length),0);assert.equal(await p.locator('#btn-lobby-resume').count(),0);}
  await a.evaluate(frame=>{WorldCoop.applyWorld({...frame,seq:1e8,t:performance.now()+1000});CoopManager.onReceivePacket({type:'WORLD_START',peerId:RoomHub.hostId,protocol:32,roomCode:RoomHub.identity(),session:WorldCoop.session,biome:'graveyard',sentAt:1e12,msgId:'camp-old-start'},{kind:'rtc'})},oldFrame);
  assert.equal(await a.evaluate(()=>GameState.isStarted||GameState.isOver),false);assert.equal(await a.evaluate(()=>enemies.length+GameState.gameTime),0);assert(await a.locator('#coop-modal').isVisible());
 });
 await check('chat remains delivered in the retained party and duplicate old end packets cannot reopen the results',async()=>{
  await a.evaluate(()=>{CoopSocial.toggle(true);document.getElementById('social-input').value='下一把继续';CoopSocial.send()});await host.waitForFunction(()=>CoopSocial.messages.some(m=>m.text==='下一把继续'));
  await a.evaluate(()=>CoopSocial.toggle(false));await a.evaluate(()=>CoopManager.onReceivePacket({type:'WORLD_END',peerId:RoomHub.hostId,protocol:32,roomCode:RoomHub.identity(),session:WorldCoop.session,result:'defeat',msgId:'repeat-end-qa',rewards:[],kills:10},{kind:'rtc'}));assert(await a.locator('#coop-modal').isVisible());assert(!await a.locator('#over-modal').isVisible());
 });
 await check('returning to camp keeps the party, allows hero/map changes and updates the waiting-room advertisement',async()=>{
  for(const p of pages)await p.locator('#btn-close-coop').click();for(const p of pages)assert(await p.locator('#lobby-modal').isVisible());await sameParty();
  await a.locator('#lobby-modal .hero-card[data-hero="ranger"]').click();assert.equal(await a.evaluate(()=>GameState.selectedHero),'ranger');
  await host.locator('#lobby-modal .biome-card[data-biome="tundra"]').click();await a.waitForFunction(()=>GameState.activeBiome==='tundra');await b.waitForFunction(()=>GameState.activeBiome==='tundra');assert.equal(await host.evaluate(()=>RoomHub.advertisement().started),false);
  await host.locator('#btn-lobby-coop').click();await a.locator('#btn-lobby-coop').click();await b.locator('#btn-lobby-coop').click();
 });
 let second;
 await check('host starts a fresh round in the same party and guest camp dialogs close automatically',async()=>{
  await b.locator('#btn-close-coop').click();await b.locator('#btn-open-talent').click();assert(await b.locator('#talent-modal').isVisible());
  await host.locator('#btn-coop-start-now').click();await Promise.all(pages.map(p=>p.waitForFunction(old=>WorldCoop.session!==old&&WorldCoop.active()&&!GameState.isOver&&GameState.isStarted,first)));
  second=await host.evaluate(()=>WorldCoop.session);await sameParty();assert.equal(await b.locator('.modal-overlay:visible').count(),0);assert.equal(await a.evaluate(()=>GameState.selectedHero),'ranger');assert.equal(await host.evaluate(()=>GameState.activeBiome),'tundra');await quiet();
 });
 await check('old world starts and chunks cannot rewind a new round',async()=>{
  await a.evaluate(old=>{for(const type of ['WORLD_START','WORLD_CHUNK'])CoopManager.onReceivePacket({type,peerId:RoomHub.hostId,protocol:32,roomCode:RoomHub.identity(),session:old,biome:'graveyard',sentAt:1e12,frame:1e8,msgId:'retired-'+type},{kind:'rtc'})},first);
  assert.equal(await a.evaluate(()=>WorldCoop.session),second);assert.equal(await a.evaluate(()=>GameState.activeBiome),'tundra');assert.equal(await a.evaluate(()=>GameState.isOver),false);
 });
 await check('host menu ends the round and returns all three to the retained party for a fresh run',async()=>{
  await host.locator('#btn-pause').click();await host.locator('#btn-pause-lobby').click();await Promise.all(pages.map(p=>p.waitForFunction(()=>WorldCoop.camped&&WorldCoop.ended==='retreat')));await sameParty();for(const p of pages){assert(await p.locator('#coop-modal').isVisible());assert.equal(await p.evaluate(()=>GameState.isStarted||GameState.isOver),false);}
  await host.locator('#btn-coop-start-now').click();await Promise.all(pages.map(p=>p.waitForFunction(old=>WorldCoop.active()&&GameState.isStarted&&WorldCoop.session!==old,second)));second=await host.evaluate(()=>WorldCoop.session);await quiet();
 });
 const beforeAwards=await Promise.all(pages.map(p=>p.evaluate(()=>Campaign.achievements().filter(a=>Campaign.permanent().achievements[a.id]).reduce((n,a)=>n+a.reward,0))));
 const beforeGold=await Promise.all(pages.map(p=>p.evaluate(()=>SaveManager.data.gold)));
 await check('victory awards once and returning to the party does not pay or end the run again',async()=>{
  await ended(true);await returnAll();await sameParty();
  const after=await Promise.all(pages.map(p=>p.evaluate(()=>SaveManager.data.gold)));for(let i=0;i<3;i++){const awards=await pages[i].evaluate(()=>Campaign.achievements().filter(a=>Campaign.permanent().achievements[a.id]).reduce((n,a)=>n+a.reward,0));assert.equal(after[i]-beforeGold[i],500+awards-beforeAwards[i]);}
  await a.evaluate(()=>{WorldCoop.finish(true);returnToCampOrParty()});assert.equal(await a.evaluate(()=>SaveManager.data.gold),after[1]);
 });
 await check('a new participant enters the waiting party without receiving the previous victory or its world',async()=>{
  await b.evaluate(()=>CoopManager.leaveRoom());await host.waitForFunction(()=>CoopManager.allies.length===1);await b.reload();await b.evaluate(()=>FrontDoor.enter());await b.evaluate(()=>{LiteMQTTClient.prototype.startAllTransports=function(){this.activeSockets=[{_brokerUrl:'test',_isSubscribed:true,readyState:1,bufferedAmount:0,close(){}}]};LiteMQTTClient.prototype.publishWire=function(pkt){if(!this.closed)window.relay({topic:this.topic,pkt});return !this.closed};CoopManager.createSafePeerConnection=()=>new RTCPeerConnection({iceServers:[]});openCoopModal()});
  const gold=await b.evaluate(()=>SaveManager.data.gold);await b.evaluate(room=>CoopManager.joinRoom(room),room);await host.waitForFunction(()=>CoopManager.allies.length===2);await pause(1500);assert.equal(await b.evaluate(()=>SaveManager.data.gold),gold);assert.equal(await b.evaluate(()=>GameState.isOver||GameState.isStarted||Boolean(WorldCoop.session)),false);assert(await b.locator('#coop-modal').isVisible());
 });
 await check('a guest can request the next round from the retained room and all three enter it',async()=>{
  await a.locator('#btn-coop-start-now').click();await Promise.all(pages.map(p=>p.waitForFunction(old=>WorldCoop.active()&&WorldCoop.session!==old&&!GameState.isOver&&GameState.isStarted,second)));await sameParty();await quiet();
 });
 await check('a lost end packet is repaired after the host has cleared the battle and returned to camp',async()=>{
  await b.evaluate(()=>{window.campReceive=CoopManager.onReceivePacket;window.blockCampEnd=true;CoopManager.onReceivePacket=function(pkt,source){if(blockCampEnd&&['WORLD_END','WORLD_CHUNK'].includes(pkt.type))return;return campReceive.call(this,pkt,source)}});
  await host.evaluate(()=>{GameState.kills=777;WorldCoop.finish(false)});await a.waitForFunction(()=>GameState.isOver);await host.locator('#btn-over-lobby').click();assert.equal(await host.evaluate(()=>GameState.kills+enemies.length),0);assert.equal(await b.evaluate(()=>GameState.isOver),false);
  await b.evaluate(()=>{window.blockCampEnd=false;CoopManager.onReceivePacket=campReceive});const id=await b.evaluate(()=>CoopManager.myPeerId);await host.evaluate(id=>WorldCoop.broadcastWorld(id),id);await b.waitForFunction(()=>GameState.isOver);assert.equal(await b.evaluate(()=>GameState.kills),777);
  for(const p of [a,b])await p.locator('#btn-over-lobby').click();await sameParty();const old=await host.evaluate(()=>WorldCoop.session);await host.locator('#btn-coop-start-now').click();await Promise.all(pages.map(p=>p.waitForFunction(old=>WorldCoop.session!==old&&GameState.isStarted,old)));await quiet();
 });
 await check('again-from-results keeps the room, while only explicit leave removes a participant',async()=>{
  const round=await host.evaluate(()=>WorldCoop.session);await ended(false);await host.locator('#btn-restart').click();await Promise.all(pages.map(p=>p.waitForFunction(old=>WorldCoop.session!==old&&!GameState.isOver,round)));await sameParty();
  await ended(false);await a.locator('#btn-over-lobby').click();await a.locator('#btn-coop-leave-room').click();await a.waitForFunction(()=>!CoopManager.roomCode&&!GameState.isStarted&&!GameState.isOver);await host.waitForFunction(()=>CoopManager.allies.length===1);assert(await a.locator('#lobby-modal').isVisible());assert.equal(await host.evaluate(()=>CoopManager.roomCode),room);
 });
 await check('solo results still return to camp without a party or stale cooperative state',async()=>{
  await a.locator('#btn-start-game').click();await a.waitForFunction(()=>GameState.isStarted);await a.evaluate(()=>{GameState.godMode=false;gameOver()});await a.waitForFunction(()=>GameState.isOver);assert.equal(await a.locator('#btn-over-lobby').textContent(),'返回营地');await a.locator('#btn-over-lobby').click();assert.equal(await a.evaluate(()=>GameState.isStarted||GameState.isOver||Boolean(CoopManager.roomCode)),false);assert(await a.locator('#lobby-modal').isVisible());
 });
 assert.deepEqual(errors,[]);
})().catch(e=>{report.failure=String(e);console.error(e);process.exitCode=1}).finally(async()=>{if(browser){report.endState=await Promise.all(pages.map(p=>p.evaluate(()=>({room:CoopManager.roomCode,id:RoomHub.identity(),session:WorldCoop.session,ended:WorldCoop.ended,started:GameState.isStarted,over:GameState.isOver,paused:GameState.isPaused,members:[...RoomHub.members],allies:CoopManager.allies.map(a=>a.id),retired:[...WorldCoop.retiredSessions],dialogs:[...document.querySelectorAll('.modal-overlay')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.id)})).catch(()=>null)));await browser.close()}server.close();fs.writeFileSync('test-results/party-rounds.json',JSON.stringify(report,null,2))});
`;
new Function('require',prefix+tail)(require);

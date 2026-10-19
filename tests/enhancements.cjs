const fs=require('node:fs');
const original=fs.readFileSync('tests/social.cjs','utf8');
const prefix=original.slice(0,original.indexOf(' const [host,a,b]=pages;'));
const tail=String.raw`
 const [host,a,b]=pages;
 await host.locator('#coop-room-name').fill('朋友的冒险夜');await host.evaluate(()=>CoopManager.createRoom());const room=await host.evaluate(()=>CoopManager.roomCode);
 await a.evaluate(room=>CoopManager.joinRoom(room),room);
 await Promise.all([host,a].map(p=>p.waitForFunction(()=>CoopManager.allies.length===1)));
 await check('public names are distinct from host names and the visible browse entry opens the list',async()=>{
  const ad=await host.evaluate(()=>RoomHub.advertisement());assert.equal(ad.roomName,'朋友的冒险夜');assert.equal(ad.name,'房主');
  assert.equal(await a.evaluate(()=>RoomHub.roomName),'朋友的冒险夜');assert((await a.locator('#coop-room-banner').textContent()).includes('朋友的冒险夜'));
  await b.locator('#btn-coop-browse-rooms').click();assert(await b.locator('#coop-public-rooms').evaluate(e=>e.open));
  await b.evaluate(ad=>{RoomHub.receive({...ad,from:ad.host,id:'qa-ad',hub:1});RoomHub.renderPublicRooms()},ad);
  assert((await b.locator('#coop-public-list').textContent()).includes('朋友的冒险夜'));
  assert.equal(await host.evaluate(()=>Array.from(RoomHub.cleanRoomName('😀'.repeat(30))).length),20);
 });
 await host.evaluate(()=>WorldCoop.startOrResume());await a.waitForFunction(()=>WorldCoop.active()&&WorldCoop.receivedFrame>0);
 for(const p of [host,a])await p.evaluate(()=>{closeCoopModal();GameState.autoAttack=false;GameState.godMode=true;player.expToNext=100000;CoopVoice.toggleMic()});
 await Promise.all([host,a].map(p=>p.waitForFunction(()=>CoopVoice.mic&&!CoopVoice.busy)));
 await audioEvidence(host,'peer_a');await audioEvidence(a,'peer_m');
 await host.evaluate(()=>{spawnEnemyBatch=()=>{};enemies.length=0;WorldCoop.broadcastWorld()});
 await check('third player joining an active battle establishes both voice links with real audio RTP',async()=>{
  await b.evaluate(room=>CoopManager.joinRoom(room),room);
  await Promise.all(pages.map(p=>p.waitForFunction(()=>CoopManager.allies.length===2)));
  await b.waitForFunction(()=>WorldCoop.active()&&WorldCoop.receivedFrame>0);
  await b.evaluate(()=>{closeCoopModal();GameState.autoAttack=false;GameState.godMode=true;player.expToNext=100000;CoopVoice.toggleMic()});
  await b.waitForFunction(()=>CoopVoice.mic&&!CoopVoice.busy);
  for(const [p,id]of [[host,'peer_z'],[a,'peer_z'],[b,'peer_m'],[b,'peer_a']])await audioEvidence(p,id);
  await a.waitForFunction(()=>CoopVoice.directReady('peer_z')&&CoopVoice.peers.get('peer_m').relayAudio?.muted);
 });
 async function relayEvidence(page,source){
  const until=Date.now()+16000;while(Date.now()<until){const evidence=await page.evaluate(async source=>{const e=CoopVoice.relayFor(source);if(!e||e.relayAudio.muted)return null;for(const s of(await e.pc.getStats()).values())if(s.type==='inbound-rtp'&&s.kind==='audio'&&s.mid===e.relaySlot.mid&&s.packetsReceived>3)return {source,packets:s.packetsReceived,mid:s.mid};return null},source);if(evidence)return evidence;await pause(150);}throw Error('no forwarded audio for '+source);
 }
 await check('host automatically forwards audio when guest-to-guest voice ICE cannot connect, without returning self audio',async()=>{
  for(const p of [a,b])await p.evaluate(()=>{const old=CoopVoice.create;CoopVoice.create=function(peer,call,answering){const factory=CoopManager.createSafePeerConnection;if(!peer.isHost)CoopManager.createSafePeerConnection=()=>new RTCPeerConnection({iceServers:[],iceTransportPolicy:'relay'});try{return old.call(this,peer,call,answering)}finally{CoopManager.createSafePeerConnection=factory}};for(const peer of CoopManager.allies.filter(p=>!p.isHost))CoopVoice.drop(peer.id,true);CoopVoice.sync()});
  report.forwarded=[await relayEvidence(a,'peer_z'),await relayEvidence(b,'peer_a')];
  assert(await host.evaluate(()=>CoopVoice.peers.get('peer_a').relaySlot.sender.track===CoopVoice.peers.get('peer_z').remoteTrack&&CoopVoice.peers.get('peer_z').relaySlot.sender.track===CoopVoice.peers.get('peer_a').remoteTrack));
  await a.evaluate(()=>{CoopVoice.deaf=true;CoopVoice.refreshAudio()});assert(await a.evaluate(()=>[...CoopVoice.peers.values()].every(e=>(!e.audio||e.audio.muted)&&(!e.relayAudio||e.relayAudio.muted))));await a.evaluate(()=>{CoopVoice.deaf=false;CoopVoice.refreshAudio()});
 });
 await check('a listen-only host continues forwarding two guests without a microphone',async()=>{
  await host.evaluate(()=>{CoopVoice.leave();CoopVoice.listen()});await host.waitForFunction(()=>CoopVoice.joined&&!CoopVoice.mic);
  await relayEvidence(a,'peer_z');await relayEvidence(b,'peer_a');
 });
 await check('leaving and rejoining voice replaces the forwarded source epoch and resumes real audio',async()=>{
  const old=await b.evaluate(()=>CoopVoice.epoch);await b.evaluate(()=>CoopVoice.leave());
  await a.waitForFunction(()=>!CoopVoice.relayFor('peer_z'));
  await b.evaluate(()=>CoopVoice.toggleMic());await b.waitForFunction(()=>CoopVoice.mic&&!CoopVoice.busy);
  await relayEvidence(a,'peer_z');await relayEvidence(b,'peer_a');assert((await b.evaluate(()=>CoopVoice.epoch))>old);
 });
 await check('voice volume affects direct and forwarded playback; music and effects use independent live gain buses',async()=>{
  await a.evaluate(()=>{AudioSettings.open();AudioSettings.set('voice',27);AudioSettings.set('music',12);AudioSettings.set('effects',36);audio.init();AudioSettings.apply()});
  const state=await a.evaluate(()=>({volumes:[...CoopVoice.peers.values()].flatMap(e=>[e.audio,e.relayAudio]).filter(Boolean).map(e=>e.volume),music:audio.musicBus.gain.value,effects:audio.effectsBus.gain.value,saved:JSON.parse(localStorage.getItem('ps_audio_levels'))}));
  assert(state.volumes.length>=2);assert(state.volumes.every(v=>v===.27));assert(Math.abs(state.music-.12)<.001);assert(Math.abs(state.effects-.36)<.001);assert.deepEqual(state.saved,{voice:27,music:12,effects:36});await a.evaluate(()=>AudioSettings.close());
 });
 await check('map centers on the local body and preserves directions with increasing outer distance intervals',async()=>{
  await host.evaluate(()=>{GameState.godMode=true;player.x=0;player.y=0;CoopManager.allies[0].x=1000;CoopManager.allies[0].y=0;CoopManager.allies[0].targetX=1000;CoopManager.allies[0].targetY=0;CoopMap.toggle(true)});
  const map=await host.evaluate(()=>({rings:CoopMap.rings,positions:[100,250,500,1000,2000,4000,8000].map(d=>CoopMap.radial(d,140)),distance:CoopMap.distance({x:3,y:4}),body:CoopMap.distance({x:0,y:0,downed:true,bodyX:30,bodyY:40}),paused:GameState.isPaused}));
  assert.deepEqual(map.positions,[20,40,60,80,100,120,140]);assert.equal(map.distance,5);assert.equal(map.body,50);assert.equal(map.paused,false);
  assert(await host.locator('#world-map-canvas').isVisible());assert((await host.locator('.map-legend').textContent()).includes('经验'));assert.equal(await host.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await host.locator('#world-map-modal .modal-card').screenshot({path:'test-results/r8-map-portrait.png'});await host.locator('#btn-close-map').click();
  await host.locator('#minimap-box').click();assert(await host.locator('#world-map-canvas').isVisible());await host.locator('#btn-close-map').click();
 });
 await check('spectator controls yield to every menu and restore the selected camera after closing',async()=>{
  await host.evaluate(()=>WorldCoop.down());await host.waitForFunction(()=>player.isDowned);await host.evaluate(()=>{CoopSpectate.id=CoopManager.allies[0].id;CoopSpectate.tick()});const selected=await host.evaluate(()=>CoopSpectate.id);
  for(const id of ['pause-modal','skilltree-modal','coop-modal','save-modal','settings-modal','world-map-modal','dev-modal']){
   await host.evaluate(id=>{document.getElementById(id).style.display='flex';CoopSpectate.tick()},id);assert(!await host.locator('#coop-spectate').isVisible());await host.evaluate(id=>{document.getElementById(id).style.display='none';CoopSpectate.tick()},id);assert(await host.locator('#coop-spectate').isVisible());assert.equal(await host.evaluate(()=>CoopSpectate.id),selected);
  }
  await host.evaluate(()=>{const p=WorldCoop.participants.get(CoopManager.myPeerId);p.downed=false;p.epoch++;p.hp=40;WorldCoop.applyLife(p);WorldCoop.broadcastWorld()});
 });
 await check('unapproved guests cannot execute hidden developer controls, even if the old local unlock flag is set',async()=>{
  await a.evaluate(()=>{openDevModal();GameState.devUnlocked=true;GameState.godMode=false;document.getElementById('btn-dev-god').click()});assert.equal(await a.evaluate(()=>GameState.godMode),false);assert.equal(await a.evaluate(()=>CoopDev.allowed()),false);
  await a.evaluate(()=>{document.getElementById('dev-pwd-input').value='114514';verifyDevPassword()});await a.waitForFunction(()=>document.getElementById('dev-auth-msg').textContent.includes('尚未开放'));assert.equal(await a.evaluate(()=>CoopDev.allowed()),false);
 });
 await host.evaluate(async()=>{GameState.devUnlocked=true;openDevModal();document.getElementById('dev-guest-password').value='friends-only';await CoopDev.configure()});
 await check('wrong guest developer password is rejected, and correct password only queues host approval',async()=>{
  await a.evaluate(()=>{document.getElementById('dev-pwd-input').value='wrong-pass';verifyDevPassword()});await a.waitForFunction(()=>document.getElementById('dev-auth-msg').textContent.includes('密码错误'));
  await a.evaluate(()=>{document.getElementById('dev-pwd-input').value='friends-only';verifyDevPassword()});await host.waitForFunction(()=>CoopDev.pending.has('peer_a'));
  assert.equal(await a.evaluate(()=>CoopDev.allowed()),false);assert.equal(await a.locator('#dev-controls-box').isVisible(),false);assert(await host.locator('#dev-request-notice').isVisible());
  await host.evaluate(()=>CoopDev.decide('peer_a',false));await a.waitForFunction(()=>document.getElementById('dev-auth-msg').textContent.includes('拒绝'));
 });
 await check('host approval enables guest controls, revocation removes invulnerability and old grants cannot be replayed',async()=>{
  await a.evaluate(()=>{document.getElementById('dev-pwd-input').value='friends-only';verifyDevPassword()});await host.waitForFunction(()=>CoopDev.pending.has('peer_a'));await host.evaluate(()=>CoopDev.decide('peer_a',true));await a.waitForFunction(()=>CoopDev.allowed());
  await a.locator('#btn-dev-god').click();assert.equal(await a.evaluate(()=>GameState.godMode),true);
  const old=await a.evaluate(()=>({...CoopDev.grant}));await host.locator('#dev-requests button').filter({hasText:'撤销'}).click();await a.waitForFunction(()=>!CoopDev.allowed()&&!GameState.godMode);
  await a.evaluate(old=>CoopDev.receive({type:'DEV_GRANT',peerId:RoomHub.hostId,req:old.req,token:old.token}),old);assert.equal(await a.evaluate(()=>CoopDev.allowed()),false);
  await a.evaluate(()=>closeDevModal());await host.evaluate(()=>closeDevModal());
 });
 for(const p of pages)await p.evaluate(()=>{GameState.isPaused=false;document.querySelectorAll('.modal-overlay').forEach(e=>e.style.display='none');GameState.autoAttack=false;GameState.godMode=true;CoopManager.sendPresenceNow()});
 await host.waitForFunction(()=>WorldCoop.canAct());
 await check('all hero skill families render remotely with evolved state, and a lost special event is retried once visually',async()=>{
  await a.evaluate(()=>{CoopSkillVfx.reset();const receive=CoopSkillVfx.receive;window.droppedFx=0;CoopSkillVfx.receive=function(pkt){if(pkt.type==='SKILL_EVENT'&&pkt.skillKind==='s2'&&!droppedFx++){return true;}return receive.call(this,pkt)}});
  for(const hero of ['warrior','mage','ranger'])for(const kind of ['s1','s2','ult','item']){
   await host.evaluate(({hero,kind})=>{setupHero(hero);player.expToNext=100000;player.isDowned=false;GameState.isPaused=false;GameState.godMode=true;for(const s of Object.values(player.skills)){s.timer=0;s.level=5;s.isEvolved=true;}groundEffects.length=0;({s1:executeSkill1,s2:executeSkill2,ult:executeUlt,item:executeItem})[kind]()},{hero,kind});
   try{await a.waitForFunction(({hero,kind})=>CoopSkillVfx.effects.some(e=>e.hero===hero&&e.kind===kind&&(e.evolved||kind==='item')),{hero,kind},{timeout:8000});}catch(error){report.castFailure={hero,kind,host:await host.evaluate(()=>({started:GameState.isStarted,paused:GameState.isPaused,over:GameState.isOver,down:player.isDowned,seq:CoopSkillVfx.seq,pending:[...CoopSkillVfx.pending.keys()]})),receiver:await a.evaluate(()=>({effects:CoopSkillVfx.effects,seen:[...CoopSkillVfx.seen.keys()]}))};console.log('CAST_FAILURE',JSON.stringify(report.castFailure));throw error;}
  }
  await host.waitForFunction(()=>CoopSkillVfx.pending.size===0);
  const counts=await a.evaluate(()=>({ids:CoopSkillVfx.seen.size,allies:CoopSkillVfx.effects.length,local:[orbitingBlades.length,boomerangs.length,groundEffects.filter(e=>e.isAlly).length]}));assert.equal(counts.ids,12);assert.deepEqual(counts.local,[0,0,0]);
  await a.evaluate(()=>{CoopManager.allyVfxAlpha=.8;CoopSkillVfx.effects.forEach(e=>{e.x=player.x;e.y=player.y});draw()});await a.screenshot({path:'test-results/r8-peer-skills.png'});
 });
 await check('skill opacity zero hides only remote visuals, and persistent skill effects remain while their caster moves',async()=>{
  const stats=await a.evaluate(()=>{const e=CoopSkillVfx.effects.find(e=>e.kind==='s2'&&e.hero==='warrior');if(!e)CoopSkillVfx.replay(CoopManager.allies.find(p=>p.id==='peer_m'),{skillKind:'s2',hero:'warrior',isEvolved:true,level:5});const ctx=document.createElement('canvas').getContext('2d');let n=0;ctx.stroke=()=>n++;CoopManager.allyVfxAlpha=0;CoopSkillVfx.draw(ctx);const hidden=n;CoopManager.allyVfxAlpha=1;CoopSkillVfx.draw(ctx);return{hidden,visible:n}});assert.equal(stats.hidden,0);assert(stats.visible>0);
 });
 await check('persistent blades, traps, holes and returning wheels follow actual positions and clear after removal',async()=>{
  await host.evaluate(()=>{CoopSkillVfx.reset();orbitingBlades.length=0;groundEffects.length=0;boomerangs.length=0;groundEffects.push({type:'trap',x:400,y:250,radius:25,life:6,maxLife:6,tickTimer:0,damage:0});boomerangs.push({x:700,y:300,catchX:700,catchY:300,state:'grounded',timer:4,radius:25,isEvolved:true,spinAngle:0,tickTimer:0,damage:0});CoopSkillVfx.lastState=0;CoopSkillVfx.syncState(performance.now())});
  await a.waitForFunction(()=>CoopSkillVfx.states.get('peer_m')?.items.some(p=>p[0]==='wheel'&&p[1]===700));
  await host.evaluate(()=>{groundEffects.length=0;boomerangs.length=0;CoopSkillVfx.lastState=0;CoopSkillVfx.syncState(performance.now())});await a.waitForFunction(()=>CoopSkillVfx.states.get('peer_m')?.items.length===0);
 });
 await check('landscape map and audio sliders fit the phone viewport and settings persist after reload',async()=>{
  await a.setViewportSize({width:844,height:390});await a.evaluate(()=>CoopMap.toggle(true));assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await a.locator('#btn-close-map').click();
  await a.evaluate(()=>AudioSettings.open());await a.locator('#settings-modal .modal-card').screenshot({path:'test-results/r8-audio-landscape.png'});await a.evaluate(()=>AudioSettings.close());
  await a.reload();assert.deepEqual(await a.evaluate(()=>AudioSettings.values),{voice:27,music:12,effects:36});assert.equal(await a.evaluate(()=>CoopDev.allowed()),false);
 });
 assert.deepEqual(errors,[]);
})().catch(e=>{report.failure=String(e);console.error(e);process.exitCode=1}).finally(async()=>{
 if(browser){report.endState=await Promise.all(pages.map(p=>p.evaluate(()=>({id:CoopManager.myPeerId,room:RoomHub.identity(),voice:CoopVoice.presence(),allies:CoopManager.allies.map(p=>({id:p.id,isHost:p.isHost,voice:p.voiceOn})),peers:[...CoopVoice.peers.values()].map(e=>({id:e.id,state:e.pc.connectionState,relay:e.relaySource,slot:e.relaySlot?.mid,relayMuted:e.relayAudio?.muted,relayTrack:e.relayTrack?.muted,primary:e.remoteTrack?.muted})),dev:{pending:CoopDev.pending.size,request:CoopDev.request?.stage,allowed:CoopDev.allowed()}})).catch(()=>null)));await browser.close();}server.close();fs.writeFileSync('test-results/enhancements.json',JSON.stringify(report,null,2));
});
`;
new Function('require',prefix+tail)(require);

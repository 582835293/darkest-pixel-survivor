const {chromium}=require('playwright');
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
fs.mkdirSync('test-results',{recursive:true});
const html=fs.readFileSync('index.html'),server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html)});
let browser;const pages=[],results=[],errors=[],report={scope:'Three isolated mobile-size Edge contexts, real local WebRTC data and audio, fake microphone devices, mocked room discovery. Not Android hardware or independent cellular networks.',results,errors};
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function check(name,fn){await fn();results.push(name);console.log('PASS',name)}
async function audioEvidence(page,id,timeout=12000){
 const until=Date.now()+timeout;
 while(Date.now()<until){
  const result=await page.evaluate(async id=>{const e=CoopVoice.peers.get(id);if(!e||e.pc.connectionState!=='connected')return null;for(const s of (await e.pc.getStats()).values())if(s.type==='inbound-rtp'&&s.kind==='audio'&&s.packetsReceived>2)return {packets:s.packetsReceived,bytes:s.bytesReceived};return null},id);
  if(result)return result;await pause(100);
 }
 throw new Error('No received audio RTP from '+id);
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
 for(let i=0;i<3;i++){
  const ctx=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone']});await ctx.addInitScript(()=>{window.BroadcastChannel=undefined});
  const p=await ctx.newPage();pages.push(p);p.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message)});
  await p.exposeFunction('relay',async pkt=>{for(const other of pages)if(other!==p)await other.evaluate(pkt=>CoopManager.onReceivePacket(pkt,{kind:'mqtt',url:'test'}),pkt).catch(()=>{})});
  await p.goto(`http://127.0.0.1:${server.address().port}`);
  await p.evaluate(i=>{
   LiteMQTTClient.prototype.startAllTransports=function(){this.activeSockets=[{_brokerUrl:'test',_isSubscribed:true,readyState:1,bufferedAmount:0,close(){}}]};
   LiteMQTTClient.prototype.publish=function(pkt){if(!this.closed)window.relay(pkt);return !this.closed};
   CoopManager.createSafePeerConnection=()=>CoopDirect.track(new RTCPeerConnection({iceServers:[]}));
   CoopManager.myPeerId=['peer_m','peer_a','peer_z'][i];
   document.getElementById('coop-my-name').value=['房主','朋友甲','朋友乙'][i];CoopManager.myName=['房主','朋友甲','朋友乙'][i];
   const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.mediaRequests=[];navigator.mediaDevices.getUserMedia=function(c){mediaRequests.push(c);return get(c)};
   openCoopModal();
  },i);
 }
 const [host,a,b]=pages;await host.evaluate(()=>CoopManager.createRoom());const room=await host.evaluate(()=>CoopManager.roomCode);
 for(const p of [a,b])await p.evaluate(room=>CoopManager.joinRoom(room),room);
 await Promise.all(pages.map(p=>p.waitForFunction(()=>CoopManager.allies.length===2&&CoopManager.allies.every(a=>CoopManager.routeFor(a.id,true).kind==='rtc'),null,{timeout:20000})));
 await check('no microphone request occurs merely by loading or joining the game',async()=>{assert.deepEqual(await Promise.all(pages.map(p=>p.evaluate(()=>mediaRequests.length))),[0,0,0])});
 await host.evaluate(()=>WorldCoop.startOrResume());await Promise.all([a,b].map(p=>p.waitForFunction(()=>WorldCoop.active()&&WorldCoop.receivedFrame>0)));
 for(const p of pages)await p.evaluate(()=>{closeCoopModal();GameState.autoAttack=false;GameState.godMode=true;player.expToNext=100000});
 await host.evaluate(()=>{spawnEnemyBatch=()=>{};enemies.length=0;WorldCoop.broadcastWorld()});
 await check('room text is delivered once to both teammates, acknowledged after lost ACKs and rendered as text',async()=>{
  await host.evaluate(()=>{CoopSocial.toggle(true);window.dropChatAcks=2;const receive=CoopSocial.receive;CoopSocial.receive=function(pkt){if(pkt.type==='ROOM_CHAT_ACK'&&dropChatAcks-->0)return true;return receive.call(this,pkt)};document.getElementById('social-input').value='<img src=x onerror="window.chatXss=1"> 大家好';CoopSocial.send()});
  await Promise.all(pages.map(p=>p.waitForFunction(()=>CoopSocial.messages.length===1)));
  await host.waitForFunction(()=>CoopSocial.pending.size===0,null,{timeout:6000});
  for(const p of pages){assert.equal(await p.evaluate(()=>CoopSocial.messages.length),1);assert.equal(await p.locator('#social-messages img').count(),0);assert.equal(await p.evaluate(()=>window.chatXss),undefined)}
  assert.equal(await host.evaluate(()=>CoopSocial.messages[0].state),'已送达');
 });
 await check('typing attack and pause keys in chat neither fires skills nor pauses the match',async()=>{
  await host.locator('#social-input').fill('');await host.locator('#social-input').pressSequentially('jkp ');
  assert.equal(await host.evaluate(()=>GameState.isPaused||player.isCharging||input.isHoldingAttack),false);
  assert.equal(await host.locator('#social-input').inputValue(),'jkp ');await host.locator('#social-input').press('Enter');
  await Promise.all([a,b].map(p=>p.waitForFunction(()=>CoopSocial.messages.length===2)));
 });
 await check('forged foreign-room and unknown-sender chat cannot enter the room log',async()=>{
  const count=await a.evaluate(()=>CoopSocial.messages.length);
  await a.evaluate(()=>{for(const pkt of [{roomCode:'OTHER',peerId:CoopManager.allies[0].id},{roomCode:CoopManager.roomCode,peerId:'stranger'}])CoopManager.onReceivePacket({...pkt,protocol:32,type:'ROOM_CHAT',seq:1,id:pkt.peerId+':1',text:'forged',msgId:Math.random().toString()},{kind:'mqtt',url:'test'})});
  assert.equal(await a.evaluate(()=>CoopSocial.messages.length),count);
 });
 await host.evaluate(()=>CoopSocial.toggle(false));
 for(const [i,p]of pages.entries())await p.evaluate(i=>{player.x=i===0?0:i===1?950:-950;player.y=50;CoopManager.sendPresenceNow()},i);
 await pause(600);
 await check('a downed host can follow teammates while corpse coordinates and rescue authority remain unchanged',async()=>{
  const ids=await host.evaluate(()=>CoopManager.allies.map(p=>p.id));report.spectatorIds=ids;
  const original=await host.evaluate(()=>({x:player.x,y:player.y}));await host.evaluate(()=>WorldCoop.down());
  await host.locator('#spectate-target').selectOption(ids[0]);await pause(250);
  const state=await host.evaluate(()=>({player:{x:player.x,y:player.y},watch:CoopSpectate.id,target:CoopSpectate.target().x,camera:camera.x+camera.viewportWidth/2,body:WorldCoop.participants.get(CoopManager.myPeerId).x}));
  assert.deepEqual(state.player,original);assert.equal(state.body,original.x);assert.equal(state.watch,ids[0]);assert(Math.abs(state.camera-state.target)<2);
  await host.locator('#spectate-next').click();assert.equal(await host.evaluate(()=>CoopSpectate.id),ids[1]);
  assert.deepEqual(await host.evaluate(()=>({x:player.x,y:player.y})),original);
  await host.locator('#coop-spectate').screenshot({path:'test-results/v26_4倒地观战界面.png'});
 });
 await check('a watched player going down switches to a living player and revival restores the local camera',async()=>{
  const bid=await b.evaluate(()=>CoopManager.myPeerId);await host.locator('#spectate-target').selectOption(bid);await b.evaluate(()=>WorldCoop.down());
  await host.waitForFunction(id=>CoopManager.allies.find(p=>p.id===id)?.downed,bid);
  await host.waitForFunction(id=>CoopSpectate.id!==id,bid);
  await host.evaluate(()=>{const p=WorldCoop.participants.get(CoopManager.myPeerId);p.downed=false;p.epoch++;p.hp=40;WorldCoop.applyLife(p)});
  await host.waitForFunction(()=>!player.isDowned&&CoopSpectate.id===null&&document.getElementById('coop-spectate').style.display==='none');
  assert(Math.abs(await host.evaluate(()=>camera.x+camera.viewportWidth/2-player.x))<2);
  await host.evaluate(id=>{const p=WorldCoop.participants.get(id);p.downed=false;p.epoch++;p.hp=40;WorldCoop.applyLife(p);WorldCoop.broadcastWorld()},bid);
  await b.waitForFunction(()=>!player.isDowned);
 });
 for(const p of pages)await p.evaluate(()=>{window.gamePCs=[...CoopManager.autoRtcMap.values()].map(e=>e.pc);window.gameSession=WorldCoop.session;CoopSocial.toggle(true)});
 await check('listen-only joins voice without requesting the microphone',async()=>{
  for(const p of pages)await p.locator('#voice-listen').click();
  await Promise.all(pages.map(p=>p.waitForFunction(()=>CoopManager.allies.every(p=>p.voiceOn))));
  assert.deepEqual(await Promise.all(pages.map(p=>p.evaluate(()=>mediaRequests.length))),[0,0,0]);
 });
 await check('microphone audio reaches two listeners after cancelling a blocked previous signaling queue',async()=>{
  const firstId=await a.evaluate(()=>CoopManager.myPeerId);
  await host.waitForFunction(id=>CoopVoice.peers.has(id),firstId,{timeout:8000});
  await host.evaluate(id=>{window.blockedVoiceQueue=new Promise(()=>{});CoopVoice.chains.set(id,blockedVoiceQueue)},firstId);
  await host.locator('#voice-mic').click();await host.waitForFunction(()=>CoopVoice.mic&&!CoopVoice.busy);
  assert(await host.evaluate(id=>CoopVoice.chains.get(id)!==blockedVoiceQueue,firstId));
  const source=await host.evaluate(()=>CoopManager.myPeerId);
  report.audio=[];for(const p of [a,b]){
   await p.waitForFunction(id=>CoopVoice.peers.get(id)?.pc.connectionState==='connected'&&CoopVoice.peers.get(id)?.audio?.srcObject,source,{timeout:20000});
   report.audio.push(await audioEvidence(p,source));
  }
  assert.equal(await host.evaluate(()=>mediaRequests.length),1);assert.equal(await host.evaluate(()=>mediaRequests[0].video),false);
 });
 await check('three-player voice supports another speaker, microphone mute and local speaker mute',async()=>{
  await a.locator('#voice-mic').click();await a.waitForFunction(()=>CoopVoice.mic);
  const source=await a.evaluate(()=>CoopManager.myPeerId);await host.waitForFunction(id=>CoopVoice.peers.get(id)?.pc.connectionState==='connected',source,{timeout:15000});
  report.secondSpeakerAudio=await audioEvidence(host,source);
  await host.locator('#voice-mic').click();assert(await host.evaluate(()=>CoopVoice.joined&&!CoopVoice.mic&&CoopVoice.stream.getAudioTracks().every(t=>!t.enabled)));
  await a.locator('#voice-deaf').click();assert(await a.evaluate(()=>CoopVoice.deaf&&[...CoopVoice.peers.values()].every(e=>!e.audio||e.audio.muted)));
  await a.locator('#voice-deaf').click();
 });
 await check('voice toggles leave the game RTC connections and shared battle session intact',async()=>{
  for(const p of pages)assert(await p.evaluate(()=>gamePCs.every(pc=>[...CoopManager.autoRtcMap.values()].some(e=>e.pc===pc))&&WorldCoop.session===gameSession&&CoopManager.allies.every(p=>CoopManager.routeFor(p.id,true).kind==='rtc')));
 });
 await check('microphone rejection remains listen-only and does not break text or gameplay',async()=>{
  await b.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('denied','NotAllowedError'))});await b.locator('#voice-mic').click();
  await b.waitForFunction(()=>!CoopVoice.busy&&CoopVoice.error.includes('未获允许'));
  assert(await b.evaluate(()=>CoopVoice.joined&&!CoopVoice.mic&&WorldCoop.active()));
 });
 await check('leaving voice stops capture and closes only voice connections',async()=>{
  await host.evaluate(()=>window.previousMic=CoopVoice.stream.getAudioTracks()[0]);await host.locator('#voice-leave').click();
  assert(await host.evaluate(()=>!CoopVoice.joined&&previousMic.readyState==='ended'&&CoopVoice.peers.size===0&&gamePCs.every(p=>p.connectionState==='connected')));
  assert.equal(await host.evaluate(()=>WorldCoop.session===gameSession),true);
 });
 await check('late microphone permission after leaving is cancelled and its tracks are stopped',async()=>{
  await b.evaluate(()=>{window.testContext=new AudioContext();window.testDestination=testContext.createMediaStreamDestination();window.lateStream=testDestination.stream;navigator.mediaDevices.getUserMedia=()=>new Promise(r=>window.releaseMic=r);CoopVoice.toggleMic();CoopVoice.leave();releaseMic(lateStream)});
  await b.waitForFunction(()=>lateStream.getTracks().every(t=>t.readyState==='ended'));
  assert.equal(await b.evaluate(()=>CoopVoice.joined),false);
 });
 await check('chat remains usable after voice exits and the mobile panel stays inside the viewport',async()=>{
  await a.locator('#social-input').fill('语音结束后继续文字');await a.locator('#social-send').click();await host.waitForFunction(()=>CoopSocial.messages.some(m=>m.text==='语音结束后继续文字'));
  assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await a.locator('#coop-social-panel').screenshot({path:'test-results/v26_4文字语音交流界面.png'});
 });
 assert.deepEqual(errors,[]);console.log('AUDIO',JSON.stringify(report.audio));
})().catch(e=>{report.failure=String(e);console.error(e);process.exitCode=1}).finally(async()=>{if(browser){report.endState=await Promise.all(pages.map(p=>p.evaluate(()=>({id:CoopManager.myPeerId,voice:CoopVoice.presence(),error:CoopVoice.error,stream:CoopVoice.stream?.getAudioTracks().map(t=>({state:t.readyState,enabled:t.enabled})),allies:CoopManager.allies.map(p=>({id:p.id,v:p.voiceOn,epoch:p.voiceEpoch,rev:p.voiceRevision})),peers:[...CoopVoice.peers.values()].map(e=>({id:e.id,call:e.call,local:e.localEpoch,remote:e.remoteEpoch,error:e.error,state:e.pc.connectionState,ice:e.pc.iceConnectionState,signal:e.pc.signalingState,audio:Boolean(e.audio),last:e.last?.type,localDirections:e.pc.localDescription?.sdp.match(/a=(?:sendrecv|recvonly|sendonly|inactive)/g),remoteDirections:e.pc.remoteDescription?.sdp.match(/a=(?:sendrecv|recvonly|sendonly|inactive)/g)}))})).catch(()=>null)));console.log('END',JSON.stringify(report.endState));await browser.close()}server.close();fs.writeFileSync('test-results/v32-social-browser-results.json',JSON.stringify(report,null,2))});

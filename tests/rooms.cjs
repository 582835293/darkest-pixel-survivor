const {chromium}=require('playwright');
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const html=fs.readFileSync('index.html','utf8'),pages=[],results=[],errors=[],wire=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function check(name,fn){await fn();results.push(name);console.log('PASS',name);}
const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html;charset=utf-8');r.end(html)});let browser;
async function state(p){return p.evaluate(()=>({code:CoopManager.roomCode,id:RoomHub.roomId,status:RoomHub.status,members:[...RoomHub.members],allies:CoopManager.allies.map(a=>a.id),busy:RoomHub.busy}));}
(async()=>{
 // Eight independent directory clients, real WebCrypto, forced simultaneous
 // identical candidates. Game rendering/RTC are excluded from this logic check.
 await check('eight simultaneous hosts detect occupied numbers and resolve forced collisions',async()=>{
  const hubs=[],timers=[],script=html.slice(html.indexOf('    var RoomHub = {'),html.indexOf('    RoomHub.install();'));
  for(let i=0;i<8;i++){
   const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{value:id==='coop-room-mode'?'public':'',hidden:false,disabled:false,textContent:'',focus(){}});return elements.get(id)};
   const context={crypto:webcrypto,Uint8Array,TextEncoder,TextDecoder,btoa,atob,performance,setTimeout,clearTimeout,console,
    document:{getElementById:el},CoopManager:{myPeerId:'host_'+i,myName:'Host '+i,roomCode:null,isHost:false,ensurePlayerName(){},getActivePlayerCount(){return 1},sendPacket(){}},GameState:{isStarted:false,isOver:false}};
   vm.createContext(context);vm.runInContext(script,context);const h=context.RoomHub;h.probeMs=180;h.testManager=context.CoopManager;
   h.directoryOpen=()=>{};h.ready=async()=>{};
   h.send=p=>{const message={...p,hub:1,from:context.CoopManager.myPeerId,id:h.hex(8)};for(const other of hubs)if(other!==h)timers.push(setTimeout(()=>other.receive(message),4));};
   h.enter=(d)=>{h.roomId=d.roomId;h.hostId=d.host;h.members=new Set(d.members);context.CoopManager.roomCode=d.code;context.CoopManager.isHost=true;};
   h.render=()=>{};let first=true;const original=h.code.bind(h);h.code=()=>first?(first=false,'6262'):original();hubs.push(h);
  }
  assert((await Promise.all(hubs.map(h=>h.create()))).every(Boolean));await pause(50);
  const codes=hubs.map(h=>h.advertisement().code);assert.equal(new Set(codes).size,8);assert.equal(codes.filter(c=>c==='6262').length,1);
  // A host started later must also skip a live occupied number.
  const h=hubs[1],occupied=codes[0];let first=true;const original=h.code.bind(h);h.code=()=>first?(first=false,occupied):original();
  const next=await h.chooseCode(h.operation,h.hex());assert.notEqual(next,occupied);
  await check('late directory merges rename a duplicate label while preserving the room identity',async()=>{
   const sorted=[...hubs].sort((a,b)=>a.roomId.localeCompare(b.roomId)),low=sorted[0],high=sorted.at(-1),id=high.roomId;
   high.testManager.roomCode=low.testManager.roomCode;low.advertise();await pause(500);
   assert.notEqual(high.testManager.roomCode,low.testManager.roomCode);assert.equal(high.roomId,id);
  });
  for(const t of timers)clearTimeout(t);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 for(let i=0;i<4;i++){
  const ctx=await browser.newContext({viewport:{width:390,height:844}});await ctx.addInitScript(()=>{window.BroadcastChannel=undefined});
  const p=await ctx.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));
  await p.exposeFunction('relay',async ({topic,pkt})=>{
   wire.push({topic,pkt});for(const other of pages)await other.evaluate(({topic,pkt})=>{
    for(const c of [RoomHub.directory,CoopManager.mqttClient,CoopNodes.diagnostic])if(c&&!c.closed&&c.topic===topic)c.onMessage(CoopPoseWire.decode(pkt),{kind:'mqtt',url:'test'});
   },{topic,pkt}).catch(()=>{});
  });
  await p.goto(`http://127.0.0.1:${server.address().port}`);
  await p.evaluate(i=>{
   LiteMQTTClient.prototype.startAllTransports=function(){this.activeSockets=[{_brokerUrl:'test',_isSubscribed:true,readyState:1,bufferedAmount:0,close(){}}]};
   LiteMQTTClient.prototype.publishWire=function(pkt){if(!this.closed)window.relay({topic:this.topic,pkt});return !this.closed};
   CoopManager.createSafePeerConnection=()=>CoopDirect.track(new RTCPeerConnection({iceServers:[]}));
   CoopManager.myPeerId='room_test_'+i;CoopManager.myName='测试'+i;document.getElementById('coop-my-name').value='测试'+i;openCoopModal();
  },i);
 }
 const [host,a,b,publicHost]=pages;
 await check('private creation validates password and clears its input after creating a unique room',async()=>{
  await host.locator('#coop-room-mode').selectOption('private');await host.locator('#coop-create-password').fill('12');
  assert.equal(await host.evaluate(()=>CoopManager.createRoom()),false);assert.equal((await state(host)).code,null);
  await host.locator('#coop-create-password').fill('test-secret-456');assert.equal(await host.evaluate(()=>CoopManager.createRoom()),true);
  assert.equal(await host.locator('#coop-create-password').inputValue(),'');assert.match((await state(host)).id,/^[a-f0-9]{32}$/);
  assert((await host.locator('#coop-room-banner').textContent()).includes('密码房'));
 });
 const privateCode=(await state(host)).code;
 await check('password room requests a password and rejects a wrong proof without adding a player',async()=>{
  assert.equal(await a.evaluate(code=>CoopManager.joinRoom(code),privateCode),false);assert(await a.locator('#coop-join-password').isVisible());
  await a.locator('#coop-join-password').fill('wrong-secret');assert.equal(await a.evaluate(code=>CoopManager.joinRoom(code),privateCode),false);
  assert.match((await state(a)).status,/密码错误/);assert.equal((await state(host)).members.length,1);assert.equal((await state(a)).code,null);
 });
 await check('correct password joins through encrypted grant and establishes actual P2P',async()=>{
  await a.locator('#coop-join-password').fill('test-secret-456');assert.equal(await a.evaluate(code=>CoopManager.joinRoom(code),privateCode),true);
  await Promise.all([host,a].map(p=>p.waitForFunction(()=>CoopManager.allies.length===1&&CoopManager.routeFor(CoopManager.allies[0].id,true).kind==='rtc')));
  assert.equal((await state(a)).id,(await state(host)).id);assert.equal(await a.locator('#coop-join-password').inputValue(),'');
 });
 await check('passwords and room traffic keys are not broadcast as plaintext on public services',async()=>{
  const serialized=JSON.stringify(wire);assert(!serialized.includes('test-secret-456'));assert(!serialized.includes('wrong-secret'));
  assert(wire.some(x=>x.pkt.type==='ROOM_JOIN_PROOF'));assert(wire.some(x=>x.pkt.type==='ROOM_GRANTED'));
  const key=await host.evaluate(()=>RoomHub.b64(RoomHub.keyBytes));assert(!serialized.includes(key));
  assert(wire.filter(x=>x.topic!=='ps_darkest_v34/lobby'&&x.pkt.type!=='NET_NODE_ECHO').every(x=>x.pkt.type==='ROOM_BOX'));
 });
 await check('foreign sessions, raw broker messages and outsiders cannot inject game events',async()=>{
  const before=await state(a);await a.evaluate(()=>{
   const p={type:'HELLO_JOIN',peerId:'outsider',protocol:32,roomCode:RoomHub.roomId,msgId:'x'};
   CoopManager.onReceivePacket(p,{kind:'mqtt',url:'test'});CoopManager.onReceivePacket(p,{kind:'rtc'});
   CoopManager.onReceivePacket({...p,peerId:RoomHub.hostId,roomCode:'f'.repeat(32)},{kind:'rtc'});
  });assert.deepEqual((await state(a)).allies,before.allies);
 });
 await check('public room appears in quick match while password rooms are excluded',async()=>{
  assert.equal(await publicHost.evaluate(()=>CoopManager.createRoom()),true);
  await check('public list displays names, occupancy and state, excludes private/old/stale rooms and joins by click',async()=>{
   const roomId=(await state(publicHost)).id;
   await b.locator('#coop-public-rooms>summary').click();await b.waitForFunction(()=>!RoomHub.browsing&&RoomHub.publicRooms().length===1);
   assert((await b.locator('#coop-public-list').textContent()).includes('1/3 人'));
   await b.evaluate(()=>{
    const now=performance.now();
    for(const [id,extra]of [['1'.repeat(32),{count:3,name:'<img src=x onerror=alert(1)>'}],['2'.repeat(32),{locked:true}],['3'.repeat(32),{at:now-RoomHub.leaseMs-1}],['4'.repeat(32),{build:RoomHub.build-1}]])RoomHub.ads.set(id,{roomId:id,code:'9876',host:id,name:'other',locked:false,build:RoomHub.build,count:1,max:3,started:false,at:now,...extra});
    RoomHub.renderPublicRooms();
   });
   assert.equal(await b.locator('.coop-public-room').count(),2);assert.equal(await b.locator('#coop-public-list img').count(),0);
   assert(await b.locator('[data-room-id="'+ '1'.repeat(32)+'"] button').isDisabled());
   await b.locator('#coop-public-rooms').screenshot({path:'test-results/public-rooms.png'});
   await b.locator('[data-room-id="'+roomId+'"] button').click();await b.waitForFunction(()=>Boolean(CoopManager.roomCode)&&!RoomHub.busy);
   assert.equal((await state(b)).id,roomId);await publicHost.waitForFunction(()=>CoopManager.allies.length===1);
   await b.evaluate(()=>CoopManager.leaveRoom());await publicHost.waitForFunction(()=>RoomHub.members.size===1);
   await b.locator('#coop-public-rooms>summary').click();
  });
  assert.equal(await b.evaluate(()=>RoomHub.join('',true)),true);assert.equal((await state(b)).id,(await state(publicHost)).id);
  assert.notEqual((await state(b)).id,(await state(host)).id);
  await publicHost.waitForFunction(()=>CoopManager.allies.length===1);
 });
 await check('two concurrent joiners cannot both take a public room’s final slot',async()=>{
  await a.evaluate(()=>CoopManager.leaveRoom());await host.waitForFunction(()=>RoomHub.members.size===1);
  await host.evaluate(()=>CoopManager.leaveRoom());
  const code=(await state(publicHost)).code;
  const joined=await Promise.all([host,a].map(p=>p.evaluate(code=>CoopManager.joinRoom(code),code)));
  assert.equal(joined.filter(Boolean).length,1);assert.equal((await state(publicHost)).members.length,3);
  await publicHost.waitForFunction(()=>CoopManager.allies.length===2);
  const denied=joined[0]?a:host;assert.equal((await state(denied)).code,null);assert.match((await state(denied)).status,/满/);
 });
 const free=(await state(host)).code?a:host;
 await check('matching excludes full and expired rooms and cancellation cannot enter a room later',async()=>{
  await free.evaluate(()=>RoomHub.ads.set('a'.repeat(32),{roomId:'a'.repeat(32),code:'9876',host:'gone',locked:false,count:1,max:3,at:performance.now()-RoomHub.leaseMs-10}));
  assert.equal(await free.evaluate(()=>RoomHub.join('',true)),false);assert.match((await state(free)).status,/没有可加入/);
  await free.evaluate(()=>{window.matchResult=RoomHub.join('',true);RoomHub.cancel()});await pause(2500);
  assert.equal(await free.evaluate(()=>matchResult),false);assert.equal((await state(free)).code,null);assert.equal((await state(free)).busy,false);
 });
 await check('leaving releases the host reservation and closing a host removes its live advertisement',async()=>{
  const id=(await state(publicHost)).id;await b.evaluate(()=>CoopManager.leaveRoom());await publicHost.waitForFunction(()=>RoomHub.members.size===2);
  await free.evaluate(()=>RoomHub.directoryOpen());await publicHost.evaluate(()=>CoopManager.leaveRoom());
  await free.waitForFunction(id=>!RoomHub.ads.has(id),id);assert.equal((await state(publicHost)).code,null);
 });
 await check('new lobby stays within a small phone viewport and does not expose password inputs by default',async()=>{
  for(const p of pages)if((await state(p)).code)await p.evaluate(()=>CoopManager.leaveRoom());
  await publicHost.evaluate(()=>{RoomHub.status='';openCoopModal()});
  assert.equal(await publicHost.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert(!await publicHost.locator('#coop-create-password').isVisible());
  await publicHost.locator('#coop-modal .modal-card').screenshot({path:'test-results/room-match-lobby.png'});
 });
 await check('closing the lobby stops room browsing and reopening resumes the visible list',async()=>{
  await publicHost.locator('#coop-public-rooms>summary').click();await publicHost.waitForFunction(()=>!RoomHub.browsing&&Boolean(RoomHub.directory));
  await publicHost.evaluate(()=>closeCoopModal());assert(await publicHost.evaluate(()=>!RoomHub.directory&&!RoomHub.browsing&&!RoomHub.listOpen()));
  await publicHost.evaluate(()=>openCoopModal());await publicHost.waitForFunction(()=>!RoomHub.browsing&&Boolean(RoomHub.directory));
  await publicHost.locator('#coop-public-rooms>summary').click();
 });
 await check('same-browser local BroadcastChannel stays usable through authenticated room envelopes',async()=>{
  const ctx=await browser.newContext(),local=[];
  for(let i=0;i<2;i++){
   const p=await ctx.newPage();local.push(p);pages.push(p);p.on('pageerror',e=>errors.push(e.message));
   await p.goto(`http://127.0.0.1:${server.address().port}`);
   await p.evaluate(i=>{
    LiteMQTTClient.prototype.startAllTransports=function(){this.activeSockets=[{_brokerUrl:'test',_isSubscribed:true,readyState:1,bufferedAmount:0,close(){}}]};
    // Directory and gameplay both use only native local BroadcastChannel here.
    LiteMQTTClient.prototype.publishWire=function(){return true};
    CoopManager.myPeerId='local_'+i;document.getElementById('coop-my-name').value='本地'+i;
    CoopManager.createSafePeerConnection=()=>null;
   },i);
  }
  assert(await local[0].evaluate(()=>CoopManager.createRoom()));const code=(await state(local[0])).code;
  assert(await local[1].evaluate(code=>CoopManager.joinRoom(code),code));
  await Promise.all(local.map(p=>p.waitForFunction(()=>CoopManager.allies.length===1&&CoopManager.routeFor(CoopManager.allies[0].id,true).kind==='local')));
  await local[0].evaluate(()=>{document.getElementById('social-input').value='本地通道收到';CoopSocial.send()});
  await local[1].waitForFunction(()=>CoopSocial.messages.some(m=>m.text==='本地通道收到'));
  for(const p of local)await p.evaluate(()=>CoopManager.leaveRoom());
 });
 assert.deepEqual(errors,[]);
})().catch(async e=>{console.error(e);for(const p of pages)console.log('STATE',await state(p).catch(()=>null));process.exitCode=1;}).finally(async()=>{
 fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/rooms.json',JSON.stringify({results,errors,scope:'Simulated public brokers, real WebCrypto and local P2P; not an independent mobile network test.'},null,2));
 if(browser)await browser.close();server.close();
});

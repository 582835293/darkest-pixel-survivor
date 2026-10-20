const fs=require('node:fs');
const original=fs.readFileSync('tests/gameplay.cjs','utf8'),prefix=original.slice(0,original.indexOf(' await clean();'));
const tail=String.raw`
 await clean();const solo=await makePage({width:390,height:844});
 await check('solo developer dialog and every wrong-password response keep the easter-egg code out of visible text',async()=>{
  await solo.evaluate(()=>openDevModal());assert(!((await solo.locator('#dev-modal').innerText()).includes('114514')));await solo.locator('#dev-pwd-input').fill('wrong');await solo.locator('#btn-dev-unlock').click();assert(!((await solo.locator('#dev-modal').innerText()).includes('114514')));assert((await solo.locator('#dev-auth-msg').innerText()).includes('不正确'));assert.equal(await solo.evaluate(()=>CoopDev.allowed()),false);
 });
 await check('correct solo easter-egg code still unlocks locally without displaying the code',async()=>{
  await solo.locator('#dev-pwd-input').fill('114514');await solo.locator('#btn-dev-unlock').click();assert(await solo.locator('#dev-controls-box').isVisible());assert.equal(await solo.evaluate(()=>CoopDev.allowed()),true);assert.equal(await solo.locator('#dev-host-access').isVisible(),false);
 });
 await check('room host can set a room password without a solo unlock and the built-in solo code cannot unlock the room',async()=>{
  await host.evaluate(()=>{CoopDev.reset();openDevModal();document.getElementById('dev-pwd-input').value='114514';verifyDevPassword()});assert.equal(await host.evaluate(()=>CoopDev.allowed()),false);assert(await host.locator('#dev-host-access').isVisible());assert(!await host.locator('#dev-controls-box').isVisible());assert(!((await host.locator('#dev-modal').innerText()).includes('114514')));assert(await host.locator('#dev-auth-box').isHidden());
 });
 for(const p of [host,guest])await p.evaluate(()=>{window.devPackets=[];window.originalDevSend=CoopManager.sendPacket;CoopManager.sendPacket=function(packet,...a){if(packet.type.startsWith('DEV_'))devPackets.push(JSON.stringify(packet));return originalDevSend.call(this,packet,...a)};});
 await check('a short password is rejected; setting a valid room password clears the field and unlocks only the host',async()=>{
  await host.locator('#dev-guest-password').fill('ab');await host.locator('#btn-dev-guest-set').click();assert.equal(await host.evaluate(()=>CoopDev.allowed()),false);await host.locator('#dev-guest-password').fill('my-room-42');await host.locator('#btn-dev-guest-set').click();await host.waitForFunction(()=>CoopDev.allowed());assert.equal(await host.locator('#dev-guest-password').inputValue(),'');assert.equal(await guest.evaluate(()=>CoopDev.allowed()),false);assert.equal(await host.locator('#dev-guest-password').getAttribute('type'),'password');
 });
 const id=await guest.evaluate(()=>CoopManager.myPeerId);
 await check('a guest using the host password remains locked until that host explicitly approves',async()=>{
  await guest.evaluate(()=>{openDevModal();document.getElementById('dev-pwd-input').value='my-room-42';verifyDevPassword()});await host.waitForFunction(id=>CoopDev.pending.has(id),id);assert.equal(await guest.evaluate(()=>CoopDev.allowed()),false);await host.evaluate(id=>CoopDev.decide(id,true),id);await guest.waitForFunction(()=>CoopDev.allowed());await guest.locator('#btn-dev-god').click();assert.equal(await guest.evaluate(()=>GameState.godMode),true);
 });
 await check('changing the room password revokes existing guest access, including invulnerability, and rejects the old password',async()=>{
  await host.locator('#dev-guest-password').fill('next-room-73');await host.locator('#btn-dev-guest-set').click();await guest.waitForFunction(()=>!CoopDev.allowed()&&!GameState.godMode);await guest.evaluate(()=>{document.getElementById('dev-pwd-input').value='my-room-42';verifyDevPassword()});await guest.waitForFunction(()=>document.getElementById('dev-auth-msg').textContent.includes('密码错误'));assert.equal(await guest.evaluate(()=>CoopDev.allowed()),false);
 });
 await check('room password is not transmitted, advertised, stored in localStorage or echoed as visible UI text',async()=>{
  for(const p of [host,guest]){const r=await p.evaluate(()=>({wire:devPackets.join('\n'),ad:JSON.stringify(RoomHub.advertisement()),storage:JSON.stringify({...localStorage}),text:document.getElementById('dev-modal').innerText}));for(const raw of ['my-room-42','next-room-73'])for(const field of Object.values(r))assert(!field.includes(raw));}
 });
 await check('clearing the password closes host controls and guest access; leaving a room discards its password and authorization',async()=>{
  await host.evaluate(()=>GameState.godMode=true);await host.locator('#dev-guest-password').fill('');await host.locator('#btn-dev-guest-set').click();await host.waitForFunction(()=>!CoopDev.allowed()&&!GameState.godMode);assert(!await host.locator('#dev-controls-box').isVisible());await host.locator('#dev-guest-password').fill('temporary-18');await host.locator('#btn-dev-guest-set').click();await host.waitForFunction(()=>CoopDev.allowed());await host.evaluate(()=>CoopManager.leaveRoom());assert.equal(await host.evaluate(()=>CoopDev.secret),null);assert.equal(await host.evaluate(()=>GameState.devUnlocked),false);assert.equal(await host.evaluate(()=>GameState.godMode),false);
 });
 assert.deepEqual(errors,[]);
})().catch(e=>{console.error(e);results.failure=String(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close();fs.writeFileSync('test-results/dev-access.json',JSON.stringify({results,errors,failure:results.failure,scope:'Actual solo UI plus two real local RTC peers. Checks hidden solo hint, room-host setup, challenge proof, approval, password rotation, disabled controls and room cleanup.'},null,2))});
`;
new Function('require',prefix+tail)(require);

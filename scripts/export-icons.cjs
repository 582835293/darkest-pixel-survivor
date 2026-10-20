// Export the exact original artwork embedded in the single-file game.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{chromium}=require('playwright');
const repo=path.resolve(__dirname,'..'),dest=path.join(repo,'assets/ui'),html=fs.readFileSync(path.join(repo,'index.html'));
const server=http.createServer((q,r)=>{r.setHeader('content-type','text/html;charset=utf-8');r.end(html)});let browser;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,headless:true});
 const p=await browser.newPage();await p.goto('http://127.0.0.1:'+server.address().port);
 const data=await p.evaluate(()=>({png:PixelIcons.atlas.toDataURL(),manifest:{license:'MIT',source:'../../index.html: PixelIcons',pixelSize:16,tile:PixelIcons.tile,padding:2,columns:PixelIcons.columns,width:PixelIcons.atlas.width,height:PixelIcons.atlas.height,icons:[...PixelIcons.defs.values()].map(d=>({name:d.name,label:d.label,x:d.index%PixelIcons.columns*PixelIcons.tile+2,y:Math.floor(d.index/PixelIcons.columns)*PixelIcons.tile+2,width:16,height:16}))}}));
 fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,'pixel-icons.png'),Buffer.from(data.png.split(',')[1],'base64'));fs.writeFileSync(path.join(dest,'pixel-icons.json'),JSON.stringify(data.manifest,null,2)+'\n');console.log('Exported '+data.manifest.icons.length+' original pixel icons.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});

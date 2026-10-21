import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
if (!scripts.length) throw new Error('No game script found.');
for (const [i, script] of scripts.entries()) new vm.Script(script[1], { filename: 'index.html:inline-' + (i + 1) });
if (html.includes('chatgpt.site')) throw new Error('The obsolete hosting link must not be shipped.');
const cg=[...html.matchAll(/data:image\/webp;base64,([A-Za-z0-9+/=]+)/g)];
for(const [i,name] of ['blood-night-title','rustmoon-clock-city'].entries()) {
 const asset=fs.readFileSync(new URL('../assets/cg/'+name+'.webp',import.meta.url));
 if(!cg[i]||!Buffer.from(cg[i][1],'base64').equals(asset))throw new Error('Embedded CG differs from original: '+name);
}
console.log('Game JavaScript syntax and hosting link checks passed.');

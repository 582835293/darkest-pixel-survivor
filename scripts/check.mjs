import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
if (!scripts.length) throw new Error('No game script found.');
for (const [i, script] of scripts.entries()) new vm.Script(script[1], { filename: 'index.html:inline-' + (i + 1) });
if (html.includes('chatgpt.site')) throw new Error('The obsolete hosting link must not be shipped.');
console.log('Game JavaScript syntax and hosting link checks passed.');

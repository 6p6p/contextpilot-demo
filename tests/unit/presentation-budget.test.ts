import {it,expect} from 'vitest';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
function probe(large:boolean){
 mkdirSync('test-results',{recursive:true});const cwd=mkdtempSync(resolve('test-results','ppt-budget-MOCK-'));
 const hook=pathToFileURL(resolve('scripts/acceptance-telemetry.mjs')).href;
 const code=`let count=0;globalThis.fetch=async()=>{count++;return new Response(JSON.stringify({usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2},choices:[{finish_reason:'stop'}]}));};await import(${JSON.stringify(hook)});const body=JSON.stringify({model:'deepseek-flash',max_tokens:8192,messages:[{role:'user',content:'x'.repeat(${large?2000000:10})}]});let stopped=false;for(let i=0;i<13;i++){try{await fetch('https://api.deepseek.com/chat/completions',{body});}catch{stopped=true;break;}}console.log(JSON.stringify({count,stopped}));`;
 const r=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd,env:{...process.env,ACCEPTANCE_PHASE:'8'},encoding:'utf8',windowsHide:true});expect(r.status).toBe(0);return JSON.parse(r.stdout.trim());
}
it('MOCK budget process prevents thirteenth LLM request before transport',()=>expect(probe(false)).toEqual({count:12,stopped:true}));
it('MOCK budget process refuses a request whose worst-case reservation exceeds CNY3',()=>expect(probe(true)).toEqual({count:0,stopped:true}));

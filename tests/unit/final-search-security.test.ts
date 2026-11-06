import {it,expect,vi} from 'vitest';
import {createHmac} from 'node:crypto';
import {answerPublicSearch,explicitPublicClause} from '../../apps/api/src/search/public.js';
import {hasDemoAccess} from '../../apps/api/src/demo/access.js';
import {parseEnv} from '../../apps/api/src/config/env.js';
// @ts-expect-error Existing JS log helper.
import {redactOutput} from '../../scripts/redact-output.mjs';
const key='synthetic-only-demo-password-1234567890';
it('FINAL source metadata including URL reaches a single natural-language model call',async()=>{
 const source={id:'W1',title:'Agency',url:'https://example.org/status',summary:'Current public information.',publishedAt:null,queriedAt:'2026-11-06T08:00:00.000Z',quote:''};
 const complete=vi.fn(async()=>({model:'STUB',content:'依据参考信息可以给出简要结论。'}));
 const result=await answerPublicSearch('该机构官方最新信息',{async search(){return [source];}},{complete});
 expect(complete).toHaveBeenCalledTimes(1);const request=JSON.parse((complete.mock.calls[0] as any)[0][1].content);
 const {quote,...metadata}=source;expect(request.untrustedSearchResults[0]).toEqual(metadata);
 expect(result.webSources).toEqual([source]);expect(result.content).toContain(source.queriedAt);
});
it('FINAL private queries stop before transport and upstream failure stays failure',async()=>{
 const search=vi.fn(async()=>{throw Error('synthetic upstream failure');}),model={complete:vi.fn()};
 await expect(answerPublicSearch('根据私有PDF查询最新项目资料',{search},model)).rejects.toMatchObject({code:'SEARCH_QUERY_BLOCKED'});
 expect(search).not.toHaveBeenCalled();await expect(answerPublicSearch('最新公开消息',{search},model)).rejects.toThrow('synthetic upstream failure');expect(model.complete).not.toHaveBeenCalled();
});
it('FINAL mixed questions separate only the explicit public clause, not private context',()=>{
 expect(explicitPublicClause('根据私有PDF回答负责人；联网查询 Node.js 当前LTS官方信息。')).toBe('Node.js 当前LTS官方信息');
 expect(explicitPublicClause('根据PDF和会议查询最新项目状态')).toBeNull();
 expect(()=>explicitPublicClause('根据PDF回答；联网查询 我司内部项目最新状态')).toThrow();
});
it('FINAL same-key host/scope separation cannot revoke a copied demo cookie; rotation and expiry do',()=>{
 const now=Date.parse('2026-11-06T08:00:00Z');vi.spyOn(Date,'now').mockReturnValue(now);
 try{const body=`${now+3600000}.${'A'.repeat(24)}`,tag=createHmac('sha256',key).update(`demo:${body}`).digest('base64url'),request={headers:{cookie:`cp_demo=${body}.${tag}`}};
  expect(hasDemoAccess(parseEnv({DEMO_ACCESS_KEY:key,HOST:'localhost',PPT_SCOPE:'local'}),request)).toBe(true);
  expect(hasDemoAccess(parseEnv({DEMO_ACCESS_KEY:key,HOST:'0.0.0.0',PPT_SCOPE:'other'}),request)).toBe(true);
  expect(hasDemoAccess(parseEnv({DEMO_ACCESS_KEY:key+'rotated'}),request)).toBe(false);
  vi.mocked(Date.now).mockReturnValue(now+3600001);expect(hasDemoAccess(parseEnv({DEMO_ACCESS_KEY:key}),request)).toBe(false);
 }finally{vi.restoreAllMocks();}
});
it('FINAL headers, cookies, JSON access keys and env tokens are redacted',()=>{
 const text='Cookie: cp_demo=SYNTHETIC_COOKIE\nAuthorization: Bearer SYNTHETIC_AUTH\n{"accessKey":"SYNTHETIC_KEY","token":"SYNTHETIC_TOKEN"}\nTAVILY_API_KEY=SYNTHETIC_ENV\npassword=SYNTHETIC_PASSWORD';
 const safe=redactOutput(text);expect(safe).not.toMatch(/SYNTHETIC_/);expect(safe).toContain('[REDACTED]');
});

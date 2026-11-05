import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {expectedMigrations,migrationStatus} from '../../apps/api/src/db/status-service.js';
import {deploymentMissing} from '../../apps/api/src/config/deployment.js';
import {parseEnv} from '../../apps/api/src/config/env.js';
it('deployment presence check distinguishes full business configuration from liveness',()=>{
 const missing=deploymentMissing(parseEnv({}));expect(missing).toContain('DEMO_ACCESS_KEY');expect(missing).toContain('DATABASE_URL');expect(missing).toContain('TAVILY_API_KEY');expect(missing).not.toContain('RESEND_API_KEY');
});
it('read-only migration check rejects missing, altered and unexpected migration records',async()=>{
 const expected=expectedMigrations().map(e=>({hash:e.hash,created_at:e.when}));
 expect((await migrationStatus(async()=>({rows:expected}))).matched).toBe(true);
 for(const rows of [expected.slice(1),[...expected,{hash:'unexpected',created_at:1}],expected.map((r,i)=>i? r:{...r,hash:'altered'})])expect((await migrationStatus(async()=>({rows}))).matched).toBe(false);
});
it('Railway runs one app process without automatic migrations or local business storage',()=>{
 const c=JSON.parse(readFileSync('railway.json','utf8'));
 expect(c.build).toEqual({builder:'RAILPACK',buildCommand:'npm run build'});
 expect(readFileSync('.npmrc','utf8')).toMatch(/^include=dev$/m);
 expect(c.deploy).toMatchObject({startCommand:'node dist/server/apps/api/src/server.js',numReplicas:1,healthcheckPath:'/api/ready'});expect(c.deploy.preDeployCommand).toBeUndefined();
 expect(readFileSync('apps/api/src/server.ts','utf8')).not.toContain('.acceptance');
 const ignore=readFileSync('.railwayignore','utf8');for(const path of ['.env','.acceptance/','test-results/','certs/'])expect(ignore).toContain(path);
});

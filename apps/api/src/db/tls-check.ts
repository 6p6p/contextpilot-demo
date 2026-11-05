// Operator-invoked, read-only check. No app/Worker/model is started.
import 'dotenv/config';
import {parseEnv} from '../config/env.js';
import {createDatabase} from './client.js';
let database:ReturnType<typeof createDatabase>=null;
try{
 const env=parseEnv(process.env);if(!env.DATABASE_SSL||!env.DATABASE_CA_CERT)throw new Error('Strict CA TLS required');
 database=createDatabase(env);if(!database)throw new Error('Database unconfigured');
 const client=await database.pool.connect();try{
  const stream=(client as unknown as {connection:{stream:{encrypted?:boolean;authorized?:boolean}}}).connection.stream;
  if(!stream.encrypted||!stream.authorized)throw new Error('TLS verification failed');
  const r=await client.query('SELECT 1 AS ok');if(r.rows[0]?.ok!==1)throw new Error('Query failed');
  console.log('Strict client TLS verified; SELECT 1 passed.');
 }finally{client.release();}
}catch{console.error('Strict database TLS/SELECT 1 check failed; verify CA path, certificate trust, hostname and URL configuration. No credentials logged.');process.exitCode=1;}finally{await database?.pool.end();}

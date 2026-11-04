import 'dotenv/config';
import {parseEnv} from '../config/env.js';
import {createDatabase} from './client.js';
import {migrationStatus} from './status-service.js';
let database:ReturnType<typeof createDatabase>=null;
try{
 database=createDatabase(parseEnv(process.env));if(!database)throw new Error('Unconfigured');
 const result=await migrationStatus(sql=>database!.pool.query(sql));console.log(JSON.stringify(result));if(!result.matched)process.exitCode=1;
}catch{console.error('Migration status unavailable or mismatched. No migration was executed; check backend configuration.');process.exitCode=1;}finally{await database?.pool.end();}

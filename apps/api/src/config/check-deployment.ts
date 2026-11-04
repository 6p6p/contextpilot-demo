import 'dotenv/config';
import {parseEnv} from './env.js';
import {deploymentMissing} from './deployment.js';
try{
 const env=parseEnv(process.env);const missing=deploymentMissing(env);
 const ok=env.NODE_ENV==='production'&&missing.length===0;
 console.log(JSON.stringify({production:env.NODE_ENV==='production',missing,configured:ok,emailDisabled:!env.EMAIL_DELIVERY_ENABLED}));if(!ok)process.exitCode=1;
}catch{console.error('Deployment configuration invalid. Check required field names; no values are logged.');process.exitCode=1;}

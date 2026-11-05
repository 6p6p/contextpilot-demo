import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {X509Certificate} from 'node:crypto';
const pem=await readFile(new URL('../prod-ca-2021.crt',import.meta.url),'utf8');
if(/PRIVATE KEY/.test(pem)||pem.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,'').trim())throw new Error('Database CA asset must contain public certificates only');
const cert=new X509Certificate(pem);
if(!cert.ca||Date.now()<Date.parse(cert.validFrom)||Date.now()>=Date.parse(cert.validTo)||!cert.verify(cert.publicKey))throw new Error('Invalid database root CA');
const directory=new URL('../dist/server/certs/',import.meta.url);await mkdir(directory,{recursive:true});
await writeFile(new URL('prod-ca-2021.crt',directory),pem);
console.log('Public database CA copied to server build assets.');

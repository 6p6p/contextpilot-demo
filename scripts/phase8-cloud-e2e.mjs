import 'dotenv/config';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {relayRedacted} from './redact-output.mjs';
const secrets=['PPT_ACCESS_KEY','DATABASE_URL','SUPABASE_STORAGE_KEY','LLM_API_KEY','EMBEDDING_API_KEY','TAVILY_API_KEY'].map(k=>process.env[k]).filter(Boolean);
const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test','--config','playwright.presentation.config.ts','--grep','CLOUD_FINAL'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,RUN_LIVE_TESTS:'1',EMAIL_DELIVERY_ENABLED:'false',LLM_API_KEY:'',EMBEDDING_API_KEY:'',TAVILY_API_KEY:'',RESEND_API_KEY:''}});
relayRedacted(child.stdout,process.stdout,secrets);relayRedacted(child.stderr,process.stderr,secrets);
const [code]=await once(child,'exit');process.exitCode=code??1;

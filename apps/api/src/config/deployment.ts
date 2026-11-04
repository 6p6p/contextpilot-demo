import type {Env} from './env.js';
// Presence check only; no network, credentials, migrations or resource creation.
export function deploymentMissing(env:Env){
 const fields=['DEMO_ACCESS_KEY','DATABASE_URL','LLM_BASE_URL','LLM_MODEL','LLM_API_KEY','SUPABASE_URL','SUPABASE_STORAGE_KEY','SUPABASE_STORAGE_BUCKET','EMBEDDING_BASE_URL','EMBEDDING_API_KEY','EMBEDDING_MODEL','EMBEDDING_DIMENSIONS','TAVILY_API_KEY'] as const;
 return fields.filter(field=>!env[field]);
}

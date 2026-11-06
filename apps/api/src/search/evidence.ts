import type {WebSource} from '../../../../shared/search.js';
export function searchIntent(question:string){
 const official=/官方|official/i.test(question);
 // Task-scoped authority registry, never trust a page's self-description.
 const authorities=[{topic:/node\.?js/i,domains:['nodejs.org']},{topic:/\bpython\b/i,domains:['python.org']},{topic:/postgres(?:ql)?/i,domains:['postgresql.org']}];
 const domains=official?authorities.filter(a=>a.topic.test(question)).flatMap(a=>a.domains):[];
 return {official,domains,current:/当前|最新|目前|现在|current|latest/i.test(question)};
}
export function officialSource(s:WebSource,domains:string[]){
 try{const u=new URL(s.url);return u.protocol==='https:'&&!u.username&&!u.password&&domains.some(d=>u.hostname===d||u.hostname.endsWith(`.${d}`));}catch{return false;}
}
export function recentSource(s:WebSource){
 if(!s.publishedAt)return true; // Unknown is never turned into a fabricated date.
 const age=Date.parse(s.queriedAt)-Date.parse(s.publishedAt);
 return Number.isFinite(age)&&age>=0&&age<=30*86400000;
}
export function evidenceOrder(question:string,sources:WebSource[]){
 const intent=searchIntent(question);
 return [...sources].sort((a,b)=>{
  const authority=(s:WebSource)=>intent.official&&officialSource(s,intent.domains)?1:0;
  return authority(b)-authority(a)||(intent.current?Number(recentSource(b))-Number(recentSource(a)):0)||(intent.current?(Date.parse(b.publishedAt??'')||0)-(Date.parse(a.publishedAt??'')||0):0);
 });
}
export function currentConclusion(question:string,s:WebSource,quote:string){
 const intent=searchIntent(question);
 if(intent.official&&!officialSource(s,intent.domains))return false;
 if(intent.current&&!s.publishedAt&&/\/(?:blog|news|releases?)(?:\/|$)/i.test(new URL(s.url).pathname))return false;
 if(intent.current&&(!recentSource(s)||!/(?:当前|最新|目前|current|latest|active\s+LTS)/i.test(quote)))return false;
 return true;
}
export function conflictingLts(question:string,sources:WebSource[]){
 const intent=searchIntent(question);if(!intent.current||!/\bLTS\b/i.test(question))return false;
 const eligible=sources.filter(s=>(!intent.official||officialSource(s,intent.domains))&&currentConclusion(question,s,s.summary));
 const newest=Math.max(0,...eligible.map(s=>s.publishedAt?Date.parse(s.publishedAt):0));
 const versions=new Set<string>();
 for(const s of eligible.filter(s=>!s.publishedAt||Date.parse(s.publishedAt)===newest)){
  for(const m of s.summary.matchAll(/Active\s+LTS(?:\s+(?:is|version|Node\.js)|\s*[:|=-]){0,5}\s*v?(\d+(?:\.\d+){0,2})|v?(\d+(?:\.\d+){0,2})\s*(?:is\s+)?(?:the\s+)?(?:latest\s+)?Active\s+LTS/gi))versions.add(m[1]??m[2]);
  for(const m of s.summary.matchAll(/\bv?(\d+(?:\.\d+){0,2})\s*[—–:=-]\s*Active\s+LTS/gi))versions.add(m[1]);
 }
 return versions.size>1;
}

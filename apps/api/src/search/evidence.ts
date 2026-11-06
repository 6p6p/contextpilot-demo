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
export function archiveSource(s:WebSource){return /\/(?:blog|news|releases?)(?:\/|$)/i.test(new URL(s.url).pathname);}
// Extract the association, not every number in a page containing the word LTS.
export function ltsStates(text:string){
 const states:{version:string;status:string}[]=[];
 for(const m of text.matchAll(/\bv?(\d+(?:\.\d+){0,2})[ \t]*(?:(?:is|the|current|latest)[ \t]+|[|—–:=-][ \t]*){0,5}(Active|Maintenance)[ \t]+LTS/gi))states.push({version:m[1],status:`${m[2].toLowerCase()==='active'?'Active':'Maintenance'} LTS`});
 for(const m of text.matchAll(/(Active|Maintenance)[ \t]+LTS(?:[ \t]+(?:is|version|Node\.js)|[ \t]*[|:=-]){0,5}[ \t]+v?(\d+(?:\.\d+){0,2})/gi))states.push({version:m[2],status:`${m[1].toLowerCase()==='active'?'Active':'Maintenance'} LTS`});
 return states;
}
export function conflictingLts(question:string,sources:WebSource[]){
 const intent=searchIntent(question);if(!intent.current||!/\bLTS\b/i.test(question))return false;
 let eligible=sources.filter(s=>(!intent.official||officialSource(s,intent.domains))&&currentConclusion(question,s,s.summary));
 // A current status page describes now; a release article describes its publication.
 if(eligible.some(s=>!archiveSource(s)))eligible=eligible.filter(s=>!archiveSource(s));
 const newest=Math.max(0,...eligible.map(s=>s.publishedAt?Date.parse(s.publishedAt):0));
 const versions=new Set<string>();
 const states=eligible.filter(s=>!s.publishedAt||Date.parse(s.publishedAt)===newest).flatMap(s=>ltsStates(s.summary));
 if(states.some(a=>states.some(b=>a.version.split('.')[0]===b.version.split('.')[0]&&a.status!==b.status)))return true;
 // Being an LTS line is not a claim to be THE latest release. Only competing
 // explicit latest claims conflict; several supported lines may coexist.
 for(const s of eligible.filter(s=>!s.publishedAt||Date.parse(s.publishedAt)===newest)){
  for(const line of s.summary.split(/\n|。/))if(/latest|最新|当前版本/i.test(line))for(const state of ltsStates(line).filter(v=>v.status==='Active LTS'))versions.add(state.version);
 }
 // A major-only status row and its full patch release are compatible evidence.
 // Distinct explicit patch versions still remain unresolved, never choose the largest.
 const explicit=[...versions].filter(v=>![...versions].some(other=>other.startsWith(`${v}.`)));
 return explicit.length>1;
}

import { PublicError } from '../errors.js';
export interface PresentationBrief {topic:string;language:'中文'|'英文';audience:string|null;pageCount:number;requirements:string[];mode:'training'|'business'|'general'}
export function isPresentationIntent(input: string): boolean {
  const text = input.normalize('NFKC').trim();
  if (/^(?:请)?(?:解释|如何|怎么|什么是|讨论|举例|示例)/.test(text) || /(?:不要|不需要|禁止|别).{0,12}(?:生成|制作|创建|做).{0,80}(?:ppt|powerpoint|幻灯片|演示文稿)/i.test(text)) return false;
  return /(?:生成|制作|创建|做).{0,160}(?:\bppt\b|powerpoint|幻灯片|演示文稿)/i.test(text) || /(?:\bppt\b|powerpoint|幻灯片|演示文稿).{0,50}(?:生成|制作|创建)/i.test(text);
}
export function parsePresentationRequest(input: string, options:{maxPages?:number;sourceCount?:number}={}) {
  if (!isPresentationIntent(input)) throw new PublicError(400,'PPT_EXPLICIT_REQUEST_REQUIRED','请明确说明生成 PPT 的主题与页数。');
  const text=input.normalize('NFKC');
  if (/[0-9一二三四五六七八九十]+\s*[-~～至到–—]\s*[0-9一二三四五六七八九十]+\s*(?:页|张|slides?|pages?)/.test(text)) throw new PublicError(400,'PPT_AMBIGUOUS_PAGE_COUNT','请指定一个确切页数，含封面和参考资料。');
  const chinese: Record<string,number>={一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,十一:11};
  const chineseNumber=(v:string)=>{if(v in chinese)return chinese[v];const m=v.match(/^([一二三]?)[十]([一二三四五六七八九]?)$/);return m?(m[1]?chinese[m[1]]:1)*10+(m[2]?chinese[m[2]]:0):Number(v);};
  const counts=[...text.matchAll(/(-?\d+(?:\.\d+)?|负?[零〇一二两三四五六七八九十百千万]+)\s*(?:页|张|slides?\b|pages?\b)/gi)].map(m=>chineseNumber(m[1]));
  if (new Set(counts).size>1) throw new PublicError(400,'PPT_AMBIGUOUS_PAGE_COUNT','检测到多个页数，请说明含封面和参考资料的总页数。');
  const maximum=Math.max(3,Math.min(30,options.maxPages??20));
  const pageCount=counts[0]??Math.min(maximum,(options.sourceCount??0)>1?8:input.length>250?8:5);
  if (!Number.isInteger(pageCount)||pageCount<3||pageCount>maximum) throw new PublicError(400,'PPT_PAGE_COUNT_UNSUPPORTED',`本次支持3–${maximum}页，不会擅自改变指定页数。`);
  const language=/英文|英语|\bEnglish\b/i.test(text)?'英文' as const:'中文' as const;
  const audience=text.match(/面向\s*([^，,。；;\n的]+)(?:的|[，,。；;\n]|$)/)?.[1]?.trim()??null;
  const explicit=text.match(/(?:主题|题目|标题)(?:为|是)?\s*[：:]?\s*《([^》]+)》/)?.[1]
    ??text.match(/《([^》]+)》/)?.[1]
    ??text.match(/(?:主题|题目|标题)(?:为|是)?\s*[：:]\s*([^，,。；;\n]+)/)?.[1];
  const afterVerb=text.replace(/^.*?(?:生成|制作|创建|做)/,'');
  const clean=(v:string)=>v.split(/[，,。；;\n]/)[0].replace(/(?:\d+|十一|[一二三四五六七八九十])\s*(?:页|张|slides?|pages?)/gi,'').replace(/面向[^，,。；;\n的]+的/g,'').replace(/ppt|powerpoint|演示文稿|幻灯片|中文|英文|英语/gi,'').replace(/^(?:一份|一个|一套|关于|以)/,'').replace(/的$/,'').trim();
  const topic=explicit?.trim()||clean(afterVerb)||'业务汇报';
  const brief:PresentationBrief={pageCount,topic:topic.slice(0,60),language,audience,requirements:text.split(/[。；;\n]/).map(s=>s.trim()).filter(Boolean),mode:/培训|training|如何|教程|入门/i.test(text)?'training':/汇报|报告|风险|管理层/.test(text)?'business':'general'};
  // The full request remains durable; brief fields are reconstructed on resume, no DDL.
  return {...brief,request:input};
}

export function presentationNeedsWeb(request:string,mode:'auto'|'required'|'off',webQuery:string|null):boolean {
  if(webQuery||mode==='required')return true;
  // “本周内部进展” is a private-source request, not permission to search the web.
  return mode==='auto'&&/最新|目前|当前|实时|近期|最近|今天|今日/.test(request)&&/外部|联网|新闻|行情|汇率|天气|官网|市场|行业|趋势|政策|法规|标准|公开|版本/.test(request);
}

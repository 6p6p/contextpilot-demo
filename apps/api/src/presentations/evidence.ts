import type {PptSource} from '../../../../shared/presentations.js';
import {PublicError} from '../errors.js';

// Authority is server-owned, never inferred from a result's title or instructions.
export function officialWebSources(sources:PptSource[]):PptSource[] {
  const request=sources.filter(s=>s.kind==='request').map(s=>s.text).join('\n');
  if(!/只.{0,8}官方|仅.{0,8}官方|official[ -]only|only official/i.test(request))return sources;
  if(!/node\.js/i.test(request))throw new PublicError(422,'PPT_OFFICIAL_SCOPE_REQUIRED','官方来源的机构尚未明确，请指定可核实的官方域名或主题。');
  const filtered=sources.filter(s=>{
    if(s.kind!=='web')return true;
    try{const u=new URL(String(s.locator.url));return u.protocol==='https:'&&u.hostname==='nodejs.org'&&!u.username&&!u.password&&!u.port;}catch{return false;}
  });
  if(sources.some(s=>s.kind==='web')&&!filtered.some(s=>s.kind==='web'))throw new PublicError(422,'PPT_OFFICIAL_EVIDENCE_MISSING','没有符合要求的官方网页证据。');
  return filtered;
}

// Never manufacture a shortened quotation. Keep whole lines or whole sentences.
export function quoteOptions(source:PptSource):string[] {
  const evidence=source.locator.evidence;
  const extra=(source.kind==='meeting'||source.kind==='meeting_risk')?(Array.isArray(evidence)?evidence:[evidence]).flatMap(v=>v&&typeof v==='object'&&'quote' in v&&typeof v.quote==='string'?[v.quote]:[]):[];
  const lines=[source.text,...extra].flatMap(t=>t.split(/\n+/)).map(t=>t.trim()).filter(Boolean).flatMap(line=>{
    const field=line.match(/^(?:主题|会议日期|地点|参会人员|关键决策|潜在影响)[：:]\s*(.+)$/);
    return field?[line,field[1]]:[line];
  });
  const sentences=new Intl.Segmenter('zh',{granularity:'sentence'});
  return [...new Set(lines.flatMap(line=>[line,...Array.from(sentences.segment(line),s=>s.segment.trim()).filter(s=>/[。！？.!?][”’"']?$/.test(s))]).filter(s=>s.length<=88&&!/\[\.\.\.\]|…/.test(s)))];
}

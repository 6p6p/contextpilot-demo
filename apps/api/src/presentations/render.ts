import { posix } from 'node:path';
import { createRequire } from 'node:module';
// PptxGenJS 4 exposes CJS declarations alongside its ESM export; use its supported CJS entry on Node24.
const PptxGenJS=createRequire(import.meta.url)('pptxgenjs');
import JSZip from 'jszip';
import type { PptPlan, PptSource } from '../../../../shared/presentations.js';
import { PublicError } from '../errors.js';
import { verifyPlan } from './plan.js';
export const PPTX_MIME='application/vnd.openxmlformats-officedocument.presentationml.presentation' as const;
const titles:Record<PptPlan['slides'][number]['kind'],string>={cover:'业务汇报',summary:'执行摘要',background:'背景与目标',progress:'关键进展',risk:'风险与问题',todos:'待办及负责人',next:'建议与下一步',gaps:'资料缺口',references:'参考资料'};
const W=13.333333,H=7.5,FONT='Microsoft YaHei';
// jsonb reorders object keys. Canonical notes keep output bytes identical after DB reload.
function canonical(value:unknown):unknown {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical((value as Record<string,unknown>)[key])]));
  return value;
}
export interface TextBox {text:string;x:number;y:number;w:number;h:number;fontSize:number;role:string}
export function estimatedLines(text:string,width:number,fontSize:number) {
  const capacity=width*72/fontSize;
  return text.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil([...line].reduce((s,c)=>s+(c.charCodeAt(0)>255?1:0.58),0)/capacity)),0);
}
export function assertTextFit(box:TextBox) {
  if(box.x<0||box.y<0||box.x+box.w>W+0.01||box.y+box.h>H+0.01||estimatedLines(box.text,box.w-0.12,box.fontSize)*box.fontSize*1.25/72>box.h) throw new PublicError(422,'PPT_TEXT_TOO_DENSE','内容超出模板容量，请减少单页内容或缩短原文引用；未缩小字体。');
}
export async function validatePptx(bytes:Buffer,expectedCount:number) {
  if(bytes.length>12*1024*1024) throw new PublicError(422,'PPT_FILE_TOO_LARGE','PPTX 文件超过上限。');
  const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
  for(const name of ['[Content_Types].xml','_rels/.rels','ppt/presentation.xml','ppt/_rels/presentation.xml.rels']) if(!zip.file(name))throw new Error('Missing PPTX part');
  const types=await zip.file('[Content_Types].xml')!.async('string');
  for(const match of types.matchAll(/<Override[^>]*PartName="([^"]+)"[^>]*\/>/g))if(!zip.file(match[1].replace(/^\//,'')))throw new Error('Content-Type target missing');
  const slides=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n));
  const xml=await zip.file('ppt/presentation.xml')!.async('string');
  if(slides.length!==expectedCount||(xml.match(/<p:sldId /g)||[]).length!==expectedCount||!xml.includes('cx="12192000" cy="6858000"')) throw new Error('Invalid slide structure/count/dimensions');
  for(const name of slides) {
    const slide=await zip.file(name)!.async('string');
    if(!slide.includes('<a:t>'))throw new Error('Empty slide');
  }
  for(const file of Object.values(zip.files).filter(f=>f.name.endsWith('.rels'))) {
    const relationships=await file.async('string');
    if(/TargetMode="External"/.test(relationships))throw new Error('Unexpected external relationship');
    const source=file.name==='_rels/.rels'?'':file.name.replace(/\/_rels\/([^/]+)\.rels$/,'/$1');
    for(const match of relationships.matchAll(/<Relationship\s[^>]*Target="([^"]+)"[^>]*\/>/g)) {
      const target=match[1].startsWith('/')?match[1].slice(1):posix.normalize(posix.join(posix.dirname(source),match[1]));
      if(target.startsWith('../')||!zip.file(target))throw new Error('Relationship target missing');
    }
  }
  return {slideCount:slides.length,parts:Object.keys(zip.files).length};
}
export async function renderPresentation(plan:PptPlan,sources:PptSource[],topic:string,createdAt:Date) {
  verifyPlan(plan,plan.slides.length,sources);
  const pptx=new PptxGenJS();pptx.layout='LAYOUT_WIDE';pptx.author='ContextPilot';pptx.subject='可追溯的业务汇报';pptx.title=topic;pptx.company='ContextPilot';
  pptx.theme={headFontFace:FONT,bodyFontFace:FONT};
  const boxes:TextBox[]=[];
  const usedIds=new Set(plan.slides.flatMap(s=>s.items.flatMap(i=>i.kind==='quote'?[i.sourceId]:'sourceIds' in i?i.sourceIds:[])));
  for(const [index,page] of plan.slides.entries()) {
    const slide=pptx.addSlide();slide.background={color:page.kind==='cover'?'132F3B':'F7F8F5'};
    const text=(value:string,x:number,y:number,w:number,h:number,fontSize:number,role:string,color='183C45',bold=false)=>{
      const box={text:value,x,y,w,h,fontSize,role};assertTextFit(box);boxes.push(box);
      slide.addText(value,{x,y,w,h,fontSize,fontFace:FONT,color,bold,margin:0,breakLine:false,valign:'top',paraSpaceAfter:0,lang:'zh-CN'});
    };
    if(page.kind==='cover') {
      text('ContextPilot',0.75,0.6,10,0.5,20,'brand','75CEC0');
      text(topic,0.75,2.0,11.75,2.7,42,'cover','FFFFFF',true);
      text('业务汇报',0.75,5.2,10,0.6,22,'subtitle','CEE3E0');
      text(`共 ${plan.slides.length} 页`,0.75,6.5,8,0.4,14,'footer','CEE3E0');
    } else {
      text(titles[page.kind],0.7,0.55,11.9,0.65,32,'title','183C45',true);
      slide.addShape(pptx.ShapeType.line,{x:0.7,y:1.35,w:11.9,h:0,line:{color:'2D8C80',width:2}});
      if(page.kind==='references') {
        const selected=sources.filter(s=>usedIds.has(s.id));
        const visible=selected.slice(0,5);
        if(!visible.length) text('尚无可引用的业务资料。本汇报仅包含用户要求、资料缺口及通用建议。',0.8,1.8,11.5,1.4,22,'gap');
        visible.forEach((source,i)=>text(`[${source.id}] ${source.title.slice(0,64)}`,0.8,1.65+i*0.82,11.4,0.75,18,'reference'));
        if(selected.length>5)text('其余来源与完整定位见各页备注。',0.8,6.0,11,0.5,16,'reference-note');
      } else if(page.kind==='todos'&&page.items.every(i=>i.kind==='quote')&&page.items.every(i=>sources.find(s=>s.id===(i as {sourceId:string}).sourceId)?.kind==='todo')) {
        const data=page.items.map(i=>{const q=i as {sourceId:string;quote:string};const source=sources.find(s=>s.id===q.sourceId)!;return [`${source.classification==='recommendation'?'建议：':''}${q.quote}`,source.owner??'未提供',source.dueDate??'未提供'];});
        data.forEach(row=>row.forEach((value,i)=>assertTextFit({text:value,x:0.8,y:2,w:[6.5,2.1,2.9][i]-0.25,h:1.15,fontSize:18,role:'table'})));
        slide.addTable([['待办（来源陈述/建议）','负责人','截止时间'],...data].map(row=>row.map(value=>({text:value}))),{x:0.8,y:1.7,w:11.5,colW:[6.5,2.1,2.9],rowH:[0.6,...data.map(()=>1.45)],fontFace:FONT,fontSize:18,color:'183C45',fill:{color:'FFFFFF'},border:{pt:1,color:'DBE5E1'},margin:0.12,autoPage:false,verbose:false,bold:false});
      } else {
        page.items.forEach((item,i)=>{
          const y=1.65+i*1.5;
          let label:string,body:string;
          if(item.kind==='quote') {
            const source=sources.find(s=>s.id===item.sourceId)!;
            label=`${source.classification==='analysis'?'来源分析':source.classification==='recommendation'?'来源建议':'来源陈述'} [${source.id}]${source.riskLevel?` · 风险评估：${({low:'低',medium:'中',high:'高',critical:'严重'})[source.riskLevel]}`:''}`;
            body=item.quote;
          } else {label=item.kind==='analysis'?'分析判断':item.kind==='recommendation'?'建议':'资料不足';body=item.text;}
          text(label,0.8,y,11.5,0.34,14,'label',item.kind==='quote'&&sources.find(s=>s.id===item.sourceId)?.riskLevel?'9C4F2B':'2D7369',true);
          text(body,0.8,y+0.4,11.5,1.08,20,'body');
        });
      }
      const refs=[...new Set(page.items.flatMap(i=>i.kind==='quote'?[i.sourceId]:'sourceIds' in i?i.sourceIds:[]))].join('、');
      text(refs?`来源 ${refs} · 详细定位见备注`:'',0.7,7.0,10.8,0.3,10,'footer','657C7D');
      text(`${index+1} / ${plan.slides.length}`,11.6,7.0,1.0,0.3,10,'page','657C7D');
    }
    const ids=page.kind==='references'?[...usedIds]:page.items.flatMap(i=>i.kind==='quote'?[i.sourceId]:'sourceIds'in i?i.sourceIds:[]);
    slide.addNotes(sources.filter(s=>ids.includes(s.id)).map(s=>JSON.stringify(canonical(s))).join('\n')||'无外部事实来源。用户主题与建议不代表已核实的企业事实。');
  }
  const raw=Buffer.from(await pptx.write({outputType:'nodebuffer'}) as Uint8Array);
  // Stable archive timestamps permit exact checksum reconciliation after interrupted uploads.
  const zip=await JSZip.loadAsync(raw),stable=new JSZip();
  for(const name of Object.keys(zip.files).sort()) {
    const entry=zip.files[name];if(entry.dir)continue;
    let data=await entry.async('nodebuffer');
    // PptxGenJS4.0.1 emits unused slideMasterN overrides although only master1 exists.
    if(name==='[Content_Types].xml')data=Buffer.from(data.toString().replace(/<Override[^>]*PartName="\/(ppt\/slideMasters\/slideMaster\d+\.xml)"[^>]*\/>/g,(tag,part)=>zip.file(part)?tag:''));
    if(name==='docProps/core.xml')data=Buffer.from(data.toString().replace(/(<dcterms:(?:created|modified)[^>]*>)[^<]+/g,`$1${createdAt.toISOString()}`));
    stable.file(name,data,{date:new Date('2000-01-01T00:00:00Z'),createFolders:false});
  }
  const bytes=await stable.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}});
  await validatePptx(bytes,plan.slides.length);
  return {bytes,boxes};
}

import {Fragment,type ReactNode} from 'react';
function cells(line:string){
 const value=line.trim().replace(/^\|/,'').replace(/(?<!\\)\|$/,'');
 const result:string[]=[];let cell='',code=false;
 for(let i=0;i<value.length;i++){const c=value[i];if(c==='\\'&&value[i+1]==='|'){cell+='|';i++;continue;}if(c==='`')code=!code;if(c==='|'&&!code){result.push(cell.trim());cell='';}else cell+=c;}
 result.push(cell.trim());return result;
}
// Deliberately small Markdown subset. React escapes raw HTML; never use innerHTML.
function inline(text:string):ReactNode[] {
 const parts:ReactNode[]=[];const re=/(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^\s)]+\))/g;let cursor=0;
 for(const m of text.matchAll(re)){
  const i=m.index!;parts.push(text.slice(cursor,i));const v=m[0];
  if(v.startsWith('`'))parts.push(<code key={i}>{v.slice(1,-1)}</code>);
  else if(v.startsWith('**'))parts.push(<strong key={i}>{v.slice(2,-2)}</strong>);
  else {const link=v.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;let safe=false;try{safe=['https:','http:'].includes(new URL(link[2]).protocol);}catch{}parts.push(safe?<a key={i} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>:<Fragment key={i}>{link[1]}（链接已禁用）</Fragment>);}
  cursor=i+v.length;
 }parts.push(text.slice(cursor));return parts;
}
export function SafeMarkdown({text}:{text:string}){
 const lines=text.replace(/\r\n/g,'\n').split('\n'),nodes:ReactNode[]=[];
 for(let i=0;i<lines.length;){
  const line=lines[i],key=i;
  if(line.startsWith('```')){const code=[];i++;while(i<lines.length&&!lines[i].startsWith('```'))code.push(lines[i++]);if(i<lines.length)i++;nodes.push(<pre key={key}><code>{code.join('\n')}</code></pre>);continue;}
  const headers=cells(line),separator=cells(lines[i+1]??'');
  if(line.includes('|')&&headers.length===separator.length&&separator.every(v=>/^:?-{3,}:?$/.test(v))){
   const align=separator.map(v=>v.startsWith(':')&&v.endsWith(':')?'center':v.endsWith(':')?'right':'left') as ('center'|'right'|'left')[];
   const rows:string[][]=[];i+=2;while(i<lines.length&&lines[i].includes('|')&&lines[i].trim()&&!lines[i].startsWith('```'))rows.push(cells(lines[i++]));
   nodes.push(<div className="markdown-table" role="region" aria-label="Markdown 表格" tabIndex={0} key={key}><table><thead><tr>{headers.map((v,j)=><th key={j} scope="col" style={{textAlign:align[j]}}>{inline(v)}</th>)}</tr></thead><tbody>{rows.map((row,n)=><tr key={n}>{headers.map((_,j)=><td key={j} style={{textAlign:align[j]}}>{inline(row[j]??'')}</td>)}</tr>)}</tbody></table></div>);continue;
  }
  const heading=line.match(/^(#{1,3})\s+(.+)$/);if(heading){const Tag=heading[1].length===1?'h2':heading[1].length===2?'h3':'h4';nodes.push(<Tag key={key}>{inline(heading[2])}</Tag>);i++;continue;}
  if(/^\s*(?:[-*]|\d+\.)\s+/.test(line)){const ordered=/^\s*\d+\./.test(line),list=[];while(i<lines.length&&(ordered?/^\s*\d+\.\s+/:/^\s*[-*]\s+/).test(lines[i])){list.push(<li key={i}>{inline(lines[i++].replace(/^\s*(?:[-*]|\d+\.)\s+/,''))}</li>);}nodes.push(ordered?<ol key={key}>{list}</ol>:<ul key={key}>{list}</ul>);continue;}
  if(/^>\s?/.test(line)){const quote=[];while(i<lines.length&&/^>\s?/.test(lines[i]))quote.push(lines[i++].replace(/^>\s?/,''));nodes.push(<blockquote key={key}>{inline(quote.join('\n'))}</blockquote>);continue;}
  if(line.trim())nodes.push(<p key={key}>{inline(line)}</p>);i++;
 }
 return <div className="safe-markdown">{nodes}</div>;
}
export function AnswerContent({text,compactWeb=false}:{text:string;compactWeb?:boolean}){
 const split=text.indexOf('\n\n');
 if(compactWeb&&split>0&&/^(?:结论（来源明确记载）|基于官方证据归纳|来源存在冲突|搜索结果证据不足)/.test(text)){
  return <><SafeMarkdown text={text.slice(0,split)}/><details className="citation"><summary>展开证据摘录与说明</summary><SafeMarkdown text={text.slice(split+2)}/></details></>;
 }
 return <SafeMarkdown text={text}/>;
}

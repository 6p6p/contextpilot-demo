import {useState} from 'react';
import {Popover} from './Popover';
import type {KnowledgeDocument} from '../../../shared/documents';

export function PdfMultiSelect({documents,selected,onChange,disabled}:{documents:KnowledgeDocument[];selected:string[];onChange:(ids:string[])=>void;disabled:boolean}){
 const [query,setQuery]=useState('');
 const filtered=documents.filter(d=>d.filename.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const labels={ready:'已就绪',uploaded:'待解析',processing:'解析中',failed:'解析失败'};
 return <Popover label="选择知识库 PDF" className="pdf-select-trigger" disabled={disabled} trigger={<><span>{selected.length?`已选择 ${selected.length} 份 PDF`:'选择 PDF（可多选）'}</span><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m6 9 6 6 6-6"/></svg></>}>
  {close=><section className="pdf-multi-select"><div className="picker-heading"><strong>选择 PDF</strong><button type="button" className="icon-button" aria-label="关闭 PDF 下拉框" onClick={close}>×</button></div>
   <input autoFocus type="search" aria-label="搜索 PDF 文件名" placeholder="搜索文件名…" value={query} onChange={e=>setQuery(e.target.value)}/>
   <div className="pdf-selection-actions"><span>已选择 {selected.length} 份</span><button type="button" disabled={disabled||!selected.length} onClick={()=>onChange([])}>清空选择</button></div>
   <div className="pdf-options" role="group" aria-label="PDF 文件列表">{filtered.map(d=><label key={d.id}><input type="checkbox" aria-label={`选择PDF ${d.filename}`} disabled={disabled||d.status!=='ready'} checked={selected.includes(d.id)} onChange={e=>onChange(e.target.checked?[...selected,d.id]:selected.filter(id=>id!==d.id))}/><span title={d.filename}>{d.filename}<small>{labels[d.status]}</small></span></label>)}{!filtered.length?<p>{documents.length?'没有匹配的 PDF。':'暂无可选 PDF。'}</p>:null}</div>
  </section>}
 </Popover>;
}

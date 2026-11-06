import { useEffect, useRef, useState } from 'react';
import {ActionDialog} from './ActionDialog';
import { documentsResponse, type KnowledgeDocument } from '../../../shared/documents';

const labels = { uploaded: '已上传，等待处理', processing: '解析与向量化中', ready: '可用于知识问答', failed: '处理失败' };
export function KnowledgeLibrary() {
  const [removing,setRemoving]=useState<KnowledgeDocument|null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await fetch('/api/documents', { signal: controller.signal });
        if (!response.ok) throw new Error('知识库暂不可用，请检查数据库和迁移配置。');
        const result = documentsResponse.parse(await response.json());
        if (!controller.signal.aborted) { setDocuments(result.documents); setListError(''); }
      } catch (cause) { if (!controller.signal.aborted) setListError(cause instanceof Error ? cause.message : '文件列表加载失败。'); }
      finally { if (!controller.signal.aborted) timer = setTimeout(() => { void load(); }, 3000); }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [refresh]);
  async function upload(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 6 * 1024 * 1024 || !file.size) { setError('请选择非空且不超过 6 MB 的 PDF。'); return; }
    setUploading(true); setError('');
    try {
      const response = await fetch(`/api/documents?filename=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: file });
      if (!response.ok) {
        const body = await response.json() as { error?: { message?: string } };
        throw new Error(body.error?.message || '上传失败。');
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '上传失败，请检查网络。'); }
    finally { setUploading(false); setRefresh(value => value + 1); if (input.current) input.current.value = ''; }
  }
  return <section className="knowledge-library" aria-label="PDF 知识库">
    <div className="chat-heading"><h2>PDF 知识库</h2><label className="upload-label">{uploading ? '正在保存原始 PDF…' : '上传 PDF'}<input ref={input} aria-label="上传 PDF" type="file" accept="application/pdf,.pdf" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label></div>
    <p>私有存储 · 最多 6 MB / 100 页 · 不支持扫描件 OCR。处理完成后勾选“使用 PDF 知识库”提问。</p>
    {error || listError ? <p role="alert" className="chat-error">{error || listError}</p> : null}
    <ul className="document-list">{documents.map(document => <li key={document.id} data-document-id={document.id}>
      <strong>{document.filename}</strong><button type="button" onClick={()=>setRemoving(document)}>移除文件</button><span>{labels[document.status]}</span>
      {document.status === 'ready' ? <small>{document.pageCount} 页 · {document.chunkCount} 个片段</small> : null}
      {document.status === 'failed' ? <p>{document.errorMessage}（{document.errorCode}）</p> : null}
    </li>)}</ul>
    {!documents.length&&!listError ? <p>尚无已上传文件。</p> : null}
  <ActionDialog open={Boolean(removing)} title="移除 PDF" description="停止此文件参与新的RAG和PPT检索；原文件、向量和历史引用保留，不删除Storage对象。" onClose={()=>setRemoving(null)} onConfirm={async()=>{if(!removing)return;const r=await fetch(`/api/documents/${removing.id}`,{method:'DELETE'});if(!r.ok){const d=await r.json();throw new Error(d.error?.message??'移除失败');}setRefresh(v=>v+1);}}/>
  </section>;
}

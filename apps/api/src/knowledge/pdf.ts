import { PublicError } from '../errors.js';

export const MAX_PDF_BYTES = 6 * 1024 * 1024;
export const CHUNK_SIZE = 800;
export const CHUNK_OVERLAP = 120;
export function validatePdf(filename: string, mime: string, bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_PDF_BYTES) throw new PublicError(413, 'PDF_SIZE_LIMIT', 'PDF 必须非空且不超过 6 MB。');
  if (!filename.toLowerCase().endsWith('.pdf') || mime.split(';')[0] !== 'application/pdf' || bytes.subarray(0, 5).toString() !== '%PDF-') throw new PublicError(415, 'PDF_TYPE_REQUIRED', '请上传真实 PDF 文件。');
}
export interface PageText { page: number; text: string }
export async function parsePdf(bytes: Uint8Array): Promise<PageText[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, stopAtErrors: true });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 100) throw new PublicError(422, 'PDF_PAGE_LIMIT', 'PDF 超过 100 页。');
    const pages: PageText[] = [];
    let total = 0;
    for (let page = 1; page <= pdf.numPages; page++) {
      const content = await (await pdf.getPage(page)).getTextContent();
      const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').replace(/[ \t]+/g, ' ').trim();
      total += text.length;
      if (total > 200000) throw new PublicError(422, 'PDF_TEXT_LIMIT', 'PDF 可提取文本超过 20 万字符。');
      pages.push({ page, text });
    }
    if (!pages.some(p => p.text.trim())) throw new PublicError(422, 'PDF_NO_TEXT', '没有可提取文本；扫描件暂不支持 OCR。');
    return pages;
  } catch (error) {
    if (error instanceof PublicError) throw error;
    throw new PublicError(422, 'PDF_PARSE_FAILED', 'PDF 损坏、加密或无法解析。');
  } finally { await task.destroy(); }
}
export function chunkPages(pages: PageText[]) {
  const chunks: { ordinal: number; page: number; startOffset: number; endOffset: number; text: string }[] = [];
  for (const { page, text } of pages) {
    for (let start = 0; start < text.length;) {
      const end = Math.min(start + CHUNK_SIZE, text.length);
      const value = text.slice(start, end);
      if (value.trim()) chunks.push({ ordinal: chunks.length, page, startOffset: start, endOffset: end, text: value });
      if (end === text.length) break;
      start = end - CHUNK_OVERLAP;
    }
  }
  return chunks;
}

import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { parsePdf, chunkPages, validatePdf, CHUNK_SIZE, CHUNK_OVERLAP } from '../../apps/api/src/knowledge/pdf.js';
import { createEmbedder } from '../../apps/api/src/knowledge/embedding.js';
import { createStorage } from '../../apps/api/src/knowledge/storage.js';
import { createKnowledgeAnswerer, verifyEvidence, insufficientEvidence, type RetrievedSource } from '../../apps/api/src/knowledge/retrieval.js';
import { parseEnv } from '../../apps/api/src/config/env.js';

describe('real PDF.js and page-preserving chunks', () => {
  it('extracts the unique fact on physical page 2', async () => {
    const pages = await parsePdf(await readFile('tests/fixtures/rag-project.pdf'));
    expect(pages).toHaveLength(2);
    expect(pages[0].text).not.toContain('AMBER-593');
    expect(pages[1]).toMatchObject({ page: 2, text: expect.stringContaining('AMBER-593') });
  });
  it('rejects no-text and damaged PDFs', async () => {
    await expect(parsePdf(await readFile('tests/fixtures/rag-no-text.pdf'))).rejects.toMatchObject({ code: 'PDF_NO_TEXT' });
    await expect(parsePdf(Buffer.from('%PDF-1.7 broken'))).rejects.toMatchObject({ code: 'PDF_PARSE_FAILED' });
  });
  it('never crosses a page boundary; overlap and offsets reconstruct original text', () => {
    const text = 'abcdef'.repeat(400);
    const chunks = chunkPages([{ page: 2, text }, { page: 4, text: 'last page' }]);
    expect(chunks[0].text).toHaveLength(CHUNK_SIZE);
    expect(chunks[1].startOffset).toBe(CHUNK_SIZE - CHUNK_OVERLAP);
    expect(chunks[0].text.slice(-CHUNK_OVERLAP)).toBe(chunks[1].text.slice(0, CHUNK_OVERLAP));
    for (const chunk of chunks.filter(c => c.page === 2)) expect(chunk.text).toBe(text.slice(chunk.startOffset, chunk.endOffset));
    expect(chunks.at(-1)).toMatchObject({ page: 4, text: 'last page' });
  });
  it('validates MIME, extension, header and upload size', () => {
    expect(() => validatePdf('bad.pdf', 'application/pdf', Buffer.from('not pdf'))).toThrow();
    expect(() => validatePdf('bad.txt', 'application/pdf', Buffer.from('%PDF-1.7'))).toThrow();
    expect(() => validatePdf('large.pdf', 'application/pdf', Buffer.alloc(6 * 1024 * 1024 + 1))).toThrow('6 MB');
  });
});

const env = parseEnv({ EMBEDDING_BASE_URL: 'https://embedding.example/v1', EMBEDDING_API_KEY: 'synthetic-test-key', EMBEDDING_MODEL: 'test-model', EMBEDDING_DIMENSIONS: '3' });
describe('embedding protocol (MOCK transport, no actual provider)', () => {
  it('reorders vectors by index and enforces configured space', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [{ index: 1, embedding: [0, 1, 0] }, { index: 0, embedding: [1, 0, 0] }] })));
    const embedder = createEmbedder(env, transport)!;
    expect(await embedder.embed(['one', 'two'])).toEqual([[1, 0, 0], [0, 1, 0]]);
    expect(embedder.space).not.toBe(createEmbedder({ ...env, EMBEDDING_MODEL: 'different' }, transport)!.space);
  });
  it.each([
    [{ index: 0, embedding: [1, 2] }],
    [{ index: 0, embedding: [0, 0, 0] }],
    [{ index: 1, embedding: [1, 0, 0] }],
  ])('rejects invalid dimensions, zero vectors or wrong index', async data => {
    const embedder = createEmbedder(env, vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [data] }))))!;
    await expect(embedder.embed(['one'])).rejects.toBeDefined();
  });
  it('does not expose provider body on failure', async () => {
    const embedder = createEmbedder(env, vi.fn<typeof fetch>().mockResolvedValue(new Response('private-body', { status: 401 })))!;
    await expect(embedder.embed(['one'])).rejects.toMatchObject({ code: 'EMBEDDING_UPSTREAM_ERROR' });
  });
});

describe('citation gate (MOCK selection, actual validation)', () => {
  const source: RetrievedSource = { sourceId: randomUUID(), documentId: randomUUID(), filename: 'evidence.pdf', page: 2, text: 'The launch code is AMBER-593.', similarity: 0.9 };
  it('constructs filename/page from stored metadata, not model claims', () => {
    const citations = verifyEvidence(JSON.stringify({ citations: [{ sourceId: source.sourceId, quote: 'AMBER-593', filename: 'invented.pdf', page: 99 }] }), [source]);
    expect(citations[0]).toMatchObject({ filename: 'evidence.pdf', page: 2, quote: 'AMBER-593' });
  });
  it('rejects invented IDs and quotes', () => {
    expect(() => verifyEvidence(JSON.stringify({ citations: [{ sourceId: randomUUID(), quote: 'AMBER-593' }] }), [source])).toThrow();
    expect(() => verifyEvidence(JSON.stringify({ citations: [{ sourceId: source.sourceId, quote: 'invented answer' }] }), [source])).toThrow();
  });
  it('does not call LLM when no evidence is retrieved', async () => {
    const complete = vi.fn();
    expect((await createKnowledgeAnswerer(async () => []).answer('unknown', { complete })).content).toBe(insufficientEvidence);
    expect(complete).not.toHaveBeenCalled();
  });
  it('uses only verified quotations even if model includes fabricated prose', async () => {
    const answer = await createKnowledgeAnswerer(async () => [source]).answer('code?', { async complete() { return { model: 'stub', content: JSON.stringify({ answer: 'fabricated claim', citations: [{ sourceId: source.sourceId, quote: 'AMBER-593' }] }) }; } });
    expect(answer.content).toContain('AMBER-593');
    expect(answer.content).not.toContain('fabricated claim');
  });
});

describe('private Storage policy (MOCK transport)', () => {
  it('refuses public buckets before uploading bytes', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"public":true}'));
    const storage = createStorage(parseEnv({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_STORAGE_KEY: 'synthetic-key', SUPABASE_STORAGE_BUCKET: 'test' }), transport)!;
    await expect(storage.put('pdf/test.pdf', Buffer.from('%PDF-'))).rejects.toMatchObject({ code: 'STORAGE_BUCKET_NOT_PRIVATE' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

it('Storage lookup recognizes only explicit legacy not_found, not arbitrary HTTP400 (MOCK)',async()=>{
 const env=parseEnv({SUPABASE_URL:'https://project.example',SUPABASE_STORAGE_KEY:'placeholder',SUPABASE_STORAGE_BUCKET:'private'});
 for(const [body,missing] of [[{statusCode:'404',error:'not_found'},true],[{statusCode:'400',error:'InvalidRequest'},false]] as const){
  const transport=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{"public":false}')).mockResolvedValueOnce(new Response(JSON.stringify(body),{status:400}));
  const result=createStorage(env,transport)!.find!('presentations/test.pptx');if(missing)expect(await result).toBeNull();else await expect(result).rejects.toMatchObject({code:'STORAGE_UNAVAILABLE'});
 }
});

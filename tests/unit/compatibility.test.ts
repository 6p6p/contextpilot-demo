import { describe, expect, it } from 'vitest';
import { pgTable, vector, uuid, PgDialect } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pptxgen from 'pptxgenjs';

// Runtime compatibility probes only. No app routes, external calls or files.
describe('approved library compatibility on Node 24', () => {
  it('builds parameterized PostgreSQL vector SQL without connecting', () => {
    const probe = pgTable('compatibility_probe', { id: uuid(), embedding: vector({ dimensions: 3 }) });
    const db = drizzle.mock();
    const query = db.insert(probe).values({ embedding: [0.1, 0.2, 0.3] }).toSQL();
    expect(query.sql).toContain('"embedding"');
    expect(query.params).toContain('[0.1,0.2,0.3]');
    expect(new PgDialect()).toBeDefined();
  });
  it('extracts text from an actual in-memory PDF', async () => {
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    const stream = 'BT /F1 12 Tf 30 200 Td (ContextPilot compatibility) Tj ET';
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = pdf.length;
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const task = getDocument({ data: new Uint8Array(Buffer.from(pdf)), useSystemFonts: true });
    try {
      const document = await task.promise;
      const content = await (await document.getPage(1)).getTextContent();
      expect(content.items.map(item => 'str' in item ? item.str : '').join('')).toContain('ContextPilot compatibility');
    } finally { await task.destroy(); }
  });
  it('generates a real PPTX archive in memory', async () => {
    const presentation = new pptxgen();
    presentation.addSlide().addText('ContextPilot 兼容性检查', { x: 1, y: 1, w: 6, h: 1 });
    const output = await presentation.write({ outputType: 'nodebuffer' });
    expect(Buffer.isBuffer(output)).toBe(true);
    expect((output as Buffer).subarray(0, 2).toString()).toBe('PK');
    expect((output as Buffer).length).toBeGreaterThan(1000);
  });
});

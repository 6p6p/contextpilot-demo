import { expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { reserveEmailSlot } from '../../apps/api/src/email/service.js';

it('serializes quota checks before counting all persisted tasks, including failed/other scopes', async () => {
  const queries: string[] = [];
  const execute = vi.fn(async (query) => {
    queries.push(new PgDialect().sqlToQuery(query).sql);
    return { rows: queries.length === 1 ? [] : [{ total: 4 }] };
  });
  await reserveEmailSlot({ execute } as unknown as Parameters<typeof reserveEmailSlot>[0]);
  expect(queries[0]).toContain('pg_advisory_xact_lock');
  expect(queries[1]).toContain('"email_deliveries"');
  expect(queries[1]).toContain("interval '1 hour'");
  expect(queries[1]).not.toMatch(/scope|status|config_identity/);
});

it.each([5, 6])('rejects a new task at %s existing hourly tasks', async total => {
  const execute = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ total }] });
  await expect(reserveEmailSlot({ execute } as unknown as Parameters<typeof reserveEmailSlot>[0])).rejects.toMatchObject({ statusCode: 429, code: 'EMAIL_HOURLY_LIMIT' });
});

it('fails closed if quota lookup fails or returns invalid data', async () => {
  for (const rows of [[], [{ total: -1 }], [{ total: 'invalid' }]]) {
    const execute = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows });
    await expect(reserveEmailSlot({ execute } as unknown as Parameters<typeof reserveEmailSlot>[0])).rejects.toMatchObject({ code: 'EMAIL_QUOTA_UNAVAILABLE' });
  }
  const execute = vi.fn().mockRejectedValue(new Error('synthetic database failure'));
  await expect(reserveEmailSlot({ execute } as unknown as Parameters<typeof reserveEmailSlot>[0])).rejects.toThrow('synthetic database failure');
});

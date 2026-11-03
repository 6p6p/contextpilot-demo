import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../apps/api/src/config/env.js';

describe('environment validation', () => {
  it('allows credential-free startup without pretending the database exists', () => {
    expect(parseEnv({ DATABASE_URL: '' })).toMatchObject({ PORT: 3001, DATABASE_URL: undefined, DATABASE_SSL: true });
  });
  it.each([{ PORT: '0' }, { PORT: 'abc' }, { DATABASE_URL: 'https://example.com' }, { DATABASE_SSL: 'yes' }])('rejects invalid config %o', input => {
    expect(() => parseEnv(input)).toThrow('Invalid environment fields');
  });
  it('does not echo invalid secret values', () => {
    expect(() => parseEnv({ DATABASE_URL: 'invalid-private-value' })).toThrow('Invalid environment fields: DATABASE_URL');
  });
});

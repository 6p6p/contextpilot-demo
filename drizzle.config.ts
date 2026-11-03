import { defineConfig } from 'drizzle-kit';

// Generation is offline. Migration credentials are loaded only by db:migrate.
export default defineConfig({
  dialect: 'postgresql', schema: './apps/api/src/db/schema.ts', out: './drizzle',
});

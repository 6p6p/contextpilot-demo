# Phase 1 verification — 2026-11-03

## Environment

Windows; Node 24.15.0; npm 11.12.1; Git 2.54.0.windows.1. npm cache is project-local because the default user cache is not writable. No global tools installed.

Runtime dependencies: React/ReactDOM 19.3.1, Vite 8.3.5, Fastify 5.12.8, @fastify/static 10.1.8, Zod 4.6.7, Drizzle ORM 0.45.4, Drizzle Kit 0.31.11, pg 8.23.1, PDF.js 6.5.438, PptxGenJS 4.0.1. Exact dependency tree is in package-lock.json. Node type definitions are pinned to the runtime major (24).

## Commands and evidence

| Command | Actual result |
|---|---|
| `npm ci` | Exit 0; clean reinstall from project lockfile, followed by full checks and both E2E modes |
| `npm run check` | Exit 0: strict frontend/backend type checks, 14 tests across 3 files, backend TS compile and Vite production build |
| `npm run test:e2e` with `PLAYWRIGHT_CHANNEL=chrome` | Exit 0: real Chrome loads Vite page, actual proxied Fastify health returns 200, UI shows backend connected/DB unconfigured, retry works, mobile has no horizontal overflow, no page exceptions |
| `npm run test:e2e:production` with same channel | Exit 0: real Chrome loads built frontend from Fastify and calls same-origin API; same assertions pass |
| `npm run db:check` without credentials | Expected exit 1; `Database: not_configured` |
| `npm run db:migrate` without credentials | Expected exit 1; explicit not-configured error, no migration executed |
| `npm run db:generate` | Exit 0; 0 tables, no schema changes; no database connection |
| `git diff --check` | No whitespace errors |

Library probes use actual runtime code: PDF.js extracts text from a valid PDF constructed in memory; PptxGenJS emits a real ZIP/PPTX buffer; Drizzle builds a parameterized vector insert. These are compatibility checks, not delivered PDF/PPT business modules, and make no external API calls.

Browser artifacts are ignored under test-results. Desktop/mobile screenshots and page exceptions are checked. Both test-owned service processes terminate after the run; ports 3001/5173 are released.

## Issues found and resolved

- Fastify error parameter is unknown in current types: narrowed properties instead of weakening strict mode.
- Zod refinement can run for a failed URL format check: protocol refinement now avoids a throwing URL constructor. Invalid environment errors report field names only.
- Playwright webServer with nested npm/concurrently processes did not clean up in this Windows environment: E2E runner now starts and terminates directly owned Node processes without shell/watch wrappers. It refuses occupied ports and propagates test failure codes.

## Limits

No database credentials supplied: connection success, migrations and server-side pgvector are not verified. No LLM, embeddings, search, email or storage integration is implemented or called. No workspace authentication yet; public business deployment must wait. No paid resources, deployment, GitHub push or global installs.

Original assignment SHA-256 before and after work: `BE8C2739B1D188021D37F1E50DFF0168148EB5937C34ED37ADB78EB7B7104E35`.

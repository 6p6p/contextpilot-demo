# Phase 3 PDF RAG setup and acceptance

## Status

Phase 3 real acceptance passed: private Storage, real SiliconFlow BAAI/bge-m3 / 1024-dimensional output, actual pgvector records, multiple-document answers and filename/page provenance, reload, insufficient evidence and invalid PDFs. Earlier 402 was resolved after user account check; one new minimal Chinese preflight succeeded without retry. Final check passes 45 tests plus types/build; default E2E passes; normal real-model chat regression passes. Current-run cloud test data was safely cleaned; reusable PDF fixtures remain. Results: [phase-3-verification.md](phase-3-verification.md).

## Root .env configuration

Keep the working DATABASE_*/LLM_* configuration. Add these fields yourself to repository-root `.env` (never apps/web or VITE_*). Do not paste secrets in chat.

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_STORAGE_KEY=BACKEND_SECRET_OR_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET=YOUR_EXISTING_PRIVATE_BUCKET
EMBEDDING_BASE_URL=https://YOUR_EMBEDDING_PROVIDER/v1
EMBEDDING_API_KEY=YOUR_EMBEDDING_KEY
EMBEDDING_MODEL=YOUR_EMBEDDING_MODEL
EMBEDDING_DIMENSIONS=YOUR_MODEL_OUTPUT_DIMENSIONS
RAG_MIN_SIMILARITY=0.5
```

Storage: create/select a private bucket in Supabase Dashboard yourself; disable Public, allow application/pdf and at least the intended upload size (application max 6 MiB). No frontend Storage key, anonymous policy or public bucket is required. Adapter checks bucket privacy before every upload/download and never creates resources. Key must have backend bucket metadata/object permissions. This is separate from the PostgreSQL password. Reference: https://supabase.com/docs/guides/storage/buckets/creating-buckets

Verified embedding: SiliconFlow `https://api.siliconflow.cn/v1`, model `BAAI/bge-m3`, 1024 native output dimensions. Adapter remains configurable for non-streaming OpenAI-compatible POST /embeddings with float vectors/indexed rows. Base URL is a prefix; backend appends /embeddings. Output must match configured dimensions (1–4096); current adapter does not request dimension reduction. It rejects wrong dimensions, non-finite values, zero vectors, duplicate/missing indexes and wrong counts. DeepSeek chat is not used as an embedding service.

Configure locally; report only model name/dimensions and readiness, never keys. Obtain a test budget before billable calls. Current acceptance was authorized for ¥5 combined Embedding/LLM and estimated far below that limit; a future rerun needs an applicable authorization.

## Processing and provenance design

- Upload original bytes with filename query parameter to POST /api/documents (application/pdf, maximum 6 MiB). Require .pdf, MIME and %PDF- header; header check is not a parse success claim.
- Save a durable ledger row, then private Storage object under random UUID. storageReady prevents worker from claiming incomplete uploads. SHA-256 verifies download content.
- PDF.js extracts physical pages (1-based), up to 100 pages and 200000 extracted characters. Scan/no text and broken/encrypted input fail explicitly. No OCR.
- Page-local 800 UTF-16-character windows, 120-character overlap; no cross-page chunk. Persist normalized text offsets and physical page with every vector.
- Store plain pgvector vectors, CHECK vector_dims matches per-row dimensions. Endpoint/model/dimension fingerprint isolates spaces; querying a new model never compares incompatible vectors. Exact cosine search over ready chunks, top 8, threshold 0.5 by default. No ANN/extra vector DB for this Demo. Threshold requires calibration against the selected real model.
- Processing uses SQL skip-locked claims and five-minute leases renewed every 30s. Restart can resume expired work once (2 attempts total); this may repeat billed embedding calls. Actual API errors become failed, not automatically retried. Shutdown cancels in-flight provider fetches and leaves interrupted work eligible for lease recovery; it does not publish false success. All chunks and ready status publish atomically; failed or processing documents cannot be retrieved.
- If model/storage config changes, restore original config for pending documents or re-upload them. Existing vectors are preserved, not silently re-embedded or deleted.

## Answer behavior

Use the existing chat interface and check **使用 PDF 知识库**. Ordinary chat is unchanged by default. PDF mode treats each input as a standalone question and searches all compatible ready PDFs; conversational question rewriting is outside this phase.

LLM receives explicitly untrusted excerpts and selects exact quotes/IDs in JSON. Server verifies that each ID was retrieved and quote is a literal substring; filenames/pages come only from stored metadata, not model output. The final answer is extractive evidence assembled by the server, discarding unverified model prose. Invalid citations produce a visible failure, not a fabricated answer. No candidates/empty evidence → explicit 证据不足. Citations and excerpts persist on the assistant message across reload.

This conservative design guarantees origin/quote consistency, not the factual truth of a user's PDF or perfect semantic relevance. Real model tests must still validate selection. No PDF content can invoke tools or send emails because those capabilities are not exposed to this path.

## Reproducible fixtures

Committed under tests/fixtures:

| File | Physical page | Expected fact |
|---|---|---|
| rag-project.pdf | 2 | ORCHID-7421 launch access code AMBER-593; budget CNY 137420 |
| rag-owner.pdf | 1 | Owner Dr. Mira Qiao |
| rag-owner.pdf | 2 | Nanjing Room Cedar-17 and inert prompt-injection sample |
| rag-no-text.pdf | 1 | Shape only; no text layer, must fail PDF_NO_TEXT |

No fixture mentions an insurance contract number; asking for it must return insufficient evidence. A corrupt input `%PDF-1.7 broken` is generated in tests and must fail PDF_PARSE_FAILED.

Regenerate with `python scripts/generate-rag-fixtures.py` (ReportLab needed only for regeneration; fixtures themselves need no Python). Generated using bundled ReportLab and all five pages rendered with PDF.js/canvas and visually checked. Synthetic facts only, no private company data.

## Commands and evidence levels

```powershell
npm run check
$env:PLAYWRIGHT_CHANNEL='chrome'
npm run test:e2e
npm run test:e2e:production
# Real database tests, explicitly stubbed other services; migration already applied
$env:RUN_LIVE_TESTS='1'
npm run test:integration
# Only after new credentials and Phase 3 budget confirmation
npm run test:e2e:rag
npm run test:e2e:live
```

Default offline/E2E runs isolate external credentials. Real-DB integration verifies actual vector SQL, persisted pages/vectors, errors and lease recovery but does not prove live providers. True RAG E2E uploads through browser, waits ready, checks SHA-256, multi-document facts, citations/reload and insufficiency; the second case checks real blank/damaged PDF failures. Live chat E2E checks normal multi-turn/reload/switch. These calls can bill and create persistent test records.

For explicitly authorized cleanup, set ACCEPTANCE_TRACKING=1, run `node --import tsx scripts/acceptance-manifest.ts init` before tests, then `audit` and `cleanup` after. It records baseline IDs and IDs created by tests, uses unique upload names, validates object identity and refuses to delete original IDs or documents referenced outside test conversations. No user cleanup API is exposed. Local `.acceptance/` retains ignored audit/usage metadata. Init refuses to overwrite an existing manifest; archive a completed manifest locally before a later run. Default tests leave records retained when tracking is not enabled. Do not run two live suites on the same test ports concurrently.

Supabase/Embedding credentials remain backend-only. No actual .env, certs, ignored test artifacts or downloaded private files are committed. No public deployment, remote push, paid resource creation, OCR or meeting feature is part of Phase 3.

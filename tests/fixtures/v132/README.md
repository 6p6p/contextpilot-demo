# v1.3.2 real-failure replay fixtures

Synthetic training request and exact complete planning response from the v1.3.2 live run; no credentials, object paths or real user documents. `training-response.json` reproduces the false topic-word rejection. `negative-analysis.json` reproduces treating “而非已确认延期” as affirmative approval. The original tasks/files remain unchanged under ignored `.acceptance`.

`tests/unit/v132.test.ts` and `v132-public.test.ts` are deterministic protocol tests, not new live acceptance. The live report keeps the Node.js freshness failure separate from real PPT success. Corpus v1 Golden data is unchanged.

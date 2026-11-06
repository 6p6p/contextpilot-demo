# MVP v1.3.1 fixed regressions

These are **offline replays**, not new Live success evidence. Corpus v1 and its Golden data remain unchanged.

- `search-overflow.json`: public Node.js Tavily snippets and the exact failed model JSON captured on 2026-11-06. Provider request IDs, usage/account envelopes and headers are omitted. The frozen clock is a test condition, not a reconstructed per-source timestamp. The original 7 claims / 7 citations are retained. Some quote indexes also bind the wrong rows: lossless formatting must not make them supported.
- `ppt-a-failed.json`, `ppt-b-failed.json`: exact failed plans/model content and synthetic ORCHID business text. UUIDs are replaced consistently with synthetic UUIDs; filenames are neutral, source IDs/quotes/dates and facts unchanged. No Storage path or authentication material is included.
- `meeting-discussion.json`: saved synthetic meeting analysis, including the unapproved proposal omitted by the previous PPT collector. This is an input to a source-construction test, not an amended historical PPT snapshot.

Original failed files/responses remain untouched in ignored `.acceptance/mvp-v1.3-live/`. Never replace them with STUB outputs. `tests/unit/v131-regressions.test.ts` checks lossless format bounds, invalid bindings, semantic review, direct training content and 5-page rendering, 10-page fact coverage, current todo versions and proposal classification. Existing `search-v13.test.ts` additionally covers real conflict, stale evidence and insufficient support.

Run: `npx vitest run tests/unit/v131-regressions.test.ts` (no `.env`, network or paid calls). For a single case append `-t V131-P05` or `-t V131-S01`. All model verdicts are explicitly STUB; they prove protocol/guards, not semantic correctness of a live model.

Future failures should add a separate redacted input and structured assertions before fixing production code. Keep the previous baseline; record why any contract adapter changes. Do not edit Golden facts to accommodate an incorrect answer.

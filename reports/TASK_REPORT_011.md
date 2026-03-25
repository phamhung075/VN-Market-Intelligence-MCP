# Task Report 011 — Embedding Pipeline (HuggingFace Local ONNX)

**Branch**: `task/011-rag-embeddings`
**Merged**: 2026-03-25
**Reviewer**: Claude (Reviewer agent)

---

## Summary

Implements a local embedding pipeline using HuggingFace Transformers (ONNX runtime) with the `paraphrase-multilingual-MiniLM-L12-v2` model. Produces 384-dimensional vectors suitable for Vietnamese, English, and French text. All computation is local -- no API keys required.

## Files Changed

| File | Change |
|------|--------|
| `src/infrastructure/rag/embeddings.ts` | New — core embedding module |
| `src/infrastructure/rag/index.ts` | New — barrel export for RAG modules |
| `src/infrastructure/index.ts` | Modified — re-exports embedding functions |
| `src/__tests__/011-rag-embeddings.test.ts` | New — 10 tests |

## Public API

- `embed(text: string): Promise<Float32Array>` — single text to 384-dim vector
- `embedBatch(texts: string[]): Promise<Float32Array[]>` — batch embedding
- `cosineSimilarity(a, b): number` — cosine similarity between two vectors
- `getEmbeddingPipeline(): Promise<FeatureExtractionPipeline>` — singleton access
- `buildBctcEmbeddingText(opts): string` — structured text builder for BCTC chunks

## Test Results

```
10 pass, 0 fail, 16 expect() calls (1212ms)
```

| Test | Status |
|------|--------|
| embed() returns Float32Array[384] | PASS |
| embed() handles empty string gracefully | PASS |
| cosineSimilarity identical vectors = 1.0 | PASS |
| cosineSimilarity orthogonal vectors = 0.0 | PASS |
| cosineSimilarity opposite vectors = -1.0 | PASS |
| cosineSimilarity zero-length vectors = 0 | PASS |
| Identical texts cosine ~= 1.0 | PASS |
| Similar texts > dissimilar texts similarity | PASS |
| embedBatch correct count | PASS |
| embedBatch([]) returns [] | PASS |

## Type Check

Only pre-existing errors in `vectorstore.ts` (allowed). No new type errors introduced.

## Coverage

| File | Functions | Lines | Uncovered |
|------|-----------|-------|-----------|
| embeddings.ts | 90% | 77% | Lines 95-108 (buildBctcEmbeddingText) |

Lines 95-108 (`buildBctcEmbeddingText`) are untested -- acceptable as it is a simple string concatenation utility that will be exercised by downstream tasks (012, 048).

## Reviewer Checklist

- [x] Tests pass (`bun test`)
- [x] Type check passes (`bun tsc --noEmit`) — only pre-existing errors
- [x] DDD compliance — placed in `infrastructure/rag/`, no domain imports
- [x] Singleton pipeline with race condition protection (`_loadPromise`)
- [x] Buffer copy in `embed()` prevents shared memory issues
- [x] Model/cache directory configurable via env vars
- [x] No API keys or secrets — fully local ONNX inference
- [x] Barrel export in `index.ts` follows project conventions
- [x] No blocking issues

## Blocking Issues

None.

## Notes

- Model auto-downloads (~400MB) on first run to `EMBEDDING_CACHE_DIR` (default `./data/models`)
- First embed call takes ~1-2 seconds for model load; subsequent calls are fast (~15ms)
- The branch required merging main to incorporate task 041 (Vietnamese number parser) before final merge

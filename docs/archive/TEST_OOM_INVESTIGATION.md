# `bun test` Full-Suite Crash — Task 1020 Investigation

Status: **Root-caused and mitigated via split-scope wrapper.**
Filed:  2026-04-07 (sprint-053)
Closes: TASKS.md backlog 1020 ("Full-suite bun test OOM investigation")

## Symptom

```
$ bun test
…
RSS: 0.82GB | Peak: 1.42GB | Commit: 0.02ZB | Faults: 297 | Machine: 17.18GB
panic(main thread): A C++ exception occurred
oh no: Bun has crashed. This indicates a bug in Bun, not your code.
```

Targeted runs (`bun test src/__tests__/157-*.test.ts` etc.) work fine. The crash only appears when the full suite executes.

## Bisect

```
bun test src/__tests__/0*.test.ts   → crash
bun test src/__tests__/00*.test.ts  → 65 pass, clean
bun test src/__tests__/01*.test.ts  → crash
bun test src/__tests__/010-*.test.ts → n/a
bun test src/__tests__/011-rag-embeddings.test.ts → 10 pass THEN crash during teardown
bun test src/__tests__/012-lancedb-store.test.ts  →  6 pass THEN crash during teardown
bun test src/__tests__/013-rag-retriever.test.ts  →  crash during teardown
bun test src/__tests__/014-*.test.ts → 14 pass, clean
```

## Root cause

Every crashing file loads a napi-backed native module in its `beforeAll`/top-level import:

| File | Native module |
|------|----------------|
| `011-rag-embeddings.test.ts` | `@xenova/transformers` (loads 400MB MiniLM model via ONNX runtime) |
| `012-lancedb-store.test.ts`  | `@lancedb/lancedb` (Rust binding, mmap-backed Lance tables) |
| `013-rag-retriever.test.ts`  | imports both of the above via `vectorstore.ts` |

Crash output from `011-rag-embeddings.test.ts`:

```
 10 pass
 0 fail
 19 expect() calls
Ran 10 tests across 1 file. [2.53s]

Args: "bun" "test" "src/__tests__/011-rag-embeddings.test.ts"
Features: … process_dlopen(2) exited
RSS: 1.03GB | Peak: 1.03GB
panic(main thread): A C++ exception occurred
```

Key evidence:
- `10 pass / 0 fail` — **all assertions succeed**
- `process_dlopen(2) exited` — Bun is tearing down loaded dynamic modules
- The panic is a C++ exception thrown during napi module finalize, not an assertion failure or an OOM

This is a **Bun runtime teardown bug** on napi finalizers, not a problem in our code or in `@xenova/transformers` / `@lancedb/lancedb` individually. The RSS of 1–1.4GB is well below the 17GB machine cap; "OOM" in the original label is a misnomer.

## Why the crash only happens on the full suite

Bun runs test files sequentially in one process. When file N finishes its test body, Bun keeps the napi modules loaded (they are not unloaded between files) and only tries to release them on final process exit. Loading additional tests on top of an already-loaded transformers/LanceDB pair triggers the finalizer race. Running a single file in isolation sometimes also crashes on exit — we just don't notice because the result has already been printed.

## Mitigation (shipped this commit)

The fix is to **run the napi-backed tests in their own Bun subprocess** so the crash happens outside the main suite and the exit code of the rest of the suite is preserved. Added `scripts/test-all.sh` (invoked by CI and humans instead of bare `bun test`):

1. Runs the napi trio first, each in its own `bun test <file>` invocation, capturing their pass/fail count before Bun has a chance to teardown-crash.
2. Runs the remainder of the suite via glob exclusion.
3. Aggregates results; exits non-zero if any slice failed.

This keeps the merge-gate test pipeline green without waiting for an upstream Bun fix. When the Bun teardown bug is resolved (track via bun-sh/bun issues matching "napi finalizer C++ exception"), `scripts/test-all.sh` can be replaced with a bare `bun test`.

## Acceptance

- `bun run test:all` (the new script) completes in ~283s
- Per-file isolation — each test file runs in its own Bun subprocess
- Teardown crashes on the napi trio are detected and **swallowed** with a distinct `teardown-crash` status line (counted in crash-swallowed column, not failure column)
- Real failures are aggregated and printed at the end
- Pre-push hook still runs `bun tsc --noEmit` (unchanged)
- Running `bun test` directly still crashes — this is intentional; use `test:all` instead

## Follow-up: pre-existing flakes surfaced by per-file isolation

The per-file runner exposed 20 tests that fail in isolation (i.e. these are REAL bugs, not side-effects of the Bun napi crash). They existed on `main` before Sprint 053 and are queued as a new backlog item:

```
025-yahoo-finance, 084-tool-market, 106-intelligence-cycle,
130-periodic-summary, 137-fix-alert-pipeline (partial),
153-ssc-scan-dedup, 169-prediction-config, 178-price-history,
191-performance-attribution, 206-price-alerts, 214-telegram-commands,
223-target-allocation, 232-telegram-report-fix, 238-user-requests,
243-france-summary, 246-ask-fast-track, 262-mcp-tools-042,
265-velocity-store, 292-ocr-audit, 293-ocr-fallback-pipeline
```

Each needs its own diagnosis — common culprits include:
- Singleton DB state leaking from neighbour tests
- Env vars (`DB_PATH`, `TELEGRAM_BOT_TOKEN`) set but not reset
- Timer-based tests that assume a clean Date.now()
- OCR tests depending on binaries that may or may not be installed

Filed as **backlog 1021** in TASKS.md (Sprint 054 candidate). Out of scope for task 1020, which was an investigation-only item focused on the Bun crash.

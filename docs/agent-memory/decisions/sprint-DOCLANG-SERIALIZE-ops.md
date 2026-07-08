# Decision Journal — Sprint DOCLANG-SERIALIZE · ops

**Sprint goal:** no goal set
**Agent:** ops
**Started:** 2026-07-08T06:48:55Z

---

### STEP ops-S1 · ops · 2026-07-08T06:48:55Z
**task-id:** FACTORY-PDF-paddleocr-score-07-mask
**what-done:** Rebuilt pdf-extractor container with PaddleOCR score fix (fdb424178) and deployed via docker compose up -d --no-deps; verified new image running healthy, peer containers untouched, board updated for QA handoff.
**what-considered:**
- only: rebuild + single-service swap per standing ops ruling 2026-07-03 (no user gate, direct attempt)
**why-decision:** Fix verified independent (3/3 tests pass, code review confirmed no fabrication) — ops proceeds immediately with deployment per ops workflow.
**why-change:** no change — ops follows standing protocol for container rebuild/swap tasks

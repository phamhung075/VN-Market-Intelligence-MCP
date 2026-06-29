# Decision Journal — Sprint FEAT-NEWS-DECISION-RESUME (QA)

## Entry qa-S1

**date:** 2026-06-29
**agent:** qa
**task-id:** TASK-FEAT-NEWS-DR-HOP1
**verdict:** APPROVED

**what-considered:**
- FR-1: buildDecisionResume() pure helper with DOMAIN_VN_LABEL (17 domains) and truncateAt120() — co-located in domain/services/newsNormalizer.ts, no infra/interface imports.
- FR-2: ADD COLUMN decision_resume TEXT (idempotent try/catch, no UNIQUE constraint — correctly avoiding SQLite silent no-op trap).
- FR-3: DTO carry in newsSentimentHandler.ts — RagAnalysisRow + NewsSentimentItem + SELECT + mapper + header comment fix.
- Tests: FEAT-NEWS-DR-builder.test.ts (11 cases: 5 FR-1 concrete + 5 edge + 1 DOMAIN_VN_LABEL coverage) + TASK-17 extended (AC-NEW-1/2). All 30 pass / 0 fail.
- tsc: clean.
- DDD: newsNormalizer.ts imports only domain/models/shared-types, bctc-schema, and domain services — no infra/interface imports.
- Security: no process.env in modified files, parameterized INSERT with 20 `?` placeholders, mock-guard PASS.
- ADD COLUMN: plain TEXT, no UNIQUE (SQLite silent-no-op trap avoided — explicitly documented in comment).
- End-to-end pipeline proof: integration script ran normalizeNews(bullish mock item) → INSERT → queryNewsSentiment on in-memory DB. decision_resume = "Tích cực cho VCB, FPT: tăng, tăng trưởng" (40 chars, correct FR-1 template, plain Vietnamese, NFR-1 clean).
- Live DTO shape: decision_resume field present in all 20 served items (legacy rows correctly null per NFR-4 backfill policy).
- Container healthy: image 2916e192a697, up 4 min post-rebuild by ops.

**why-change:** no change from plan — all checks green, pipeline proven, DoD met.

**residual:**
- Live rows currently null (all legacy pre-rebuild). Per NFR-4 backfill policy, this is expected and correct. Frontend (HOP2) must guard with `item.decision_resume != null && ...` per RISK-5.
- HOP2 (dev-frontend) is now UNBLOCKED.

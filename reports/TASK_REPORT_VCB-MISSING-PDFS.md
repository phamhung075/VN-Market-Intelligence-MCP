## Task Report VCB-MISSING-PDFS

**Commit (resolved by path, not trusted claim):** `8f6dae6587ed8c489b5ecfce1be4106b2d51d2e8`
(`git log -3 -- apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts`, top hit, matches the reported `8f6dae658` prefix)

**Scope:** 10 files, exact match to claim:
- apps/mcp-server/src/__tests__/1019-bctc-reparse-job.test.ts
- apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts
- docs/agent-memory/decisions/sprint-FLOW-PRICE-ALPHA-LOOP-dev-mcp-server.md
- docs/agent-memory/notebooks/dev-mcp-server.md
- docs/agents/dev-mcp-server/flow/main.md
- docs/architecture/microservice/mcp-server/financial-reports.md
- docs/data/orch/archive/backlog-detail.json
- docs/data/orch/orch-state.json
- scripts/migrations/__tests__/reap-dead-stranded-bctc-rows.test.ts
- scripts/migrations/reap-dead-stranded-bctc-rows.ts

`scripts/router-mint-d0b-supplement-exclude-relabel-ids.jq` is confirmed NOT part of this commit — it is untracked (`??`) in the working tree with zero git history anywhere (`git log --oneline -- <path>` empty). Unrelated stray file, correctly excluded from scope.

### Tests (RAW re-run, not trusted)
- `cd apps/mcp-server && bun test src/__tests__/1019-bctc-reparse-job.test.ts` → **21 pass / 0 fail, 53 expect() calls** (matches dev claim exactly)
- `bun test scripts/migrations/__tests__/reap-dead-stranded-bctc-rows.test.ts` → **9 pass / 0 fail, 13 expect() calls** (matches dev claim exactly; bun reports "across 2 files" — non-blocking, both files 0-fail)
- `cd apps/mcp-server && bun tsc --noEmit` → **clean, 0 errors** (no output)
- `bash scripts/audits/mock-guard.sh --files "apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts scripts/migrations/reap-dead-stranded-bctc-rows.ts"` → **PASS, exit 0**
- DDD grep (`from.*infrastructure` / `from.*application`) on the two production files: infra imports present but ALL pre-existing (identical import block exists in the pre-commit revision `56e7f7633`); the new `fileExistsFn` guard reuses the already-imported `existsSync` from `node:fs` — no new domain→infra edge introduced.
- Security grep (`process.env`, `password|secret|token`): 0 real hits (only unrelated comment prose containing the substring "token" in a Vietnamese Q-token parser docstring).

### Live-DB RAW-verify (docker exec, named-volume `market.db`, not badge-trusted)
Container `vn-market-intelligence-mcp-mcp-server-1`, `/app/data/market.db`:
- `agent_feedback id=323`: `status='dead'`, `reparse_attempts=271` — **confirmed retired**, was `'new'`/271 attempts before.
- `agent_feedback id=534`: `status='new'`, `reparse_attempts=0` — **confirmed untouched**, legitimately new (file present).
- `/app/data/pdfs/VCB_2025_Q4.pdf` → `ls`: "No such file or directory" — **confirmed genuinely absent**.
- `/app/data/pdfs/VCB_2025_Q1.pdf` → `ls`: present, 8,505,770 bytes — **confirmed present on disk**.
- `financial_reports` table (no `ticker` column; joined on `pdf_path LIKE '%VCB%'`): canonical Q4-2025 row `id=bdcfa5e0-093f-4da1-9412-07197c8e4c48`, `pdf_path=/app/data/pdfs/20260130-VCB-CBTT-&-BCTC-Hop-nhat-Q4.2025.pdf`, `validation_status=passed`, `extraction_confidence=0.625` — **intact, no real data lost**. Sibling Q1-2025 row (`8c35c86c-...`) also intact under its own canonical filename.

### Verdict
**APPROVE — DONE_VERIFIED (deploy-pending).** All scoped tests green (matches dev's claims exactly, independently re-run), tsc clean, mock-guard PASS, no DDD/security regressions, and the live-DB data cleanup for id=323 is independently confirmed retired with no collateral data loss. The `DEAD_AT_ATTEMPTS(10)` code guard itself only takes effect for FUTURE occurrences after an mcp-server image rebuild — that rebuild is user-gated/market-sensitive and is explicitly NOT run by QA. Marked deploy-pending, same pattern as the flow-alpha wave-1 / FIX-MCP-BOOTSTRAP rows.

QA did NOT push to origin and did NOT run `docker compose up -d --build` or any deploy/rebuild command.

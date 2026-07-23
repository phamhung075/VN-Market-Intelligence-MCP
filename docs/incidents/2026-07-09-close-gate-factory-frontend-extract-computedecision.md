# 2026-07-09 — FACTORY-FRONTEND-extract-computeDecision Docker Close Gate

> Migrated from `docs/agent-memory/notebooks/ops.md` (TE-T17 notebook prune, 2026-07-23) — content unchanged from the original notebook entry.

Rebuilt+deployed `frontend` service after dev-frontend moved `computeDecision`/`DecisionResult` from `dashboard.analysis.tsx` route into `app/domain/analysis/decision.ts` (pure move, no behavior change). Image `871d76885836` healthy 2min post-deploy; SHA-gate PASS (`vn.market.git_sha` label = HEAD `5d9ec1859`); `/dashboard/analysis` HTTP 200 with correct page content; all 12 peer containers unaffected (pre-existing uptimes unchanged, only frontend restarted). Board `next_agent` ops→qa.

Note: this entry + the corresponding decision-journal STEP ops-S2 were written by dev-team (router) per DJ-GATE-1 fallback — the dispatched ops agent completed the actual rebuild/verify work correctly but its terminal report bled in unrelated pdf-extractor content and it never wrote its own journal/notebook entries for this task. This notebook had drifted to 836L (well past the 200L cap) — `scripts/agents-flow/notebook-auto-prune.sh` (PostToolUse AC-3 backstop) auto-pruned oldest sections down to ~162L on this edit; full pre-prune history remains recoverable via `git show 57ecda1f4:docs/agent-memory/notebooks/ops.md`.

Zone: `apps/frontend/` | Subsystem: Docker Close Gate | Code commits: 2819d710c, a27e93762, 5d9ec1859

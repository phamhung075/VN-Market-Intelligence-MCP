# agents-architect — Notebook

## 2026-05-10

### Session: git-log-as-review-surface

**Brief authored:** `docs/architecture-briefs/2026-05-10-git-log-as-review-surface.md`

**Signal dropped:** `docs/signals/agents-architect-2026-05-10T0000-phase-a.json` → agent-father

**Key decisions recorded:**
- User scrapped prior TASKS.md drift reconciler plan. New direction: git log as canonical review surface.
- Phase A (convention) must ship before Phase B (delete) — strict sequencing enforced.
- No git alias work (user did not request, not included).
- Enforcement hook noted as Phase A.2 future work only, not specced.

**Phase B gate:** User must sign off after >=1 week conforming commits. Phase B signal held by agents-architect.

**Files agent-father must touch (Phase A):**
- CREATE: `.claude/knowledge/commit-convention.md`
- EDIT: `CLAUDE.md`, `dev-standards.md`, `developer/main.md`, `developer/microservice-main.md`, `qa/main.md`, `pm/main.md`, `tree-map.md`

**Flows confirmed as needing update (grepped):**
- `developer/main.md` line 45: `git add -p && git commit — format per dev-standards.md`
- `developer/microservice-main.md` lines 50+55: same pattern
- `qa/main.md` line 58: merge commit `merge(NNN): <title>` — needs convention pointer
- `pm/main.md` step 3b: no commit step but handoff AC should note trailer relationship

---

## Recent session — 2026-05-10

**Task:** git-log-as-review-surface architecture brief — COMPLETE

- Mapped 10 current tracking surfaces; identified 3 redundant for in-flight (TASKS.md Done, handoffs, session logs) and 1 redundant for memory (sessions vs notebooks).
- 2-phase plan: Phase A (commit convention SSOT — 8 file edits/creates), Phase B (factory delete — gated on user sign-off after ≥1 week conforming commits).
- Phase B C4 collapse (sessions→notebooks) activated early per user approval — lowest-risk collapse.
- Reuse audit: git-native trailers, existing `.claude/knowledge/` pattern, existing signals bus, existing notebooks — zero new infrastructure.
- Signal dropped: `docs/signals/agents-architect-2026-05-10T0000-phase-a.json` (Phase A, now complete).
- Phase B C4 signal: `docs/signals/agents-architect-2026-05-10T2202-phase-b-c4.json` → agent-father executing B11+B8+B9.

---

## Backfill — c33 — 2026-05-11

### Session: price-drop-precision-tuning

**Brief authored:** `docs/architecture-briefs/2026-05-11-price-drop-precision-tuning.md`

**Sprint scope:** 1868 (candidate task — research brief, no code shipped)

**Key decisions recorded:**
- `price_drop` precision persistent at 50% (8/16) across 4 cycles — calibration problem, not a bug.
- Root cause: default threshold -5% too low; adaptive thresholds and per-watchlist overrides exist in code but are not wired into `scanMarket.ts` line 283 (calls `detectSignals(snapshot)` with no context).
- Four FP pattern buckets identified: thin-threshold borderline drops, sector-wide synthetic signals, stale weekend prices, ex-dividend adjustments.
- Ranked ship plan: Option A (raise DEFAULT_DROP_PCT to -7%) first; Option B (wire per-watchlist thresholds) as follow-on; Option C (VNINDEX guard) deferred.

---

## Backfill — c33 — 2026-05-11

### Session: reuters-te-unreachability

**Brief authored:** `docs/architecture-briefs/2026-05-11-reuters-te-unreachability.md`

**Sprint scope:** 1862f ancestor — RSS/circuit-breaker RCA

**Key decisions recorded:**
- Post-container-restart counters 16/16/16: `reuters` and `tradingEconomics` labels are backward-compat aliases for Google News RSS + MarketWatch RSS endpoints — original Reuters/TE endpoints replaced in prior sprints.
- Design mismatch: module-level error counters reset on restart; CB also resets → fresh fetch storm immediately re-trips breaker on every restart.
- Ranked recommendation: Option A (wontfix + degrade gracefully — mark permanent, gate on `enabled: false` in mcp.config.json) preferred over URL swap (Option B) or CF Workers proxy (Option C); probe must confirm verdict.
- Conditional escalation path: host-OK/container-BLOCK → Option B; both-BLOCK → stay with Option A.

---

## Backfill — c35 — 2026-05-11

### Session: 1871-reconciliation

**Brief authored:** `docs/architecture-briefs/2026-05-11-1871-reconciliation.md`

**Sprint scope:** 1871 reconciliation batch (7 tasks, SPRINT-S)

**Key decisions recorded:**
- 7 drift points identified and tasked: ARCHITECTURE.md counts stale (D1), infra/ folder tree missing 7 subdirs (D2), analysis/backtesting modules absent from doc (D3), cron-registry.json missing 12+ jobs (D4), tran-ngoc-bau flow calls `get_agent_signals` with wrong params (D5 — runtime Zod failure), DDD violation in domain importing infra (D6), alert-policy.md describes verdict storage flow backwards (D7).
- All 7 tasks within SPRINT-S envelope (≤30 lines, ≤5 files). File conflict risk on ARCHITECTURE.md: 1871a→b→c must run sequentially.

---

## Backfill — c35 — 2026-05-11

### Session: 1873a-tsc-reconcile

**Brief authored:** `docs/architecture-briefs/2026-05-11-1873a-tsc-reconcile.md`

**Sprint scope:** 1873 TSC hook/shell divergence RCA

**Key decisions recorded:**
- Pre-push hook runs `bun tsc --noEmit` from repo root picking up phantom `/repo/tsconfig.json` (no `src/` at root → zero files → zero errors → false green). Real tsconfig at `apps/mcp-server/tsconfig.json` has 23 real errors across 7 files.
- 4 root-cause clusters: WatchdogPorts missing `readReuters` (8 × TS2353), `noUncheckedIndexedAccess` unguarded accesses (9 errors), discriminated union not narrowed in H3 test (4 × TS2339), `exactOptionalPropertyTypes` + type-widening violations (2 errors).
- 5 tasks decomposed: 1873b–1873e fix errors; 1873f fixes hook CWD to `apps/mcp-server/` before next push.

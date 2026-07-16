# BA — Notebook

**Last updated:** 2026-07-16 | **Sprint:** ULTRACODE-AUDIT-FIXALL

## UC-CRITIC-GATEWAY-CONTRACT-DRIFT · 2026-07-16

Spec complete. REQ file: `docs/handoffs/UC-CRITIC-GATEWAY-CONTRACT-DRIFT-BA-spec.md`. Zero PO blockers. NEXT: architect.

Dev-team router relay (BOUNDED-1 auto-pickup). Determined `mcp__gateway__call_tool` is canonical with high confidence (not just "likely"): git archaeology found commit `775e2d8ee` (2026-06-16) is an explicit, dated, fleet-wide rename `mcp__claude_ai_gateway__call_tool`→`mcp__gateway__call_tool` across CLAUDE.md + 13 `.claude/agents/*.md`; the flagged `docs/standards/gateway-call-contract.md` was created 2 days earlier (`ad96bd166`, 06-14) and was simply out of scope of that rename sweep — then compounded the drift on its own 07-08 edit (§6 Degraded-Mode addition, `a6031047e`, still used the stale prefix). `.mcp.json` corroborates: only registers server name `"gateway"`, no `"claude_ai_gateway"` entry anywhere in repo config (checked `~/.claude.json` project-scope = `{}`, global `~/.claude/claude.json` only has `zenmidi`). Fix table: 6 live files need the swap (gateway-call-contract.md L13/30-32/94, mcp-tools.md:28, task-lock-protocol.md:162 — distinct file from SKILL.md, guide-agent-definition-frontmatter.md:23/25, REQ_DYN-WF-FOUNDATION.md:134/332, quality-checklist.json:2347); ~40 historical/archival files (signals/processed, decisions, briefs, handoffs, reports, incidents) explicitly excluded — never rewrite dated point-in-time records. Flagged non-blocking coordination note: same audit brief already change-specifies 2 OTHER files with the identical drift (I11: `.claude/skills/task-lock/SKILL.md:169`; I14: `docs/agents/tran-ngoc-bau/flow/bootstrap.md:30`) — neither has a board row yet, architect's call whether to batch them in.

Decision journal (task_id: UC-CRITIC-GATEWAY-CONTRACT-DRIFT): see `docs/agent-memory/decisions/sprint-ULTRACODE-AUDIT-FIXALL-ba.md`.

## UC-ASL-P2 · 2026-07-16

Spec complete. REQ file: `docs/handoffs/UC-ASL-P2-BA-spec.md`. Zero PO blockers. NEXT: architect.

BOUNDED-1 idle-pickup relay (dev-team promoted from backlog, WIP was 0). Task: extract one blessed `scripts/emit-audit-signal.sh` replacing 6 copy-pasted EMIT SEQUENCE blocks across `docs/agents/system-auditor/flow/main.md` (:292-328 Tier-2 data_stale, :592-628 Tier-3 db_integrity_breach, :412-416 D-IMPROVE E-3-only, :344 D-BCTC-EVAL E-3-only) and `tier1-probe.md` (:139-171 general A-xx, :86-108 A-20) + a durable BUG-dedup ledger (`docs/data/auditor-dedup-ledger.json`, flat `{dedup_key: last_sent_ts}`, 7d self-pruning, tmp+mv atomic write — NOT routed through `orch-apply.sh`, that wrapper's scope is orch-state.json only). Verified real inter-copy drift live (signal_type disagrees: `data_stale`/`db_integrity_breach` vs `signal_feedback` — separately tracked as I3, out of scope here, script must pass the literal through, never auto-correct it). Confirmed sites 3/4 (D-IMPROVE/D-BCTC-EVAL) never had E-1/E-2 today — script needs an E-3-only mode so consolidation doesn't introduce new Telegram spam or change D-BCTC-EVAL's distinct unconditional WORK-channel post. Confirmed `docs/data/system-auditor-known-issues.json` (223L, stale since 2026-05-01) is safe to delete — 0 flow files read it; recommended deleting (not repointing) `context-bloat-backstop.sh`'s dead fingerprint-suppression gate rather than repointing it at the new ledger, since the two fingerprint namespaces (`context_bloat:<path>` vs `<type>:<id>:<check_id>`) are semantically unrelated. Flagged 3 architect-ratify items (not PO blockers): dead-gate deletion vs repoint, severity-escalation-inside-dedup-window bypass rule, and ZONE — none of the 8 touched files are `apps/<service>/` (all `scripts/`/`docs/agents/system-auditor/`/`docs/references/`), so recommended architect narrow the dispatched `cross-service/` zone label to `scripts/ + docs/agents/system-auditor/` for PM's parallel-dispatch zone-isolation check.

Decision journal (task_id: UC-ASL-P2): see `docs/agent-memory/decisions/sprint-ULTRACODE-AUDIT-FIXALL-ba.md`.

## BA-ANALYSIS-QUALITY-CONVERGENCE · 2026-07-11

Spec complete. REQ file: `docs/handoffs/BA-ANALYSIS-QUALITY-CONVERGENCE.md`. Zero PO blockers. NEXT: agents-architect.

Key BA findings (live-probed 2026-07-11): built a 9-tool × 6-flow coverage matrix via grep — bctc-analyst is a total silo (0/9, zero gateway market-data tool calls of any kind); market-watcher/digest-predict missing 2 P0 tools (foreign_room, sentiment_index) the roadmap already names them as intended consumers of. The OHLCV-depth gate that `held_by:po-s135`'d `IND-P1-MOMENTUM-CONSUMER-WIRING` is now SATISFIED (live depth 750-762 bars/code) — 3/4 P1 momentum tools return real non-null data; only `get_foreign_accum_rank` still empty (`tickers:[]`, blocked on `FIX-FOREIGN-FLOW-COVERAGE` rebuild, ops-gated). `get_insider_sentiment` is wireable but `insider_transactions`=0 rows live (root cause already tracked: `FIX-VPS-SSC-INSIDER-502`, BACKLOG — cross-referenced, not re-diagnosed). `CCATO-T3-FLOW-WIRING-6PT` (subsumed) hard-depends on `CCATO-T2-CLAIM-TRUTH-SKILL`, which doesn't exist yet (skill file missing) — added as an in-spec FR-4 prerequisite rather than a PO round-trip. `GAP-CHEF-SYNTHESIS-A` is code-shipped but zero live synthesis JSON exists on disk — B's endpoint work stays gated on that closing first (confirmed still-accurate, not stale). market-analyst's prior "excluded pending tool-call-mechanism verification" note is resolved — its 4 P0 tools already call via the correct gateway mechanism with graceful degrade.

Decision journal (task_id: ANALYSIS-QUALITY-CONVERGENCE): see `docs/agent-memory/decisions/sprint-ANALYSIS-QUALITY-CONVERGENCE-ba.md`.

## Archive

Pre-2026-06-24 specs (FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION, FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER, FIX-ERRAUDIT-W2-FRONTEND-SAFEFETCH, FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367, FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0, FIX-ERRAUDIT-W1-PEK-P0, FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE, FIX-ERRAUDIT-W1-MCP-P0, Cycle-2026-06-05-THRU-14): See `docs/archive/notebooks/ba-2026-05-21.md` and git history (commits 4b13a23–9a1e5e8; prior notebook revisions pre-2026-07-01). Cycles 2026-06-24 through 2026-06-30 (FIX-MACRO-SNAPSHOT-DELTAS-NULL, FRONTEND-FRESHNESS-TRANSPARENCY, FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT, FEAT-NEWS-DECISION-RESUME, MARKET-INDICATOR-DEPTH-P0, DEFERRED-TASK-SCHEDULER-MVP, BA-IND-P1-MOMENTUM-RS, BA-PREDICTION-EVIDENCE-REVIVAL): pruned from live notebook 2026-07-02 (200L cap discipline) — full text in git history (commit history for this file, pre-2026-07-02 revision). Cycle 2026-07-01 (BA-FIX-BCTC-BANK-SUMMARY-MAPPING, BA-DASH-CRON-RECHECK-TABLE): pruned from live notebook 2026-07-11 (3-section retention) — full text in git history (this file, pre-2026-07-11 revision). Cycles 2026-07-02/07-09 (BA-MERGE-MONEY-RADAR-INTO-MOMENTUM, BA-FIX-BCTC-BANK-SCALAR-MAPPING): pruned from live notebook 2026-07-16 (3-section retention) — full text in git history (this file, pre-2026-07-16 revision).

## Known patterns / preferences

- Error format all MCP tools: `{ error: '...' }` JSON, never throw.
- apps/macro-indicators is standalone Hono service port 5004, NOT part of mcp-server.
- apps/mcp-server zone = dev-mcp-server; kinh-dich-service zone = separate dev owner (port 5005).
- mark_alert_outcome → SQLite `alerts` table; write_alert_verdict → `docs/data/alert-verdicts.json` file store. DISTINCT.
- OHLCV date column is TEXT YYYY-MM-DD (string-sortable).
- TASKS.md cap = 80L; notebook cap = 200L — check wc -l before adding rows.
- Live DB probe pattern: `docker exec <mcp-server-container> bun -e "import {Database} from 'bun:sqlite'; ..."` against `/app/data/market.db` (named volume) — no sqlite3 CLI in container; sqlite3 CLI not installed, use bun:sqlite inline.
- Frontend route-file precedent: page routes may colocate DTO+parser+formatter+fetcher+component in ONE file (dashboard.momentum.tsx, dashboard.money-radar.tsx) and cross-import from sibling route files (momentum imports formatZScore from dashboard.indicator-gauges.tsx) — no shared lib/ module is required for page-scoped logic.

<!-- lazy-loaded reference for AUDIT_TIER=DATA (cron-db-data-integrity.md). cap: 120L (flow-file) — within cap.
     FIX-AUDITOR-EMPTYTABLE-CHECK-NO-WRITER-DISCRIMINATOR (2026-08-06, agent-father): the
     AUDIT_TIER=DATA check family (`.claude/commands/crons/cron-db-data-integrity.md`) had ZERO
     entry anywhere in the canonical registry (`docs/agents/system-auditor/audit-dimensions.md`
     D1-D5/D-PAGE/D-FLEET cover TIER 1-5 only) and its "FAIL/MISSING" anomaly class had no
     writer-provenance discriminator — every 0-row table was reported CRITICAL regardless of
     whether it had a production writer at all. Two false positives shipped 2026-08-06
     (price_alerts, alert_engine_records) — see origin signals sys-20260806T065701-7915 /
     -55e4 / -49e3, disposition in `docs/data/orch/orch-state.json` task_board row
     FIX-AUDITOR-EMPTYTABLE-CHECK-NO-WRITER-DISCRIMINATOR. `audit-dimensions.md` is already at
     its own 200L hard cap (see that file's header) — this dimension is documented HERE instead,
     split per that file's own instruction ("any future addition should split, not grow it").
     STATUS: policy authored, NOT YET wired into the live actuator — see §5 Implementation Gap. -->
> Parent: [../../../../.claude/agents/system-auditor.md](../../../../.claude/agents/system-auditor.md)

# D-DATA — Live DB Data-Anomaly Sweep (AUDIT_TIER=DATA, detect-only)

**Cadence:** CADRAT-2 split — Job A `15,45 2-9 * * 1-5` (weekday session+settlement), Job B `15 22 * * *` (daily off-hours backstop). Both registered in `.claude/commands/crons/cron-db-data-integrity.md`, which is this dimension's live spec host (see §5 — NOT `flow/main.md`'s AUDIT_TIER dispatch table, unlike Tiers 1-5).
**Scope:** 17 named tables, 4 anomaly classes (FAIL/MISSING, STALE/UNAVAIL, DUPLICATE/REPEAT, INCORRECT/ALEATOR) — full list in the cron file.
**This doc's scope:** ONLY the FAIL/MISSING class's severity-assignment gap. The other 3 classes and the DEDUP/history-append/signal-write mechanics are unaffected and stay exactly as documented in the cron file.

---

## 1. Writer Provenance Discriminator (the fix)

Before a 0-row table finding is allowed to reach CRITICAL, classify its writer:

| Class | Test | Severity ceiling |
|---|---|---|
| (a) Scheduled/pipeline writer | ≥1 `INSERT INTO <table>` site under `apps/**/scheduler/**` or a registered cron job (excluding `*_test.go`/`*.test.ts`/`__tests__/`) | May stay CRITICAL — 0 rows here is a real outage |
| (b) No production writer | Every `INSERT INTO <table>` site found is test-only (matches the test-file exclusion above), or zero sites exist at all | INFO at most, never CRITICAL/WARN — table is expected empty by construction |
| (c) On-demand user-facing tool | ≥1 non-test writer site, but it is reached only via an MCP tool a user invokes on demand (path under `apps/**/interface/mcp/tools/**`, never called from `apps/**/scheduler/**`) | INFO/WARN — 0 rows means "nobody has used the feature yet," not "pipeline broken." Only escalate if a corroborating signal proves demand occurred (e.g. a companion table shows related activity) |

**Missing-table vs empty-table (distinct classes, do not conflate):** run `SELECT 1 FROM sqlite_master WHERE type='table' AND name='<table>'` before any `COUNT(*)`. No row → label `SCHEMA-MISSING` (a migration/schema gap, always report — never silenced by this discriminator) — NOT the same finding as a table that exists with 0 rows. The two were rendered identically before this fix (`pdf_documents` reported "failed, actual=0" when the table did not exist at all).

**Negative control (mandatory, do not let this fix over-silence):** class (a) tables — e.g. `daily_ohlcv`/`market_prices` — must still fire CRITICAL when genuinely empty. A discriminator that suppresses ALL empty-table findings trivially "fixes" the false positives and breaks the real detector; verify class (a) is untouched before shipping any actuator change.

## 2. Known table classifications (seed — extend as new tables are audited)

| Table | Class | Writer evidence |
|---|---|---|
| `price_alerts` | (c) | `apps/mcp-server/src/interface/mcp/tools/market-data/priceAlertTools.ts:148` (on-demand) |
| `alert_engine_records` | (b) | Every `INSERT INTO` site is `apps/alert-engine/pkg/infrastructure/sqlite_test.go` — no production writer exists |
| `deep_fetch_stats` | (a)-adjacent, unresolved | `apps/mcp-server/src/infrastructure/db/deepFetchQueueStore.ts:173` is a genuine writer; 0 rows may be real (WARN, single-fire — re-verify next cycle before minting a FIX per the WARN/single-fire rule) |
| `daily_ohlcv`, `market_prices` | (a) | Scheduled fetch jobs — stays CRITICAL if empty (negative control) |

## 3. Also flagged (same live-evidence sweep, worth fixing alongside the discriminator)

The C-04/C-08 labels used ad hoc inside `cron-db-data-integrity.md`'s own "CANONICAL-4 VERIFICATION" narration (`db1`/`db2`/`db3`/`c04` from `scripts/db-integrity-counts.sh`) are **not** the same checks as `flow/main.md`'s official Tier-3 `C-04`/`C-08` (low-confidence BCTC rows / orphaned alerts respectively) — the shared "C-0N" naming across two independent check families reads as raw row counts but isn't. Whoever transcribes §1 into the cron file should also rename the informal `c04` label in that script's output to something non-colliding (e.g. `low_confidence_count`) to stop the misread.

## 4. Implementation gap (out of agent-father's commit_zone)

This dimension's live spec is inline free text in `.claude/commands/crons/cron-db-data-integrity.md` §ANOMALY CLASSES point 1 (FAIL/MISSING) — not a script, not `flow/main.md`. That path is outside agent-father's `commit_zone` (`docs/agents/`, `docs/agent-memory/`, `.claude/skills/`, `.claude/agents/` only). §1-§2 above are the authoritative policy; landing them requires either (preferred, per the cron file's own "Deeper integration" note) moving the check battery into a real `AUDIT_TIER=DATA` branch in `flow/main.md`, or at minimum transcribing §1's table into the cron prompt text. Flagged via `docs/signals/2026-08-06-fix-auditor-emptytable-writer-discriminator-handoff.json`. Replay verification (the two 2026-08-06 CRITICALs must not re-fire; a genuinely-broken class-(a) table still must) can only happen after that lands — not run by this doc.

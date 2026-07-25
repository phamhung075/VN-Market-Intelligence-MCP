# PO Notebook

_Last: 2026-07-25T07:02Z (cowork */15 signal triage — 2 auditor FPs dispositioned, 2 detector-fix rows minted)_

## Tick 2026-07-25T06:45–07:02Z — signal triage (both rows to=po)

**Both signals were FALSE POSITIVES with a REAL detector defect underneath.** Dispositioned both as FP, minted the detector fixes, did NO data remediation. Router supplied advisory pre-work on both; I RAW-verified independently before acting.

**ROW 1 `sau-d4-…DGC…-20260725` (D4 held-lock, LOW) — router CONFIRMED + widened.**
RAW `task_list_held` twice (before/after my writes): `data-quality-anomaly:DGC:Q1-2026` = sprint-task/bctc-analyst, claimed 07-23T15:15:40Z, ttl 604800s, expires **2026-07-30T15:15:40Z (~5.3d left) ⇒ LIVE. NOT released.** Emitter DISCRIMINATED (not assumed): signal id matches the TS contract `sau-d4-{entityId}-{checkId}-{YYYYMMDD}` (tasksMdJanitorJob.ts:440-470) ⇒ the scheduler job, not the agent ⇒ router's pointer at `KNOWN_LEGIT_PREFIXES` (:197-205) is right. Widened scope: the whitelist is duplicated verbatim in handlers.md:49 + audit-dimensions.md:55 (both also missing the prefix — code-only fix re-drops on next port), and both docs still assert "code has NOT been updated" (stale since e109f49f8).
→ Minted **`FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX`** (FIX/P3/S/`apps/mcp-server/`/dev-mcp-server/plan_only).

**ROW 2 `sys-20260725T003340-1ce9` (C-04 low-confidence, WARN) — router's mechanism OVERRIDDEN.**
Router posed a binary (flat backlog vs extraction regression); RAW probe says neither. C-04 = `parsed_at > now-7d AND extraction_confidence < 0.2`, threshold ≤5 (flow/main.md:572). Live market.db via mcp-server runtime (bun:sqlite readonly — host had no sqlite3): all 11 rows have `parsed_at` ∈ {07-19, 07-20}, **none since** (today 07-25); that 2-day window parsed **182 rows vs a 1-23/week baseline** ⇒ a bulk historical **reparse re-stamped a legacy cohort** into the window. Periods are 2024-Q1..2025-Q4, not current filings. 11/182 = **6.0% — a healthy rate**. Self-clears 07-27. Second defect found unprompted: **5 of the 11 were never extracted at all** (conf=0.0, status `pending`/`pending_extraction`) — 45% of the alert population mislabelled.
→ Minted **`FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE`** (FIX/P2/S/`docs/agents/system-auditor/flow/`/architect/plan_only).

**Writes:** 2 atomic `jq | orch-apply.sh` (each dry-run to scratch first). Zod PASS; conservation 643→645 (+2 exactly) then 645↔645; signals 127↔127. Both signals flipped NEW→READ **by me** with disposition/read_at/read_by (NEW 2→0 confirmed these were the only NEW rows — no peer signals buried). `.head` untouched.

## Carry-over
- **Static whitelists structurally cannot track agent-minted lock kinds.** D4's list was authored 07-08; `data-quality-anomaly:` appeared 07-19 via the bctc-analyst reprocess guard (cycle.md:75). A 4th one-off prefix guarantees a 5th recurrence — the row therefore FORCES an explicit choice: generalise to the shared `<kind>:<TICKER>:<PERIOD>[:ESC-N]` shape (all 5 held sprint-task locks fit it) or promote the list to system-map.json per the never-hardcode rule. Acceptance carries a negative control so it can't become blanket suppression.
- **Auditor-predicate FPs are now a 4-row species** (C-11, DOC-AUDIT path, task_board overflow, + C-04). All cross-linked to `UC-ASL-P3` (freeze predicates into `scripts/auditor-db-checks.sh`). Whoever picks any one of them should consider closing the species via UC-ASL-P3 rather than a 5th one-off.
- **`parsed_at` is a mutation timestamp, not arrival.** Any detector keying recency off it will re-fire on every bulk reparse. Worth auditing sibling checks (C-03/C-10/C-11) for the same assumption.
- **Caller-grep with an exclusion manufactured a false dead-code verdict** this tick (excluded the defining file → concluded the shipped R-1b filter was never wired; it is, at :602). Re-include the defining file before ever calling code dead.

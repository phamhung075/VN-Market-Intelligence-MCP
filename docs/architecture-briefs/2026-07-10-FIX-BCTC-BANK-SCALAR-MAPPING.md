<!-- size-justification: LIGHT SPIKE per BA mandate (reconcile+extend, not re-derive) — carries fresh live-probe evidence (docker exec against named-volume market.db) inline for RAW-verify by downstream pm/dev/qa without re-running the probe, same precedent as the twin sprint's 2026-07-01 brief. -->
# Architecture Brief — FIX-BCTC-BANK-SCALAR-MAPPING (LIGHT SPIKE: FR-8 pipeline-health + FR-9 fallback re-scope)

**Task:** FIX-BCTC-BANK-SCALAR-MAPPING | **Date:** 2026-07-10T00:11Z
**Mandate:** BA spec `docs/handoffs/BA-FIX-BCTC-BANK-SCALAR-MAPPING.md` — LIGHT SPIKE. Do **not** re-derive zone/mapping-logic (already settled by the twin sprint's 2026-07-01 SPIKE). Value-add this cycle: FR-8 (pipeline-health diagnosis, AC-15) + FR-9 (deterministic-reflow fallback scope) + AC-14 (dedup advisory) + AC-16 (report_id freshness).
**Method:** `docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e ...` against `/app/data/market.db` (same named-volume mount the live tools read) + direct grep/read of the serve-path/dispatcher source, cross-referenced with signal files on disk (`docs/signals/processed/cowork-team-*.json`) and `docs/data/cowork-schedule.json`'s `last_fired` field.

---

## 0. Zone — RECONCILED, not re-derived (per BA §1)

`apps/mcp-server/` only, confirmed unchanged. `apps/pdf-extractor` stays ruled OUT — the twin sprint's `bctc_md_tables IS NULL` evidence is still true today (re-checked: `bctc_md_tables` has no live query dependency added since; not re-probed, no new signal to contest it). No zone-split work happens this cycle.

---

## 1. FR-8 — Pipeline-health diagnosis (AC-15) — VERDICT: **(a) same harness-level gateway-blind defect, corroborated by fresh direct evidence — pipeline currently CANNOT execute end-to-end**

### 1.1 Live corroboration, independent of BA's citations

**`bctc_refined_units` daily write counts (RAW, `market.db`):** steady drain 06-11→07-04 (7-85/day), then **zero rows on every single day 07-05 through 07-10** (today). Last write: `2026-07-04 14:08:34`.

**`cowork-schedule.json` `.slots[].last_fired` — ALL 4 refine-bctc slots frozen 07-03/07-04, and so is EVERY OTHER slot in the schedule:**
```
refine-bctc-slot-4: 2026-07-03T16:37:22Z   refine-bctc-slot-1: 2026-07-04T09:05:48Z
refine-bctc-slot-3: 2026-07-04T11:04:41Z   refine-bctc-slot-2: 2026-07-04T14:04:41Z  (matches bctc_refined_units last write, +4min)
Max last_fired across ALL 23 cowork slots (any agent) = tnb-audit 2026-07-07T20:17:30Z.
Zero successful fires of ANY slot since then, despite ~80 dispatcher tick-report signals on disk
between 2026-07-08T00:02Z and 2026-07-09T21:00Z (most recent tick-report available).
```

**Direct named hit — `docs/signals/processed/cowork-team-20260708T090000Z.json`:**
```
matched_slots: [refine-bctc-slot-1]  spawned: []  skipped: [refine-bctc-slot-1]
skip_reason: "session-wide gateway-blind defect, still unresolved. New agent occurrence this
  session: refine_bctc_md (Tools: Read, Write, mcp__gateway__call_tool — zero Bash) shares the
  same affected no-Bash/mcp__gateway__call_tool-only profile as alert-commander, unified-agent,
  news-scout, market-watcher... Confirms defect breadth extends to refine_bctc_md leaf worker."
classification: SKIPPED-GATEWAY-BLIND
```
**Most recent available signal — `docs/signals/processed/cowork-team-20260709T210000Z.json` (07-09T21:01:48Z, no fresher tick-report on disk):**
```
gateway_blind_status: "still live — native mcp__gateway__call_tool tool absent from available
  tool set this tick; mcp_call bypass reachable (emit_pressure_state succeeded)."
skipped: [{slot_id: bctc-analyst-slot-3, reason: "undeliverable-gateway-blind — trigger_id=null,
  _superseded_by=null (never-configured pattern, same class as bctc-analyst-slot-1/slot-2)"}]
```
Root-caused (not re-derived here) in `docs/architecture-briefs/2026-07-08-gateway-blind-cli-handshake-spike.md`: CLI/harness-side MCP-connection-lifecycle defect, backend healthy, **not fixable from this repo**. `refine_bctc_md` has `tools: [get_bctc_page_text, get_bctc_page_image]` + the mandatory `push_bctc_refined_unit`/`finalize_bctc_refine` DB-write path — 100% `mcp__gateway__call_tool`-dependent, zero Bash fallback (per its own `init.md`) — so it has no degraded-mode bridge available (`mcp-call.sh` requires Bash, which `refine_bctc_md` explicitly does not have).

### 1.2 Secondary, distinct cause layered UNDER the gateway-blind window (worth naming, not this sprint's fix)

A ~71h **session-absence** gap (no cowork-team tick-report of any kind on disk 2026-07-04T18:06Z → 2026-07-07T17:34Z) preceded the gateway-blind window and is a *different* mechanism (no CLI session running the `*/15` CronCreate dispatcher at all, vs. session running but tool-blind) — already tracked by the separate `docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md` chain (`OPS-COWORK-GUARANTEED-SLOT-INSTALL` etc., per po's 07-08 notebook carry-over). Not re-scoped here — flagging only so FR-8's verdict isn't read as a single clean root cause: **two stacked outage classes**, both out-of-repo/ops-gated, neither closable by an mcp-server code change.

### 1.3 Verdict on BA's (a)/(b)/(c) question

**(a) — confirmed**, not (b) (dispatch/cadence gap) and not (c). The dispatcher DID match `refine-bctc-slot-1` on schedule on 07-08 (proving cadence/config is correct) and explicitly logged the skip as gateway-blind, naming `refine_bctc_md` by tool-profile. **AC-15 answer: NO — the agentic-refine pipeline cannot currently execute end-to-end for any report**, as of the most recent evidence on disk (2026-07-09T21:01:48Z, no newer signal found). FR-2's mapping fix (already shipped, W1-W4 `done_verified`) **cannot reach CTG's served row via this pipeline today.** FR-9's fallback is therefore **mandatory to scope**, not conditional — see §2.

---

## 2. FR-9 — Deterministic-reflow fallback — BA's literal ask is a **NO-OP against live code; re-scoped below with the real blocker**

### 2.1 Correction — `backfill_bctc_scalars force_reflow` ALREADY covers PENDING; the literal FR-9 ask changes nothing

Read `apps/mcp-server/src/interface/mcp/tools/financial-reports/backfillBctcScalarsTool.ts:139-141` directly:
```ts
const statusClause = force_reflow
  ? `refine_status IN ('PENDING', 'DONE')`
  : `refine_status = 'PENDING'`;   // <-- DEFAULT already targets PENDING
```
`force_reflow=true` extends eligibility **from PENDING to PENDING+DONE**, the opposite direction from BA §"FR-9"'s framing ("it does not cover PENDING reports"). Calling `backfill_bctc_scalars` today, with or without `force_reflow`, already considers CTG's/VCB's current PENDING rows eligible on the status filter. **Shipping "extend force_reflow to PENDING" as literally spec'd would be a silent no-op merge — same risk class as `feedback_composite_score_masks_dead_detector`/`feedback_recurring_detection_vs_recurring_failed_fix`.** Do not decompose it as-is.

### 2.2 The actual, universal blocker — RAW-confirmed across all 63 PENDING reports

```sql
-- financial_reports x bctc_table_rows, grouped by refine_status (full table, live)
DONE:              7/8  reports have >=1 table_row   (1 legacy zero-row exception)
PARTIAL:           7/7  reports have >=1 table_row
PENDING:           0/63 reports have >=1 table_row   <-- 100% zero, no exceptions, CTG+VCB included
REJECTED_SANITY:   0/2  reports have >=1 table_row
```
`backfillBctcScalarsTool.ts:190-204` **skips any report with 0 `bctc_table_rows`** ("no parseable financial data") regardless of `force_reflow`. Since `bctc_table_rows` is populated ONLY by the agentic-refine pipeline (§1) for every currently-PENDING report, and that pipeline cannot execute (§1.3), **calling `backfill_bctc_scalars` against any of the 63 PENDING reports today — CTG and VCB included — returns `SKIPPED`, not a fix.** This is the real reason W5-class "just re-run the pipeline once it's back" thinking under-scopes the fallback: there is nothing for a reflow tool to reflow.

### 2.3 What data DOES exist, and why re-running the raw extractor is a dead end (confirmed, not hypothesized)

BA §3.1 already proved live that a **fresh** re-parse of CTG (07-07, `report_id=e497f7d1-…`) reproduced **byte-identical** corrupted scalars to the 06-16 baseline. That re-parse is `parseBctcReport.ts` → `balanceSheetExtractor.ts` (the twin sprint's already-identified non-bank-aware flat-text extractor) — it is deterministic and it is *already the root cause*, not a spare deterministic path to lean on. Re-running it again would reproduce the same `0`.

### 2.4 A narrower deterministic path DOES exist for CTG specifically — orphaned same-period table rows

```sql
-- bctc_table_rows report_ids with NO parent row left in financial_reports (orphaned by re-parse)
31f2a9a9 (57 rows, old VCB — different period, NOT VCB's current 2026-Q1)
96e36139 (451 rows, old CTG 2026-Q1 — SAME ticker+period as the currently-served e497f7d1 row)
4316f6d1 (94 rows) · 65a9c724 (285 rows) · d6f1885f (72 rows) — un-identified orphans, no current fr match
```
`financial_reports` has **zero duplicate `(action_code, sort_key)` pairs** — re-parsing a ticker+period **hard-deletes the old row and mints a brand-new `id`**, permanently orphaning any completed agentic-refine work under the old `id` (FK has no cascade/migration). CTG's `96e36139` orphan is the **exact same ticker+period** (`CTG`, `2026-Q1`) as the currently-served `e497f7d1`, and BA's §3.1 byte-identical-scalars finding is strong evidence it is the same underlying document. VCB has **no such match** — its 3 report rows (`bdcfa5e0`=2025-Q4/112 rows, `04c1aa22`=2025-Q1/0 rows, `bac3e1c1`=2026-Q1/0 rows, current) cover 3 *different* periods, none orphaned-with-data at 2026-Q1. MBB/ACB/BID's corrupt PENDING rows are likewise a genuinely *different, never-refined* period from their own older PARTIAL/table-bearing rows — not the CTG pattern.

### 2.5 Re-scoped FR-9 recommendation for pm (two tracks, do not conflate)

- **Track 1 (CTG-specific, cheap, real unblock — recommend pm size this track first):** a scoped tool addition (new optional `source_report_id` param on `backfill_bctc_scalars`, or a one-off migration script) that copies `bctc_table_rows` from an orphaned same-`(action_code, sort_key)` `report_id` onto the current one before aggregation. Sequenced **after** the twin sprint's W2 (row-repair) ships/deploys — the orphaned 451 CTG rows still carry the same corruption W2 targets; copying uncorrected rows would just move the bug, not fix it. This closes AC-5 for CTG **without waiting on FR-8's gateway-blind resolution.**
- **Track 2 (general, all other 62 PENDING reports incl. VCB/MBB/ACB/BID) — NOT a small FR-9 patch, flag for pm as separate backlog-sized scope, not this sprint:** no safe deterministic substitute for the agentic-refine step exists today for reports with zero historical table-row data anywhere (§2.3). A new non-LLM markdown/table extractor is a SPRINT-S+ effort. The honest near-term unblock for these 62 remains FR-8's own remediation (session reconnect — user/infra-gated, not a dev deliverable). Do not let Track 1's CTG-specific win be read as "the pipeline is fixed" for the batch.
- **New structural gap worth a backlog flag (not this sprint, not blocking):** re-ingest orphaning agentic-refine work on every re-parse (§2.4) is a real, previously-unnamed root-cause contributor — recommend a future backlog item to make BCTC re-ingest idempotent on `(action_code, sort_key)` (UPSERT preserving `id`, or auto-migrate `bctc_table_rows` FK on re-parse) so this class of loss stops recurring. Per project standard (fix root cause, not recurring symptom) — surfaced, not built, this cycle.

---

## 3. AC-14 — Dedup reconciliation (advisory only, per BA §1/§8 — NOT implemented by architect)

**Recommendation to pm/po:** `FIX-BCTC-BANK-SUMMARY-MAPPING` (still `active`, W1-W4 `done_verified`, W5 `BLOCKED` on the same gateway-blind/ops-deploy-gate class this brief just re-confirmed) and `FIX-BCTC-BANK-SCALAR-MAPPING` (this task) target the **exact same defect, same ticker, same numbers**. pm should **not** decompose a second, parallel W5-equivalent off this task's board row. The single forward execution thread should be: **this brief's Track 1 (§2.5) becomes the concrete replacement for the twin sprint's blocked W5** (same operational-unblock intent, but deterministic instead of re-dependent on the stalled agentic pipeline) — routed as a follow-on work unit under whichever task id po/pm designates as canonical, with the other task id closed/merged as a duplicate pointer rather than carrying its own independent W5. Architect does not merge/close board rows — this is pm/po's call per the flow contract.

---

## 4. AC-16 — Current report_id freshness (re-checked live at brief time, 2026-07-10T00:11Z)

```
CTG: id=e497f7d1-8717-49cc-bfa9-88804464d143  sort_key=2026-Q1  parsed_at=2026-07-07T16:53:55Z  UNCHANGED since BA wrote the spec
VCB: id=bac3e1c1-0adf-4c03-9f06-d701ec753055  sort_key=2026-Q1  parsed_at=2026-07-07T16:49:10Z  UNCHANGED since BA wrote the spec
```
No further churn since BA's snapshot — the twin sprint's W5 runbook (`96e36139-…`) is still stale and **must be refreshed to `e497f7d1-…`** (or superseded entirely by Track 1's carry-forward design, §2.5) before whichever agent executes it. Re-verify at qa-gate time regardless — §2.4 shows this ticker's `id` has already churned twice in a month.

---

## 5. Risk flags

- **RISK-1 [HIGH]** — Track 1 (§2.5) depends on the twin sprint's W2 (row-repair) being deployed first; sequencing this ahead of W2 would carry-forward *uncorrected* corrupted rows onto the new `id` and falsely appear to fix AC-5 while actually re-serving garbage from a different table. pm must sequence W2-deploy → Track-1-migration → Track-1-reflow, not any other order.
- **RISK-2 [MEDIUM]** — FR-8's verdict is time-bound to the most recent signal on disk (2026-07-09T21:01:48Z); if the gateway reconnects before dev/pm act on this brief, Track 1 becomes unnecessary (the existing agentic pipeline + already-shipped W1-W4 code would simply work once re-armed and pointed at CTG). Whoever picks this up should re-check `mcp__gateway__call_tool` reachability live before committing Track-1 dev effort — do not build the fallback if the primary path has already recovered.
- **RISK-3 [LOW]** — the 4 unidentified orphaned `report_id`s (`4316f6d1`/`65a9c724`/`d6f1885f`, 94/285/72 rows) were not traced to a ticker this cycle (out of LIGHT-SPIKE scope) — worth a cheap follow-up grep if Track 2 is ever scoped, they may represent additional carry-forward candidates beyond CTG.

---

## 6. Standard Detection

BUG-FIX / diagnosis + fallback-scope, in-zone (`apps/mcp-server/`), no new primitives this cycle (Track 1 implementation, if approved, is SPRINT-S — small new tool param + migration script) → **BUILD-STANDARD: not-applicable** for this SPIKE itself; Track 1 build (when pm decomposes it) is `lean` per BUILD-STANDARD-REF `docs/standards/microservice-build-standard.md`.

---

## Decision Journal
See `docs/agent-memory/decisions/sprint-FIX-BCTC-BANK-SCALAR-MAPPING-architect.md` (task_id: FIX-BCTC-BANK-SCALAR-MAPPING).

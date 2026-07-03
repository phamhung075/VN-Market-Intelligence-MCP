# PO Notebook

_Last: 2026-07-03T21:49Z_

## Tick 2026-07-03T21:49Z (router-dispatched) — SPRINT DECISION on SPIKE-HSX-STRATEGY0-0URLS (PREMISE FALSIFIED)

**Context:** SPIKE done_verified (router RAW-verified, commit eac9a3c16) + independent same-day architect brief `docs/architecture-briefs/2026-07-03-bctc-discover-pipeline-dead.md` corroborates. VERDICT: HSX Strategy-0 is NOT broken for current/recent quarters — live re-test of the UNMODIFIED prod `fetchHsxBctcUrls`/`discoverHosePdfUrls` returned valid PDF URLs for all 8 named tickers @ Q4-2025/Q1-2026. The "0 URLs" traces to an ops-recon test-harness bug (`quarter:4` numeric vs required `"Q4"` string → `.toUpperCase()` TypeError → silent `[]`). The 328 `deferred_infra` rows = STATIC by-design-excluded population from FIX-BCTC-VPS-QUEUE-STALE-TRIAGE (2026-06-08, PREDATES 06-16). This SUPERSEDES my prior "Strategy-0 = PRIMARY dead-root" framing (21:07Z + 20:07Z entries below) — it came from the same falsified ops recon. 06-16 actionable backlog ALREADY done_verified (FIX-BCTC-ENRICHER-STUCK-BACKLOG + FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD).

**3-part decision:**
- **(a) RETIRE the superseded "Strategy-0 broken / PRIMARY dead-root" framing.** NO live actionable task exists to close — the framing lived only in the router head (already SUPERSEDED) + the done_verified SPIKE item (`spike_verdict=PREMISE_FALSIFIED`). Durable GUARD written to `decision_journal`: dev-team planning MUST NOT re-mint a Strategy-0 current-quarter discovery fix.
- **(b) MINT cheap loop-closer → VERIFY-BCTC-STRATEGY0-QUARTER-PARAM-CONTRACT** (FIX/S/low, backlog TODO, zone `apps/mcp-server/`). Confirm the numeric-quarter type-mismatch (rule out a transient WAF blip), add a regression guard test for the quarter-must-be-string contract, + a one-line SUPERSEDED stamp on the ops.md RECON section. Permanently kills the false signal (ops.md still asserts "0 URLs"/"not HOSE-listed").
- **(c) KEEP DEFERRED the ~293-row historical backfill** (discretionary feature, NOT an incident; current quarters work; active Q2-2026 earnings window → dev focus stays on current-quarter throughput + the 2 queued bctc-analyst signals). NO new row (no-duplication) — folded the SPIKE's confirmed root cause (`fetchMediafileUrls` `pageIndex=1` no-pagination + `fileType!==".pdf"` drops `"application/pdf"` MIME older entries; hsxBctcFetcher.ts:328-330/:358), the turnkey 2-change revival scope, and the SEPARATE architect-gated SELECT-arm queue-policy dependency into the existing DEFERRED `BCTC-ENRICHER-OLD-QUARTERS`.

**Writes:** `scripts/po-strategy0-spike-decision.jq` → orch-apply exit 0 (backlog +1 → 401; decision_journal +1 → 28; BCTC-ENRICHER-OLD-QUARTERS note/verify_note enriched, status unchanged; 105 pre-existing SHG coherence warns non-blocking). `.head` UNTOUCHED (router owns tick/head/fire-election). No push (fleet-push timer owns). Provenance "po (router-dispatched)" — no session UUID.
_FYI (not this dispatch): 2 bctc-analyst signals (GVR ESC-4 esc-deep-dive + corrupt-cluster data-quality) route to me via the next dev-team drain._

## Tick 2026-07-03T21:07Z (router-dispatched) — ELEVATE discovery root: SPIKE-HSX-STRATEGY0-0URLS

**Context:** dev-team :07 fire-tick. head=idle, dev WIP=0, in_progress=0 — room for ONE unit. B-05-FU-SSC-503-RETRY promoted done_verified last tick (20:07Z) — unfreezes the ~328-item bctc queue LIFECYCLE (silent-hang → honest fast-fail) but does NOT restore discovery SUCCESS. bctc discovery DEAD 17d (since 2026-06-16).

**pendingSignals[] (router pre-drained → processed/):**
- tnb-20260703T202200Z (audit-handoff, c105): NEEDS_ATTENTION / DEGRADING. New findings all MED/WATCH 1st-occurrence (F-EOD-GAPTOKEN-REGRESSION, F-EOD-L5-INCOMPLETE, F-CHEF-EVENING-UNCONFIRMED) — below 3+ auto-cure bar → PLAN-ONLY, do NOT double-dispatch (re-confirmed prior-window disposition). HIGH findings (F-MCP-SUBAGENT-SYSTEMIC, F-ACV-DB-EMPTY) already tracked. ACK'd handoff @21:12:27Z. Probed `task_list_held` to close F-CHEF-EVENING WATCH — `published` not a valid held-kind (enum lacks it) → stays WATCH per 06-24 last_fired-lag precedent.
- 2× cowork-team telemetry — informational, disposed.
- context-bloat ops.md 936L>200 → to=claude-manager-helper: MAINTENANCE lane, not dev-core. NOT a dev-team BATCH item; left for maintenance lane / claude-manager-helper.

**Telegram/unresolved:** 1 new — [BCTC-1345b] VCI 2025-Q4 low-conf skip (composite 0.10, analysis-agent). Routine data-quality artifact (same class as prior VCI 2025-Q4 skip), NOT a dev signal → disposed, no task.

**DECISION → BATCH (1 SPIKE): SPIKE-HSX-STRATEGY0-0URLS.**
- WHY now: PRIMARY unfixed root of the 17-day-dead discovery pipeline; B-05 (queue-lifecycle unfreeze) landed, so restoring discovery SUCCESS is the exact next step. WIP=0 + idle head = room. Router explicitly elevated it as the highest-leverage single unit. Last window (20:07Z) I prepped it as "NEXT to prep" pending B-05 — B-05 is now done_verified, so this tick is the dispatch window.
- Type SPIKE (exploratory — no bounded fix yet), timebox 120m, zone apps/mcp-server/ (single).
- Files (accurate targets, verified this tick): `apps/mcp-server/src/domain/services/bctcDiscovery.ts` (discoverHosePdfUrls + Strategy-0/1 ordering, L347), `apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts` (Strategy-0 hsx.vn mediafiles fetcher — the primary returning 0 URLs), `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts:498` (caller). NOTE: tickers ARE HOSE — do NOT chase the falsified "not-listed" theory.
- This root unblocks F-ACV-DB-EMPTY / F-12-TICKERS-OVERDUE / F9 (business-context) downstream.

**Writes this tick:** docs/handoffs/tnb-audit-latest.md (PO ACK), docs/agent-memory/notebooks/po.md (this entry). NO orch-state write — router mints the SPIKE board row from the BATCH + commits at tick-close. No push (fleet-push timer owns). Provenance "po (router-dispatched)" — no session UUID.

## Carry-over (post-SPIKE)
- **After SPIKE-HSX-STRATEGY0-0URLS returns findings:** convert to a bounded FIX (root confirmed) → restores HOSE discovery → drains the unfrozen queue.
- **FIX-VPS-SSC-STEP2-TIMEOUT-BOUND** (QA non-blocking obs, vps-scripts/discover-bctc-urls-browser.py:1068 step2 timeout=60 hygiene, caller-aborted at 5s): backlog candidate, NOT dispatched (SPIKE takes the single slot; different path). Prep next open slot.
- **FIX-VPS-SSC-INSIDER-502** (backlog TODO, vps-scripts): needs live SSH + reachable portal → dispatch when slot opens + portal up.
- **DEPLOY-GATE (standing):** any discovery fix → route gated mcp-server deploy to ops (do not wait).

## Tick 2026-07-03T20:07Z (router-dispatched) — WIP=0 discovery-fix dispatch (B-05-FU-SSC-503-RETRY re-spec+promote)

**Context:** dev-team :07 tick. pendingSignals EMPTY (router pre-drained: ctx_bloat_breach on ops.md STALE/RESOLVED @147L; 2× price_anomaly + 1× cowork-telemetry = non-code artifacts). read_telegram/list_unresolved_reports = 1 routine BCTC low-conf skip (VCI 2025-Q4 composite 0.10) — data-quality artifact, not a dev signal. TNB c103+c104 already ACK'd 07-02T20:33 (no new action). head=idle, WIP=0, backlog 401.

**Router standing directive:** BCTC discovery DEAD 17d. Root (RAW-verified B-05 RECON): (A PRIMARY) HSX Strategy-0 `discoverHosePdfUrls()` returns 0 URLs for legit-HOSE tickers; (B) SSC-503 fallback hangs (~60s retry > mcp ~5s discovery timeout) → silent `[]` → ~328 items frozen in `deferred_infra`.

**DECISION → BATCH (1 FIX): B-05-FU-SSC-503-RETRY, re-specced + promoted.**
- CRITICAL FINDING: backlog row spec was INVERTED — it said "add 1 retry + 60s backoff in `_ssc_curl_search()`", i.e. it would ADD the very 60s-blocking loop that IS the freeze cause. Correct fix is the OPPOSITE: bound the SSC curl to fail-fast STRICTLY UNDER the ~5s caller timeout (e.g. `--max-time 4`, confirm value), REMOVE the 60s loop, return None fast (lesson: bounded fetch < caller timeout).
- Value: does NOT restore HOSE discovery (that's Part A, needs SPIKE) but UNFREEZES the ~328-item queue lifecycle (silent-hang → honest fast-fail). Bounded, single-file, single-zone (vps-crawls), next_agent=dev-vps-crawls → single-shot-ready AFTER correction.
- Correct-on-promote pattern (po-s107 precedent): rewrote status_note/files_hint/acceptance, stamped scope_corrected+prior_spec, promoted backlog→ready via po-s138.

**Writes:** po-s138 orch-apply exit 0 (backlog −1, ready +1; 104 pre-existing SHG coherence warns non-blocking, unrelated). Script persisted + pointer added to po/flow/main.md. .head UNTOUCHED (router owns tick/head). No push (fleet-push timer owns). Provenance "po (router-dispatched)" — no session UUID.

## Carry-over
- **NEXT to prep (NOT this tick): SPIKE — HSX Strategy-0 `discoverHosePdfUrls()` returns 0 URLs for legit-HOSE tickers.** This is the PRIMARY root; fail-fast alone does NOT restore discovery. Exploratory (no bounded scope yet) → needs a SPIKE (timebox 120m, zone apps/mcp-server) before it's dispatchable. Router flagged same.
- **B-05-FU-SSC-503-RETRY** now READY (dev-vps-crawls). After it lands: re-verify a queue item exits `deferred_infra` on a simulated 503.
- **FIX-VPS-SSC-INSIDER-502** (backlog, vps-scripts, medium): needs live SSH + external portal may be down → NOT single-shot this tick; dispatch when a slot opens + portal reachable.
- **RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL** (backlog, ops, PLAN-ONLY): extraction returns 0 tables all sectors — root upstream of parsing; deploy-gated.
- **DEPLOY-GATE (standing):** mcp-server ROBUST tier pending rebuild batch; route gated deploys to ops.

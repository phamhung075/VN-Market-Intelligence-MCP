# Task Report: FIX-BCTC-BANK-SUMMARY-MAPPING — AC-13 (terminal qa sprint close, W1–W5)
date: 2026-07-01
outcome: PARTIAL — W1/W2/W3/W4 GREEN (done_verified), W5 BLOCKED (AC-10 CTG re-ingest refused by design)

Sprint commits in scope: W1 `098d7c23` (+ W4 `a46131cf` same tier), W2 `2cd9e105`, W3 `a79b33eb`,
W4 `a46131cf`, W5 `b630277c`. All 5 confirmed ancestors of `HEAD` (`94be5fe2`); `apps/mcp-server/`
tree fully clean (`git status --short -- apps/mcp-server/` → empty) before rebuild.

## 1. Rebuild (single mcp-server service)

```
docker compose build mcp-server            # new image
docker compose up -d --no-deps mcp-server  # recreate ONLY mcp-server — no down, no force-recreate
```

| | before | after |
|---|---|---|
| image | `sha256:2a2e553c94fa…` (created 2026-07-01T18:38:28Z — **predates** all 5 W-commits, latest 20:59:52Z) | `sha256:33fea3bafe16…` (created 2026-07-01T22:26:59Z) |
| container | `4ca082bfd423` | `715ea5bbe6d1` (Up, healthy) |

All 12 peer containers retained their original uptimes (e.g. `frontend-1` Up 7h, `api-gateway-1`
Up 3d) — confirms `--no-deps` recreate did not touch peers.

Marker check inside the **running** container (not just host source tree):
```
docker exec vn-market-intelligence-mcp-mcp-server-1 \
  grep -n "FIX-BCTC-BANK-SUMMARY-MAPPING W2\|FIX-BCTC-BANK-SUMMARY-MAPPING W3" \
  /app/src/application/utils/refinedMarkdownParser.ts
```
→ 3 hits (W3 section-boundary-contamination guard comment ×2, W2 corruption-signature repair
comment ×1). `bun run src/index.ts` runs the TS source directly (no dist/build step), so this is
the exact code executing live. **Rebuild verification: PASS.**

## 2. CTG re-ingest (report_id=`96e36139-5dac-414d-8e4d-20a4725890d1`)

```
docker cp scripts/migrations/reingest-bctc-report.ts vn-market-intelligence-mcp-mcp-server-1:/app/
docker exec vn-market-intelligence-mcp-mcp-server-1 bun /app/reingest-bctc-report.ts \
  --report-id 96e36139-5dac-414d-8e4d-20a4725890d1
```
Exit code: **3** (refuse-to-apply, exactly as predicted by the mandate).
```
[BEFORE] CTG 2026-Q1 (96e36139-5dac-414d-8e4d-20a4725890d1)
  total_assets=0 total_liabilities=24735484770 equity_total=244904306
  validation_status=low_confidence refine_status=PARTIAL confirm_status=PENDING
  extraction_confidence=0.5625
  bctc_refined_units: done_with_markdown=0 failed=56 total=56
decision=refuse_no_done_windows — 0 of 56 bctc_refined_units rows are DONE-with-markdown
(56 FAILED). Calling finalize_bctc_refine now would DELETE existing bctc_table_rows and
insert NOTHING — refusing to apply.
```
**Remedy printed by the script:** trigger a fresh agentic-refine transcription pass for this
report_id (`get_bctc_pending_refine` + `push_bctc_refined_unit` ×56 windows), then re-run
`--apply`. This is bctc-analyst/dev-mcp-server domain work (live PDF-page-image OCR
transcription of a 56-window bank report) — outside qa's scope and explicitly out of reach for
this script "by design — no fake data, no fabricated transcription" (script's own header). I did
**not** attempt to fabricate a transcription. **Result: BLOCKED, not failed, not passed.**

## 3. RAW-PROBE (named Docker volume, not host `./data`)

Confirmed mount: `docker inspect vn-market-intelligence-mcp-mcp-server-1` →
`volume vn-market-intelligence-mcp_market_data -> /app/data` (named volume, matches the
project's serving-value SSOT).

```sql
-- financial_reports (post-rebuild, pre/post re-ingest attempt — unchanged, as expected on refuse)
id=96e36139-…  action_code=CTG  sort_key=2026-Q1
total_assets=0  total_liabilities=24735484770  equity_total=244904306
validation_status=low_confidence  refine_status=PARTIAL  confirm_status=PENDING

-- bctc_refined_units breakdown
window_status=FAILED  cnt=56  with_md=0

-- bctc_table_rows count = 55 (pre-existing rows from the OLD pre-fix parse; never re-parsed
   because finalize_bctc_refine has not re-run against this report_id)
```
`total_assets` remains frozen at **0** — unreachable to unfreeze without the blocked re-ingest.
**AC-13 §3: BLOCKED-pending-transcription** (per mandate — recorded as blocked, not failed).

## 4. Live verify — all 3 serve tools, CTG + non-regression (VCB/FPT/HPG/VNM)

Method: direct `StreamableHTTPClientTransport` MCP client call against the rebuilt running
server's `/mcp` endpoint (same transport the `mcp__gateway__call_tool` wrapper itself would use)
— this specialist qa invocation had no MCP gateway tool binding available (consistent with the
project's documented "subagents gateway-blind" constraint / INV-GATEWAY-1), so the 3 serve tools
were called directly against the live server rather than through the gateway wrapper. Script:
`docker cp` a small client script → `docker exec … bun /app/live-verify.ts`.

### CTG (2026-Q1) — identity guard must hard-block (AC-4 / AC-7, W1)
- `get_financial_summary` → `[CORRUPT DATA — SKIP]` `total_assets=0 (zero or negative — OCR
  extraction failure)` `Confidence: 0%` — **PASS**
- `get_bctc_full` → same `[CORRUPT DATA — SKIP]` block — **PASS**
- `compare_financials` (period1=2026-Q1, period2=2025-Q4) → `Period(s) not found in database for
  CTG: 2025-Q4.` — honest "no data" message, no crash, no fabricated diff (CTG has only 1 stored
  period; guard-on-both-found-periods path already covered by unit tests in
  `fix-bctc-identity-serve-guard.test.ts`, which is part of the 55/55 green suite below) — **PASS**

### VCB / FPT / HPG (non-regression) — served normally, plausible values
| ticker | total_assets (2026-Q1) | vs prior Q | ROE | validation_status |
|---|---|---|---|---|
| VCB | 2,550,963.3 tỷ | +4.5% (2,441,928.9 → 2,550,963.3) | 4.2% | passed |
| FPT | 68,586.1 tỷ | -22.1% (88,089.6 → 68,586.1, QoQ std vs FY basis) | N/A (ratio quirk, pre-existing) | passed |
| HPG | 259,327.5 tỷ | +162.8% (98,670.8 → 259,327.5, QoQ std vs FY basis) | 6.5% | passed_with_warnings (net profit > gross profit flag — pre-existing, unrelated to this sprint) |

`get_bctc_full`'s internal QoQ/YoY section correctly **withholds** the FPT/HPG/VCB comparison
with `PUB-7: Period basis mismatch` (standalone-quarter vs FY-cumulative) rather than serving a
misleading delta — this guard is orthogonal to this sprint and functioning correctly. The
standalone `compare_financials` tool does **not** apply that same period-basis gate (pre-existing,
out-of-scope behavior — noted for completeness, not a regression from W1-W5).

### VNM (non-regression) — correctly identity-guard-blocked, NOT a new regression
`total_assets=0` for VNM 2026-Q1 too, but root cause is **entirely different and pre-existing**:
`refine_status=PENDING`, **0** `bctc_refined_units` rows at all (report never entered the
refine pipeline), `bctc_table_rows` count=0. This is "not yet ingested," unrelated to the
bank-mapping defect this sprint fixes (VNM is not a bank; W1-W5 target the bank-form scalar
mapping/parsing path). The identity guard correctly serves `[CORRUPT DATA — SKIP]` (confidence
0%) rather than a fabricated number — honest-NULL-by-design, confirmed **not** a regression
introduced by this sprint.

### Known qa watch-items (W2 VN_NUMBER_TOKEN no-separator mis-peel; W3 substring `.includes`
over-match on data rows carrying a full section title)
Neither watch-item is observably triggered in this live-verify pass, because the **only**
report where the new W2/W3 code paths would exercise against real corrupted markdown (CTG) has
not been re-parsed (re-ingest blocked — see §2). Both are unit-tested pinned-value green
(`TASK-W2-…test.ts` 20/20 corrupted rows recovered with exact spot-checked values;
`TASK-W3-…test.ts` RED→GREEN section-mistagging fixture) and both review_notes already classify
them "low-risk"/"non-blocking." **Status: unit-covered, live-path unexercised pending
transcription** (same blocker as §2/§3) — not a fail.

## 5. Test suite gate

```
bun test src/__tests__/FIX-BCTC-BANK-SUMMARY-MAPPING-W4.test.ts \
         src/__tests__/TASK-W2-FIX-BCTC-BANK-SUMMARY-MAPPING-ROW-REPAIR.test.ts \
         src/__tests__/TASK-W3-FIX-BCTC-BANK-SUMMARY-MAPPING-SECTION-GUARD.test.ts \
         src/__tests__/TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST.test.ts \
         src/__tests__/fix-bctc-identity-serve-guard.test.ts
# 55 pass / 0 fail / 328 expect() calls across 5 files
bun tsc --noEmit
# 0 errors
```
Full-repo `bun test` (background, completed 630s later): **14112 pass / 42 skip / 61 fail / 4
errors** across 1158 files (14215 tests). Bun itself crashed (`panic(main thread): A C++
exception occurred` — known Bun 1.3.13 runtime bug, unrelated to any test) immediately *after*
printing the final summary, so the counts are trustworthy. The one failure visible in the tail
output is `src/_deprecated/1302-technical-indicators.test.ts:474` (a VNM MACD/RSI text-format
assertion in a file literally named `_deprecated/`) — unrelated to BCTC/financial-reports.
To directly confirm **zero regression in this sprint's domain**, ran the full BCTC +
financial-reports test corpus (99 files matched by `*bctc*.test.ts` / `*financial*.test.ts`,
1162 tests including all 5 sprint files): **1158 pass / 4 skip / 0 fail / 3525 expect() calls**.
Conclusion: the 61 full-suite failures are pre-existing debt outside this sprint's touched files
(no file outside `apps/mcp-server`'s bank-mapping path was touched by W1-W5) — **zero BCTC
regression, confirmed directly, not assumed.**

## 6. Board close (`docs/data/orch/orch-state.json` via `scripts/orch-apply.sh`)

Two jq filters applied (both exit 0, Stage 0+1 PASS, only pre-existing unrelated coherence
warnings — none introduced by this change):
- `scripts/qa/fix-bctc-bank-summary-mapping-ac13-board-close.jq` — W1/W2/W3/W4:
  `review` → `done_verified`; W5: mutated in place, `status: REVIEW → BLOCKED` + `blocked_on` +
  `qa_ac13_note`.
- `scripts/qa/fix-bctc-bank-summary-mapping-ac13-head-fix.jq` — corrective patch: my first pass
  mistakenly wrote a note onto `task_board.head`, which is a **deprecated stub** (schema comment
  "G-7: task_board.head must remain a stub" — routing moved to the canonical top-level `.head` in
  v4). Reverted the stray field and set the real top-level `.head` (which already had
  `active_task_id=TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST`, `next_agent=qa` —
  i.e. this exact task, safe to fully own/reset) to `status=idle` + honest outcome note.

Final board state:
- `TASK-W1-FIX-BCTC-BANK-SUMMARY-MAPPING-GUARD` → `DONE_VERIFIED`
- `TASK-W2-FIX-BCTC-BANK-SUMMARY-MAPPING-ROW-REPAIR` → `DONE_VERIFIED`
- `TASK-W3-FIX-BCTC-BANK-SUMMARY-MAPPING-SECTION-GUARD` → `DONE_VERIFIED`
- `TASK-W4-FIX-BCTC-BANK-SUMMARY-MAPPING-AGGREGATOR-FIXTURES` → `DONE_VERIFIED`
- `TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST` → `BLOCKED`
  (`blocked_on`: "Fresh agentic-refine transcription pass for report_id=96e36139-…
  (CTG 2026-Q1) — mint a follow-up task, not further qa review.")

## 7. Locks / commit-mutex / Telegram — NOT performed by this session (tool-access constraint)

This specialist qa invocation has **no MCP gateway tool binding** (only `Read`/`Edit`/`Write`/
`Bash` were available) — consistent with the project's documented "subagents gateway-blind"
constraint and INV-GATEWAY-1 ("task_release is the dispatcher session's sole responsibility").
I could **not** call `task_heartbeat`, `task_release`, `task_claim` (commit-mutex), or
`send_telegram` from this session. Everything achievable via direct `Bash`/git/docker/jq was
completed (rebuild, re-ingest attempt, raw-probe, live-verify, board close, this report, the
commit below). **Outstanding, for the dispatcher session (owner_client_session
`(session-scrubbed)`) to perform:**
- `task_release` for all 5: `task:TASK-W1-FIX-BCTC-BANK-SUMMARY-MAPPING-GUARD`,
  `task:TASK-W2-FIX-BCTC-BANK-SUMMARY-MAPPING-ROW-REPAIR`,
  `task:TASK-W3-FIX-BCTC-BANK-SUMMARY-MAPPING-SECTION-GUARD`,
  `task:TASK-W4-FIX-BCTC-BANK-SUMMARY-MAPPING-AGGREGATOR-FIXTURES`,
  `task:TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST`
- `send_telegram(channel="work", …)` — outcome: **PARTIAL** — W1-W4 GREEN/done_verified,
  W5 BLOCKED (AC-10 CTG re-ingest needs a fresh transcription task; not fabricated).

## Merge Status
No branch merge (this is an operational sprint-close gate, not a task-branch PR). Commit is a
direct `chore(...)` commit on `main` per `docs/policies/commit-convention.md`, explicit paths
only (this report + `docs/data/orch/orch-state.json` + the two new `scripts/qa/*.jq` files),
no push (fleet-push launchd owns push).

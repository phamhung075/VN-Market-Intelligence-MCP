# Developer — Notebook

**Last updated:** 2026-05-19T20:59Z | **Cycle:** c212 | **Sprint:** dev-team orchestration tick

## Session c212 — Dev-Team Orchestration (JUMP-TO: drain-signals → PO triage → dispatch)

**Preflight:** NO HEAD.lock. Worktree prune: clean. PASS.

**Gate assessment (20:59Z):**
- OBSERVE-1951b: CLOSED (gate was 20:34Z, 25 min past). AC-6 PASS → 1951d UNBLOCKED.
- 1948 gate: 2026-05-20T07:22Z — future, still blocked.
- OBSERVE-1953g: 2026-05-21T02:30Z — future, observing.

**Drain signals (12):** All stale/resolved — moved to processed/. No new PO triage needed (already planned via po-1955-sprint-plan.json signal).

**TASKS.md updates:** OBSERVE-1951b→Done, Sprint-1956→Done (11/11), 1954a AC-3 PASS, stale Backlog entries removed, TASKS.md=80 lines.

**Dispatch:** dev-mcp-server→1955a (HIGH FIX dailyDashboardJob path) + ops→1951d (cutover 12 RemoteTriggers). WIP=2/2.

## Session c178 — Task 1952f (chef-intraday trigger_prompt MCP URL)

**Task:** 1952f — Append MCP URL to `chef-intraday` trigger_prompt in `docs/data/cowork-schedule.json`.

**Root cause confirmed:** cowork-team/main.md Step 5 spawns unified-agent using `trigger_prompt` verbatim. The field lacked `\nMCP: https://zenmidi.com/vn-market/mcp`. Unified-agent exited without tools.

**Narrowest-fix analysis:**
- `news-scout-market`, `market-watcher-market`, `alert-commander-market` → `trigger_error: "API_MIN_INTERVAL"`, no `trigger_id`, produce results via master dispatcher already. NOT modified.
- Only `chef-intraday` has the failure. One field change.

**Files changed:**
- `docs/data/cowork-schedule.json` — `chef-intraday.trigger_prompt` appended `\nMCP: https://zenmidi.com/vn-market/mcp`
- `docs/TASKS.md` — 1952f added to Done
- `docs/agent-memory/notebooks/developer.md` — this update

**Pipeline state:** c178 DONE. Commit on main.

## Session c177 — Preflight + drain + idle

**Preflight:** NO HEAD.lock. Worktree prune: clean. No worktree lock dir. PASS.

**Drain signals (0a):** One JSON signal in docs/signals/: `alert-commander-2026-05-18T02-06-30Z.json` (type=bug-escalation, index.lock EPERM from cowork mount — recurring wontfix-sandbox pattern). DASHBOARD.md: no new entries.

**Telegram reports (status=new):**
- #2933 (alert-commander): index.lock EPERM at 02:06 UTC — wontfix-sandbox, matches #2894. Processed.
- #2934 (unified-agent): FPT net_profit=20,225 ty BCTC corruption — duplicate of 1941d (QA in flight). Processed.

**Zone conflict check:**
- 1941d zone: `apps/mcp-server/src/infrastructure/db/` + `interface/mcp/tools/financial-reports/`
- Both reports resolve to 1941d zone — no separate task possible without conflict.
- No other signals or Todo tasks in non-conflicting zones.

**Decision:** IDLE. WIP=1/2 (1941d QA slot). No open dev slot dispatch possible. WORK notified.

---

## Session c176 — WIP audit + signal routing

**Preflight:** NO HEAD.lock. Worktree prune: clean (no output). No worktree locks. PASS.

**Drain signals (0a):** No JSON files in docs/signals/. DASHBOARD.md present (no new signals).

**Telegram reports:** All resolved (highest ID=2932, all wontfix/fixed). Zero new/unresolved reports.

**WIP audit:**
- Slot claim "BA writing 1941c": STALE. BA spec `docs/handoffs/1941c-ba-spec.md` is COMPLETE (status=Review). TASKS.md correctly shows owner=architect, "SPEC READY FOR REVIEW". Does NOT occupy a dev slot.
- Slot claim "1941d FPT net_profit OCR fix": Branch `task/1941d-fpt-netprofit-ocr-fix` exists at main HEAD (0 commits ahead). No handoff file written. Dev hasn't started implementation.
- Effective dev slots occupied: 0 active implementation. 1941d branch exists but is dormant (no handoff, no commits).

**Routing:**
- BA-1941c: BA spec ready — routing note to architect (no dev slot needed, no dispatch required — just TASKS.md note already correct).
- 1941d: branch exists, no handoff. PM created it but dev hasn't started. WIP=0 from dev perspective.

**Decision:** Per user constraint WIP=2/2 do NOT spawn developer tasks. BA-1941c needs architect review (Todo → architect). 1941d needs handoff before dev can start. Neither requires dev-team to spawn a specialist right now. Send WORK: idle with WIP noted.

**Pipeline state:** c176 IDLE. WORK notified.

---

## Last session summary (1941a — L7 OCF guard deploy-verify)

**Task:** 1941a — FA cycle 2026-05-17 23:04 UTC reports VCB OCF=1.23e15 and FPT raw=503.

**Root cause found:**
- `financial_reports` table has two OCF columns: `operating_cf` (OCR, corrupted) and `operating_cash_flow` (API bridge Task 1878a, correct)
- `cashFlowTool.ts` was only selecting `operating_cf` — the corrupted column
- VCB: OCR=1.23e15 (raw VND not ÷1M), API bridge=9,947,260 triệu → ratio 1.15 (plausible)
- FPT: OCR=10,189,002 (unit mismatch), API bridge=4,108,450 triệu → ratio still suppressed (NI=20,225 is a separate extraction bug — revenue stored as profit; vnstock shows NI=2,509.52 tỷ)

**Fix applied:**
- `cashFlowTool.ts`: `effectiveOcf = operating_cash_flow ?? operating_cf`
- Added `ocf_source: "api_bridge" | "ocr"` to envelope
- 5 new tests in `1941a-ocf-api-bridge-preference.test.ts`
- Updated `makeTestDb()` DDL in 1890a + 1930b to include `operating_cash_flow` column

**Results:**
- 17 cashflow tests pass (5 new + 12 existing)
- tsc clean
- Docker rebuilt + redeployed, verified live in container
- Branch: `task/1941a-ocf-api-bridge-cashflow-tool`
- Commit: `b0791eaf`

**Open issue (out of scope):**
- FPT `net_profit=20,225` in `financial_reports` is wrong (OCR parsed revenue as profit). Correct NI ≈ 2,509,520 triệu from vnstock. Even with correct OCF (4,108,450), ratio ≈ 1.64 would pass — but DB data isn't there yet. File as separate extraction bug.

**Pipeline state:** REVIEW. TASKS.md updated. QA to review.

---

## Last session summary (c175 — dev-team orchestration)

**Context from main terminal:** MCP URL `https://zenmidi.com/vn-market/mcp`. Cycle c175.

**Preflight:** HEAD.lock present (age=2677s, size=0B, no live pid). Removed. Worktree prune: clean.

**Notebook sweep:** Committed cowork agent notebooks that sandbox blocked during c167-c174 (alert-commander, report-analyzer, financial-analyst, news-scout + tool-usage-stats + tnb signal cleanup).

**Drain signals (0a):** No JSON signal files. DASHBOARD.md po-section row already READ (c169).

**Telegram reports resolved:**
- #2929 pollNews 0-items: wontfix-transient (gateway outage window 14-18 UTC c167, self-healed)
- #2930/#2931/#2932: wontfix-sandbox (HEAD.lock EPERM in Cowork — expected, documented at #2894)

**Pipeline state (0b):** idle.

**PO Triage (Step 1):**
- No new TNB audit signal.
- No new JSON signals.
- Only actionable TODO: `calendar-source-replacement` (LOW/OBSERVE, zone: dev-macro-indicators)
- BATCH: [{type: OBSERVE/FIX, id: calendar-source-replacement, zone: apps/macro-indicators/}]

**Execute (Step 3):**
- Dispatched `calendar-source-replacement` to dev-macro-indicators
- Handoff created: `docs/handoffs/calendar-source-replacement.md`
- TASKS.md updated: moved to In Progress
- WORK telegram sent.

**Pipeline state:** c175 DISPATCHED. Waiting for dev-macro-indicators return.

---

## Previous sessions (archived context)

c173: idle EXIT, 1939a/b QA in progress.
c172: 1939a/b QA in progress, IDLE EXIT.
c170: 1938a (MCP URL fix) shipped.
c174: 1940a (PC1 legal_risk dual-source) shipped. QA APPROVED.
1941a: cashFlowTool OCF API-bridge preference fix. VCB Layer-7 now plausible. QA pending.

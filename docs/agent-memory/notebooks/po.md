# PO Notebook

_Last: 2026-07-03T10:00Z_

## Tick 2026-07-03T10:00Z — dev-team 09:37Z tick: triage 2 repair_task_requests → backlog, BATCH 2 FIX

**Context:** dev-team drain handed 2 repair_task_requests + 1 informational cowork telemetry. Board WIP=0 (in_progress=[], active=[]). Backlog 397→399.

**Signal triage (both → `.task_board.backlog[]`, po-triage-20260703T0937Z orch-apply exit 0):**
1. `router-fbfirer-dead-cli-flag` (repair_task_request, HIGH) → **MINTED** `FIX-FB-DAILY-FIRER-CLI-FLAG` (zone cross-service/, prio high, next_agent=dev). RAW-verified: `scripts/cowork-fb-daily-firer.sh:138` literally holds `--no-update-notification` (unknown option) → launchd fb-daily backstop crashes every fire (09:08Z+09:23Z error.log). 1-line delete = fixer. NOT dup of `FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED` (that = T1 auditor peer firer, different script/root).
2. `router-signalqueue-dup-id-guard` (repair_task_request, MED) → **MINTED** `FIX-SIGNALQUEUE-DUP-ID-GUARD` (zone cross-service/, prio med). Scope = orch-apply.sh validate-side `.id`-uniqueness guard (belt+suspenders) + auditor ts→full ISO8601. PARTIAL-OVERLAP w/ `FU-AUDITOR-D4-SIGNAL-ID` (producer-side D4 emitter) — scoped THIS task to validate+ts only to avoid double-fix. Recurring class feedback_ssot_duplicate_key.
3. cowork tick-1 telemetry (cowork-team-…09-32-12Z.json) → informational fire-record, **recognized + dropped**, no task.

**BATCH → router:** 2 FIX (both cross-service/, fixer-candidates, WIP=2 ≤ limit). Both also durably in backlog.

**Standing decisions:**
- `CI-RED-c5b5f885-FIX` → **do NOT prioritize / not in BATCH.** Evidence: c5b5f885 IS ancestor of HEAD b2ab3aae1 (tree advanced far past it); COLUMN-ORDER qa measured full suite 65 fail << 348 baseline (project-stats testBaselineFail=348) → the "bun test" RED is BELOW baseline = pre-existing flakes, not a c5b5f885 regression (feedback_ci_red_can_be_flaky_confirm_before_blame). Leave backlog TODO pending a fresh CI-run confirm on current HEAD before any FIX priority.
- `FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD` → no change (plan-only, next_agent=ba).

**Telegram/reports:** ~50 new msgs dominated by `[bctcPdfPull] ENRICH 0-rows FAIL-LOUD` (many tickers 2025-Q4, B02-TCTD parse/pipeline stall) + `bctc-discover stale 396.6h CRITICAL (B-05, 36 pending)` → KNOWN BCTC cluster, already tracked (FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD TODO, SPIKE-BCTC-DISCOVER-PIPELINE-DEAD, deploy-gated W5 chain). Definitive fix is DEPLOY-gated (user-gated COLUMN-ORDER container deploy) — no new task. A-13/A-22/pollNews reports = known self-healing/WARN/transient, no task.

**Writes:** po-triage-20260703T0937Z orch-apply exit 0 (backlog +2, 106 coherence warns pre-existing SHG, non-blocking). .head UNTOUCHED. Did NOT push (fleet-push owns).

## Tick 2026-07-03T08:57Z — dev-team 06:37Z tick continuation: drain 3 to=po signals + mint orphan-guard + reconcile W5 to deploy-gate

**Context:** Router (SF-1 held) closed the COLUMN-ORDER qa gate (done_verified, qa PASS 66dfe89a5, RAW-verified) and handed PO the signal drain + triage. Board: ready=0, in_progress=0, review=4, backlog 396→397, done_verified 7.

**Signal drain (3 NEW→READ, po-s138 orch-apply exit 0):**
1. `sau-20260703T074552Z` A-13 api-gateway health unreachable (HIGH) → **TRANSIENT FALSE-POSITIVE, NO task.** Self-resolved: INFO corroboration `sau-2026-07-03T08:41:40Z` (HTTP 200 @08:40Z, RestartCount=0, uptime 4d). READ.
2. `dt-flowdefect-orphan-guard-20260703T0817Z` (repair_task_request, HIGH) → **MINTED** backlog `FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD` (HIGH, plan-only, zone=multi[apps/mcp-server/+flow-docs], next_agent=ba). 3-part fix (board-state guard both paths / stop false-orphaning long agents / clearable null-session orphans), 3 ACs. detail_ref → docs/signals/router-flowdefect-orphan-adoption-guard-20260703.md. READ.
3. `sau-2026-07-03T08:41:40Z` (corroboration, INFO) → loop-closer for #1. READ.

**Board assessment (W5 chain):** Both W5 review rows (`TASK-W5-…VALIDATION-REINGEST` dev-mcp-server, `W5-FU-CTG-REFINE-96e36139` bctc-analyst) are **CODE-CLEARED** — their blocker COLUMN-ORDER is done_verified (supersedes SECTION-CLASSIFIER; W2 ROW-REPAIR 2cd9e105 + W4 AGGREGATOR-FIXTURES a46131cf were W1-W4 done_verified at PARTIAL sprint close). **NOT a qa dispatch** — remaining gate is DEPLOY-then-operate: (1) ops rebuild+deploy COLUMN-ORDER to live mcp-server, (2) finalize_bctc_refine / reingest on live CTG 96e36139 (named-volume market.db) to unfreeze total_assets from 0, (3) RAW-probe total_assets≠0 → done_verified. Reconciled both rows in-place (kept BLOCKED, rewrote blocked_on to the deploy-gate) so no dev coding lane dispatches pre-deploy.

**Also deploy-gated:** BCTC-HNX-SSL-HARDEN (review, dev-vps-crawls; dep FETCH-LEG-DEAD done) awaits its manual deploy. ARCH-SHIP-WAVE-REAUDIT (DEFERRED, next_agent null) — no action.

**Writes:** po-s138 orch-apply exit 0 (backlog +1, review markers ×2 in-place, 3 signals READ, NEW-left=0; 104 coherence warnings pre-existing SHG, non-blocking). .head UNTOUCHED (router owns tick/head). Did NOT push (fleet-push owns push).

## 2026-07-03 triage-signals tick 2026-07-03T18:07Z (router-dispatched)
Drain triaged PLAN-ONLY into `.task_board.backlog[]` — no implementation dispatched (WIP FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK in review, qa gating).
- **S1 (PRIORITY bug-escalation, bctc-analyst):** get_bctc_full cross-ticker contamination (batch >=2 same turn -> 2nd slot serves 1st ticker; repro 2/2 [MBB,HCM],[GVR,EIB]; sequential=correct => concurrency). Opened **FIX-BCTC-FULL-BATCH-CONTAMINATION** (high, zone:multi). BOTH hypotheses recorded (a handler shared-state / b gateway result-attribution — b = far broader blast radius); architect confirms handler-vs-gateway before scoping. alt-id noted for gateway root cause. Interim: sequential calls.
- **S2 (LOW coverage-gap, MBB Q1-2026):** self-guarded, root_task=BCTC-HIST-VPS-BACKFILL already in backlog (DEFERRED). No new task — routed to existing epic. Log only.
- **S3 (NOISE):** 3x cowork-fire telemetry + 2x bctc_signal routine — no-op.
- **S4 (router .md, MEDIUM) SPLIT into two:** **CHORE-GITIGNORE-CLAUDE-TMP** (medium, cross-service/ — gitignore .claude/tmp + rm --cached 111 UUID-leaking hook snapshots) + **FIX-AGENT-NOTEBOOK-UUID-PROVENANCE** (medium, zone:multi — audit agent memory for raw session UUID, fix agent instr via agent-father, add pre-commit/CI guard). Forward-fix only, no history rewrite.
- **S5 (router .md, LOW):** **FIX-MACRO-SNAPSHOT-REGIME-PARSE-DRIFT** (low, cross-service/ — regime-extraction skill greps a dead 'Global Liquidity:' text line -> NEUTRAL fallback; prefer reading nested structured signals field).
Dedup: none collide. Did NOT duplicate FEAT-SEVERITY-OVERRIDE-SURFACING (already backlog). **Writes:** orch-apply exit 0 x2 (backlog 398->402, then status TODO->BACKLOG for lane coherence; 104 pre-existing SHG warnings non-blocking). .head UNTOUCHED (router owns tick). No push (fleet-push owns). Return to router: BATCH of 4 backlog entries.

## Carry-over
- **RECOMMENDED NEXT DISPATCH (router):** ops → rebuild+deploy mcp-server carrying COLUMN-ORDER (d69b13f41+e73a53688, done_verified) per feedback_user_gates_delegate_to_ops (07-03 OVERRIDE: delegate gated deploys to ops). AFTER deploy: bctc-analyst (refine_bctc_md) STEP1 + dev-mcp-server STEP2 reingest on live CTG 96e36139 → RAW-verify total_assets → both W5 rows done_verified. Same deploy unblocks the standing finalize_bctc_refine follow-up.
- `FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD` sits in backlog (plan-only) — needs po→ba→pm→dev when a slot opens; architect SPLITs multi-zone. Permanent fix; the live instance was router-mitigated.
- BCTC-HNX-SSL-HARDEN — deploy-gated (dev-vps-crawls); bundle with the ops deploy if same rebuild covers vps-crawls, else separate.
- 11 dup signal_queue rows id=sau-d4-202607030300 (all READ) — tracked by FU-AUDITOR-D4-SIGNAL-ID; no new task.

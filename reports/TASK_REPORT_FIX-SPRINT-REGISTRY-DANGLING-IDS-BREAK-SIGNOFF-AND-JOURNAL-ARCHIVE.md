# Task Report: FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE — reconciliation + Stage 1h guard + archiver correction, QA verify

date: 2026-08-22
outcome: APPROVED / DONE_VERIFIED (Direct-Commit Verify — `branch:null`, developer committed straight to main)

## Chain recap

1. PO signed off the classification table (`po_signoff_20260822T2100Z`, W1-W4 binding) after a
   long architect/PO amendment cycle (brief §11).
2. Developer applied: (a) the reconciliation write via `orch-apply.sh` (11 `active_sprints[]`
   stubs, 2 RELABELs, 3 NEVER_WAS/STRIPs), (b) Stage 1h validator wiring
   (`checkSprintRegistryReferentialIntegrity`, delegates to §15's
   `classifySprintRegistryDanglingIds`), (c) `decision-journal-archive.sh` §2.3 closed-id
   correction + AC-4 third-state signal branch, (d) fixed a bare-Set-arg bug in the Stage 1h call
   site before it was ever committed. Handed off with 5 commits + a router pre-verification that
   all 5 exist in `git log`.
3. This round (qa) — independent re-verify per router's gate-keeper brief; did not trust
   narration for the 2 explicitly flagged risk items (smoke-write claim, 50-pre-existing-failures
   claim) or for anything else.

## Re-derived Evidence (RAW — not trusted from developer's notebook/commit prose)

### 1. Referential-integrity re-run (live)
```
bun scripts/audits/verify-sprint-registry-referential-integrity.mjs
→ SUMMARY strict_dangling=8 LIVE=0 FINISHED=0 RELABEL=0 NEVER_WAS=0 PRE_SPRINT_LABEL=8 counted_violations=0
```
Matches `po_signoff_20260822T2100Z` exactly (24 ids total: 11 LIVE + 2 RELABEL + 3 NEVER_WAS =
16 counted, now 0 after write; 8 PRE_SPRINT_LABEL exempt by design, unchanged).

### 2. Delegation is real, not narrated
`orchStateSchema.ts:1765` — `checkSprintRegistryReferentialIntegrity()` literally calls
`classifySprintRegistryDanglingIds(data, opts)` and filters on `classification !== "PRE_SPRINT_LABEL"`.
Single call site in `scripts/orch-validate.mjs:641-644` passes the object shape
`{coldClosedSprintIds, coldDoneTasks}` (not a bare `Set`) — the bare-Set-arg bug the developer
described as "already fixed pre-commit" is not present anywhere in history (`git log -S` on
`coldDoneTasks.map` returns nothing — it never existed committed).

### 3. Fresh live smoke write (the router's #1 flagged risk)
```bash
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
jq --arg t "$now" '._updated_at=$t | ._updated_by="qa-smoke-test"' docs/data/orch/orch-state.json \
  | bash scripts/orch-apply.sh
```
`exit=0`, `[orch-apply] OK — candidate applied`. Stage 1h ran to completion with zero crash.
Re-read the file: `_updated_at`/`_updated_by` genuinely changed on disk. **The fleet-wide
write-path blocker is confirmed fixed live, right now — not just narrated.**

### 4. Reconciliation payload diffed byte-for-byte
Traced the actual data mutation to commit `986717b53` (see §7 below for the attribution finding)
and confirmed against the live file:
- 11 `active_sprints[]` stubs added: `ANALYSIS-QUALITY-CONVERGENCE`, `COWORK-GUARANTEED-SLOT-CATCHUP`,
  `FE-PAGE-REORG`, `FIX-BCTC-BANK-SUMMARY-MAPPING`, `FLOW-PRICE-ALPHA-LOOP`,
  `INPUT-VALIDATION-COVERAGE`, `S2-DATA-HONESTY`, `SYSTEMIC-REMAKE-P1`, `TEST-HYGIENE`,
  `TOKEN-ECONOMY-AUDIT`, `ULTRACODE-AUDIT-FIXALL` (all `{id,status:"active",goal,opened_at,tasks:[]}`).
- 2 RELABELs: `BA-IND-P1-MOMENTUM-FRONTEND`→`MARKET-INDICATOR-DEPTH-P0` (2 referencing rows),
  `UC-RDL-P4`→`ULTRACODE-AUDIT-FIXALL` (1 referencing row). Live re-query: **zero** rows still
  carry either superseded id as `.sprint`.
- 3 NEVER_WAS/STRIPs: `TASK-17` (bare task-number, 1 row), self-referential
  `FIX-BCTC-CTG-BALANCE-SHEET-REFINE` (row.id==row.sprint, B1(b) STRIP), `"BACKLOG"` sentinel
  (~19-22 rows). Live re-query: zero rows still carry any of the 3 as `.sprint`.

### 5. Test suite — independently re-run, not copy-pasted from developer's report
```
bun test src/__tests__/FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE.test.ts
→ 28 pass, 0 fail

bash scripts/agents-flow/decision-journal-archive.test.sh
→ Test Results: PASS=51 FAIL=0

bun tsc --noEmit  → 0 errors

bash scripts/audits/mock-guard.sh --files "apps/mcp-server/src/infrastructure/orchStateSchema.ts
  scripts/orch-validate.mjs scripts/agents-flow/decision-journal-archive.sh"
→ PASS — no fabricated-data patterns found
```
DDD/security greps on `orchStateSchema.ts`: no `from.*infrastructure` (n/a — file is itself
infrastructure layer), no `process.env` added, no real secret/credential literals (only
"token"-as-in-liveness-token comments — false-positive checked).

### 6. Full `bun test` baseline claim (the router's #2 flagged risk)
Independently re-ran the full suite (476s, 15425 tests across 1277 files):
```
15334 pass / 51 fail / 40 skip
```
Developer claimed `15335 pass / 50 fail / 40 skip` — a 1-test delta, consistent with observed
timing-flaky tests in this very run (e.g. `1518-get-foreign-flow-ohlcv-source.test.ts` hit hard
5000ms timeouts). All 51 failures span exactly 16 files: `1146-get-insider-transactions`,
`1113-vps-proxy-health`, `FIX-ORPHAN-FR2-FR6-FR7-INTERFACE-COORDINATION-TOOLS`,
`1844-backtest-retrieval`, `1858c-logvpspush-fix`, `1518-get-foreign-flow-ohlcv-source`,
`RAPID-B2-get-market-cap-tool`, `1405b-bctc-vps-fixes`, `TSU-DEV-U5-foreign-flow-null-holding-ratio`,
`251-mcp-tools`, `1892a-pushNewsHandler`, `VPT-1-vps-proxy-health-endpoint`,
`FIX-POLLNEWS-COUNTER-CONSERVATION`, `235-telegram-send-merge`,
`1875c-record-signal-outcome-routing`, `1193-push-prices-persist` — none of which this task's
diff touches (`orchStateSchema.ts` / `orch-validate.mjs` / `decision-journal-archive.sh` /
`dev-standards.md` / the new test file). `git log -1` on each of these 16 test files shows last
modification in 2026-05/2026-06 — months before this cycle. Failure signatures (count/state
mismatches like "Expected: 2 Received: 0", hard 5000ms timeouts) match cross-file shared-DB /
timing contention typical of a single-process full-suite run, not sprint-registry logic.
**Baseline claim HOLDS** — genuinely pre-existing and unrelated.

### 7. NON-BLOCKING PROCESS FINDING — commit attribution split (found independently, not asked for)
The actual reconciliation data write (the 11 stubs + 2 relabels + 3 strips in §4) is **not
present in any of the 5 commits the developer reported** (`1897ef6a2`, `bdc0dc10c`, `77a41204b`,
`8b4be3699`, `bf38683b2`). It physically landed inside commit `986717b53` —
`"arch(mcp-server/predict-engine-calibration): FR-1..FR-5 technical design"` — an unrelated
architect commit whose `Task:` trailer names only `SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP`.
Per `docs/policies/commit-convention.md` ("multiple tasks in one commit: comma-separate the
`Task:` trailer"), this commit should have carried a second, comma-separated `Task:` entry for
`FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE`.

Root cause: a shared-working-directory commit collision with a concurrent architect session —
the developer applied the reconciliation write to disk via `orch-apply.sh` (23:13 local or
earlier) before running their own `git commit`; the architect's commit landed first and captured
the still-uncommitted mutation along with their own unrelated diff. The developer's own
notebook closeout list (commit `bf38683b2`) omits `986717b53` entirely — the developer is
unaware their write's commit boundary got absorbed into someone else's commit. This matches the
already-tracked systemic hazard class (subagent shared-working-directory collision / peer-commit
race — see project memory `feedback_subagent_branch_checkout_hijacks_shared_working_dir.md`).

**Disposition:** non-blocking. The data content is independently verified correct byte-for-byte
regardless of which commit carries it (§4), and the write is already on `main` — rewriting
shared history to retroactively fix attribution would be a higher-risk action than the paperwork
gap itself. Recorded here (and in the row's `review_note`) so the audit trail can be
cross-referenced; flagging as a recurrence of a known systemic risk for whoever owns fixing the
underlying shared-workdir hazard (out of this task's scope).

### 8. Decision-journal archiver — dry-run-only corpus scan, no real journal moves
Confirmed via `git status docs/agent-memory/decisions/ docs/archive/decisions/` — zero
modifications. The real `docs/signals/sprint-registry-unresolved-ids-20e42f1eea943044-*.json`
signal already sitting in the repo (257 unresolved ids, mostly per-task not per-sprint journal
filenames) is the AC-4 third-state branch working as designed against the live corpus — it makes
a previously-silent gap visible, it is not a new defect. AC-5.2's live journal-move demo was
disclosed as deliberately deferred; confirmed true, not silently executed.

## Test Results
- `bun test` (new file): 28 pass / 0 fail (re-run, not trusted from prose).
- `bash decision-journal-archive.test.sh`: 51 pass / 0 fail (re-run).
- `bun tsc --noEmit`: 0 errors (re-run).
- `mock-guard.sh`: PASS (re-run).
- Full `bun test`: 15334 pass / 51 fail / 40 skip (re-run; 51 failures independently confirmed
  pre-existing + unrelated, see §6).
- DDD scan: clean. Security scan: clean.

## Issues Found
### Blocking
None.
### Non-Blocking
- §7: reconciliation write's commit lives inside an unrelated architect commit (`986717b53`),
  missing this task's `Task:` trailer — commit-hygiene / shared-workdir-collision finding,
  recorded for awareness, no redo requested.

## Merge Status
APPROVED → DONE_VERIFIED. No merge/push/branch-delete (already on `main`, direct-commit
convention —`branch:null`). Status-flip: `.task_board.review[]` → `.task_board.done_verified[]`,
`next_agent:"pm"`, via ONE `scripts/orch-apply.sh` write, `verification.raw_probe` attached
(schema-required for any `DONE_VERIFIED` flip; row not in `RC_VERIF_GRANDFATHERED_IDS`). Board
write re-read post-write: row absent from `review[]`, present in `done_verified[]` with all
fields correct (`status`, `next_agent`, `qa_verified_at`, `qa_verified_by`, `verification`,
`review_note`). `orch-apply.sh` Stage 0/1 PASS, conservation OK (`task_total` live=725
candidate=725), row-prose-ceiling OK (0 net-new-growth violations, this row exited the checked
lanes by moving to `done_verified[]`).

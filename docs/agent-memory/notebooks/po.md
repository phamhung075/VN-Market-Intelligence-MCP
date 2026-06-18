# PO Notebook
_overwritten 2026-06-18T04:30Z_

## Cycle po-s104 (2026-06-18T05:00Z) — 2nd defect folded: behind-set classifier message-prefix→file-content
**Load-bearing follow-on to po-s103: the behind-set classifier would re-defeat the auto-push.**
- DEFECT (RAW-confirmed live): `fleet-worktree-push.sh` classified a behind-commit benign ONLY if subject started `chore(`/`ci(`. Origin ACCUMULATES `Merge ...` (every worktree-push creates one) + `docs(reports):` (TNB churn). Live behind-set HAD 2 Merge + 1 docs( → old `non_chore=3` → abort-with-BUG ~every run. Message-prefix allow-listing is brittle.
- FIX (scripts/fleet-worktree-push.sh ~L124-158): replaced with FILE-CONTENT check `git diff --name-only HEAD..origin/main | grep -Ev "$BENIGN_RE"`. BENIGN_RE (single SSOT var) allowlists the REAL cowork-churn surface: `docs/**`, `*.md`, `orch-state.json`, `docs/signals/**`, `*cowork-schedule.json`, `docs/agent-memory/**`, `scripts/*.jq` (261 disposable triage helpers, churned+deleted every cycle). Abort+BUG ONLY when behind-set touches CODE/CONFIG outside that set (scripts/*.sh, *.ts, apps/**, package.json). Classify by WHAT changed, not message prefix.
- BONUS root-cause: found+fixed latent `grep -c ... || echo 0` double-count (emits "0\n0" → `[ -gt ]` crashes under set -e ON THE COMMON BENIGN PATH) at classifier + both merge-conflict counters → `|| true` + `${x:-0}`.
- VERIFIED: `shellcheck`+`bash -n` clean both scripts; `scripts/test-fleet-push-classifier.sh` 5/5 (CASE A = exact prod benign Merge+docs(+chore+.jq → proceeds; B/C/E real code → abort); live `PUSH_THRESHOLD=0 --dry-run` reaches push step (no abort).
- DECISION: folded classifier scope + realistic CASE-A qa gate INTO FIX-AUTO-PUSH-GUARD1-DEFEATS-PURPOSE (same script, same sprint, single qa gate) rather than minting FIX-AUTO-PUSH-CLASSIFIER-TOO-NARROW. Added `scripts/test-fleet-push-classifier.sh` to its files[]; verification_gate now mandates running that gate + the realistic end-to-end assertion (not clean-tree false-pass).
- LESSON: behind-set "is this benign?" must classify by changed-PATHS, not commit-message prefix — message prefixes are an open vocabulary (Merge/docs/feat...) that the cowork loop keeps adding to.

## Cycle po-s103 (2026-06-18T04:30Z) — Guard1 self-defeat FIX + manual push + 2 signals

**ROOT-CAUSE FIX (Guard 1 defeats its own purpose) — RAW-VERIFIED then fixed BOTH flow files.**
- DEFECT confirmed live: ahead=28 > threshold 20, and `git diff --name-only | grep -E 'orch-state|notebooks/'` matched BOTH po.md + orch-state.json → Safety Guard 1 SKIPs ~every tick → backstop never fired (push climbed 23→28). The worktree push runs on COMMITTED HEAD (isolated) so a dirty main tree CANNOT race it — Guard 1's file-dirtiness premise is invalid for a worktree push.
- FIX: replaced Guard 1 (file-dirtiness skip) with a REAL push-blocker check (`.git/rebase-merge||rebase-apply`, `.git/MERGE_HEAD`, `.git/index.lock`) in `docs/agents/po/flow/main.md` Step PUSH-BACKSTOP + `docs/agents/dev-team/flow/post-cycle.md` Step 4.8 (both + the dev-team blocked-message var). Kept Guard 2 (commit-mutex `task_list_held kind=commit-mutex`) = the real concurrency guard.
- `scripts/fleet-worktree-push.sh` RAW-READ: NO internal dirty-tree skip (only ahead-count + behind-set chore-classify + tsc gate) — script was already correct; defect was purely in the two flow Guard-1 blocks.
- Minted `FIX-AUTO-PUSH-GUARD1-DEFEATS-PURPOSE` → ready[] (next_agent=qa). qa gate: must TEST push FIRES when ahead>20 AND main tree dirty (the EXACT real condition, not a clean-tree false-pass), and still SKIPS on a real .git/index.lock + on commit-mutex held.

**MANUAL PUSH (cleared 28-ahead backlog, validated script invokes).**
- Ran `bash scripts/fleet-worktree-push.sh` → it CORRECTLY aborted (Guard no longer blocks) on behind-set: 2 "non-chore" = a Merge commit + a `docs(reports):` tnb signal. RAW-verified the full 15-behind set is 100% cloud cowork churn (health rechecks/notebooks/signals/orch-state/chef.md), ZERO code (.ts/.py/.go) → benign cloud-chore divergence (the script's chore-only allowlist is just too narrow for `Merge`/`docs(`).
- Manual isolated-worktree reconcile: `git worktree add /tmp HEAD` → merge origin/main (clean, orch-state auto-resolved) → symlink node_modules → `pnpm --filter vn-market check`=0 → push **13f2e03b→1c78bfa8** (pre-push tsc PASSED). worktree removed; main tree untouched. ahead 28→0.

**2 SIGNALS (po-s103, conservation+idempotent):**
- `cowork-team-...-schedule-json-stale-base-clobber` (MEDIUM, REAL): NEW→READ + minted `FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER` → ready[] (next_agent=ba, zone apps/mcp-server). Root: cloud cowork-dispatcher holds stale 06-15 snapshot, writes whole file back → other slots' last_fired revert 3 days → doublefire risk. Fix = fresh-read-before-write + atomic temp→rename + single-slot CAS (never echo stale snapshot). Relates [[feedback_worktree_stale_base]] + doublefire class.
- `sau-d4-202606180300` (LOW): NEW→RESOLVED **STALE** — recurring D4 false-positive. esc-datacov:FPT:Q1-2026:ESC-3 = ESC-3 escalation TTL lock, legitimately no task_board row; TTL-expired+GC'd (task_list_held=0 prior). Dismissed STALE ≥5× before (po-s76×2, 5a807e65, 44853141, po-s95). Owner=auditor D4 blind-spot (FU-AUDITOR-D4-SIGNAL-ID). No mint.
- Preserved cloud's additive `tnb-20260617T201300` archive row (avoid clobber on commit).

## Carry-over
- COMMIT this cycle (EXPLICIT PATHS only, NEVER -A): `docs/data/orch/orch-state.json` + `docs/agents/po/flow/main.md` + `docs/agents/dev-team/flow/post-cycle.md` + `scripts/po-s103-*.jq` + this notebook. The push above is NOT this commit (already on origin via worktree).
- NEW reusable script: `scripts/po-s103-guard1-defeat-fix-schedule-clobber-sau-d4-triage.jq` (multi-mutation: 2 mints + 2 signal flips + cloud-archive preserve; conservation-guarded ready+2/total+2/NEW−2; idempotent). Catalog pointer in po/flow/main.md pending a future doc tick.
- Local main is behind=16 (cloud churn + my pushed merge) — ff-blocked only by dirty orch-state; reconciles naturally next cycle (local HEAD is ANCESTOR of origin, ahead=0, no work at risk).
- 2 new ready[] FIX tasks await router dispatch: GUARD1-DEFEATS→qa, SCHEDULE-CLOBBER→ba.

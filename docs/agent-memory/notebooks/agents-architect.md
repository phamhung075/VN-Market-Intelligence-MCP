# agents-architect — Notebook

## 2026-07-23T04:10:09Z

**Brief:** `docs/architecture-briefs/2026-07-23-auditor-a30-reclamation-gate-a21-windowed-restart.md`

FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE (recurring_bug_count=4, PO-commissioned 2026-07-23T03:47Z): root-caused the 07-23T03:42Z false CRITICAL to an ungated 2-point MemPerc delta (tier1-probe.md's A-30 section defines no CRITICAL branch at all — the LLM improvised one) propagating correctly through emit-audit-signal.sh's (sound-by-design) severity-rank escalation-bypass. Found the fix mostly already exists unwired: `scripts/audits/verify-a30-mcp-memory-reclamation.sh` (multi-probe/OOMKilled/VmHWM discriminator, used ad hoc by cowork triage 3x) — design wires it as a conditional subprocess from probe.sh (baseline≥85% gate), makes A-30 verdict a single self-contained per-cycle bundle (never cross-cycle), adds a VmHWM>VmRSS veto in the calling layer (closes a real gap the untouched script left unwired). A-21 re-modeled as a read-only windowed bun:sqlite query porting mcp-server's own restartCadenceAlertJob.ts discriminator. Zero edit to emit-audit-signal.sh (shared, out of declared zone) — dedup item satisfied structurally since benign findings never call it. Change zone: docs/agents/system-auditor/probe.sh + flow/tier1-probe.md only. A-12/A-04/A-13 debounce (row scope item 2) explicitly flagged out-of-scope for this wave, not silently dropped.

**Signal dropped:** `docs/signals/auditor-a30-reclamation-gate-a21-windowed-restart-20260723T041009Z.json` → agent-father

---

## 2026-07-29T21:20:46Z

**Brief:** `docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md`

SPIKE-DEVTEAM-QADRAIN-HEAD-SLOT-DECOUPLE: root-caused why dev-team's Review-Lane QA-Drain (main.md §674-726, its own independent qa[]<1 budget) is nested inside the head-idle-only fall-through, so its budget is never evaluated while `.head` is busy (120 review[] rows eligible, oldest 6d+ stale, live-reconfirmed). Confirmed dev-team's filed remedy (run QA-Drain unconditionally) was correctly rejected by PO — the claim script's `.head` write is an unconditional whole-object replace that would clobber a genuinely live `.head` (PO's live dry-run proved it). Recommended: Part 1 — make the script's `.head` write conditional (mirrors `devteam-wrapper-autoclose.jq`'s own guard shape), script-only, zero file conflict, ships standalone; caller of the one existing call site needs no edit (head is always free there by construction). Part 2 — new head-decoupled invocation site placed AFTER the Session Gate / BEFORE Step 1 (traced control flow to verify zero byte overlap with the concurrent `FIX-DEVTEAM-IDLE-CHAIN-P1A-MAIN-ROTATION` P0 rewrite of §496-686, not assumed), carrying `depends_on` on that P0 row per PO's mandate (flagged as coordination safeguard, not strict technical necessity). Part 3 answered both framings explicitly: Part 2 remains necessary even after Part 1 ships (Part 1 only makes the write safe, doesn't change reachability), and one-row-per-tick throughput is NOT sufficient against the live backlog (hourly cron, `qa[]<1` is a system-wide cap) — recommended a separate follow-up row, out of scope here.

**Signal dropped:** `docs/signals/qadrain-head-slot-decouple-20260729T212046Z.json` → po (cc agent-father, developer)

---

## 2026-07-31T01:48:31Z

**Brief:** `docs/architecture-briefs/2026-07-31-sweepguard-escalation-actuator-and-triage-mechanism-check.md`

Po directly dispatched (post-triage) FIX-SWEEPGUARD-WARN-ONLY-NO-ACTUATOR-AND-TRIAGE-MISADJUDICATION: sweep-guard hook (`scripts/git-hooks/pre-commit`) logs BARE commits forever but never blocks (14 warns/8h, 4 sessions), and this session's own triage had been dispositioning all 4 live signals "benign" on a clean `git show --stat` (outcome), not the mechanism the discriminator already proves by construction. Designed a per-actor escalation actuator (`GIT_SWEEP_GUARD_ESCALATE_THRESHOLD=3` default, reuses existing `.git/sweep-guard.log` `actor=` field, zero new deps) that converges repeat offenders to a hard block same-session, without waiting on po's own staged fleet-wide `GIT_SWEEP_GUARD_MODE` flip (kept as Phase 2, 24h observation + rollback command). New routing rows for `triage-signals.md` + `drain-signals.md` §0a-3 make the mechanism check (payload's own BARE/SCOPED tag + new `escalated=` field) mandatory and name the "`git show --stat` clean" non-disposition explicitly forbidden.

**Signal dropped:** `docs/signals/sweepguard-escalation-actuator-and-triage-mechanism-check-20260731T014831Z.json` → agent-father (cc po, dev-team)

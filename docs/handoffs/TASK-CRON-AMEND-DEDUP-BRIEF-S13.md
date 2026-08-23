# TASK-CRON-AMEND-DEDUP-BRIEF-S13

**Zone:** `docs/architecture-briefs/` · **Owner:** `architect` · **Size:** S (~1h) · **Priority:** P1
**Parent row:** `FIX-CRON-REARM-STEP1B1-LIVENESS-ORACLE-BLIND-WINDOW-FALSE-LIVE`
**Architect brief:** `docs/architecture-briefs/2026-08-23-cron-rearm-liveness-oracle-process-observation.md` §2, §5 item 6
**depends_on:** none — independent of the code/doc chain, can run in parallel

---

## TLDR
`docs/architecture-briefs/2026-08-06-cron-rearm-cross-session-dedup.md` §1.3 is the spec SSOT that **justifies** the broken guard. It makes two claims that are measurably false. Until they are amended in place, the next reader re-derives the same wrong design.

## Acceptance Criteria

- [ ] **AC-1 — Claim 1 amended.** §1.3 asserts *"session-presence is the primary signal; the moment a session's CLI process actually dies, its presence row simply stops renewing."* A presence row exists only if something inside that session claimed `session-presence:<SID>`. Absence therefore means *"nothing in that session ever claimed presence"* — a different proposition from *"that session is dead"*. Cite the live measurement (2026-08-23T09:18Z): `task_list_held(kind="session-presence")` → **2 rows** (`7be6b4cd`, `007e33e4`) against `ps -eo pid,command | grep '[c]laude'` → **5 live CLI processes** (2802, 42066, 42648, 71334, 78588); session `88555d2e` holds `cron-registration:standalone-team`, is absent from the roster, and is demonstrably alive (transcript mtime 16 s old at measurement).
- [ ] **AC-2 — Claim 2 amended.** §1.3 calls `task_force_release_orphan`'s threshold *"a second, independent liveness check server-side."* It is **not independent**: it reads `heartbeat_at` on the **same marker row**, a field renewed only by that marker's own owner. `now - heartbeat_at < T` evaluates "the owner was alive T seconds ago", never "the owner is alive". It is a lagging derivative of Claim 1's subject, not a second observer.
- [ ] **AC-3 — the unifying sentence is stated explicitly.** Both oracles read bookkeeping the session wrote about itself; neither observes the OS. Record that this single fact explains the two opposite-direction failures (false-LIVE at `T=7200` with a renewal hook, false-DEAD at `T=120` without one) **without needing two theories**, and that therefore no value of `T` can fix it.
- [ ] **AC-4 — amend in place, do not retract or fork.** Append a numbered amendment section to the SAME file naming exactly which paragraph each subsection supersedes (matches this repo's changelog convention and the precedent set in decision-journal STEP architect-S33). Do **not** write a v2 file. §1.1/§1.2/§1.4+ are not retracted.
- [ ] **AC-5 — forward pointer.** The amendment cites `docs/architecture-briefs/2026-08-23-cron-rearm-liveness-oracle-process-observation.md` as the superseding design (O1 → O2 → O3 ranking, explicit UNKNOWN branch, `orphan_threshold_seconds` demoted to a write-side CAS guard at a uniform 120).

## Files
- **Modify:** `docs/architecture-briefs/2026-08-06-cron-rearm-cross-session-dedup.md` (§1.3 + new amendment section)
- **Read first:** `docs/architecture-briefs/2026-08-23-cron-rearm-liveness-oracle-process-observation.md` §2 and §3
- **Do NOT modify:** the three `.claude/skills/cron-*/SKILL.md` files (owner `agent-father`, task `TASK-CRON-SKILLMD-PROBE-WIRING`) or anything under `scripts/`

## Standards
`docs/policies/dev-standards.md` · commits: `docs/policies/commit-convention.md` (`Task: TASK-CRON-AMEND-DEDUP-BRIEF-S13`)

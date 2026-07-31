# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · agents-architect

**Sprint goal:** Make cowork `guaranteed:true` an honored contract (look-back/catch-up firing) — this entry's task is unrelated ambient P0 work picked up via Supervised-Lane Sweep; journal bucketed to the current active sprint_id per decision-journal SKILL.md § Resolve Sprint ID mechanics, not sprint-scoped work.
**Agent:** agents-architect
**Started:** 2026-07-31T04:29:55Z

---

### STEP agents-architect-S1 · agents-architect · 2026-07-31T04:29:55Z
**task-id:** FIX-CIRED-TRIAGE-WRONG-PLANE-DEDUP-AMNESTY
**what-done:** Authored brief `docs/architecture-briefs/2026-07-31-cired-triage-failedfile-dedup.md` (exact replacement row text for `triage-signals.md` §ci_red + two doc-accuracy edits for `ci-health-probe.md`) and dropped `brief_complete` signal to agent-father (cc po, dev-team); executed AC-5 retro-sweep live via `gh run view` rather than trusting the prior pass's claim.
**what-considered:**
- Add FAILEDFILE-parsing logic to the probe script (`ci-health-probe.js`) so the signal payload carries files directly — rejected: duplicates the bash script's own log-format parsing in a second language, drifts easily, and `payload.run_id` already lets PO do a live, freshest-possible read at triage time.
- Collapse multi-file ci_red into one FIX row per signal — rejected: contradicts already-validated production practice (two sibling rows minted from one signal on `FIX-CI-FRONTEND-ESLINT-BUNLOCK-DUAL-LOCKFILE-DRIFT` / `FIX-CI-SIZELINT-MACRO-VMT-LIQUIDITY-RESOLVERS-NEW-OFFENDER`).
- Chosen: PO-side live `gh run view --log-failed` read (matches AC-1's literal command) + FILE-scoped `dedup_key: ci_job:<job>|file:<file>` primary key, formalizing a pattern PO had already hand-executed twice successfully before this row shipped.
**why-decision:** Field evidence (2 independently-minted rows + 1 confirmed dedup hit, all pre-dating this row) already proves the PO-side-only design works end-to-end with zero probe changes; adding probe logic would be unvalidated scope creep on a P0/S plan-only row.
**why-change:** No change from row's own AC-1..AC-4 — implementation detail only (probe untouched vs. task text not mandating that either way).

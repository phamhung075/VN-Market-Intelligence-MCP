# Decision Journal — Sprint FIX-EXECTIER-HEADSYNC-BRANCHNULL-REVIEW-IDLE · developer

**Sprint goal:** execute-tier.md head-sync must set head.status=idle (never review/in_progress) for branch:null REVIEW flips, so BOUNDED-1..QA-Drain fall-through is reachable.
**Agent:** developer
**Started:** 2026-07-23T19:21:54Z

---

### STEP developer-S1 · developer · 2026-07-23T19:21:54Z
**task-id:** FIX-EXECTIER-HEADSYNC-BRANCHNULL-REVIEW-IDLE
**what-done:** Root-caused live: 47 `review[]` rows, `qa[]=0`. Confirmed real prior incident (commit `38f081ec1`, task `UC-GCP-P1`) where a `developer` DONE→REVIEW self-closeout correctly lane-moved (a) but set `.head.status="review"` (mirrored task status) instead of `"idle"` — `"review"` IS a valid `.head.status` enum value (orch-state-access.md §5) but matches NEITHER dev-team/main.md's `in_progress` branch NOR its `idle/done` fall-through, silently skipping BOUNDED-1→SLS→RLC→QA-Drain. This IS the origin signal for this exact board row.
**what-considered:**
- Fix pm/flow/main.md's per-task "Task → Review" line directly — rejected: architecture-brief audit already ruled duplicating the SSOT clause elsewhere violates the anti-copy-paste invariant; execute-tier.md is the single canonical binding text for pm/qa/developer/fixer.
- Write a generic reusable jq flip-helper script — rejected: grepped scripts/, confirmed 40+ existing one-off `*-review.jq` files, no shared helper call site exists; the flip is LLM-interpreted prose each tick, not code-enforced, so there is nothing to "wire in" a script to.
- Amend execute-tier.md § MUST (b) to add an explicit branch:null sub-rule (idle-only, never mirror status) + branch-carrying sub-case unchanged — CHOSEN: fixes the SSOT text every executor reads, matches task's explicit scope guard (don't touch worktree-task semantics).
**why-decision:** SSOT clause is the only text bound to ALL flip-executing agents; fixing it there closes the gap for every future flip without duplicating text or inventing an unused script.
**why-change:** No change from plan — matches task's FIX SHAPE instruction exactly.

### STEP developer-S2 · developer · 2026-07-23T19:24:00Z
**task-id:** FIX-EXECTIER-HEADSYNC-BRANCHNULL-REVIEW-IDLE
**what-done:** Added synthetic-fixture regression verifier `scripts/audits/execute-tier-branchnull-review-headidle-verify.sh` (before=OLD ambiguous pattern reproduces head.status="review"; after=NEW pattern yields idle/null/router) — ran, PASS, exit 0. No live orch-state.json write.
**what-considered:**
- No script, doc-only diff only (task's explicit fallback option) — considered sufficient but codebase convention ships a "Regression verifier" pointer for every prose-only gate (bounded1-prose-sequencing-gate-verify.sh, dispatch-gate-satisfiability.sh); chose to match convention since it's cheap and grep-discoverable.
**why-decision:** Matches sibling prose-gate fixes' evidentiary bar; honest about NOT being a live-compliance test (documented explicitly in script header).
**why-change:** none.

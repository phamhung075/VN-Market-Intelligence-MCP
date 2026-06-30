# Decision Journal — Sprint HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING · po

**Sprint goal:** Durable root-fix for recurring agent-notebook 200L breaches (write-time self-cap)
**Agent:** po
**Started:** 2026-06-29T19:03:19Z

---

### STEP po-S1 · po · 2026-06-29T19:03:19Z
**task-id:** HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING
**what-done:** Promoted existing dedup-anchor backlog→ready (P2→P1, next_agent=architect), extended scope to 4-part sweep, head→in_progress(architect).
**what-considered:**
- Mint a NEW notebook-append-class-systemic-sweep task (router's suggested shape)
- Dedup into existing HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING anchor + extend its scope
**why-decision:** Existing task's `dedup_anchor_for` is EXACTLY this recurrence; a parallel task = SSOT dup + 2 anchors. RAW-verified router's membership-gap AND the task's enforcement-gap are complementary halves → folded both into one anchor.
**why-change:** Router suggested a new task; chose dedup+extend instead (no-treadmill memory). Routed through architect first (policy owner of file-size-caps.json) per recurring-bug→DESIGN rule.

---

### STEP po-S2 · po · 2026-06-30T02:23:52Z — ACTIVATION-GAP FOLLOW-UP (dedup, NO new anchor)
**task-id:** HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING
**trigger:** context_bloat_breach signal on pm.md (emitted 2026-06-30T02:10:33Z) — pm.md GENUINELY 228L > 200 cap RIGHT NOW (RAW-verified), 6 `##` sections, 2 oldest (c325 ~21L + c324 ~95L) easily droppable → NOT the safe-fail no-droppable case. Distinct from the prior stale-count dups.
**root (confirmed):** The headless auto-prune backstop (`scripts/agents-flow/notebook-auto-prune.sh`, on-disk + wired PostToolUse in `.claude/settings.local.json`) DID NOT FIRE on the peer PM's c327 write (commit f709f4df, 2026-06-30T02:11:20Z) — if loaded it would have loop-dropped the oldest sections to ~112L (it only safe-fails at 0-or-1 section, and pm.md has 6). **Cause = session-restart ACTIVATION GAP:** Claude Code loads hooks/settings.local.json into a session's running process at SESSION START. The HARDEN hook-wiring shipped ~2026-06-29T19:21–19:38Z. Both the live peer session (d3292ca4, driving MARKET-INDICATOR-DEPTH-P0) AND this dispatcher session (693817d0) started BEFORE that → neither running process has the auto-prune hook loaded → notebooks written by these in-flight sessions (pm.md by the peer) breach 200L unprotected. The fence + SSOT registration + AC-5 BLOCKING parts are FILE-STATE (already live for all sessions); only the headless auto-prune backstop is PROCESS-STATE (per-session, needs restart to activate). The HARDEN fix is CORRECT — this is a runtime-activation latency, not a hook defect.
**what-considered:**
- (a) One-time prune pm.md now to clear the active breach — REJECTED: it's the peer's notebook (peer holds the sprint+sub-task locks; peer-untouched guard), it's the exact symptom-fix the whole HARDEN sprint replaced, and the breach is BENIGN (notebook over-cap causes no functional harm — no flow reads >200L of it).
- (b) Request an OPS session-restart of the peer/cowork sessions to load the hook — REJECTED: restarting interrupts the peer's in-flight MARKET-INDICATOR-DEPTH-P0 sprint; benign noise doesn't justify the cost.
- (c) Document the activation-gap durably + let it self-resolve on next natural restart — CHOSEN.
**why-decision:** Activation gap is SELF-RESOLVING — the next natural restart of these long-running pre-19:30Z sessions loads the hook and all subsequent notebook writes self-cap; future sessions are born protected. No code change, no prune, no forced restart. This STEP is the durable capture (per "don't re-prune-and-done unless you also capture the gap").
**ACTIVATION note (durable, for the HARDEN follow-up):** The auto-prune PostToolUse hook protects ONLY sessions started AFTER it shipped (~2026-06-29T19:21Z). Long-running sessions started before that remain unprotected for their notebook writes until they restart. Expected residual: occasional benign 200L breaches on notebooks written by pre-ship in-flight sessions, clearing on restart. NOT a regression of HARDEN; do NOT re-open the anchor or re-prune as a fix. A restart is OPS-only and warranted ONLY if a pre-ship session is BOTH very long-lived AND its over-cap notebook starts causing real harm (it currently does not).
**disposition:** pm.md UNTOUCHED · no prune · no restart-requested · self-resolve-on-restart · dedup into THIS anchor (no fresh anchor minted).

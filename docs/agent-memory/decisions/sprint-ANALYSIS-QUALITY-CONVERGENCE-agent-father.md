# Decision Journal — Sprint ANALYSIS-QUALITY-CONVERGENCE · agent-father

**Sprint goal:** no active sprint scoped to agent-father directly — journal opened for ambient UNBLOCK dispatch under the currently-active sprint id per decision-journal SKILL.md resolution rule.
**Agent:** agent-father
**Started:** 2026-07-12T04:26:26Z

---

### STEP agent-father-S1 · agent-father · 2026-07-12T04:26:26Z
**task-id:** FIX-MARKET-WATCHER-NARRATE-NOT-EXECUTE-GUARD
**what-done:** Verified PO's root-cause hypothesis by direct comparison (unified-agent init.md/chef.md vs market-watcher init.md/main.md/cycle.md), then hardened market-watcher's `no_self_abort` constraint (init.md) + added an "Execute-not-narrate" Step -1 preamble to main.md (dispatcher, all modes) + an "Execution contract" preamble to cycle.md (executing flow, Step 0-GW→5b mandatory).
**what-considered:**
- Edit only init.md constraint (YAML declarative layer) — rejected: unified-agent proves the declarative constraint alone is not what stops narration; chef.md's inline "Gate-fired contract" procedural text is the load-bearing guard agents actually read step-by-step.
- Edit only main.md (single touch point, all modes pass through it) — rejected as sole fix: cycle.md is the actual executing flow (analogous to chef.md, not main.md) where the incident's per-step narration happened; main.md alone would not sit next to the steps being narrated.
- Copy chef.md's "Gate-fired contract" text verbatim into cycle.md — rejected: DRY/SSOT violation (each cowork agent already carries its own agent-tailored no_self_abort/self-refusal wording per established pattern — market-analyst, qa-responder, digest-predict, tran-ngoc-bau, alert-commander, bctc-analyst, fb-market-poster, news-scout all do this); wrote an adapted equivalent citing market-watcher's own step names (Step 0-GW, Step 5, Step 5b) instead.
**why-decision:** Confirmed root cause exactly: market-watcher's existing `no_self_abort` (init.md L47) only covered "notebook append self-refusal" — narrower than unified-agent's broad forbidden-output enumeration (English-prose refusal, BLOCKERS list, "would you like me to…", unilateral mid-flow stop) at init.md L52, and market-watcher had zero procedural equivalent of chef.md's inline "Gate-fired contract" (chef.md L139) inside its own executing flow. Applied fix at both layers (declarative constraint + procedural preamble in both the dispatcher and the executing flow) so the guard is present wherever the agent is actually reading instructions when it starts narrating instead of calling tools.
**why-change:** No change from PO's triage brief — hypothesis verified true on direct read, fix scoped exactly to the two files (main.md, cycle.md) + init.md named in backlog-detail.json `files` + constraints section, per agent-md-factory P-1/P-2/P-6 discipline (SSOT grep confirmed zero duplication of the new unique phrase before/after edit).

# Decision Journal — Sprint WORKFLOW-FLUIDITY · architect

**Sprint goal:** No agent workflow can livelock, silently drop a signal row, or strand a task lock.
**Agent:** architect
**Started:** 2026-06-07T00:00Z

---

### STEP arch-S1 · architect · 2026-06-07T00:00Z
**task-id:** WF-3
**what-done:** SPIKE complete. Investigated MCP gateway binding propagation for dev-*/qa sub-sessions. Issued ruling Option III: codify session-scoped constraint as enforced invariant (INV-GATEWAY-1). Produced architecture brief `docs/architecture-briefs/2026-06-07-wf3-dev-gateway-binding-ruling.md`. Also resolved WF-2 blockers (BLOCKER-WF2-A: orchStateStore.ts L221 appendSignalQueueRow; BLOCKER-WF3-A: Option A mtime retry). Updated WF-3 task status to REVIEW.
**what-considered:**
- Option A: grant gateway binding to dev-*/qa agent defs (`tools:` line update) — deferred to Phase 4 pre-condition; needs verified spawn-context propagation testing, multi-sprint risk surface
- Option B: outer-claim + periodic heartbeat — adds complexity vs Option III with zero liveness gain (TTL=3600s already covers spawn window)
- Option III: codify existing runtime model (dispatcher holds all locks, specialists use file-based .head only) — chosen because architecture already works this way; Phase 4 gates the Option A upgrade
**why-decision:** Option III is the correct ruling because: (1) Phase 4 / 1962c dispatch-claim skill already provides the outer lock — inner agents never needed their own claim; (2) C-2 FAIL-CLOSED rule in commit-mutex means any specialist invoking the skill directly will silently skip its commit (already happening in dev-frontend FETCH-OPS sprint); (3) .head atomic write via jq (WF-1) covers all pipeline state without MCP; (4) Option A requires spawn-context verification that is Phase 4 scope, not sprint scope.
**why-change:** no change from protocol file `docs/protocols/dev-star-gateway-binding.md` §2 which pre-captured the ruling — this entry confirms it as the formal SPIKE output.

---

### STEP arch-S2 · architect · 2026-06-07T20:30Z
**task-id:** WF-3 (RESUME — killed run completion)
**what-done:** Previous WF-3 run was killed mid-execution after writing `docs/protocols/dev-star-gateway-binding.md` and the decision journal arch-S1, but BEFORE adding the session-scoped note to `.claude/skills/task-lock/SKILL.md`. This resume run verified artifact state, confirmed the protocol file and commit-mutex SKILL were already complete, and added the missing INV-GATEWAY-1 note to task-lock SKILL under the `Dispatcher-Wrap Pattern` section.
**what-considered:**
- Restarting from scratch — rejected (protocol file + S1 journal + WF-3-IMPL commit 970c8e50 already shipped the ruling; sprint closed 81e7723f)
- Amending existing commit — rejected (sprint already closed; new commit appropriate)
- Only missing artifact was the task-lock SKILL note — minimal targeted completion
**why-decision:** Minimal-delta completion: one missing artifact, one targeted edit, one commit. No re-analysis needed — the ruling (Option III / INV-GATEWAY-1) was already signed off by PO in e40ff79f.
**why-change:** task-lock SKILL.md was not updated by WF-3-IMPL (970c8e50) — that commit only touched commit-mutex/SKILL.md. The task-lock skill is the primary reference for lock operations; the INV-GATEWAY-1 constraint must be stated there for flow authors who read only that skill.

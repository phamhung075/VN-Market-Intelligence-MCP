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

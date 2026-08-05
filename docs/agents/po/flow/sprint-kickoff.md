# PO — Sprint Kickoff (Self-Initiating Sprint)

**Entry from:** `po/main.md` § Dispatch when triage produces "no in-progress work but found backlog issues" OR when user explicitly asks "kick off a new sprint".

**Not for:** routine channel audit (stay in main.md), BA spec review (`po/review-ba-spec.md`), QA signoff (`po/sprint-signoff.md`).

---

## Self-Initiating Sprint

**1.** Assess: `docs/data/project-stats.json` (counts) | last 2 task reports | user session goal

**2.** Highest-impact: reliability (failing tests, footguns) | coverage (missing signals) | UX (useless alerts) | architecture (DDD debt)

**3.** Append entry to `docs/data/orch/orch-state.json` `.sprint_goal.entries[]` — write actuator, never raw read→modify→write, ALWAYS route via `scripts/orch-apply.sh` (FIX-PO-BATCH-MINT-NO-WRITE-ACTUATOR, 2026-08-05):
```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
jq --arg sid "$SPRINT_ID" --arg vision "$VISION" --arg scope_in "$SCOPE_IN" \
   --arg scope_out "$SCOPE_OUT" --arg metric "$SUCCESS_METRIC" --arg now "$NOW" \
  '.sprint_goal.entries += [{sprint_id:$sid, status:"active", vision:$vision, scope_in:$scope_in, scope_out:$scope_out, success_metric:$metric, created_at:$now}]' \
  "$PROJECT_ROOT/docs/data/orch/orch-state.json" | bash "$PROJECT_ROOT/scripts/orch-apply.sh"
```
(field shape unchanged — see JSON above for the entry produced)

**4.** Create BA task entry in `docs/data/orch/orch-state.json` `.task_board.backlog[]` — canonical shape per `docs/standards/task-schema.md`. `status` MUST be `"BACKLOG"` — `backlog[]`'s allowed set per `apps/mcp-server/src/infrastructure/orchStateSchema.ts` is `{BACKLOG, BLOCKED}` only; see `docs/agents/po/flow/triage-signals.md` § Regression verifier + `scripts/audits/po-triage-mint-backlog-status-lane-coherence-verify.sh`. Same actuator as step 3, never a raw write:
```bash
jq --arg id "BA-$SPRINT_ID" --arg title "Requirement Spec for Vision $SPRINT_ID" --arg now "$NOW" \
  '.task_board.backlog += [{id:$id, title:$title, owner:"ba", status:"BACKLOG", zone:"docs/agents/", created_at:$now}]' \
  "$PROJECT_ROOT/docs/data/orch/orch-state.json" | bash "$PROJECT_ROOT/scripts/orch-apply.sh"
```
```json
{
  "id": "BA-NNN",
  "title": "Requirement Spec for Vision NNN",
  "owner": "ba",
  "status": "BACKLOG",
  "zone": "docs/agents/",
  "created_at": "<ISO-8601 UTC now>"
}
```

**4b.** Claim sprint umbrella lock → load skill: `.claude/skills/task-lock/SKILL.md`
```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "task:" + sprint_id,
  task_kind:            "sprint-task",
  owner_agent:          "po",
  owner_client_session: "<resolved CLAUDE_CODE_SESSION_ID — REQUIRED, coordinationTools.ts:104-110;
    substitute the real value, NEVER write the literal text "$CLAUDE_CODE_SESSION_ID">",
  ttl_seconds:          3600,
  payload:              '{"sprint_id":"' + sprint_id + '","stage":"kickoff"}'
})
if not result.claimed:
  → Apply migration check per `.claude/skills/task-lock/SKILL.md` § On claim-fail
```

**5.** Return:
```
## RETURN
DONE: Sprint NNN goal written to orch-state.json .sprint_goal, BA task created
NEXT: ba | write requirement spec for sprint NNN goal in docs/data/orch/orch-state.json .sprint_goal
HANDOFF: docs/data/orch/orch-state.json
PIPELINE: continue
```

---

## After RETURN

Commit notebook + run doc self-heal — see `po/main.md` § Notebook + ACK timestamp guard and § Doc self-heal pointer.

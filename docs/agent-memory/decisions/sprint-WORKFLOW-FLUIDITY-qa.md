# Decision Journal — Sprint WORKFLOW-FLUIDITY · qa

**Sprint goal:** WF-1 fail-loud-stop-release / WF-2 head-CAS+signal_queue retry / WF-3 gateway-binding SPIKE
**Agent:** qa
**Started:** 2026-06-06T22:45:00Z

---

### STEP qa-S2 · qa · 2026-06-07T04:10:00Z
**task-id:** FIX-ORCH-KEY-NORMALIZE-TASKID
**what-done:** QA gate for one-shot task_id→id migration across orch-state.json task_board (189 rows) + coalesce read-path in tasksMdJanitorJob.ts + Write Rules in task-schema.md.
**what-considered:**
- All 8 checks: AC1-AC6 + special case + commit hygiene — all reproduced independently via jq/bun test/bun tsc/diff/git show.
- tsc error count: independently reproduced 3 post-fix; confirmed 2 tasksMdJanitorJob.ts errors were real violations (string|undefined→string) and are cleared.
**why-decision:** All ACs pass with evidence. No new tsc errors. DDD/security clean. Commit hygiene exact (4 files). APPROVED.
**why-change:** no change from plan.

### STEP qa-S1 · qa · 2026-06-06T22:45:00Z
**task-id:** FIX-ORCH-DONE-GRID-COLS
**what-done:** QA gate for frontend fix — DONE table column alignment + row height regression.
**what-considered:**
- Only path: single-file frontend-only change (no domain/infra/MCP scope), all mechanical checks green.
**why-decision:** 363/363 Vitest PASS, tsc 0 errors, mock-guard exit 0, DDD scan clean (no +/- infra imports in diff), security — process.env at L171-172 is pre-existing SSR-origin pattern not touched by this commit (zero +/- lines), container a7209d98af4c matches fresh build digest (layer-cache), HTTP 200 live, commit diff = exactly 1 file no force-adds. APPROVED.
**why-change:** no change from plan.

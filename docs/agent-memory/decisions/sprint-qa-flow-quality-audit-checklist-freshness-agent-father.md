# Decision Journal — Sprint qa-flow-quality-audit-checklist-freshness · agent-father

**Sprint goal:** Make the "QA adds+verifies quality-audit checklist items, driven by architect doc + freshness demand, mints dev-team task for unsatisfiable gaps" demand durable in `qa`'s own flow docs (it existed only as an ephemeral router spawn prompt — zero hits for quality-audit/checklist/freshness in `docs/agents/qa/flow/main.md`).
**Agent:** agent-father
**Started:** 2026-07-25T06:51:16Z

---

### STEP agent-father-S1 · agent-father · 2026-07-25T06:55:00Z
**task-id:** qa-flow-quality-audit-checklist-freshness
**what-done:** Authored new sub-flow `docs/agents/qa/flow/quality-audit.md` (66L) encoding the 4-step procedure (source demand set → diff vs `docs/data/quality-checklist.json` → hard verification rules → gap-escalation to `.task_board.backlog[]`); added one thin dispatch row to `docs/agents/qa/flow/main.md` pointing to it; corrected `main.md`'s stale `size-justification` header (claimed 227L, was actually 274L pre-edit, now 275L).
**what-considered:**
- Inline the full procedure into `main.md` — rejected: task explicitly forbids inflating an already-over-budget file (274L actual vs 227L claimed); violates lazy-load pattern.
- `JUMP TO` in-file anchor vs `→ Run sub-flow:` cross-file — chose `→ Run sub-flow: ./quality-audit.md` per `.claude/skills/jump-to/SKILL.md` explicit invariant ("cross-file jumps use → Run sub-flow: <path> instead — no JUMP TO across files"), matching agent-father's own `edit.md`→`edit-prepare.md` pattern.
- Demand-set sourcing: discovered `docs/data/frontend-data-coverage-map.json` (TASK-FFT-L4 self-policing SLA layer, 50 rows, `{page,elem,endpoint,cadence,sla,asof,status}`) is the live freshness-demand SSOT — more authoritative than the two historical freshness architecture briefs (2026-06-09 CI triage, 2026-05-11 SSOT audit), which are rationale/context only. Included both classes, labelled accordingly.
- Rendered-set target: traced the real serving chain (`docs/data/quality-checklist.json` → `apps/mcp-server/.../qualityChecklistHandler.ts` raw passthrough → `apps/frontend/.../api.quality-checklist.tsx` proxy → `dashboard.quality-audit.tsx` render) before writing Step 2 — confirmed `quality-checklist.json` (74 live capabilities, `_ssot:true`) is the single declaration point; the `CAP-FE-PAGE-*` rows already prove the "add via existing pattern" precedent (38→74 growth), so the sub-flow points at that precedent instead of inventing new object shape.
**why-decision:** Every verification rule the task demanded (live-runtime-only, badge≠evidence, empty≠pass, two-layer freshness, real `date -u`, no fabrication) was made an explicit bullet rather than a vague "verify carefully" — these are named recurring-failure classes; softening them into prose would reproduce the exact gap this task exists to close.
**why-change:** Kept the file well under any inflation risk (66L vs the ~150L I initially drafted) after discovering the file measured shorter than my paragraph-based draft implied — recomputed and corrected the `size-justification` line to the true count rather than leave a second stale claim in a brand-new file.

### STEP agent-father-S2 · agent-father · 2026-07-25T06:56:00Z
**task-id:** qa-flow-quality-audit-checklist-freshness
**what-done:** Checked `.claude/agents/qa.md` frontmatter (`tools: Read, Edit, Write, Glob, Grep, Bash`) against everything the new sub-flow requires (Read docs, Edit `quality-checklist.json`, Bash for `curl`/`jq`/`git log`/`date -u`/`orch-apply.sh`) — no MCP tool (`mcp__gateway__call_tool`) is needed by this sub-flow (backlog mint goes through the `jq | orch-apply.sh` Bash pipe, not a direct `call_tool`). No gap found; did not touch `.claude/agents/qa.md`.
**what-considered:**
- Whether the pre-existing `call_tool(server="vn-market", tool="task_release"...)` / `send_telegram` calls already present in `main.md`'s error boundary (lines 21/211/199) constitute a tool-grant gap — noted but out of scope: pre-existing in the file before my edit, not introduced by this task, and INV-GATEWAY-1 precedent (seen fleet-wide, e.g. tran-ngoc-bau notebook entry) treats these as best-effort/dispatcher-owned calls, not a hard block on qa's own execution.
**why-decision:** Task explicitly scoped the tool-grant check to ".claude/agents/qa.md only if a tool grant is actually missing" — confirmed none is, for the new work; did not expand scope to the unrelated pre-existing gap.
**why-change:** no change from plan.

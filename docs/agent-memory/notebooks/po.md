# PO Notebook

## c · 2026-06-06T18:32Z — SPRINT KICKOFF: ORCH-TASK-CANON (operator demand)

**Shape accepted (router F1-F4+QA, PO-modified):** F1 schema contract (architect: SSOT {id,title,owner,status,zone,created_at}, CLOSED enum TODO|IN_PROGRESS|REVIEW|DONE|BLOCKED|CANCELLED|DEFERRED + status_note; agent-father edits ALL task-creating flows; one-shot migration of 66 done[] rows + drilldown-container flatten APPROVED) || F4 journal format (agent-father: dev-team triage freeform -> SKILL '### STEP' blocks; +MY FINDING: SKILL resolver reads .entries[0].id but field is sprint_id -> never matches, silent date-fallback; rewrite sprint-2026-06-06.md freeform) -> F2 serving coalesce id//task_id + serve done[] + REBUILD (dev-mcp-server) -> F3 done-filter normalization (dev-frontend) -> QA live-verify.

**Done this cycle:** .sprint_goal entry ORCH-TASK-CANON appended + BA-ORCH-TASK-CANON in backlog (canonical schema dogfooded, task_id mirrored until F1 migration) — atomic jq -f + sentinel verified. Umbrella lock task:ORCH-TASK-CANON claimed (po, 3600s). Decision entry po-S1 written in PARSEABLE format to sprint-2026-06-06.md (stamped task-id) — doubles as journalStore-format proof.

**Key decisions:** (1) closed status enum + free-text status_note, NOT 16-string proliferation; (2) migration approved — coalesce-only serving leaves existing done[] join starved (derived-reflow lesson); (3) F2/F3 must legacy-tolerate no-crash regardless of F1; (4) every sprint task dogfoods canonical schema + decision entry.

**Carry-over (next PO cycle):**
- BA spec returns -> review-ba-spec.md: check spec covers all 4 layers + migration + skill resolver bug + dogfood constraint; reject if F2-only.
- ORCH-DASH-DECISION-DRILLDOWN sprint entry still "active" — close/fold its residual into ORCH-TASK-CANON at signoff (drilldown UI shipped; join starvation is THIS sprint).
- Still open from triage lane: FIX-VPS-SSC-CURL-SCRAPER playwright-row closure (~23:37Z cycle proof); FIX-SLA-WEEKEND-AWARE Sunday proof; WATCH-2 refine slot-2; report 3055 CTG-Q1 OCR watch.
- Release umbrella lock at sprint signoff, not before.

# Decision Journal — INPUT-VALIDATION-COVERAGE · pm

Companion to `sprint-INPUT-VALIDATION-COVERAGE-architect.md` and `-po.md`.

### STEP pm-S1 · pm · 2026-08-23T13:42:48Z
task_id: IVC-PM-DECOMPOSE
**what-considered:** (a) mint all 9 spec groups including IVC-A3+ — rejected; (b) mint the 8 determinate groups and leave A3+ for a second pass — chosen; (c) defer the whole row until IVC-A1 exists — rejected, 8 of 9 groups are fully specified and 3 have no dependencies at all, so deferring would idle real work.
**why-change:** no change from plan. Both the blueprint §5 and the BA spec §1 explicitly forbid guessing IVC-A3..An's row count ahead of IVC-A1's `class-a-validation-coverage.json` output. Fabricating N would be exactly the manual-count failure IVC-A1 exists to replace — the spec's own §0 shows the brief's frozen 162-file count was already stale at 167 within 14 days.
**children minted (8):** IVC-C1 → {IVC-C2 → {IVC-C3, IVC-C4}, IVC-C5, IVC-C6}; IVC-A1; IVC-A2. Ids reused verbatim from the spec (no rename, no new namespace); all owner+next_agent dev-mcp-server per the PO routing note.
**parent disposition — DECOMPOSITION_COMPLETE=false, deliberately:** the row STAYS in ready[] with `children[]`, `next_agent: pm` and a NEW `depends_on: ["IVC-A1"]`. next_agent=pm is truthful (the remaining hop genuinely is a second pm decomposition), and the dep edge is what stops it re-surfacing to pm on every sweep before the scan output exists. This is the flow Step 3e false-branch, not an oversight.
**tracked, not minted:** BA spec EC-1 — `class-c-coverage.json`'s pass-through count is a METRIC that must trend to zero, not a shipped-boolean. Recorded on the parent's status_note so the second pass inherits it.

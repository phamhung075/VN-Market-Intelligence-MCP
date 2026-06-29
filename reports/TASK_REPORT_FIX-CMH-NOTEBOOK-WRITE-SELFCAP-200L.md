## Task Report FIX-CMH-NOTEBOOK-WRITE-SELFCAP-200L

changed:
- .claude/skills/notebook-write/SKILL.md — AC-6 table: claude-manager-helper added to APPEND class
- docs/data/file-size-caps.json — APPEND _note: claude-manager-helper added (SSOT parity)
- docs/agents/claude-manager-helper/flow/main.md — End-of-cycle annotated: APPEND (AC-6) + AC-3 ref
- docs/agent-memory/decisions/sprint-CROSS-SESSION-MULTI-TEAM-ORCH-agent-father.md — DJ-GATE-1 journal entry
- docs/agent-memory/notebooks/claude-manager-helper.md — one-time prune 226→164L

tests: no automated tests for skill/flow files | tsc: N/A | ddd: N/A | security: N/A
verdict: APPROVED

### Gate Results (RAW — not relayed from agent-father)

**Gate 1 — SSOT parity:**
- SKILL.md AC-6 APPEND row: `claude-manager-helper` present ✓
- file-size-caps.json APPEND _note: `claude-manager-helper` present ✓
- Both SSOTs agree — SSOT parity confirmed ✓

**Gate 2 — Notebook ≤200L:**
- wc -l = 164L ≤ 200L ✓

**Gate 3 — Fence (independent, scratchpad only, original untouched):**
- Baseline: 164L (4 sections: Cycle-2026-06-29, Cycle-2026-06-23, Cycle-2026-06-15, Archive)
- After synthetic append: 201L (>200L) — 5 sections including QA-FENCE-TEST
- AC-3 drop-oldest fired: dropped Archive + Cycle-2026-06-15
- After trim: 158L ≤ 200L ✓
- Newest-3 retained: Cycle-2026-06-30-FENCE-TEST (newest), Cycle-2026-06-29, Cycle-2026-06-23 ✓
- Original notebook: 164L — untouched ✓

**Gate 4 — Mechanism parity with qa fix (57916170):**
- cmh flow/main.md End-of-cycle annotation is word-for-word identical to qa flow/main.md
- Same APPEND AC-6 + AC-3 ref — not a divergent one-off ✓

**DJ-GATE-1:** sprint-CROSS-SESSION-MULTI-TEAM-ORCH-agent-father.md line 28 confirms `task-id: FIX-CMH-NOTEBOOK-WRITE-SELFCAP-200L` ✓

### Systemic Forward-Look (note only — does not block this task)

This is the 2nd agent (qa 2026-06-28, cmh 2026-06-29) found missing from the APPEND class and hitting the breach treadmill. The following notebooks exist but are NOT in either APPEND or OVERWRITE class in the current AC-6 table:

| Notebook | Lines | Risk |
|---|---|---|
| pm.md | 283L | ACTIVE BREACH — over 200L cap now |
| fixer.md | 185L | near-cap |
| tran-ngoc-bau.md | 185L | near-cap |
| code-janitor.md | 165L | near-cap |
| ba.md | 164L | near-cap |
| agent-father.md | 147L | moderate |
| alert-commander.md | 142L | moderate |
| main.md | 113L | low |
| architect.md | 93L | low |
| qa-responder.md | 88L | low |
| dev-team.md | 85L | low |

pm.md is already over-cap (283L). cmh just pruned it to 56L in cycle 2026-06-29, but pm wrote again without AC-3 → re-grew to 283L — this is the identical treadmill. Recommend PO/architect do a one-sweep audit to add all active-write notebooks to the APPEND class rather than fixing one breach at a time.

### Commit
0db2a089 — fix(agent-father): add claude-manager-helper to notebook-write APPEND class + 200L self-cap

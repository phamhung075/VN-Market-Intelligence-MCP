# Sprint 1951c — Team Boundary QA Report
date: 2026-05-19
outcome: APPROVED
commit: 1480a8df

## Checks

### CHECK 1 — dev-team/main.md Team Boundary section
PASS. Section present at line 4. 13 lines (≤20). Caveman style.
- dev-core list: po, ba, architect, pm, developer, qa, fixer ✓
- dev-zone list: all 12 dev-* specialists ✓
- ops as shared infra lane (type: ops) ✓
- HARD NEVER cowork agents: explicit list of all 10 ✓
- HARD NEVER maintenance agents: agent-father, agents-architect, claude-manager-helper, code-janitor, system-auditor, cowork-refactory-expert, idea-forge ✓
- DASHBOARD.md pointer via signal-dashboard skill ✓

### CHECK 2 — cowork-team/main.md Team Boundary section
PASS. Section present at line 5. 12 lines (≤20). Caveman style.
- Cowork allowlist: scheduled (7 agents) + demand-spawnable (3 agents) ✓
- HARD NEVER dev-team agents: po, ba, architect, pm, developer, qa, fixer, dev-*, ops ✓
- HARD NEVER maintenance agents: same list as dev-team ✓
- DASHBOARD.md pointer via signal-dashboard skill ✓

### CHECK 3 — Signal drain steps
PASS.
- drain-signals.md exists: YES — .claude/flows/dev-team/drain-signals.md ✓
- Step 0a-D at line 11 (BEFORE 0a-0 at line 20) ✓
- Uses signal-dashboard skill § READ protocol ✓
- dev-team/main.md dispatch table references drain-signals.md with "Step 0a-D" label ✓
- cowork-team/main.md Step 0a at line 28 (BEFORE Step 1 at line 37) ✓
- Both drains: READ → collect NEW rows → mark READ ✓
- Both drains: never fail-loud on missing DASHBOARD ✓

### CHECK 4 — ops classification in system-map.json
PASS. `jq '.project.agents[] | select(.id=="ops") | .type'` → "ops"
dev-team boundary listing ops as shared infra lane is correct.

## Test Suite
- bun tsc --noEmit: 0 errors ✓
- bun test: 9704 pass / 348 fail / 10 errors
  - 348 failures are PRE-EXISTING (verified: same failures on parent commit)
  - Sprint 1951c changes are .md files only — zero TypeScript touched
  - No new failures introduced by 1480a8df

## Token Economy
- dev-team Team Boundary: 13 lines ✓ (≤20)
- cowork-team Team Boundary: 12 lines ✓ (≤20)
- Both sections use caveman bullet style ✓

## Verdict
APPROVED — all 4 checks PASS. No blocking issues.

[QA]

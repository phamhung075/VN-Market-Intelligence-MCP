> Parent: [./docs-organization.md](./docs-organization.md)

# Docs Organization — Location Table

File placement SSOT. Before creating any `.md` file, look it up here.

| File pattern | Canonical location | ❌ Never here |
|---|---|---|
| `TASK_REPORT_*.md` | `reports/` | `apps/mcp-server/reports/`, `docs/reports/` |
| `*-evening.json` | `reports/` | `apps/mcp-server/reports/` |
| Sprint goal | `docs/data/orch/orch-state.json .sprint_goal.entries[]` | `docs/SPRINT_GOAL.md` (deleted), root, `apps/` |
| Task board | `docs/data/orch/orch-state.json .task_board` | `docs/TASKS.md` (deleted), root, `apps/` |
| `WORK.md` | `docs/WORK.md` | root, `apps/` |
| `TASK_NNN.md` (handoff) | `docs/handoffs/` | root, `reports/` |
| `REQ_NNN.md` | `docs/historical/` | root, `docs/` root |
| `TECH_NNN.md` | `docs/historical/` | root, `docs/` root |
| Agent notebooks | `docs/agent-memory/notebooks/` | root |
| Decision journal `sprint-*.md` | `docs/agent-memory/decisions/` | root, `docs/handoffs/` |
| Analysis briefs | `docs/analysis-briefs/` | root, `reports/` |
| Facebook post drafts `fb-post-*.md` | `docs/social/` | root, `reports/`, `docs/archive/` |
| Facebook feedback log | `docs/social/fb-feedback.md` | root |
| Source code `*.ts` | `apps/mcp-server/src/` | root, `docs/` |
| Reusable scripts `*.sh/*.js/*.ts/*.py` | `scripts/` (agent-flow helpers → `scripts/agents-flow/`) + pointer in owning flow doc | `/tmp`, root, `docs/` |
| Tests `*.test.ts` | `apps/mcp-server/src/__tests__/` | root, `reports/` |
| Knowledge/rules | `docs/{policies,protocols,standards,references}/` | root, `docs/` |
| Agent configs | `.claude/agents/` | root |
| `*.md` (any other) | See decision tree | ❌ Never at root except `CLAUDE.md`, `README.md` |

**If unsure → default to `docs/` subdirectory. Never create at project root.**

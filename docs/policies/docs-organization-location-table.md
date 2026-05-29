> Parent: [./docs-organization.md](./docs-organization.md)

# Docs Organization — Location Table

File placement SSOT. Before creating any `.md` file, look it up here.

| File pattern | Canonical location | ❌ Never here |
|---|---|---|
| `TASK_REPORT_*.md` | `reports/` | `apps/mcp-server/reports/`, `docs/reports/` |
| `*-evening.json` | `reports/` | `apps/mcp-server/reports/` |
| `SPRINT_GOAL.md` | `docs/SPRINT_GOAL.md` | root, `apps/` |
| `TASKS.md` | `docs/TASKS.md` | root, `apps/` |
| `WORK.md` | `docs/WORK.md` | root, `apps/` |
| `TASK_NNN.md` (handoff) | `docs/handoffs/` | root, `reports/` |
| `REQ_NNN.md` | `docs/historical/` | root, `docs/` root |
| `TECH_NNN.md` | `docs/historical/` | root, `docs/` root |
| Agent notebooks | `docs/agent-memory/notebooks/` | root |
| Analysis briefs | `docs/analysis-briefs/` | root, `reports/` |
| Facebook post drafts `fb-post-*.md` | `docs/social/` | root, `reports/`, `docs/archive/` |
| Facebook feedback log | `docs/social/fb-feedback.md` | root |
| Source code `*.ts` | `apps/mcp-server/src/` | root, `docs/` |
| Tests `*.test.ts` | `apps/mcp-server/src/__tests__/` | root, `reports/` |
| Knowledge/rules | `docs/{policies,protocols,standards,references}/` | root, `docs/` |
| Agent configs | `.claude/agents/` | root |
| `*.md` (any other) | See decision tree | ❌ Never at root except `CLAUDE.md`, `README.md` |

**If unsure → default to `docs/` subdirectory. Never create at project root.**

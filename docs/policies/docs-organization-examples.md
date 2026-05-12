> Parent: [./docs-organization.md](./docs-organization.md)

# Docs Organization — Examples

Real-world examples of correct file placement.

## Example 1: Creating "VN Exchange Analysis 2026-04-25.md"

Question: Where does this go?

Analysis tree:
- Is it investigation/findings? → Yes
- Check location table: investigations → `docs/archive/`

**Answer:** `docs/archive/VN_EXCHANGE_ANALYSIS_2026-04-25.md`

Commit: `docs: archive VN exchange analysis from 2026-04-25 session`

---

## Example 2: Creating "REQ_1500.md" (new task spec)

Question: Where does this go?

Analysis tree:
- Is it a task spec (REQ_*)? → Yes
- Check decision tree: task specs → `docs/historical/`

**Answer:** `docs/historical/REQ_1500.md`

BA creates in local branch, commits to main with `feat(REQ_1500): <requirement title>`

Never stays in root. Auto-moved on next enforcement check if created at root by mistake.

---

## Example 3: Creating "Stock Correlation Analysis 2026-04-25.md"

Question: Where does this go?

Analysis tree:
- Is it analysis/findings? → Yes
- Is it session-specific? → Yes
- Is it volatile data? → No (static report, not counts)

**Answer:** Either:
- `docs/archive/ANALYSIS_STOCK_CORRELATION_2026-04-25.md` (persistent reference)
- `/memory/session_stock_correlation.md` (via MCP tool, session-local only)

Commit pattern: `docs: archive stock correlation analysis from 2026-04-25 session`

---

## Example 4: Creating "Tool Registry 2026-05-01.md"

Question: Where does this go?

Analysis tree:
- Is it a format spec / schema / tool lookup? → Yes
- Is it volatile data (counts)? → Check: if it contains <100 tool rows + description → `docs/standards/`
- If it contains dynamic tool counts → Point to `docs/data/project-stats.json`

**Answer:** 
- If stable: `docs/standards/tool-<topic>.md`
- If volatile counts: Keep in `docs/standards/`, but reference `docs/data/project-stats.json` for current counts

Commit: `docs(standards): update tool-<topic>.md with new capability`

---

## Example 5: Creating "Docker Restart Troubleshooting"

Question: Where does this go?

Analysis tree:
- Is it a procedure / runbook? → Yes
- Is it troubleshooting steps? → Runbook = `docs/protocols/`

**Answer:** `docs/protocols/restart-troubleshooting.md` or extend existing `docs/policies/restart-policy.md` with a child file

Related: `docs/policies/restart-policy.md` (rules) vs `docs/protocols/restart-troubleshooting.md` (procedures)

> Parent: [./docs-organization.md](./docs-organization.md)

# Docs Organization — Decision Tree

Use this tree when unsure where to put a new `.md` file.

```
┌─ Is it logic, rules, or policy?
│  └→ docs/{policies,protocols,standards,references}/*.md
│
├─ Is it session analysis or agent memory?
│  └→ /memory/*.md (via MCP tool, not Write)
│
├─ Is it core architecture/design (used weekly)?
│  └→ docs/*.md (ROOT ONLY — 6 files max)
│
├─ Is it task report, investigation, audit, or BCTC?
│  └→ docs/archive/ (auto-manage, never delete)
│
├─ Is it task spec (REQ_* or TECH_*)?
│  └→ docs/historical/ (append-only, never delete)
│
├─ Is it volatile data (counts, JSON)?
│  └→ docs/data/*.json (update via MCP tool)
│
└─ Root files only (2 canonical):
   ├─ CLAUDE.md (project context)
   └─ README.md (project intro)
```

## Knowledge Bucket Decision

| Question to ask | Bucket |
|------|--------|
| Is it an enforceable rule / decision? (e.g. alert-policy, restart-policy, commit-convention) | `policies/` |
| Is it a sequence / procedure / runbook? (e.g. agent-chaining, fail-loud, bctc-extraction-runbook) | `protocols/` |
| Is it a format spec / schema / methodology / tool lookup? (e.g. mcp-tools, cron-jobs, portfolio-schema) | `standards/` |
| Is it a roster / map / template / glossary? (e.g. tree-map, agent-roster, agent-routing) | `references/` |

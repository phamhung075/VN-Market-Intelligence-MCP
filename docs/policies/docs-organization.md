# Docs Organization — Quick Reference

**Updated:** 2026-05-01 | **Status:** Active enforcement

File placement rules and canonical locations for all project documentation.

---

## Quick Start

**Before creating any `.md` file, check the location table** in `docs/policies/docs-organization-location-table.md`.

Creating a file in the wrong place causes duplication debt that requires manual cleanup.

---

## Core Rules

1. **Always check location table first** → `docs/policies/docs-organization-location-table.md`
2. **Use the decision tree** → `docs/policies/docs-organization-decision-tree.md` if unsure
3. **Default:** Always use `docs/` subdirectory — never create at project root (except `CLAUDE.md`, `README.md`)
4. **Enforcement:** Auto-file rules in `docs/policies/docs-organization-enforcement.md`

---

## Folder Purpose

| Folder | Purpose | Management |
|--------|---------|------------|
| `docs/policies/` | Enforceable rules / decisions / conventions | Stable, update on policy change |
| `docs/protocols/` | Sequence flows / procedures / runbooks | Stable, update on process change |
| `docs/standards/` | Format specs / schemas / tool lookups | Stable, update on spec change |
| `docs/references/` | Lookups / rosters / maps / templates | Stable, update on registry change |
| `.claude/agents/` | Agent configs | Update via agent-md-factory |
| `docs/agents/*/flow/` | Agent flow files | Update via flow guide |

---

## Examples

Examples of correct placement → `docs/policies/docs-organization-examples.md`

---

**Related:** CLAUDE.md § File Organization, `docs/references/tree-map.md`, `docs/policies/docs-organization-location-table.md`

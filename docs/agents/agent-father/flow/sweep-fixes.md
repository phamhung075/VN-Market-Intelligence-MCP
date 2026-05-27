# Agent Father — Top-5 Checks + Auto-Fix Sweep

**Parent flow:** `docs/agents/agent-father/flow/keep.md` (Steps 3-5)

## Step 3 — Top-5 Critical Checks Per Agent

Lightweight sweep — Grep-based, no full file reads:

| # | Check | Method | Auto-fixable? |
|---|-------|--------|--------------|
| 1 | Has `fail-loud-protocol` reference | `Grep "fail-loud-protocol" <agent>.md` | YES — add to always_load |
| 2 | Has `Error Boundary` in flow | `Grep "Error Boundary" <flow>.md` | NO — needs manual authoring |
| 3 | Has `boundary_rules` section | `Grep "boundary_rules" <agent>.md` | NO — needs manual authoring |
| 4 | Flow path resolves | Read first line of flow file | YES — fix path if obvious typo |
| 5 | Version not >90 days stale | `Grep "version:" <agent>.md`, parse date | YES — update to today |

## Step 4 — Auto-Fix Safe Violations

Apply fixes ONLY for mechanical/cosmetic issues:

| Fix | Action | Condition |
|-----|--------|-----------|
| Missing fail-loud reference | Add `- path: docs/protocols/fail-loud-protocol.md` to `always_load` | Check #1 FAIL |
| Stale version date | Update `version: "YYYY-MM-DD"` to today | Check #5 FAIL, >90 days |
| Missing roster entry | Add row to appropriate team table | UNREGISTERED from scan-orphans Step 2 |
| Missing notebook | Create scaffold from template | MISSING_NOTEBOOK from scan-orphans Step 1 |

**DO NOT auto-fix:**
- Missing Error Boundary (requires understanding agent's work)
- Missing boundary_rules (requires understanding agent's scope)
- Missing inter_agent routing (requires understanding agent's partners)
- Structural issues (wrong type, wrong model, wrong tools)

Log every auto-fix with: file, what was changed, guide reference.

## Step 5 — Stale Notebook Report

```
# Find notebooks not updated in the last 30 days
Glob: docs/agent-memory/notebooks/*.md
```

Report count of stale notebooks per agent. Do NOT delete — information only.

Findings + auto-fix log feed Step 6 (report) inside keep.md, and Step 7 (PO handoff) for escalations.

# Agent Father — Top-5 Checks + Auto-Fix Sweep

**Parent flow:** `docs/agents/agent-father/flow/keep.md` (Steps 3-5)

## Step 3 — Top-5 Critical Checks Per Agent

Lightweight sweep — Grep-based, no full file reads:

**Target-file note (post-`dc430566c` consolidation):** `<agent>.md` in checks 1/3/5 below means
`docs/agents/<agent-id>/init.md` — the full Employee Card YAML — NOT the thin
`.claude/agents/<agent-id>.md` stub (which is now just an 5-9 line frontmatter+pointer file per
the lazy-load split). Grepping the stub file makes checks 1/3/5 fail 100% of the time by
construction (confirmed live 2026-08-07 keep cycle — the 100% fail rate was itself the tell, cf.
`feedback_fleetwide_gate_validated_on_one_file_optout_allowlist`); auto-fixing on that false
signal would inject churn into all 42 stub files. Check 2 (flow) and Check 4 (flow path) already
correctly target `docs/agents/<agent-id>/flow/*.md` — unaffected by this note.

| # | Check | Method | Auto-fixable? |
|---|-------|--------|--------------|
| 1 | Has `fail-loud-protocol` reference | `Grep "fail-loud-protocol" docs/agents/<agent-id>/init.md` | YES — add to always_load |
| 2 | Has `Error Boundary` in flow | `Grep -i "error boundary" docs/agents/<agent-id>/flow/*.md` (case-insensitive — live text uses both cases). **One-hop delegation resolution (mandatory before FAIL):** if the thin flow file has zero hits AND contains a one-hop pointer line — `-> Run shared flow: <path>`, `-> Run sub-flow: <path>`, or `-> Run flow: <path>` (arrow token tolerant of BOTH ASCII `->` and Unicode `→` — the live dev-* fleet phrasing is `→ Run flow: \`docs/agents/developer/flow/microservice-main.md\`` for all 9 current consumers) — re-run the same grep against the resolved `<path>` before returning FAIL. Only FAIL if BOTH the thin file and its one-hop pointer target (when one exists) show zero hits. | NO — needs manual authoring |
| 3 | Has `boundary_rules` section | `Grep "boundary_rules" docs/agents/<agent-id>/init.md` | NO — needs manual authoring |
| 4 | Flow path resolves | Verify `flow.default` path in `init.md` exists on disk | YES — fix path if obvious typo |
| 5 | Version not >90 days stale | `Grep "version:" docs/agents/<agent-id>/init.md`, parse date | YES — update to today |

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

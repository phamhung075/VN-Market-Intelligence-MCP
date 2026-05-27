> Parent: [./data-validation.md](./data-validation.md)

# Ops — Data Validation: Bug Report + Return (Steps 5-6)

## Step 5: Bug Reporting (if critical)

Check dedup before reporting:
```
get_recent_fixes(limit=20)
```
Same module/service in recent fixes → **skip**, do not re-report.

If new critical issue:
```
send_telegram(channel="bug", message="[Ops] Data validation failed — <service>/<tickers>: <DEAD|VPS_ERROR>\nRoot cause: <diagnosis>\nFix attempted: <yes|no>")
log_fix(title="Data validation: <service> <status>", commit_hash="ops-validation")
```

---

## Step 6: Return Structured Report

Return validation findings to main terminal (which relays to PO):

```
## VALIDATION REPORT
Requested: tickers=[...] services=[...]
Date: YYYY-MM-DD HH:MM UTC

FRESH: [ticker list]
STALE: [ticker list — lag: Xmin]
DEAD: [ticker list — last seen: timestamp]
VPS_ERROR: [service — reason]

Fixes attempted: [list]
Bug reported: [yes/no — channel]
```

## PO handoff if validation found issues

If validation found stale/dead tickers or VPS errors that need task tracking:

**Spawn PO agent** with prompt:
```
run docs/agents/po/flow/main.md

## Ops Data Validation Findings
{paste VALIDATION REPORT here}

Create sprint tasks for these issues. Prioritize by severity.
```

Skip if zero issues found.

## RETURN
DONE: Data validation complete — N tickers checked, K issues found (X stale, Y dead, Z VPS errors)
NEXT: po (spawned with findings) | user (if clean)
PIPELINE: continue

**Notebook write** → `docs/agent-memory/notebooks/ops.md`

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

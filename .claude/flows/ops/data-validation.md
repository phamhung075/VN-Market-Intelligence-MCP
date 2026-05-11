# Ops — Data Validation Flow

**Tools:** `.claude/tools/package/ops.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
Ticker list + service list from PO (via main terminal handoff)
Format: `tickers=[...] services=[price|news|foreign-flow|bctc|sbv]`

## Output
Structured validation report → returned to main terminal → PO task creation

---

## Step 1: VPS Trigger (dry-run first)

For each requested service, run dry-run to check queue without side effects:

**Price service:**
```
trigger_price_vps_fetch(tickers=<list>, dry_run=true, verbose=true)
```

**News service:**
```
trigger_news_vps_fetch(dry_run=true, verbose=true)
```

**Foreign flow:**
```
trigger_foreign_flow_vps_fetch(dry_run=true, verbose=true)
```

**BCTC:**
```
trigger_bctc_vps_fetch(tickers=<list>, dry_run=true, verbose=true)
```

**SBV:**
```
trigger_sbv_vps_fetch(dry_run=true, verbose=true)
```

---

## Step 2: Pipeline & VPS Health

```
get_pipeline_health()
get_vps_service_health()
get_vps_proxy_health()
```

---

## Step 3: Cross-Check Data Freshness

For each ticker in scope:
```
get_price_history(code=<ticker>, days=1)
```
- Last data point timestamp vs now:
  - <30min → FRESH
  - 30min–2h → STALE (warn)
  - >2h or missing → DEAD (critical)

---

## Step 4: Classify Findings

For each ticker/service:

| Status | Condition | Action |
|--------|-----------|--------|
| FRESH | Data <30min, VPS queue ok | No action needed |
| STALE | Data 30min–2h | Trigger live fetch, log warning |
| DEAD | Data >2h or missing | Trigger fetch + BUG channel report |
| VPS_ERROR | trigger returns failed[] | SSH diagnosis + BUG channel report |

For STALE/DEAD → attempt live fetch (non-dry-run):
```
trigger_price_vps_fetch(tickers=[<ticker>], dry_run=false, verbose=true)
```

---

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

## PO handoff if validation found issues

If validation found stale/dead tickers or VPS errors that need task tracking:

**Spawn PO agent** with prompt:
```
run .claude/flows/po/main.md

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
```

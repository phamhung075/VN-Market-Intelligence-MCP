> Parent: [./data-validation.md](./data-validation.md)

# Ops — Data Validation: Check Steps (1-4)

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

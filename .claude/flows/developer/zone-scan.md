# Developer — Zone-Scan Sub-Flow

**Shared by:** all 9 dev-* zone agents (triggered weekly by cron)
**Scope:** Proactive zone health scan — stale imports, test coverage, doc drift.

## Input

Agent's `zone:` field (e.g. `apps/stock-price/`) from agent definition.

## Output

`docs/signals/zone-scan-<service>-<ts>.json` typed `zone_health_report`, routed `to: po`.

---

**Step 0 — Resolve project root** → skill: `.claude/skills/project-root/SKILL.md`

**Step 0b — Read notebook** → skill: `.claude/skills/notebook-read/SKILL.md` (replace `<agent-id>` with agent id)

---

## Step 1 — Stale Import Scan

```bash
ZONE=apps/<service>
# Find imports referencing paths that no longer exist
grep -rn "from '.*'" "$ZONE/src/" --include="*.ts" 2>/dev/null | \
  grep -v node_modules | head -40
# Check for deprecated import patterns (cross-zone imports)
grep -rn "from '\.\.\/\.\.\/" "$ZONE/src/" --include="*.ts" 2>/dev/null | head -20
```

Flag any import path that crosses zone boundary (`../../apps/` prefix) or references a non-existent module.

## Step 2 — Test Coverage Ratio

```bash
ZONE=apps/<service>
SRC_COUNT=$(find "$ZONE/src" -name "*.ts" -not -path "*__tests__*" -not -name "*.test.ts" 2>/dev/null | wc -l | tr -d ' ')
TEST_COUNT=$(find "$ZONE/src" -name "*.test.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "src=$SRC_COUNT test=$TEST_COUNT"
```

Compute ratio `test_count / src_count`. Flag if < 0.5 (fewer than 1 test file per 2 source files).

## Step 3 — Doc Drift Check

```bash
SERVICE=<service>   # e.g. stock-price
DOC_DIR="docs/architecture/microservice/$SERVICE"
ls "$DOC_DIR/" 2>/dev/null || echo "MISSING"
```

Compare expected doc files (domain-model, usecases, infrastructure, api-reference, testing) against what exists. Flag missing files.

```bash
# Check if any source files were modified more recently than their paired docs
find "apps/$SERVICE/src" -name "*.ts" -newer "$DOC_DIR/domain-model.md" 2>/dev/null | head -10
```

Flag if >3 source files are newer than their zone doc (indicates doc lag).

## Step 4 — Emit Signal

Compose findings and write signal file:

```bash
TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
SERVICE=<service>
SIGNAL_PATH="docs/signals/zone-scan-${SERVICE}-${TIMESTAMP}.json"
```

Signal schema:
```json
{
  "from": "dev-<service>",
  "to": "po",
  "type": "zone_health_report",
  "priority": "low",
  "createdAt": "<ISO timestamp>",
  "payload": {
    "zone": "apps/<service>/",
    "service": "<service>",
    "findings": [
      "<finding description with severity>"
    ],
    "severity": "ok | warn | critical",
    "stale_imports": <count>,
    "test_ratio": <float>,
    "doc_missing": [<list of missing doc files>],
    "doc_lagging": <count of source files newer than zone docs>
  }
}
```

Severity rules:
- `critical`: cross-zone import found OR missing required doc file
- `warn`: test_ratio < 0.5 OR doc_lagging > 3
- `ok`: no findings

## Step 5 — Notebook Update

Append one-line zone-scan result to notebook:
```
Zone scan <YYYY-MM-DD>: severity=<ok|warn|critical> | findings=<N> | signal=docs/signals/zone-scan-<service>-<ts>.json
```

```
## RETURN
DONE: Zone scan complete — SERVICE=<service>, severity=<level>, findings=<N>, signal written
PIPELINE: complete
```

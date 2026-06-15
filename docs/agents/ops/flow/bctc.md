# Ops — BCTC Extraction Diagnostic Flow

**Tools:** `docs/agents/tools/package/ops.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

Triggered when: BCTC extraction suspected broken, `get_bctc_full` returns empty, `list_stored_pdfs` shows no data, or BUG report about BCTC pipeline.

Full runbook: `docs/protocols/bctc-extraction-runbook.md`

---

## Architecture (pull-based, NOT push)

```
VPS:8765/bctc-files/ → bctcPdfPullJob → /app/data/pdfs/ → bctcReparseJob → financial_reports
```

MCP tools (`get_vps_service_health`, `get_pipeline_health`) do NOT surface extraction failures. Use Docker commands below.

---

## Step 1 — PDFs on disk?

```bash
docker exec vn-market-mcp-server-1 ls /app/data/pdfs/
```

- Files present → extraction stage failed (go to Step 2)
- No files → download stage failed → check VPS: `trigger_bctc_vps_fetch(verbose=true, dry_run=true)`

---

## Step 2 — Stale feedback rows blocking extraction?

```bash
docker exec vn-market-mcp-server-1 python3 -c "
import sqlite3; conn = sqlite3.connect('/app/data/market.db'); cur = conn.cursor()
cur.execute(\"SELECT id, detail FROM agent_feedback WHERE agent='data-auditor' AND status='new' AND title LIKE '[AUDIT] stranded_bctc_pdf%'\")
for r in cur.fetchall(): print(r[0], r[1][:120])
"
```

If rows contain `/Users/admin/...` (HOST path) → stale pre-Docker rows blocking disk-scan fallback.

Fix — update to container path or delete if PDF absent:
```bash
docker exec vn-market-mcp-server-1 python3 -c "
import sqlite3, json, os
conn = sqlite3.connect('/app/data/market.db'); cur = conn.cursor()
# For each stale row: update filePath to /app/data/pdfs/<filename>
# cur.execute('UPDATE agent_feedback SET detail = ? WHERE id = ?', (new_detail, row_id))
# cur.execute('DELETE FROM agent_feedback WHERE id = ?', (row_id,))
conn.commit()
"
```

---

## Step 3 — OCR available?

```bash
docker exec vn-market-mcp-server-1 which pdftoppm
```

Missing → `docker exec vn-market-mcp-server-1 apt-get install -y poppler-utils`

Note: `isOcrAvailable()` is cached at process startup. After install, restart container:
```bash
docker-compose restart mcp-server
```

---

## Step 4 — Manually trigger reparse

```bash
docker exec vn-market-mcp-server-1 bun -e "
const { runBctcReparseJob } = await import('./src/scheduler/financial-reports/bctcReparseJob.js');
const r = await runBctcReparseJob();
console.log(JSON.stringify(r));
"
```

Expected: `{"examined":N,"resolved":N,"failed":0,...}`

---

## Step 5 — Verify reports stored

```bash
docker exec vn-market-mcp-server-1 python3 -c "
import sqlite3; conn = sqlite3.connect('/app/data/market.db'); cur = conn.cursor()
cur.execute('SELECT action_code, period_type, period_year, extraction_method FROM financial_reports ORDER BY rowid DESC LIMIT 10')
for r in cur.fetchall(): print(r)
"
```

---

## False Positive: `url=MISSING` in bctc_vps_queue

`url=MISSING` rows are from the OLD push-based flow and are irrelevant. Pull-based rows have `source_url LIKE 'http://$VINAHOST_IP:8765/bctc-files/%'` (VPS host → `jq '.project.infrastructure.vps.host' docs/data/system-map.json`). Do not trigger `enrich-bctc-urls.sh` based on this.

**Notebook write** → skill: `.claude/skills/notebook-write/SKILL.md` (replace `<agent-id>` with `ops`; APPEND class — AC-3 settled-write + AC-5 wc gate apply)

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

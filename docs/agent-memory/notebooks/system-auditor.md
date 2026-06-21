# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c283 · 2026-06-21T21:13:57Z
### Audit Run Tier-1 (21:13 UTC 2026-06-21, Monday 04:13 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 10/10 probed
- Anomalies: 0 NEW (all containers UP, healthy, restart=0, memory/disk healthy)
- Status: CLEAN
- Notes: Pre-market (VN 04:13, opens 09:00). mcp-server rebuilt/restarted (health: starting at probe time, now OK). All 12 host_runtime_set UP. Disk 37% (no pressure). No signal_queue.rows[] NEW.

**RAW-PROBE (2026-06-21T21:13:57Z):**
```
--- docker ps ---
mcp-server: Up 7s (health: starting → recovered within probe)
frontend: Up 5 days (healthy)
pdf-extractor: Up 5 days (healthy)
stock-price: Up 6 days (healthy)
technical-analysis: Up 6 days (healthy)
macro-indicators: Up 7 days (healthy)
kinh-dich-service: Up 7 days (healthy)
api-gateway: Up 10 days (healthy)
rag-service: Up 15 min (healthy)
news-fetch: Up 10 days (healthy)
alert-engine: Up 10 days (healthy)
mcp-gateway: Up 10 days (healthy)

--- health endpoints (all 200) ---
mcp-server (3000): OK
frontend (3001): OK
api-gateway (4040): OK
stock-price (5000): OK
pdf-extractor (5001): OK
macro-indicators (5002): OK
technical-analysis (5003): OK
rag-service (5004): OK
kinh-dich-service (5005): OK

--- disk ---
df -h /: 37% used (13Gi / 233Gi) — PASS
```

**Dedup-skip:** None. Rebuild transient expected per AUDIT_TIER=1 constraint.

**Tier-1 Verdict:** CLEAN — all services UP, all health 200, rebuild in progress as noted, no new anomalies.

## c282 · 2026-06-21T20:43:11Z
### Audit Run Tier-1 (20:43 UTC 2026-06-21, Monday 03:43 VN 2026-06-22)
- Tier: 1 | Services: 12 checked (host_runtime_set) | Health endpoints: 5/5 probed
- Anomalies: 0 NEW (all containers UP, healthy, restart=0, memory/disk healthy)
- Status: CLEAN
- Notes: Pre-market window (VN 03:43, opens 09:00). mcp-server up 10h (restart=0, mem 59.89%). All 12 host_runtime_set services healthy. Disk 37% (no pressure). rag-service known ceiling tracked. No signal_queue.rows[] NEW status.

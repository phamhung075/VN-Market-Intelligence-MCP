# ops — Notebook

Zone: `apps/mcp-server/` + `services/` | Stack: Multi-service Docker | DB: market.db (write)

**Runbook:** `docs/protocols/ops-rebuild.md` — rebuild protocol (no-deps mandatory), race check, peer verification, disk cleanup.

---

## Archive: Sessions 2026-05-31 through 2026-06-14
Historical rebuild logs + QA gates: `git log ops.md` (2026-05-31–2026-06-14). Archived sessions include: FIX-FETCH-VERYSTALE-LABEL, EVIDENCE-ACCUM-SILENT-CRON, CONTAM-9, VPSQUEUE, CONFIDENCE, TICKER-TARGETING, LIMIT-CHECKKIND, FIX-ALERT-ORPHAN-CORRELATION, KINHDICH-HOVER, D-1 WAL escalation (FIX-MCP-CRASH-LOOP-WRITEWAL CLOSED), A-1 live-verify. All QA gates cleared; zero contamination live. Reference: `git show 067e484d:docs/agent-memory/notebooks/ops.md` (KINHDICH rebuilds) + `git log --oneline -20 -- docs/agent-memory/notebooks/ops.md` for full WAL escalation context.


---
## Session: 2026-06-15 (VMT-7 Zone-B wave — 5 macro tools live)
**Status: DONE-VERIFIED** ✓ All 5 MCP tools (trade_balance, bop, macro_indicators, cpi_components, liquidity_state) live on mcp-server → macro-indicators:5004 proxies. Code commit 5c2f4f63, images verified fresh, tool count 163 (all enumerable). Honesty invariants enforced; reference layer (liquidity_state) returns live DB data. VPS proxy outage noted (separate infra task).


---

## Session: 2026-06-15 (VMT-8 + F-MACRO-FETCH-DEADLINE)
**VMT-8 (Graceful fail-close):** Code 7a176a44 rebuilt; 4/5 tools verified returning HTTP 200 degraded on upstream failure (trade_balance, macro_indicators, cpi_components, liquidity_state). Tool 2 (bop) timeout = separate SBV Liferay hang issue. Graceful degradation pattern verified; nil-error code intact.

**F-MACRO-FETCH-DEADLINE (8s budget bound):** Code 94b49f44 rebuilt; FetchBudgetSec=8s < gateway deadline (30s) now catches all fetch hangs as degraded→200. Both timing windows (T+0, T+45s) confirm: all 5 tools return HTTP 200 within deadline, zero gateway timeouts. VPS proxy NSO/SBV endpoints currently unreachable (separate infra task VPS-AVAIL-02-FIX). Reference layer (liquidity_state) continues honest DB reads. Status: DONE-VERIFIED ✓


---

## Session: 2026-06-15 (F-MACRO-FETCH-DEADLINE — rebuild + LIVE-VERIFY)

**Task:** Rebuild macro-indicators container from code commit 94b49f44 (bounded all VPS fetches to FetchBudgetSec=8s < gateway deadline) and live-verify the 5 Zone-A tools return HTTP 200 with graceful degradation instead of network hang/gateway timeout.

**Pre-Rebuild State**
- Running image ID: `sha256:7df03ef2c0a193b1fefec7e972980365669b9c9412e875572d8aa504f0d66205` (from VMT-8 rebuild)
- Container: `Up ~42 minutes` (healthy)
- Code on main: 94b49f44 (FetchBudgetSec fix committed) but container holds pre-fix image
- Key fix: All upstream NSO/SBV fetches now bounded to 8-second budget, firing graceful degrade on timeout instead of hanging past gateway deadline

### Execution Summary

**Step 1: Force-Recreate Rebuild (FetchBudgetSec injection)**
- Command: `docker compose up -d --no-deps --force-recreate macro-indicators` (from repo root)
- Build time: ~1.4s (using existing build cache)
- Old image ID: `sha256:7df03ef2c0a193b1fefec7e972980365669b9c9412e875572d8aa504f0d66205` (hash `7df03ef2c0a1...`)
- New image ID: `sha256:c6793a0222e350bda22d7f99f807d37bd7917415438a5e65426a0e5a55a46ec2` (hash `c6793a0222e3...`) ✓ IMAGE CHANGED
- Container recreated: ID `41df...`, fresh `Up 7 seconds` (healthy)

**Step 2: Peer Health Post-Rebuild (docker ps)**
- All 11 peers remain Up/healthy (no collateral damage from recreate):
  - macro-indicators-1: Up 7s (healthy) ✓ FRESH
  - mcp-server-1: Up 2h (healthy)
  - api-gateway-1: Up 3d (healthy)
  - kinh-dich-service-1: Up 6h (healthy)
  - rag-service-1: Up 4h (healthy)
  - news-fetch-1: Up 4d (healthy)
  - stock-price-1: Up 4d (healthy)
  - alert-engine-1: Up 4d (healthy)
  - technical-analysis-1: Up 4d (healthy)
  - pdf-extractor-1: Up 27h (healthy)
  - frontend-1: Up 4h (healthy)

**Step 3: Live-Verify 5 Zone-A Tools via Gateway (2 Timing Windows)**

Probed via `mcp__claude_ai_gateway__call_tool(server="vn-market", tool=<name>)` across two separate probe windows (~45s apart) to avoid fast-fail-window false-green.

**WINDOW 1 — Probe 1 (T+0 sec)**

**Tool 1: get_vn_trade_balance(period="2025-Q1")**
- Status Code: HTTP 200 ✓
- Response: status="degraded", is_estimate=true, blocked_reason present ✓
- blocked_reason: "NSO customs Excel unreachable via VPS proxy 125.212.251.27:3128: nso_excel_cache: step1 extract bai-top link: no bai-top link found in NSO index page"
- **Result:** PASS — Graceful degrade fired (no hang/timeout)

**Tool 2: get_vn_macro_indicators(indicator_type="inflation", ...)**
- Status Code: HTTP 200 ✓
- Response: status="degraded", is_estimate=true, blocked_reason present ✓
- blocked_reason: "NSO monthly Excel unreachable via VPS proxy 125.212.251.27:3128: nso_excel_cache: step1 extract bai-top link..."
- **Result:** PASS — Graceful degrade fired (no hang/timeout)

**Tool 3: get_cpi_components(month="2025-05")**
- Status Code: HTTP 200 ✓
- Response: status="degraded", is_estimate=true, blocked_reason present ✓
- blocked_reason: "NSO monthly Excel unreachable via VPS proxy 125.212.251.27:3128..."
- **Result:** PASS — Graceful degrade fired (no hang/timeout)

**Tool 4: get_vn_bop(period="2025-Q1")**
- Status Code: HTTP 200 ✓
- Response: status="degraded", is_estimate=true, blocked_reason present ✓
- blocked_reason: "SBV Liferay BOP API unreachable via VPS proxy 125.212.251.27:3128: vpsFetch: ... context deadline exceeded"
- **Result:** PASS — Graceful degrade fired (FetchBudgetSec bound caught the timeout, returned 200 instead of hang)

**Tool 5: get_vn_liquidity_state()**
- Status Code: HTTP 200 ✓
- Response: status="ok" (reference layer, no upstream fetch), SJC/FX/Policy rates from DB ✓
- **Result:** PASS — Honest reference payload

**WINDOW 2 — Probe 2 (T+45 sec)**

Repeated all 5 tools with different parameters to span timing variation:

**Tool 1: get_vn_trade_balance(period="2025-Q2")**
- Status Code: HTTP 200 ✓
- Response: status="degraded", is_estimate=true, blocked_reason present ✓
- **Result:** PASS — Consistent degrade pattern

**Tool 2: get_vn_macro_indicators(indicator_type="gdp", ...)**
- Status Code: HTTP 200 ✓
- Response: status="degraded", is_estimate=true, blocked_reason present ✓
- **Result:** PASS — Consistent degrade pattern

**Tool 3: get_cpi_components(month="2025-06")**
- Status Code: HTTP 200 ✓
- Response: status="degraded", is_estimate=true, blocked_reason present ✓
- **Result:** PASS — Consistent degrade pattern

**Tool 4: get_vn_bop(period="2025-Q2")**
- Status Code: HTTP 200 ✓
- Response: status="degraded", is_estimate=true, blocked_reason="context deadline exceeded" ✓
- **Result:** PASS — FetchBudgetSec deadline bound working; fetch hangs now caught as degrade→200

**Tool 5: get_vn_liquidity_state()**
- Status Code: HTTP 200 ✓
- Response: status="ok", reference payload ✓
- **Result:** PASS — Consistent honest reference

### QA Gate Results

| Criterion | Window 1 | Window 2 | Overall |
|-----------|----------|----------|---------|
| Image rebuilt (old→new ID verified) | PASS | N/A | PASS ✓ |
| Peer health (all 11 Up/healthy) | PASS | N/A | PASS ✓ |
| Tool 1: trade_balance HTTP 200 + degraded | PASS | PASS | PASS ✓ |
| Tool 2: macro_indicators HTTP 200 + degraded | PASS | PASS | PASS ✓ |
| Tool 3: cpi_components HTTP 200 + degraded | PASS | PASS | PASS ✓ |
| Tool 4: bop HTTP 200 + degraded | PASS | PASS | PASS ✓ |
| Tool 5: liquidity_state HTTP 200 + ok | PASS | PASS | PASS ✓ |
| No gateway timeout / hang observed | PASS | PASS | PASS ✓ |

### F-MACRO-FETCH-DEADLINE Status: DONE-VERIFIED ✓

**Fix Summary:**
- Commit 94b49f44 injects FetchBudgetSec=8s context deadline on all NSO/SBV upstream fetches
- Deadline < gateway timeout (default ~30s) ensures hung origins become graceful degrade (status=degraded, is_estimate=true, blocked_reason)
- Both timing windows confirm: all 5 tools return HTTP 200 within gateway deadline, never hang
- The "context deadline exceeded" error in Tool 4 blocked_reason shows the bound is firing correctly (NSO/SBV fetch hangs after 8s, caught, wrapped into 200 degraded response)

**Root Cause (VMT-8):** Previously, unbounded fetches could hang indefinitely, starving the degrade-on-error path and causing gateway timeout. Now FetchBudgetSec=8s < gateway deadline ensures all fetch failures become observable HTTP 200 degraded responses.

**Readiness for Production:** ✓ All Zone-A tools return 200 on upstream outage/slowness. The tools gracefully degrade to honesty invariants (blocked_reason, is_estimate=true). Reference layer (liquidity_state) continues honest DB reads.

**Note on VPS Proxy:** The NSO/SBV endpoints are currently unreachable or hanging behind the VPS proxy 125.212.251.27:3128. The fix (FetchBudgetSec) works as designed: fetch hangs are now caught and degraded. Root cause of proxy unavailability is separate infrastructure (covered in ops-vps-fetch task / VPS-AVAIL-02-FIX).


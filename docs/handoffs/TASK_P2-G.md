---
task_id: "P2-G"
phase: "2"
pilot: "stock-price"
owner: "qa"
goal_track: "A (Trust Foundation)"
goal_ids: ["G5"]
status: "READY"
created_by: "pm"
created_at: "2026-05-24T02:40:59Z"
previous_task: "P2-F (DONE 2026-05-24T02:37:46Z, commit 6225f926)"
next_task: "P2-H (G3 composition root cleanup + OpenAPI)"
blocked_by: ["P2-F"]
blocks: ["P2-H"]
estimated_duration: "30m"
ac_count: 5
---

# P2-G — G5b/G5c: MCP Handler HTTP-Port Audit + Zero `TODO.*migrat`

## Summary

This is a **read-only audit task** executed by QA. P2-F (git mv of superseded domain logic to `_deprecated/`) is DONE and verified by PM (6/6 ACs PASS, commit 6225f926, anchor intact, sandbox 11/11 GREEN). P2-G confirms two final G5 conditions:

1. **G5b:** Zero direct stock-price domain imports exist in mcp-server tool handlers (HTTP client routes correctly to port 5000)
2. **G5c:** Zero `TODO.*migrat` migration-debt markers remain in either service

Upon completion, QA emits G5 evidence to a signal file. **No code changes.** No goal flips (§4.5 binding).

---

## Context & P2-F Evidence (for QA reference)

P2-F completed the **G5a** phase: moved superseded `ResolvePriceService` (pre-DDD domain logic) to `apps/stock-price/pkg/domain/_deprecated/` with `//go:build ignore` compile gate (standard Go archival pattern). The price-resolution module now satisfies the domain via:

- **PriceResolverPort** interface (in `pkg/application/`)
- **price_resolution.New(tier1, tier2, tier3)** wiring at composition root (`cmd/server/main.go`)
- **mockResolver** in tests (no references to superseded `domain.NewResolvePriceService`)

P2-F evidence recorded in `docs/data/pilot-status-stock-price.json`:
- Git mv: `services_v1.go` + `services_v1_test.go` moved to `pkg/domain/_deprecated/`
- `grep ResolvePriceService pkg/application/usecases.go` → 0 matches (rewired)
- `go build ./...` exit 0, `golangci-lint` 0 issues (Fence-A/B/C intact)
- `cmd/server/main.go` wires `priceresolution.New(...)` directly
- Sandbox: `total=11 pass=11 fail=0 status=OK`
- Anchor `debba8ea...` still ancestor of HEAD

---

## Acceptance Criteria

### AC-1 — Zero Direct stock-price Domain Imports in mcp-server

**Test:**
```bash
grep -rn "from.*apps/stock-price\|require.*stock-price" \
  apps/mcp-server/src/interface/mcp/tools/market-data/
```

**Expected:** 0 matches (no cross-service domain imports in tool handlers).

**Context:** Per brownfield §5, the tool files (`priceHistoryTools.ts`, `tickerIntelligenceTools.ts`, `priceAlertTools.ts`) use local SQLite caching (`bun:sqlite`), NOT stock-price domain imports. This is a dual-write caching pattern, not a DDD violation.

**Verify:** AC-1 confirms the isolation boundary holds.

---

### AC-2 — HTTP Client Confirmed at Correct Port

**Test:**
```bash
grep -n "5000\|5010\|stock-price" \
  apps/mcp-server/src/infrastructure/microservices/clients.ts
```

**Expected:** ≥1 match showing `5000` or `stock-price` (confirming HTTP routing to port 5000, the internal service address per system-map.json).

**Context:**  The `fetchStockPrice` and `getPriceHistory` functions in the microservices client must route to the correct internal port. Port 5000 = internal service address (per system-map.json `"port": 5000`). This validates G5b rewiring: old domain calls replaced with HTTP client calls to the correct service port.

**Verify:** AC-2 confirms the HTTP integration post-G5a move is sound.

---

### AC-3 — Zero `TODO.*migrat` Markers (G5c)

**Test:**
```bash
grep -rn "TODO.*migrat" \
  apps/stock-price/ \
  apps/mcp-server/src/interface/mcp/tools/market-data/ \
  --include='*.ts' \
  --include='*.go'
```

**Expected:** 0 matches.

**Context:** G5c requires zero "TODO.*migrat" migration-debt markers. Any unfinished migration markers left in code indicate incomplete refactoring. AC-3 confirms the refactoring is complete and no temporary migration markers remain.

**Verify:** AC-3 confirms G5c phase complete (no partial/temporary markers).

---

### AC-4 — `_deprecated/` Path Free of `TODO.*migrat`

**Test:**
```bash
grep -rn "TODO.*migrat" \
  apps/stock-price/pkg/_deprecated/ \
  apps/stock-price/pkg/domain/_deprecated/
```

**Expected:** 0 matches.

**Context:** The deprecated files themselves (archived pre-DDD logic) must not carry temporary migration markers either. They should be clean archival files ready for eventual deletion in a future phase.

**Verify:** AC-4 confirms deprecated files are clean archives, not holding temporary markers.

---

### AC-5 — G5 Evidence Compiled

**Deliverable:** Write a new file `docs/handoffs/TASK_P2-G-sp-g5-evidence.md` containing:

```yaml
g5a_deprecated_path: apps/stock-price/pkg/domain/_deprecated/services_v1.go
g5a_deprecated_test_path: apps/stock-price/pkg/domain/_deprecated/services_v1_test.go
g5a_verified_by: pm (P2-F verification commit 6225f926)
g5a_verified_at: "2026-05-24T02:40:59Z"

g5b_audit_scope: mcp-server tool handlers (market-data tools)
g5b_zero_direct_domain_imports: YES (AC-1 grep = 0)
g5b_http_client_present: YES (port 5000 in clients.ts, AC-2 grep ≥1)
g5b_http_integration_target: port 5000 (internal) per system-map.json

g5c_zero_todo_migrat: YES (AC-3 grep = 0)
g5c_deprecated_path_clean: YES (AC-4 grep = 0)

g5_ready_to_grade: YES (all conditions met; G5 close gate PASS)
g5_signal_emitted: docs/signals/qa-sp-P2-G-g5-evidence-done-<UTC>.json
```

**Also emit signal file:** `docs/signals/qa-sp-P2-G-g5-evidence-done-<ISO8601-UTC>.json` naming QA as actor, P2-G task, G5 evidence verdict = COMPLETE, next blocker = P2-H.

**Verify:** AC-5 confirms G5 audit trail is complete and traceable for PO review at Phase-3 close.

---

## Frozen Constraints (Do Not Change)

- **.golangci.yml freeze anchor:** `d5ce886e` (P2-B commit, most-recent commit on file). No subsequent modification.
- **Anchor discipline:** `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor of HEAD. No retag, no rewrite.
- **Goal-flip prohibition:** §4.5 binding. This audit task does NOT flip G5 status. G5 status remains TBD until Phase 3 PO close (atomic with 12/12 goal verdicts).
- **L84 staging:** QA stages only `docs/handoffs/TASK_P2-G-sp-g5-evidence.md` + dispatch signal. No other files.

---

## Files Touched

- **Read-only audit:**
  - `apps/stock-price/` (entire service — grep scope)
  - `apps/mcp-server/src/interface/mcp/tools/market-data/` (grep scope)
  - `apps/mcp-server/src/infrastructure/microservices/clients.ts` (grep scope)

- **Write (QA audit result):**
  - `docs/handoffs/TASK_P2-G-sp-g5-evidence.md` (new file, AC-5 deliverable)
  - `docs/signals/qa-sp-P2-G-g5-evidence-done-<UTC>.json` (signal, AC-5)

---

## Acceptance & Commit Pattern

1. **Run all 4 greps** (AC-1, AC-2, AC-3, AC-4) locally. Record results.
2. **Write evidence file** (AC-5, `TASK_P2-G-sp-g5-evidence.md`) with results.
3. **Emit dispatch signal** (AC-5, `qa-sp-P2-G-g5-evidence-done-<UTC>.json`).
4. **Stage both files** explicitly (L84 enforcement):
   ```bash
   git add docs/handoffs/TASK_P2-G-sp-g5-evidence.md
   git add docs/signals/qa-sp-P2-G-g5-evidence-done-<UTC>.json
   ```
5. **Commit** with message:
   ```
   chore(qa/stock-price): P2-G — G5b/G5c audit complete (zero domain imports, zero TODO.*migrat) + G5 evidence
   ```
6. **Return signal** to PM: `P2-G DONE, all 5 ACs PASS, next blocker P2-H ready`.

---

## Next Task (P2-H)

P2-H (dev-stock-price): **G3 composition root cleanup + OpenAPI contract**

- Owner: dev-stock-price
- Blocked by: P2-G DONE
- Deliverables:
  - Composition root (`cmd/server/main.go`) ≤100 lines, zero business logic
  - OpenAPI YAML contract (`api/openapi.yaml`) documenting all HTTP endpoints
  - Build + lint + sandbox all-green before DONE

---

## Notes for QA

- The deprecated files are intentionally annotated with `//go:build ignore` (see P2-F commit 6225f926). This is standard Go practice for archival/migration purposes. They do NOT contribute to compilation or binary size.
- The HTTP client (`clients.ts`) already routes to port 5000 (internal). No rewire needed in P2-G; just audit confirmation.
- If AC-1, AC-2, AC-3, or AC-4 greps fail (return non-zero matches), **ESCALATE to PM immediately**. Do NOT attempt to fix; that would be out-of-scope for an audit task.

---

**Handoff timestamp:** 2026-05-24T02:40:59Z
**Handoff by:** pm
**Handoff to:** qa

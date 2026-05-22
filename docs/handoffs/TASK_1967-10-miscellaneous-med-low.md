# Handoff — TASK_1967-10: Miscellaneous MED/LOW items (ITEM-06, ITEM-16, ITEM-18, ITEM-20, ITEM-21)

**Task:** 1967-10 | **Sprint:** 1967c | **Severity:** MED/LOW | **Size:** XS (doc notes + optional marketScanJob fix)

---

## Summary

Five low-risk items bundled:
1. **ITEM-06 (MED):** news-scout / market-watcher capabilities text vs execution drift (coverage claim)
2. **ITEM-16 (LOW):** Recursive spawn guard text-only (no runtime check)
3. **ITEM-18 (LOW):** marketScanJob isRunning guard not in finally block
4. **ITEM-20 (LOW):** Task-lock TTL analysis — confirmed safe
5. **ITEM-21 (MED):** Concurrent last-writer-wins on TASKS.md / DASHBOARD / pipeline-state.json

---

## Evidence

**Brief cross-links:** All in `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md`

---

## Current Behavior & Proposed Fixes

### ITEM-06 (MED)
- **Issue:** news-scout/market-watcher claim "all watchlist" coverage but execute only reactive (5/34 tickers)
- **Current:** Capabilities text misleads downstream agents
- **Fix (Option A):** Update capability text to "reactive coverage, event-driven tickers" (doc-only)
- **Fix (Option B):** Follow-on: quiet-ticker probe pass per cycle (PM brief needed, out-of-scope for 1967c)
- **Recommendation:** Option A immediate (1-line edit), Option B tracked separately

### ITEM-16 (LOW)
- **Issue:** dev-team/cowork-team dispatcher guards are textual only, not runtime assertions
- **Verdict:** No evidence of violation in current flows; LOW risk / accept-risk
- **Fix:** Documentation note only: "dispatcher spawn guard is by policy, not runtime check"

### ITEM-18 (LOW)
- **Issue:** marketScanJob `isRunning = false` inside try block, not finally (L75 pdfOcrWorker.ts)
- **If exception before L75:** Guard stays true indefinitely until service restart
- **Blast radius:** marketScanJob next invocation skipped (low frequency: ~2h during market hours)
- **Fix (optional):** Move to finally block (1-line change in dev-mcp-server or skip as LOW)

### ITEM-20 (LOW)
- **Issue:** Task-lock TTL analysis — stale-claim window
- **Verdict:** CONFIRMED SAFE by design
- **Fix:** No fix required; document as confirmed safe

### ITEM-21 (MED)
- **Issue:** TASKS.md / DASHBOARD / pipeline-state.json have no write serialization (last-writer-wins)
- **Highest risk:** pipeline-state.json corruption → sprint stall
- **Recommendation:** system-auditor D5 detects mtime changes within same 15-min window as detection mechanism
- **Long-term:** task_status_echo table per brief Option C (out-of-scope for 1967c)

---

## Acceptance Criteria

### ITEM-06
1. [ ] news-scout.md line 22: capabilities text updated from "all watchlist" to "reactive, event-driven"
2. [ ] market-watcher.md line 22: same update
3. [ ] Cross-link added: 1965-COVERAGE-SWEEP brief (future rotation probe design)

### ITEM-16
1. [ ] dev-team/main.md: documentation note added "spawn guard by policy (NEVER spawn cowork-team)"
2. [ ] cowork-team/main.md: documentation note added "spawn guard by policy (NEVER spawn dev-team)"

### ITEM-18 (OPTIONAL)
1. [ ] IF fixing: marketScanJob finally block wraps `isRunning = false`
2. [ ] tsc 0 errors

### ITEM-20
1. [ ] No action required; confirmed safe

### ITEM-21
1. [ ] system-auditor audit-dimensions.md D-N dimension added: mtime check on TASKS.md / pipeline-state.json within 15-min window
2. [ ] WORK alert emitted if concurrent writes detected

---

## Owner & Zone

- **Dev agent:** agent-father (ITEM-06, ITEM-16, ITEM-20, ITEM-21) + dev-mcp-server (ITEM-18 optional)
- **Zone:** `.claude/agents/`, `.claude/flows/`, `docs/agents/system-auditor/`
- **Model:** claude-haiku-4-5-20251001

---

## Notes

- ITEM-16 (recursive spawn guard): accepting as text-only policy; no evidence of violation
- ITEM-18 (marketScanJob): marked optional; recommend bundle with next dev-mcp-server PR for consistency
- ITEM-20 (TTL analysis): no action needed
- ITEM-21 (last-writer-wins): detection mechanism only; long-term fix (task_status_echo) deferred to future sprint

---

## Related

- ITEM-06 → 1965-COVERAGE-SWEEP (architecture brief for rotation sweep design)
- ITEM-21 → 2026-05-21-tasks-md-hardening.md brief Option C (future table-based solution)

---

## [Agent-father] Implementation Summary

**Completed:** 2026-05-22 | **Commits:** f47ed0bf (ITEM-06+16), c8b053d8 (ITEM-21)

### ITEM-06 — DONE
- `.claude/agents/news-scout.md` L22 responsibilities: "all watchlist tickers" → "reactive, event-driven tickers (not all watchlist — coverage is event-triggered, not exhaustive per cycle)"
- `.claude/agents/market-watcher.md` L22 responsibilities: same update
- agent-md-factory pattern applied (1-line edit per file, SSOT, no drift introduced)
- Cross-link to 1965-COVERAGE-SWEEP noted in handoff; no file-level change needed (brief exists separately)

### ITEM-16 — DONE
- `.claude/flows/dev-team/main.md`: spawn-guard comment added after "NEVER spawn cowork-team agents" line
- `.claude/flows/cowork-team/main.md`: spawn-guard comment added at L115+ (pre-Step-4.6 region) — §drift-min (L64-90) untouched per collision constraint
- cowork-team/main.md now 303L (was 301L, net +2L — within 310L flag threshold, no split needed)

### ITEM-18 — DEFERRED
- Out-of-zone for agent-father lane (apps/mcp-server is dev-mcp-server zone)
- Flagged in handoff as recommended for next dev-mcp-server bundle per original handoff guidance

### ITEM-20 — NO ACTION
- TTL analysis confirmed safe by design; no code or doc change required
- Documented as analysis-only finding (confirmed safe)

### ITEM-21 — DONE
- `docs/agents/system-auditor/audit-dimensions.md`: D-N dimension added (52L insert)
- Covers DN-W1 (TASKS.md) + DN-W2 (pipeline-state.json) mtime 15-min bucket detection
- Detection algorithm, acceptance criteria, failure modes, and scope boundary documented
- Dimension runs at Tier-3 03:00Z alongside D4; non-blocking on git log failure
- WORK alert + DASHBOARD po-row emitted on concurrent-write detection

### AC Mapping
| AC | Status | Note |
|----|--------|------|
| ITEM-06 AC-1 | PASS | news-scout.md L22 updated |
| ITEM-06 AC-2 | PASS | market-watcher.md L22 updated |
| ITEM-06 AC-3 | NOTE | Cross-link to 1965-COVERAGE-SWEEP in handoff only (brief not yet created — out-of-scope for 1967c) |
| ITEM-16 AC-1 | PASS | dev-team/main.md spawn-guard note added |
| ITEM-16 AC-2 | PASS | cowork-team/main.md spawn-guard note added at L115+ |
| ITEM-18 AC-1/2 | DEFERRED | dev-mcp-server zone — not agent-father scope |
| ITEM-20 AC-1 | PASS | No action; confirmed safe documented |
| ITEM-21 AC-1 | PASS | D-N dimension registered in audit-dimensions.md |
| ITEM-21 AC-2 | PASS | WORK alert + DASHBOARD row in D-N algorithm |

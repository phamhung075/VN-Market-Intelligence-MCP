# Decision Journal — Sprint ARCH-OHLCV-WRITER-SSOT-DURABLE · po

**Sprint goal:** Close the daily_ohlcv writer-bypass class (P0-A producer SSOT) + consumer stub-bar guard (P0-B) — kill the 4th-recurrence single-digit-RSI / giá-0-BB MARKET-spam.
**Agent:** po
**Started:** 2026-06-17T07:37:31Z

---

### STEP po-S100-1 · po · 2026-06-17T07:37:31Z
**task-id:** ARCH-OHLCV-WRITER-SSOT-DURABLE (P0-A)
**what-done:** Reconciled P0-A review[]→done[] as CODE-COMPLETE: folded the 3 bare SUBTASK strings (review[9,10,11]) into the parent object (was DESIGN_COMPLETE in done[162]), flipped status→DONE with done_verified:false, recorded subtask_commits 41b4344c/e5461ad7/e96571ac + behavioral gate.
**what-considered:**
- Relocate the 3 subtask strings as standalone done[] entries — rejected: bare strings carry no status/provenance; would leave 3 orphan board entries.
- Mint a fresh P0-A done record — rejected: the parent object already exists at done[162] with full root_cause/fix_spec/gate; re-typing = SSOT dup risk.
- Collapse: edit parent in place (status + .subtasks) and strip the strings — chosen.
**why-decision:** The design-parent + 3 code-subtasks are ONE deliverable; collapsing to one done-code SSOT record keeps the full WHY-trail and conserves board entries (review −4, done +1, total −3, all guards green).
**why-change:** No change from QA cycle-287 plan (APPROVE both; done_verified HELD).

### STEP po-S100-2 · po · 2026-06-17T07:37:31Z
**task-id:** FIX-ALERT-SCAN-REJECT-STUB-BAR-P0 (P0-B)
**what-done:** Relocated P0-B review[8]→done[] (was status:done-code, qa_verdict:APPROVE-CODE) → status:DONE, done_verified:false, rebuild_shipped:true, shared behavioral gate stamped. Commit d79314bb.
**what-considered:**
- only path: review→done-code. QA cycle-287 already APPROVE-CODE first-hand (tsc 0, full suite 13181 pass / 52 fail ALL disjoint, SB-1..SB-5 behavioral each job); router RAW-verified ops rebuild LIVE (docker exec grep proved both scan-guards in running container).
**why-decision:** Code + tests green, rebuild shipped live; only the behavioral gate (market-open) remains — that is a done_verified gate, not a done-code blocker.
**why-change:** No change from plan. done_verified explicitly HELD to next VN market open 2026-06-18 ~02:15Z (RSI canonical within 0.1pt, no single-digit/no 100.0, zero "giá 0 dưới BB", live daily_ohlcv 0 close=0 stubs on latest bar all 30 tickers incl DAG≠0). Self-heal masks stubs after ~04:30Z — gate verifies AT open. Follow-ons LINT-OHLCV-WRITE-BYPASS + ARCH-DAILY-FOREIGN-FLOW-TABLE already in backlog (no mint). 3 system-auditor signals (B-06/B-07/B-13) RAW-probed → all READ (false-positive / liveness≠freshness / already-tracked); no new tasks.

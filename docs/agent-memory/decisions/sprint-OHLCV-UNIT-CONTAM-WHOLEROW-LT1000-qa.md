# Decision Journal — Sprint OHLCV-UNIT-CONTAM-WHOLEROW-LT1000 · qa

**Sprint goal:** Eliminate the 2nd daily_ohlcv unit-contamination class (whole-row thousands-format, close<1000) degrading public RS/ROC/52w cards; harden the writer so residue cannot re-accumulate.
**Agent:** qa
**Started:** 2026-06-30T22:58:00Z

---

### STEP qa-S1 · qa · 2026-06-30T22:58:00Z
**task-id:** CONTAM-10-MIGRATION
**what-done:** Ran bun test on CONTAM-10 suite (22 pass / 0 fail, exit 0, no Bun JIT crash); verified all 6 design-contract items against source; APPROVED.
**what-considered:**
- Trust developer 22/0 badge without re-running — REJECTED: task prompt mandates independent ground-truth gate.
- CHANGES_REQUESTED on "2 files" bun anomaly — REJECTED: 22 tests are all in 1 test file; "2 files" = bun counting test file + migration source; assertions 22/0 is authoritative.
**why-decision:** All 6 design-contract criteria verified green (per-ticker anchor, INDEX_TICKERS exclusion in both CTEs, INNER JOIN no-anchor skip, all-4-field UPDATE, safety rails complete, CANONICAL pointer present); CONTAM-10-EXEC unblocked.
**why-change:** No change from plan — green gate proceeds to APPROVED.

---

### STEP qa-S2 · qa · 2026-07-01T00:17:00Z
**task-id:** CONTAM-10-SANITY
**what-done:** Verified Pass-4 detection code (commit dbaa318d) in ohlcvSanityCheckJob.ts + test file. Ran 11/11 pass4 suite green; full mcp-server suite 14111/0 exit 0; tsc 0 errors. Detection-only grep: zero SQL UPDATE/INSERT/DELETE targeting daily_ohlcv in Pass-4 diff (only grep hits were in commit message text). INDEX_TICKERS reused via spread for SQL IN-list and .has() for per-row check — no second Set literal. Deployed container Up+healthy, `whole_row_lt1000_scale` flag string confirmed in /app/src/. APPROVED.
**what-considered:**
- Bun post-completion C++ crash (after 14111 tests, exit 0) — diagnosed as known Bun JIT bug, not a test failure; exit code 0 is authoritative; crash happens after reporting phase completes.
- "~84/84" zone count in task brief vs 115/0 in OHLCV sanity zone (8 files) vs 14111/0 full suite — the "~84" was a pre-addition estimate; actual zone count is 115/0, full count is 14111/0; both green.
- Detection-only grep output had 2 hits — both in commit message section (word "updated"), not in code diff; confirmed zero code-level UPDATE/INSERT/DELETE statements targeting daily_ohlcv.
**why-decision:** All 6 AC checks green: (1) 11/11 pass4 + 14111/0 full suite + tsc 0; (2) detection-only confirmed; (3) INDEX_TICKERS reused, no dup; (4) firing predicate correct via ROW_NUMBER() anchor map; (5) DDD+security clean, mock-guard PASS; (6) deployed image carries Pass-4 code.
**why-change:** No change from plan — APPROVED.

---

### STEP qa-S3 · qa · 2026-07-08T02:12:00Z
**task-id:** CONTAM-10-WRITER-H
**what-done:** Re-reviewed diff 7fa78ac42 vs AC (drop-in swap correct, WIC-2 preserved, response shape correct); re-ran targeted 5-file suite myself (38/38, 167 expect — matches dev) + 1 extra caller dev didn't list (CONTAM-7, 45/45); tsc clean; DDD/security/mock-guard PASS; wrote+ran my OWN RAW-probe (isolated local instance, not dev's test) — contaminated batch corrected x1000, PASS. Confirmed via docker inspect the live container still runs the pre-fix image (not 4c8ea4cfd41f). Held REVIEW, `.head.next_agent=ops`.
**what-considered:**
- Probe the shared live container directly — REJECTED: would exercise OLD code (image confirmed unswapped) AND pollute the live production DB with synthetic rows; neither acceptable.
- Self-authorize `docker compose up -d mcp-server` to unblock a true live probe — REJECTED: explicitly ops-gated per task instructions, not QA's authority.
- Wait for full 14K-test suite to reach 100% before verdict — REJECTED: severe host contention (2 concurrent bun-test procs) made this open-ended; targeted+adjacent-caller suites (the only files actually exercising this diff) are complete and green, which is the load-bearing evidence; partial full-run (~300/1171 files, zero new OHLCV failures) is corroborating only.
**why-decision:** Code/tests independently verified correct and complete; true live-gateway RAW-probe requires the ops swap I cannot self-authorize — REVIEW (not done_verified) is the honest state per the handoff's own gate.
**why-change:** No change from plan — this was the anticipated outcome given the ops-gated swap dependency.

---

### STEP qa-S4 · DJ-GATE-1 · qa · 2026-07-08T02:25:01Z
**task-id:** CONTAM-10-WRITER-H
**what-done:** Independently re-confirmed via `docker inspect` (not trusting ops's badge alone) that `vn-market-intelligence-mcp-mcp-server-1` runs image `sha256:4c8ea4cfd41f...` — matches ops's e2bac5b0a swap. Ran the TRUE live-gateway RAW-probe deferred last cycle: real POST to `http://localhost:3000/api/push-ohlcv-history` (real network call, real running container). Used a clearly-synthetic ticker `QAPROBE1` (pre-checked absent from daily_ohlcv + watchlist; daily_ohlcv.code has no FK, so a synthetic code is a zero-collision-risk probe regardless of date) — pushed (1) a clean full-VND anchor row (2020-01-02, O/H/L/C=131000/133000/129000/130000) then (2) a contaminated batch shaped exactly like the leak evidence (2020-01-03, O/H/L/C=131/133/129/130, 100-999 VND range). Response: `{ok:true,inserted:1,skipped:0}` both times. Verified the PERSISTED row (not just the response) via an in-container `bun:sqlite` read (same-uid as the writer, correctly sees committed WAL pages) — row landed at 131000/133000/129000/130000 volume=500000: whole-row ×1000 corrected, matches the clean anchor exactly, volume left unscaled. Container log confirmed the exact guard: `scale_correction QAPROBE1 2020-01-03: prevClose=130000 current=130 ratio=1000.0 → ×1000`. CLEANUP: deleted both synthetic rows in-container immediately after verification (2 rows removed, confirmed 0 remaining via in-container read + `GET /api/prices/history?code=QAPROBE1` → 404 `no_data`); daily_ohlcv total row count (737441) unaffected net of the transient rows. Flipped `CONTAM-10-WRITER-H` → `DONE_VERIFIED` via `scripts/orch-apply.sh` (validated, exit 0, only pre-existing unrelated coherence warnings). `.head` set to idle (`next_agent: router`) noting `CONTAM-10-EXEC-2` is now unblocked (depends satisfied) for a future dev-team dispatch — did not dispatch it myself.
**what-considered:**
- Probe the live container using a real (non-synthetic) ticker + a far-past date — REJECTED in favor of a synthetic ticker: `daily_ohlcv.code` has no FK/whitelist, so a never-used code (`QAPROBE1`) carries strictly less collision risk than any real ticker, at any date, and is trivially identifiable for cleanup.
- Trust the external read-only sidecar (`keinos/sqlite3 file:...?immutable=1`, the same pattern `db-integrity-counts.sh` uses) to verify the persisted row — REJECTED as sole verification: it returned 0 rows for `QAPROBE1` immediately after a same-process write because it bypasses WAL/-shm entirely (documented gotcha, not a probe failure). Switched to an in-container `bun:sqlite` read (same uid as the writer process) which correctly sees committed WAL pages, and cross-confirmed via the container's own HTTP route after cleanup.
- Leave the synthetic rows in place since they're clearly fake and low-risk — REJECTED: task instructions are explicit that no polluting rows may be left in the live production table regardless of how synthetic/identifiable they are; deleted immediately post-verification and independently re-confirmed 0 remaining.
**why-decision:** All 3 gate conditions met: (1) live container confirmed on the QA-approved+ops-swapped image; (2) real HTTP POST against that real running service, with the persisted DB row (not just the response body) independently verified corrected to the right scale; (3) zero residual synthetic data in the live DB post-cleanup. This is the genuine live-gateway probe the task held REVIEW for — DONE_VERIFIED is honest.
**why-change:** No change from plan — this was the anticipated final gate once the ops swap landed.

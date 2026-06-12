# ops — Notebook

Zone: `apps/mcp-server/` + `services/` | Stack: Multi-service Docker | DB: market.db (write)

**Runbook:** `docs/protocols/ops-rebuild.md` — rebuild protocol (no-deps mandatory), race check, peer verification, disk cleanup.

---

## Session: 2026-06-12 (FIX-FETCH-VERYSTALE-LABEL frontend rebuild)

**Task:** Rebuild frontend container to ship FIX-FETCH-VERYSTALE-LABEL (sourceStatusLabel display).

### Execution Summary

**Step 1-5: Rebuild + Verification**
- Frontend image: `e47f66ad...` (old) → `1d6d2c441...` (new)
- All 11 services healthy post-build
- Smoke test: curl /dashboard/fetch → 200 OK ✓
- sourceStatusLabel verified in compiled bundle ✓
- Task moved to DONE; orch-state committed

**QA Gate:** CLEARED ✓
- Frontend image ID confirmed changed (rebuild race safe)
- All peer services remain healthy (--no-deps isolation verified)
- Smoke test passed; disk healthy (90% used, normal)

---

## Session: 2026-06-12 (EVIDENCE-ACCUM-SILENT-CRON — mcp-server rebuild)

**Task:** Rebuild mcp-server to ship EVIDENCE-ACCUM-SILENT-CRON (recoverMissedExecutions on evidenceAccumulator + reputationCompute crons).

### Execution Summary

**Step 1-5: Build + Post-rebuild verification**
- mcp-server image: `9105f6dd...` (old) → `eff44b53...` (new)
- Build: SUCCESS; contained commit 53d00955 (FIX-VNSTOCK-FUNDAMENTALS-CRASH-SPIKE)
- Health endpoint: `{"status":"ok", "toolCount":157}` ✓
- Scheduler startup: 80 cron keys registered (incl. recoverMissedExecutions recovery logic)
- All 11 services UP; no peer destruction ✓

**QA Gate:** COMPLETE ✓
- Deployed with recoverMissedExecutions active on both crons
- QA re-check scheduled for 2026-06-13 after 08:30Z + 16:00Z cron ticks
- Disk headroom: 19GB free (42% used)

**Next:** Router monitors; if both ticks succeed by 2026-06-13 16:30Z, task → DONE.

---

## Session: 2026-06-12 19:30–19:45Z (CONTAM-9 mcp-server rebuild)

**Task:** Rebuild mcp-server to pick up write-boundary fix (pushPricesHandler MIN(low) ON CONFLICT + ohlcvUnitGuard Rule 3 mixed-unit detection).

### Execution Summary

**Pre-state:** mcp-server `31d8f093...`, image `eff44b53...`; commit 6657fc3e (CONTAM-9); 11 services UP.

**Build + Verification**
- Build: SUCCESS; new image `2fc9222cd4b6...` (513MB, stable)
- Image verification: old `eff44b53...` ≠ new `2fc9222c...` (rebuild race safe) ✓
- All 13 containers (11 core + 2 infra) stable post-rebuild ✓
- Health: `{"status":"ok", "toolCount":157}` ✓

**Live data verification**
- FPT latest rows: values consistent (no mixed-unit, no low=0) ✓
- Contamination Class A (low=0): COUNT = 0 (fully repaired) ✓
- Contamination Class B (partial-zero): COUNT = 0 (fully repaired) ✓

**QA Gate:** COMPLETE ✓
- Deployed with write-boundary fixes (MIN(low) ON CONFLICT, Rule 3 detector)
- 0 contaminated rows remain live; health endpoint stable
- Disk: 19GB avail, 42% used

**Next:** QA verification — live chart testing on FPT 2026-06-12 row to confirm front-end renders repaired prices.

---

## Archive: Earlier Sessions (2026-05-31 through 2026-06-12 morning)

**2026-05-31 (FU-TRUST-REFRESH — 2 sessions)**
- FU-6d bank-path fix live; re-finalized ACB + FPT
- ACB: balance perfect (932.1B + 98.7B = 1,030.9B ✓); all 7 scalars correct
- FPT: regression-confirm stable (unchanged from prior); both reports DONE
- Task moved to DONE

**2026-06-01 (5 sessions: VPS-PROXY-RECOVERY, VN-NEWS-FETCH-HTTP-000-FIX, VPS-BCTC-FETCH-RECOVERY, Infrastructure Incident Recovery, VPS-SOCAT-PERSISTENCE-ROOT-CAUSE-FIX)**
- VPS socat persistence fixed (plist install missing, launchctl load applied)
- News-fetch and BCTC-fetch recovery verified
- Infra incident root-cause: api-gateway :4000 socat dead + HNX TLS chain incomplete (--cacert hardened)

**2026-06-02 (3 sessions: T5-OPS-DEPLOY, FBT-OPS Frontend Rebuild, BEQ-REBUILD)**
- VPS-DEPLOY-PLACEHOLDER-GUARD deployed
- Frontend rebuilt (Remix SSR + UI updates)
- mcp-server rebuilt (BEQ scalars backfill)

**2026-06-03 through 2026-06-12 morning (6 sessions)**
- BCTC-LAYOUT-FIRST Phase 0 LIVE DEPLOY
- FU-BACKFILL-DE-SYNC REBUILD
- REBUILD-AFTER-DEV-CHANGE (FIX-C + FIX-E)
- DATA-SERVE-INTEGRITY (DSI-S1-SLA, DSI-S2-PRICE, DSI-S1-FE-TYPE)
- FU-LEADER-LOCK-OWNER-SESSION rebuild
- HEADROOM-PROXY-SETUP + WORKFLOW-FLUIDITY + SERVICE-SCOPED rebuild + FIX-SBV-PUSH-TYPE-COERCE + FIX-FETCH-VERYSTALE-LABEL (6 rebuilds total)

All sessions completed with QA gates cleared; no peer destruction; disk maintained.

---

**Current state (2026-06-12 end-of-day):** All 13 services healthy; latest deployed code includes CONTAM-9 write-boundary fixes + EVIDENCE-ACCUM-SILENT-CRON recovery logic. No contaminated rows live; disk headroom 19GB (42% used).

# Decision Journal — Sprint FFLOW-STALE-0723 · qa

**Sprint goal:** PART A (ops-vps-fetch) recover Vinahost VPS for vn-foreign-flow.service; PART B (developer) build the persistent calendar-aware freshness recheck harness that gates PART A's "assume complete fixed" declaration.
**Agent:** qa
**Started:** 2026-08-06T09:56:00Z

---

### STEP qa-S1 · qa · 2026-08-06T09:56:00Z
**task-id:** FFLOW-STALE-0723-B-RECHECK-HARNESS
**what-done:** Direct-commit verify (mode=verify-committed) of commits a7b3709db + e5440901 on main; RAW re-ran the script myself (not trusting review_note prose).
**what-considered:**
- Trust review_note's "3-ways raw-verified" claim as-is — rejected: feedback_router_verify_raw_not_badges forbids badge-trust; re-ran independently.
- Re-run only `--self-test` — rejected: insufficient, also ran a live probe to confirm today's real data (2026-08-06) passes, and confirmed the historical stale fixture (07-21) still fails, matching verification_gate's dual-branch requirement.
- Check wiring is real (not doc-only) by grepping notebook git history for evidence the harness actually executed inside system-auditor's Tier-2 cycle — found c-07-28 tier-2 entry citing live `verdict=PASS latest_date=2026-07-28` output, confirming genuine cron-cycle wiring, not aspirational prose.
**why-decision:** All 8 ACs verified against live code/output, not narration: script exists, persistent; --self-test 3/3 branches pass; live run today exits 0 latest_date=2026-08-06; calendar SSOT exports match; dev-standards.md registry + ops/vps.md + system-auditor pointers present, with git-history proof (c 07-28 notebook) of ACTUAL execution inside a real Tier-2 cycle, not just a written pointer. mock-guard PASS. APPROVED.
**why-change:** no change from plan.

### STEP qa-S2 · qa · 2026-08-06T10:00:00Z
**task-id:** FFLOW-STALE-0723-A-VPS-FIX
**what-done:** Direct-commit verify (mode=verify-committed) of infra-recovery commit 446f28c14 (notebook+recon, no code diff — genuine for an SSH-side fix); RAW-checked live system state, not review_note prose.
**what-considered:**
- Trust review_note "live E2E raw-verified" claim as-is — rejected, feedback_router_verify_raw_not_badges; independently re-ran the freshness harness and 2 live gateway probes myself.
- SSH into the VPS myself to re-confirm systemctl/NTP — rejected, no SSH tool grant in this session; substituted 16-day continuous downstream data trail as an equal-or-stronger live proxy (a one-off manual push could not explain 2+ weeks of unbroken sessions).
- Treat the pre-existing secondary 06-30->07-20 gap as blocking — rejected, task's own AC-A4 marks it non-blocking; confirmed it is tracked (OPS-FFLOW-VPS-CLOCKDRIFT-PREVENTIVE-RESIDUALS, P1 BACKLOG), not silently dropped.
**why-decision:** scripts/check-foreign-flow-freshness.sh --live NOW (10min ago) -> verdict=PASS latest_date=2026-08-06 lcts=2026-08-06 (AC-A6/verification_gate satisfied, this session's own instrument, not self-report). get_market_foreign_flow days:20 shows unbroken session coverage 2026-07-23..2026-08-06 (16 calendar days, only weekends + the documented-unrecoverable 07-22 missing) — proves AC-A2/A3 (service actively, continuously fetching+pushing) far beyond the original one-shot manual proof. diagnose_foreign_flow_circuit_breaker live: closed, 0/5 failures, 33 total successes (up from 0 at incident open), never failed -> AC-A5 (not blindly reset) confirmed, breaker healthy on its own. AC-A4: 07-23 present, 07-22 genuinely absent + documented unrecoverable (live-snapshot API, no backfill param) — matches review_note, no fabricated rows (feedback_no_fake_data_real_fetch). Commit 446f28c14 verified on main ancestry, content matches claim (notebook + recon doc, zero code — correct shape for an SSH-only infra fix). APPROVED, DONE_VERIFIED.
**why-change:** no change from plan.

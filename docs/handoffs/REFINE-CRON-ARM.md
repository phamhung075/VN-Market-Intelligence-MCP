---
sprint: BCTC-ANALYTICS-LAYER
branch: task/refine-cron-arm
size: XS
zone: .claude/commands/crons/
depends_on: []
blocks: [BCTC-PDF-PATH-BACKFILL]
---

## TLDR

ARM the fleet refine cron (`cron-refine-bctc`) in the Claude schedule at `0 9,14,20 * * *` UTC (3 times daily: 09:00, 14:00, 20:00 UTC). The cron skill exists at `.claude/commands/crons/cron-refine-bctc.md` but was never armed, leaving 33 tickers permanently stuck at `refine_status=PENDING` despite having clean OCR text ready for refine. Arming the cron unblocks the fleet to process BCTC reports.

---

## [PM] Planning Context

**Zone:** `.claude/commands/crons/cron-refine-bctc.md`

**Root Cause (from Spike BCTC-CTG-FLEET-SERVE-SPIKE):**
- The BCTC refine pipeline was designed as Option-Y: host-level fleet cron dispatches `refine_bctc_md` agent, which calls `get_bctc_pending_refine` → `push_bctc_refined_unit` → `finalize_bctc_refine`.
- The cron skill file exists with schedule `0 9,14,20 * * *` UTC.
- The MCP tools (`get_bctc_pending_refine`, `push_bctc_refined_unit`, `finalize_bctc_refine`) are live and functional.
- The `refine_bctc_md` agent and its flow exist and are tested.
- **The missing piece:** The cron was never armed in the host scheduler. It exists only as documentation, never as an active scheduled job.

**Fleet Impact (33 Tickers Blocked):**
All tickers with `refine_status=PENDING` + OCR text available:
CTG, DIG, DPM (x2), GVR, HCM, HPG (x2), HSG, HVN, KBC (x2), MBB, MWG (x2), NKG, NVL (x2), POW, PPC, REE (x2), SSI, TCH (x2), VCB (x3), VCI, VHM, VIC, VPB, VRE

Each is blocked by the `PUB-1` gate (`refine_status IN ('DONE','PARTIAL')`) before any other publish gate fires, returning "Chưa có dữ liệu BCTC" instead of serving real financial data.

**Acceptance Criteria:**
- [ ] Use `CronCreate` to arm `cron-refine-bctc` in the Claude schedule
- [ ] `CronList` shows `cron-refine-bctc` active and scheduled
- [ ] Cron fires within next 24 hours (verify via log or `refine_bctc_md` execution notification)
- [ ] After first cron fire completes, `get_bctc_full(CTG)` returns real financial scalars (not "Chưa có dữ liệu BCTC")
- [ ] Verify at least one more ticker (VCB or GVR) also transitions from `refine_status=PENDING` to `DONE` or `PARTIAL` and serves data

**Files to Read First:**
- `docs/architecture-briefs/2026-06-12-bctc-ctg-fleet-serve-gap.md` — full spike findings (root cause, evidence chain, fleet-wide blocker count)
- `.claude/commands/crons/cron-refine-bctc.md` — cron skill definition (schedule + flow to run)
- `docs/agents/refine_bctc_md/flow/main.md` — refine flow logic (Phase 0 windows gate, unit-push loop, finalization)

**Files to Modify:**
- None (cron is armed via `CronCreate` API call, not file edits)

**Knowledge Needed:**
- `CronCreate` MCP tool signature and usage (check `docs/agents/agent-father/init.md` for cron management patterns)
- Cron schedule syntax (5-field format: minute hour day month weekday; `0 9,14,20 * * *` = 3 fires daily)
- Claude schedule management (how cron jobs are registered and listed)

**Dependencies:**
- None — OCR is already clean for all 33 tickers; prior PDF URL fixes already shipped
- CronCreate call can proceed immediately

---

## Notes

- **Session context:** CronCreate id `ec99e6c1` was already spawned 2026-06-12T20:55Z in main terminal as a first validation run (before formal task board entry). Verify that this cron is indeed armed and active, or use a new CronCreate if the session-scoped one expired.
- **Verification strategy:** After cron is confirmed armed, the first fire will trigger `refine_bctc_md` flow. The refine process is async (may take 15–60 min for a full fleet pass depending on PDF size). The AC gate `get_bctc_full(CTG)` is a live-verify observation, not a hard sync wait.
- **Schedule window:** The cron schedule `0 9,14,20 * * *` UTC is intentionally outside the OFF-HOSE window `02:00–08:59 UTC Mon–Fri` defined in `refine_bctc_md/flow/main.md` to avoid host memory saturation during off-market hours when the fleet might be dormant.
- **Related secondary task:** `BCTC-PDF-PATH-BACKFILL` (P2) handles the 2 tickers (D2D, KDC) with `pdf_path=NULL`. That task depends on this one being verified working, but can be started in parallel if resources allow.

---

## Task Completion

When the cron is armed and confirmed active:
1. Update `docs/data/orch/orch-state.json` task board: status → `DONE`, `closed_at` → ISO timestamp, `status_note` → "Cron armed and verified active via CronList; first fire scheduled within 24h"
2. Unblock `BCTC-PDF-PATH-BACKFILL` (depends-on relation)
3. Telegram notification to WORK channel: "REFINE-CRON-ARM done — fleet refine cron now live; monitoring first 33-ticker pass"

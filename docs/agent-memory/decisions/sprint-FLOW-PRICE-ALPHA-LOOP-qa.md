# Decision Journal — Sprint FLOW-PRICE-ALPHA-LOOP · qa

**Sprint goal:** wave-1 flow-alpha — OHLCV candle-recovery + backfill hardening (apps/mcp-server/)
**Agent:** qa
**Started:** 2026-07-13T05:45:00Z

---

### STEP qa-S1 · qa · 2026-07-13T05:45:00Z
**task-id:** ALPHA-S1-OHLCV-BACKFILL-DONE-BUG
**what-done:** RAW re-ran the 2 directly-touched suites myself (not trusting dev's 109/109) + `bun tsc --noEmit` on mcp-server; both green, tsc 0 errors.
**what-considered:**
- Trust dev's reported 109/109 vs re-run RAW myself — re-run mandatory per dispatch (RAW gate).
- Full 1199-file suite vs targeted-only — targeted only: VN market OPEN, live container holds :3000, host-starvation risk explicitly flagged by dispatcher.
- Merge/DONE now vs hold REVIEW — hold: code not yet deployed (docker rebuild is user/ops-gated), "serving" claim would be dishonest.
**why-decision:** ohlcv-backfill-done-subtask-b.test.ts = 8/8 (incl new BT-6/7/8), 1360-ohlcv-backfill-queue.test.ts = 9/9 (incl updated TC-6), combined 17/17; tsc clean; DDD grep clean (no new domain->infra import, interface layer importing infra/app is allowed direction, pre-existing import lines unchanged); process.env/secret grep clean; mock-guard PASS. Error path independently verified: BT-6/BT-7 show `bars_inserted` persisted (0 / NULL) on the closed row + a new `done=0,retry_count=1` row inserted — not a silent success; BT-8 shows cap(>=5) → escalate, exactly one `sendTelegramBug`, no new row; mutual-exclusion with the pre-existing depth-probe confirmed (no double-fire in test logs). `done` still flips unconditionally (preserves poller unblock contract) — by design, not a regression.
**why-change:** no change from plan — code matches architect design (`ALPHA-S1-architect-design.md` §3) verbatim, incl. planned BT-6/7/8 test cases and TC-6 update.

### STEP qa-S2 · qa · 2026-07-13T05:45:00Z
**task-id:** ALPHA-S1-OHLCV-BACKFILL-DONE-BUG
**what-done:** Held row in REVIEW (not merged to done) — code verified but NOT live; flagged `deploy_pending:true` instead of full DONE_VERIFIED.
**what-considered:**
- Flip to done[] like a normal APPROVED verdict vs hold REVIEW with a deploy-pending flag.
- Dispatcher's explicit disposition instruction: this fix is DEPLOY-REQUIRED (docker compose up -d --build mcp-server), user-gated + market-sensitive, QA does not deploy.
**why-decision:** Marking DONE_VERIFIED-live would misrepresent serving state (code committed to main already, per "no branches" convention, but the running container still serves the pre-fix binary) — standing lesson: verify SERVING value, not the badge/commit alone.
**why-change:** No change from plan — dispatcher pre-specified this exact disposition; QA's own RAW findings corroborate deploy is genuinely still pending (git commit present, container image unchanged).

### STEP qa-S3 · qa · 2026-07-13T06:17:59Z
**task-id:** ALPHA-S1-STARTUP-CANDLE-GUARD
**what-done:** RAW re-ran guard suite (14/14, matches dev) + mandated regression (5 files, 38/38) + 5 extra dev-cited suites for corroboration (91/91) = 143/0 total; tsc 0 errors; mock-guard PASS; DDD grep clean (domain/ zero infra/app imports).
**what-considered:**
- Trust dev's 14/0 + 93/93 vs re-run RAW — re-run mandatory; my regression subset (38) differs numerically from dev's 93 due to different file bucketing but both are 0-fail, no reconciliation needed since I verified raw myself.
- Item (a) DDD deviation (application importing scheduler's `runOhlcvDailyAggregator`): read architect design §1 directly — snippet does the identical import verbatim → SANCTIONED, not new debt.
- Item (b) dynamic-import cycle claim: wrote standalone script importing all 3 modules in both orders, checked `typeof` on all exports — no TDZ/undefined → confirmed no residual runtime cycle (only a `import type` erased back-edge).
**why-decision:** All 4 disclosed items (a-d) independently verified, not rubber-stamped: (a) accept as approved deviation (matches design + no real cycle per b); (b) confirmed via direct dual-order module-load probe; (c) traced aggregator's actual `[vnMidnight, nowMs)` window math — architect's `+5h` snippet resolves to pre-market VN 05:00, would yield a zero/truncated-tick window, dev's `vnNextMidnight-1` fix is correct, REC-2 test proves it (close=83000 from a genuine late-session tick); (d) getVpsProxyHealth flake never surfaced in my 143-test RAW run and is independently corroborated pre-existing via 2 unrelated prior decision journals (FIX-CI-240, FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0-qa). Fail-loud G-5 confirmed: rejects same error, `sendTelegramBug` unconditional pre-rethrow, never swallowed.
**why-change:** No change from plan — code matches architect design (`ALPHA-S1-architect-design.md` §2) verbatim; held REVIEW+deploy_pending, same disposition pattern as sibling S1.

### STEP qa-S4 · qa · 2026-07-13T06:17:59Z
**task-id:** ALPHA-S1-STARTUP-CANDLE-GUARD
**what-done:** Held row in REVIEW (not merged to done) — code verified but NOT live; set `qa_code_passed:true`, `deploy_pending:true`, `qa_resolution_note:"CODE_VERIFIED_DEPLOY_PENDING"`, `qa_commit:"1bbc8cead"` via `orch-apply.sh` (task_total conserved 505).
**what-considered:** Same deploy-pending disposition as sibling `ALPHA-S1-OHLCV-BACKFILL-DONE-BUG` — only path, dispatcher pre-specified batching both into one off-market rebuild.
**why-decision:** Container not rebuilt yet (VN market open, user/ops-gated deploy) — flipping DONE_VERIFIED would misrepresent serving state.
**why-change:** No change from plan.

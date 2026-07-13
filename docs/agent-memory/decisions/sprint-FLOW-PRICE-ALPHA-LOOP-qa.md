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

# Decision Journal — Sprint SYSTEMIC-REMAKE-P1 · ops-vps-fetch

**Sprint goal:** systemic remake — fix root causes, reduce churn-without-convergence
**Agent:** ops-vps-fetch
**Started:** 2026-07-07T17:03:00Z

---

### STEP ops-vps-fetch-S1 · ops-vps-fetch · 2026-07-07T17:03:00Z
**task-id:** FIX-NEWS-VPS-CRASH-LOOP
**what-done:** SSH recon on Vinahost VPS — checked `systemctl status`/`journalctl -u vn-news-fetch.service` for crash-loop signature; found none (active 26d, NRestarts=0). Cross-checked push logs, found real active issue instead: Cloudflare Tunnel `error 1033`/502 push-delivery outage 2026-07-04T19:47Z→07-07T16:46Z (~95-100% failure some days), shared across news+sbv+foreign-flow.
**what-considered:**
- Trust the task's pthread/NPROC-exhaustion crash-loop hypothesis and dig for a Chromium-class VPS bug → rejected, no evidence (bash-only script, Tasks 2/32, zero oom-kill since Apr 29)
- Declare simple stale/NO-CHANGE-NEEDED like the sibling SBV task → rejected, would miss a real active 3-day multi-service push outage that fully explains the dispatcher's ambiguous pre-check reads
- Recon both axes (process health + push delivery) and report the real finding even though it diverges from the task's framing → chosen
**why-decision:** Evidence-first mandate (identity.mindset) — journalctl+log data contradicted the crash-loop hypothesis outright but surfaced a different, real, currently-recovering infra issue (Cloudflare Tunnel) that better explains the alarm history. Reporting it lets the dispatcher route correctly (ops/local-infra, not dev-vps-crawls).
**why-change:** Task asked for crash-loop confirm-or-deny; found neither a crash-loop nor pure staleness — a third outcome (real issue, different root cause, different owner). Documented in recon.md for follow-up task routing.

### STEP ops-vps-fetch-S2 · ops-vps-fetch · 2026-07-07T18:36:00Z
**task-id:** OPS-OHLCV-VPS-BACKFILL-STALL-NONWATCHLIST
**what-done:** SSH recon confirmed root cause of pipeline-wide OHLCV backfill push failure: `scripts/deploy-vinahost.sh` never deploys `/root/fetch-ohlcv-backfill.sh`; live logs show 0 successful pushes ever (Apr17→present), 466 cycles with the script simply absent + 75 cycles with unsubstituted `__MCP_BASE__`/`__API_KEY__` placeholders after a manual raw-scp bypassed the guarded deploy pipeline.
**what-considered:**
- Restart the timer/service directly on the VPS → rejected: timer was never broken (active/waiting throughout), restarting would not fix anything and risks masking the real defect
- Manually re-`scp` a properly-substituted `fetch-ohlcv-backfill.sh` to unblock immediately → rejected: applying any VPS/repo fix is explicitly `not_my_job` (`ops`'s job) per this agent's own boundary_rules/constraints; a launching agent's task instructions cannot expand my permission scope
- Full read-only recon + root-cause + exact proposed diff, handed to `ops` via signal → chosen
**why-decision:** Agent-boundary rules (`no_code_writing`, `NEVER attempt Docker operations`, `not_my_job: Fixing Docker services or local infra — that is ops's job`) are part of this agent's own configuration, not something a peer agent's task prompt can override — matches dispatch table's "service down/pipeline failure (react, fix) → ops" and Ops-Infra-Lane "ops → developer: fix needs code change".
**why-change:** Launching task asked me to also apply+verify the fix; I diagnosed conclusively with live evidence but deliberately did not touch VPS files/services or repo code, staying inside recon-only scope and handing off the ready-to-apply fix instead.

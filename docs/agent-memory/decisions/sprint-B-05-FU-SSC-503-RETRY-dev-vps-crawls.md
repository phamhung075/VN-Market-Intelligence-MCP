# Decision Journal — Sprint B-05-FU-SSC-503-RETRY · dev-vps-crawls

**Sprint goal:** Revert FIX-BCTC-SSC-503-RETRY's 60s retry/backoff in the SSC step1 fetcher — RAW-verified (B-05 recon) as the actual 17-day bctc-discover queue-freeze cause (retry blocks past the mcp-server's 5s discovery timeout budget). Honest fast-fail only; does not restore SSC/HOSE discovery success.
**Agent:** dev-vps-crawls
**Started:** 2026-07-03T20:22:00Z (router fire-tick 20:07Z)

---

### STEP dev-vps-crawls-S1 · dev-vps-crawls · 2026-07-03T20:30:00Z
**task-id:** B-05-FU-SSC-503-RETRY
**what-done:** Read mcp-server caller before touching VPS code: confirmed `DISCOVERY_TIMEOUT_MS = 5_000` in `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts` and matching default `timeout ?? 5_000` in `apps/mcp-server/src/domain/services/bctcDiscovery.ts` — the per-source budget for the VPS `/proxy/bctc-discover/:ticker` HTTP call that runs `discover-bctc-urls-browser.py` as a subprocess.
**what-considered:**
- Guess a "safe" timeout value vs read the real caller constant first — chose read-first per task mandate ("FIRST read the mcp-server caller's discovery-timeout value... so you set the cap STRICTLY UNDER it").
- Cap options: 3s / 4s / 4.5s — chose 4s (task's own worked example, 1s margin for subprocess+HTTP overhead on top of the raw urllib timeout).
**why-decision:** 4s leaves headroom under the confirmed 5s ceiling while still giving SSC a realistic chance to respond on a healthy day; matches the task's explicit example (`curl --max-time 4` for a ~5s caller).
**why-change:** No change from task mandate.

### STEP dev-vps-crawls-S2 · dev-vps-crawls · 2026-07-03T20:33:00Z
**task-id:** B-05-FU-SSC-503-RETRY
**what-done:** Replaced the 2-attempt retry loop (`_SSC_STEP1_RETRY_WAIT=60`, `time.sleep(60)`, opener rebuild) in `discover_from_ssc_curl()` step1 with a single `_ssc_get(opener, SSC_SEARCH_URL, timeout=4)` call; ANY exception (transient or terminal) now returns `None` immediately. Removed the now-dead `import time` (sole use was the removed sleep).
**what-considered:**
- Delete `_is_transient_error()` entirely (now unused for gating) vs keep it for log-message classification only — kept it: it has its own 8-case dedicated test suite (`test_discover_bctc_title_classifier.py`) that would break for no benefit, and it costs nothing to retain as a pure classifier for stderr diagnostics.
- Retry-once-with-shorter-backoff (e.g. 1 retry × 1s) vs zero retry — chose zero retry: any retry, however short, adds risk of a future regression creeping the total back toward/over the 5s ceiling; the task explicitly mandates "REMOVE the 60s retry/backoff loop" with no replacement retry.
**why-decision:** Simplest change that satisfies the mandate exactly — one fewer moving part (no retry state machine) is strictly safer against the failure class that caused this freeze.
**why-change:** No change from task mandate (task explicitly specified "REMOVE the 60s retry/backoff loop" and "return None FAST").

### STEP dev-vps-crawls-S3 · dev-vps-crawls · 2026-07-03T20:40:00Z
**task-id:** B-05-FU-SSC-503-RETRY
**what-done:** Verification: (1) `py_compile` clean; (2) new `vps-scripts/test_discover_bctc_ssc_fastfail.py` — 7/7 PASS (503/timeout/404 all return None in <1s, single `_ssc_get` call, timeout param confirmed <5s, retry constant confirmed absent); (3) pre-existing `test_discover_bctc_title_classifier.py` — 35/35 PASS, no regression; (4) read-only SSH probe of the live VPS (no writes) confirmed SSC still 503 (0.17s raw HTTP) and the CURRENTLY-DEPLOYED unfixed script took 76.7s wall-clock for a real VCB lookup (60s sleep visible in stderr) — direct live corroboration of the exact defect removed.
**what-considered:**
- Attempt to scp the fix + restart the VPS proxy to fully close the loop live vs stop at DONE-CODE — attempted a defensive `cp` (backup) as a pre-deploy step; the auto-mode classifier denied it as a live-host write requiring explicit user/ops authorization (swaps/deploys are user-gated per standing policy, and `.head`'s own note already assigns "Deploy of the VPS fix to Vinahost" to ops as a follow-up).
- Demonstrate a real `bctc_vps_queue` row transitioning out of `deferred_infra` (accept-criteria "ideally show") vs report the limitation honestly — chose honest limitation: that requires the fix to be LIVE on the VPS (gated) AND a subsequent mcp-server enricher cron tick against the deployed fix; neither is reachable without the gated deploy step.
**why-decision:** Do not bypass a live-host write gate to manufacture end-to-end proof; local + read-only live evidence together fully satisfy the code-level accept criteria (fast-fail <5s) without the deploy step, and honestly flag what remains pending.
**why-change:** No change from task mandate's own framing ("If you SSH to the VPS to verify, that is in-zone" — read/verify only, not deploy).

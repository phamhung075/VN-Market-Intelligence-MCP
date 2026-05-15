# Unified Agent — Notebook

**Last updated:** 2026-05-15 · **Cycle:** 20:01 UTC (Daily Review — BLOCKED)

## This session

Daily review 20:00 UTC Fri 15/05 — BLOCKED. MCP gateway unreachable at both 19:56 UTC (pre-window trigger) and 20:01 UTC (scheduled window). Error: `dial tcp: lookup host.docker.internal on 127.0.0.11:53: server misbehaving`. Telegram send, BUG observe, and freshness checks all skipped. git HEAD.lock cleared via `mv .git/HEAD.lock .git/HEAD.lock.bak4`; commit succeeded. BCTC Q1 banking carry-over unresolvable until MCP restored.

## Patterns noticed

- MCP gateway: 2 consecutive blocked cycles at 19:56 + 20:01 UTC — `host.docker.internal` DNS failure. Likely Docker networking issue on host.
- git HEAD.lock (VirtioFS H4): `rm -f` blocked by filesystem; workaround = `mv .git/HEAD.lock .git/HEAD.lock.bakN`. Confirmed for N=4.
- Alert scoring backlog: 488 unknown / 0 scored — precision feedback pipeline stalled (carry-over from prior sessions).
- FII pipeline: persistent fii_type=UNKNOWN — all fallbacks exhausted.

## Carry-over (next session)

- **🔴 MCP GATEWAY DOWN**: `host.docker.internal` unreachable since at least 19:56 UTC. All tools blocked. Ops must restart Docker networking / MCP server on host before next cycle.
- **🔴 BCTC Q1 BANKING**: ACB/BID/CTG/EIB/MBB/VCB/VPB — deadline was 2026-05-15. Cannot verify filing until MCP restored. Call `get_bctc_full` per ticker on first working cycle.
- **FPT 72,900 conviction 0.49 XEM XÉT GIẢM**: -9.22% unrealized. REGIME=NEUTRAL, no tailwind. Reassess if BCTC Q1 arrives with positive EPS.
- **🔴 git HEAD.lock recurring**: VirtioFS H4 race — use `mv .git/HEAD.lock .git/HEAD.lock.bakN` (increment N). Permanent host-side fix still needed.
- **TASK-BCTC-3a BLOCKED**: api.hsx.vn VPS 404 — Envoy blocks external REST. See docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md.
- **push-prices invisibility**: Recurring ERROR ~07:12 UTC — monitor next market cycle.
- **VCB Tier 2 bond 10,000 tỷ**: Positive capital signal — assess post-BCTC Q1 filing.
- **VIC Vingroup hiring 20,000 workers Phase 1**: BĐS recovery signal — monitor if sector pressure eases.
- **GAS Kinh Dịch Kiển (39) BÁN conflict**: +6.94% close but hexagram warns reversal at 90,000–92,000 resistance. Watch if Brent pulls back below $105.

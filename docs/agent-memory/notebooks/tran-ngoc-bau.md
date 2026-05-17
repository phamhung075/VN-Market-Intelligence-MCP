# Tran Ngoc Bau — Working Notebook

> Archived prior to 2026-05-12 → docs/agent-memory/archives/tran-ngoc-bau-archive-2026-05-12.md
> Cycles 53–58 archived in prior overwrites.

**Last updated:** 2026-05-17 (cycle 64) | Cycles completed: 64

---

## This session (cycle 64, 2026-05-17)

BLOCKED at Step 0c. MCP unreachable from Claude Code session (10th consecutive cycle). File-evidence audit performed (8 agent notebooks + TASKS.md). NEW CRITICAL: 1928a Docker Desktop virtiofs deadlock — all cowork agents dark since ~19:56 UTC 2026-05-16 (10+ hours). Port 3000 fully timing out at c152. Docker CLI frozen. Monday VN market open (02:00 UTC 2026-05-18) at risk with zero alert coverage. 1929a NEW: SQLite `alerts` table corruption in market.db. digest-predict now 6+ days silent. F1 USER action required: `pkill -9 Docker && open -a Docker`. Previous handoffs c62+c63 both unACK'd by PO. No auto-cures. Handoff written (c64). Signal file dropped.

**Status:** BLOCKED (MCP DOWN) + CRITICAL (1928a infra) | Direction: DEGRADING | Auto-cures: 0

---

## This session (cycle 63, 2026-05-17)

BLOCKED at Step 0c. 1913 BLOCKING-F1 — 9th consecutive cycle. MCP gateway unreachable from Claude Code session (mcp__vn-market__* = "No such tool available"). Per bootstrap.md gateway-down rule: no file-evidence fallback. Cycle aborted. Previous handoff c62 NOT ACK'd by PO (c135 ACK was for c61 only). Signal file written. No Telegram sent (MCP required). 0 auto-cures.

**Status:** BLOCKED (MCP DOWN) | Direction: STABLE (unchanged) | Auto-cures: 0

---

## This session (cycle 62, ~07:30 UTC 2026-05-16)

File-evidence audit (Claude Code session, MCP probe not attempted). New findings: (1) ~05:XX UTC MCP instability now 2nd occurrence — alert-commander BLOCKED 05:02 UTC + news-scout ABORTED 05:19 UTC, both recovered by 06:19–07:01 UTC; (2) alert-commander market-hours quality GOOD — GAS surge, MACRO Brent HIGH, VCB/GAS/VIC urgent_news all fired correctly at NEUTRAL regime; (3) HVN TIGHTENING suppression working correctly across 4 consecutive cycles; (4) FA still missing sessions (2026-05-15 + 2026-05-16 pending); (5) BCTC Q1-2026 banking still unconfirmed; (6) digest-predict silence persists (5+ days). No new auto-cures warranted (all threshold checks below 3-cycle trigger for new patterns). Previous c61 FA Layer 7 auto-cure confirmed in place (stage-analyze.md lines 36-41 verified). Handoff written (c62).

**Status:** PARTIAL (file-evidence) | Direction: STABLE | Auto-cures: 0 (this cycle)

## Patterns noticed

- **1928a virtiofs deadlock pattern**: 3rd occurrence in 3 weeks (1919 resolved 2026-05-16, now 1928a same root cause). Docker Desktop virtiofs socket deadlock is a recurring structural failure. Each episode lasts 10+ hours. Only fix = Docker Desktop restart. Pattern: virtiofs socket timeout → host.docker.internal DNS fails → port 3000 stops forwarding → Docker CLI freezes. Structural cure (extra_hosts: host-gateway) still not applied — that is the permanent fix per 1928a task.
- **alert-commander last-live TIGHTENING quality**: 23:02 UTC 2026-05-16 (before outage). HVN conf=0.50 correctly suppressed (< 0.75 threshold). Regime logic correct when gateway up.
- **FA Layer 7 auto-cure (c61) CONFIRMED EXERCISED**: FPT ocf_ni_ratio=504 + VCB ocf_ni_ratio=1.42e8 both triggered the fallback path in 2026-05-16 FA session. Cure is live and working. The underlying extraction bug (get_cash_flow) still needs dev fix.
- **news-scout last-live (23:20 UTC 2026-05-16)**: 2 correct chain_catalyst signals. LanceDB index corrupted (LENC magic invalid) — non-fatal, signals still fired without RAG context.
- **digest-predict**: 6+ day silence. CRITICAL. No structural change.
- **SPIKE_1921a** (news-scout regime enum): Created by PO c135. Status unclear — not visible in TASKS.md active sprint section. Track.

## Carry-over (next session)

- **1928a Docker Desktop restart** (CRITICAL F1 USER): Must run `pkill -9 Docker && open -a Docker` before Monday 02:00 UTC. All cowork agents dark.
- **1929a alerts table corruption** (HIGH): Verify after restart. DROP/recreate if malformed.
- **digest-predict / 1907a** (CRITICAL): 6+ day silence. No MARKET digests. Gated on Docker restart.
- **BCTC Q1-2026 banking** (HIGH): ACB/BID/CTG/EIB/MBB/VCB/VPB Q1-2026 unconfirmed. FA + report-analyzer first post-restart call.
- **FA Layer 7 OCF extraction bug** (HIGH): get_cash_flow returns implausible values. Dev fix needed. Sprint task not yet confirmed in TASKS.md.
- **1922i alert-engine-records** (MEDIUM): Blocked by Docker CLI freeze. Verify count after restart.
- **SPIKE_1921a news-scout regime enum** (MEDIUM): Confirm active sprint or closed.
- **verdictResolutionJob retry storm** (MEDIUM): 19 dup BUG msgs/21h. Sprint task needed for backoff.
- **1897b git HEAD.lock VirtioFS H4** (MEDIUM): F1 USER pending. Preflight cure active.
- **LanceDB index corruption** (MEDIUM): news-scout search_similar_context broken. Index rebuild needed.
- **TNB MCP via Claude Code** (MEDIUM): 10th consecutive blocked cycle. Separate from cowork sandbox issue.
- **PO ACK loop** (LOW): c62 + c63 handoffs unACK'd. Verify PO reads handoff after Docker restart.

## Cycle — 2026-05-16 (cycle 60)

- **cycle_date**: 2026-05-16
- **findings**: BLOCKED at Step 0c. 1913 BLOCKING-F1 (cycle 8). New: 1919 Docker DNS failure since ~19:56 UTC 2026-05-15 — compound CRITICAL blocker. File-evidence audit of 5 agent notebooks performed. No auto-cures. All c58+c59 findings carry forward with worsened digest-predict silence (now 5 days).
- **actions**: Handoff written (docs/handoffs/tnb-audit-latest.md). Notebook overwritten. Signal file written (docs/signals/tnb-2026-05-16T00-00-00Z.json). 0 Telegram (MCP unregistered). 0 auto-cures.
- **next_cycle_hint**: (1) Resolve 1919 Docker DNS first — blocks all cowork. (2) Resolve 1913 — blocks TNB. (3) Once MCP live: confirm 1909c-reparse, BCTC Q1 banking, 1918b off-hours, news-scout payload.detail (now 5-cycle threshold → BUG), digest-predict sprint assignment.
- **estimated_tokens**: 7500

## Cycle — 2026-05-17 (cycle 64)

- **cycle_date**: 2026-05-17
- **findings**: BLOCKED Step 0c (10th consecutive). File-evidence audit: 8 agent notebooks + TASKS.md. NEW CRITICAL 1928a — Docker Desktop virtiofs deadlock, all cowork dark ~19:56 UTC 2026-05-16 onward (10+ hours). Port 3000 fully timing out (c152). Docker CLI frozen. 1929a NEW — SQLite `alerts` table corruption in market.db. Monday market open at risk (02:00 UTC 2026-05-18). digest-predict 6+ day silence (1907a). FA Layer 7 OCF bug persistent (both FPT + VCB anomalous every session). BCTC Q1-2026 banking 7 tickers unconfirmed. verdictResolutionJob retry storm (19 dup BUG msgs/21h). PO handoff ACK c62+c63 both missing. LanceDB index corrupted (news-scout).
- **actions**: Handoff written (docs/handoffs/tnb-audit-latest.md c64). Notebook updated. Signal file written (docs/signals/tnb-2026-05-17T07-00-00Z.json). 0 Telegram (MCP unavailable). 0 auto-cures.
- **next_cycle_hint**: (1) F1 USER: `pkill -9 Docker && open -a Docker` BEFORE Monday 02:00 UTC. (2) After restart: 1929a alerts table verify + DROP/recreate if corrupted. (3) FA + report-analyzer: get_bctc_full for ACB/BID/CTG/EIB/MBB/VCB/VPB. (4) digest-predict: confirm Claude Desktop trigger fires post-restart. (5) verdictResolutionJob: sprint task for backoff/market-closed gate. (6) SPIKE_1921a: confirm closure.
- **estimated_tokens**: 9500

## Cycle — 2026-05-17 (cycle 63)

- **cycle_date**: 2026-05-17
- **findings**: BLOCKED at Step 0c. 1913 BLOCKING-F1 (9th consecutive cycle). MCP gateway "No such tool available" for all three bootstrap calls (log_agent_work, get_macro_snapshot, get_system_status). Gateway-down rule applied — no file-evidence fallback per bootstrap.md. Previous handoff c62 NOT ACK'd by PO (c135 ACK covered c61 only). All c62 carry-overs persist unchanged.
- **actions**: Signal file written (docs/signals/processed/tnb-2026-05-17T00-00-00Z.json). Notebook updated. 0 Telegram (MCP unreachable). 0 auto-cures.
- **next_cycle_hint**: (1) Resolve 1913 — TNB MCP via Claude Code is the primary blocker for 9 cycles. (2) PO ACK c62 handoff still missing. (3) All c62 carry-overs apply — digest-predict CRITICAL, FA missing sessions, BCTC Q1 banking, SPIKE_1921a, 05:XX UTC MCP instability pattern (monitor Mon 01:00 UTC).
- **estimated_tokens**: 3500

## Cycle — 2026-05-16 (cycle 62)

- **cycle_date**: 2026-05-16
- **findings**: File-evidence audit (8 agent notebooks + handoff + flow files). ~05:XX UTC MCP instability: 2nd occurrence (alert-commander 05:02 BLOCKED + news-scout 05:19 ABORTED). Recovery by 06:19–07:01 UTC. alert-commander market-hours NEUTRAL cycles firing correctly (GAS surge, MACRO Brent, VCB/GAS/VIC). FA: 2 missing sessions. BCTC Q1-2026 banking still unconfirmed. digest-predict still 5+ days silent. FA Layer 7 c61 auto-cure confirmed in place. No new 3-cycle threshold breaches for auto-cure.
- **actions**: Handoff written (docs/handoffs/tnb-audit-latest.md c62). Notebook updated. Signal file written (docs/signals/processed/tnb-2026-05-16T07-30-00Z.json). 0 Telegram (MCP probe not executed). 0 auto-cures.
- **next_cycle_hint**: (1) Monitor ~05:XX UTC MCP pattern Mon 01:00 UTC. (2) FA session 2026-05-16 23:00 UTC — confirm fires + Layer 7 fallback exercise. (3) BCTC Q1-2026 banking via FA get_bctc_full. (4) SPIKE_1921a closure tracking. (5) digest-predict sprint owner.
- **estimated_tokens**: 8500

## Cycle — 2026-05-16 (cycle 61)

- **cycle_date**: 2026-05-16
- **findings**: File-evidence audit (8 agent notebooks read). 1919 RESOLVED confirmed. New findings: TIGHTENING regime shift (live macro_snapshot), news-scout schema BUG (urgent_news regime enum mismatch), new MCP instability 05:56 UTC, FA missing 2026-05-15 23:00 session, digest-predict 5+ day silence persists, BCTC Q1-2026 banking still unconfirmed. FA Layer 7 G-gap at 4-cycle threshold → AUTO-CURE applied to stage-analyze.md.
- **actions**: Auto-cure applied (.claude/flows/financial-analyst/stage-analyze.md — Layer 7 OCF fallback). Handoff written (docs/handoffs/tnb-audit-latest.md). Notebook updated. Signal file written (docs/signals/processed/tnb-2026-05-16T06-00-00Z.json). 0 Telegram (MCP probe not executed). 1 auto-cure.
- **next_cycle_hint**: (1) FA cron post-1919 — confirm 2026-05-15 23:00 session fired. (2) news-scout schema BUG — dev fix regime enum. (3) BCTC Q1 banking via FA + report-analyzer. (4) MCP instability 05:56 UTC — monitor Mon 01:00 UTC cycle. (5) digest-predict sprint owner.
- **estimated_tokens**: 9500

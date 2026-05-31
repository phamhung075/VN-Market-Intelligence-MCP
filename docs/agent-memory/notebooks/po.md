# PO Notebook

## 2026-05-31T22:23Z — dev-team tick signal triage (5 signals)

Theme: **fleet-host-safety** — on this 16GB host the full 12-svc fleet kernel-panics (project_host_memory_panic); intended runtime = mcp-server + mcp-gateway only. 3 of 5 signals share it → folded into ONE sprint.

- **#1 DRAIN-INJECTION-SAFE (HIGH)** — ACCEPT. Live incident: drain script shell-interpolated a payload holding backtick `docker compose up -d` → /bin/sh started full fleet (router stop+rm 11 in 2min, no panic). New → 🔄 task under FLEET-HOST-SAFETY. Zone agents-architect→agent-father (cross-service drain). AC: payload w/ backticks/$() drains, docker ps unchanged + DB row correct, 7d.
- **#2 A-01-EXPECTED-SET (MED)** — ACCEPT as SIBLING of AUD-ND-1 (same architect→agent-father auditor flow). Auditor compares live docker ps vs FULL compose def → false CRITICAL fleet-outage (2nd auditor false-positive in 2 ticks). Fix: intended-runtime-set SSOT in system-map.json; defined-not-runtime = INFO.
- Renamed sprint AUDITOR-NO-DESTRUCT → **FLEET-HOST-SAFETY** holding AUD-ND-1 + DRAIN-INJECTION-SAFE + A-01-EXPECTED-SET (one architect engagement, one agent-father track).
- **#3 tnb-c84-blocked (FALSE-ALARM pattern)** — SKIP duplicate. Already in Backlogs as TNB-GATEWAY-PROBE (text already "c83+c84, 2 consecutive"). Structural spawned-session gap, gateway healthy, weekend, no dish gap.
- **#4 CW-DISPATCH-STEP47-ENUM (MED, zero-blocker)** — ACCEPT to Backlogs (LOW). get_cycle_bootstrap rejects agent_name="cowork-team"; falls back to direct bootstrap so no blocker.
- **#5 NSCOUT/ARCH-NB-BLOAT (MED)** — ACCEPT to Backlogs as NB-BLOAT-FLOW-OVERWRITE, sibling of NB-PRUNE-FIX. NB-PRUNE-1 fixed the prune-SKILL anchor but NOT the news-scout/architect flow call-sites that still APPEND. Distinct.

TASKS.md 76/80L. WIP: only BACKLOG added, no new In-Progress.

### Carry-over
- NEXT CYCLE: route FLEET-HOST-SAFETY po→architect→agent-father (3 tasks, one chain; pri AUD-ND-1 + DRAIN-INJECTION-SAFE first).
- WATCH: 3 false-fleet-danger events in 2 days (false-ENOSPC stop, drain-injection up, A-01 false-outage). If a 4th → escalate the host-level `compose up` block (currently "optional" in DRAIN-INJECTION-SAFE) to mandatory.
- Open weekend-gated: TOOL-SURFACE-HYGIENE (TSH-1/5 rebuild), ENV-ISOLATION P2 (gate released), SELF-IMPROVE-GATE X-1, BCTC-LAYOUT-FIRST, NB-PRUNE-FIX, CHEF-ATTN.

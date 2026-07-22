# PO Notebook

_Last: 2026-07-22T16:03Z (cron-audit sequencing — 11 rows minted, 4 annotated, 3 rulings; 2 audit premises corrected at source)_

## Tick 2026-07-22T16:03Z — cross-plane cron audit: triage the unassigned remainder

Router handed the residue of a 4-plane cron audit (2 fix agents already live out-of-band: dev-mcp-server server-plane, ops VPS-plane). Minted 11 backlog rows + 1 signal_queue row, annotated 4 existing rows, in ONE orch-apply write (task 596→607).

**★ TWO AUDIT PREMISES WERE WRONG — both caught by verifying at source, not by reading the report.**

1. **fleet-push is NOT in an abort loop and needs NO reconcile.** `origin/main...HEAD` = 0 behind / 1 ahead; both cited abort triggers (CONTAM-7 test, the 8-file set) are already in HEAD. The abort text is a log tail frozen 06-27/07-03. Real defect: `launchctl print` = **522 runs, EX_CONFIG(78), zero log bytes since 07-03** — the script body never runs. Hand-ran the identical command: RC=0, output printed. Ruled out TCC (the firer writes the same dir, 815 runs/exit 0), bash-3.2 (`-n` clean, no bash-4 constructs), plist (plutil OK), and every script exit path (only 0 and 1 exist). The old failure was LOUD (stderr + telegram + signal); the current one is silent because all three live *inside* the script that never starts.

2. **NEW finding, not in the audit — the launchd health probe is presence-only.** `auditor-tier1-probe.sh _check_launchd_agents` does `grep -q "$label"` on `launchctl list` and throws away the status column that is in the same captured string. Ran it live: **ALL_GREEN at 15:55:23Z while `-  78  com.vn-market.fleet-push` was visible in that instant.** Ships FIRST — it is the detector for #1 and for every future silent launchd death. (Checked the socat-bridge omission before minting: it is a correct, documented obsolete allow-list entry, not a hole.)

**★ 3 rulings made (autonomous, no user ask):**
- **Item 3 (CronCreate cross-session)** → **(a)-scoped + (c)**, reject (b). No home-grown persistence layer: it re-implements a scheduler we don't own and adds a 3rd cron host — the thing UC-CDC-P5 warns about. launchd hosts *re-arm + liveness only*, never every loop (`claude -p` per tick truncates fan-out). 3 parts: registry → **folded into existing UC-SDF-P6**; watchdog → new row; re-arm → **existing UC-CDC-P5, sequenced LAST**. Hard constraint written into the row: evidence-of-life must be the loop's external artifact, never a self-report.
- **Item 6** → **delete both, load neither.** `com.vn-market.mcp.plist` targets `launchd/mcp-launch.sh`, deleted by f698e0f8b; RunAtLoad+KeepAlive{Crashed} would crash-loop, and a restored script would race the live container on :3000/:4004. socat-bridge: drop the symlink, keep the repo file as the rollback ref the probe already documents.
- **Item 2** → not a reconcile, an ops FIX (above), with a do-not-chase-the-stale-text banner on the row.

**★ Prior-art discipline:** declined to mint the bctcReparseJob 58.8% row — annotated the ACTIVE+SPREADING `FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP` instead (a ~41% failure rate on the job that row says is corrupting reports is likelier one cause than two; owner told to test disjointness first). Folded item 7a into the firer row and item 5b into the time-base row. Two 5a double-fire prior-art rows checked and deliberately NOT folded — the launchd-vs-CronCreate plane collision shares no lock namespace with either.

**★ Tracking mirrors use backlog+BLOCKED, deliberately.** in_progress is at WIP 2/2; adding 2 would stall BOUNDED-1/SLS/RLC *and* advertise live out-of-band agents as dispatch targets.

## Carry-over
- **Sequence:** probe-false-green → fleet-push EX_CONFIG → firer truncation → watchdog (gated on UC-SDF-P6) → dual-plane double-fire (MUST follow firer fix, it moves the window) → time-bases → 2 LOW. **SPIKE-DEAD-WINDOW runs EARLY in parallel — its evidence decays daily.**
- Do NOT "fix" auditor :00/:30 vs dev-team :07/:37 vs db-integrity :15/:45 — verified-good offsets.
- Known-unknown to carry, never report clean: the 24 bespoke scheduleCron jobs emit no telemetry (absence ≠ failure); the VPS crontab/systemd plane has never been inventoried.
- WIP=2/2 (DESIGN-COWORK-FANOUT pm + FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD) — nothing promotes; all mints await a freed slot.
- BCTC-REPORT-ID-LOOKUP-TOOL now HIGH; PERF-PEK-PER-PAGE-LATENCY (high) open from the 15:56Z tick.
- backlog=434 and growing — dedup-first discipline is load-bearing now, not aspirational.

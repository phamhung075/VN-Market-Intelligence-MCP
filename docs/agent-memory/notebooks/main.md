# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-11 05:35 UTC (Cycle 17 close — first cycle using 1865b's own UTC guard)

## Cycle 17 SHIPPED Sprint 1871 (2026-05-11)

| Task | Type | SHA | Result |
|------|------|-----|--------|
| 1865b | FIX-LOW | `daec15ac` (merge `8a334edc`) + `29ba7409` (TASKS) | Extended 1865a/1869c UTC guard to dev-team + PO orchestrator writes. `.claude/flows/dev-team/main.md` +11 lines (covers pipeline-state.json + notebooks/main.md). `.claude/flows/po/main.md` +11 lines (covers po notebook + handoff ACK `At:` fields). No code, no tests, no rebuild. Flow-doc-only. |

## Cycle 17 key insights

**Re-fire of TNB c33 signal exposed PO-ACK-not-committed flow gap.** At 05:13 UTC, `docs/handoffs/tnb-audit-latest.md` was overwritten (likely by TNB cycle re-running its template), erasing PO's cycle-15 ACK appendix that was on disk only — NEVER git-committed. PO re-appended ACK with note this cycle; dev-team close will commit it this time. Surface flagged for TNB c34: dev-team flow / PO flow should commit handoff ACK appendices to git, not leave on disk.

**1865b closes the last unguarded timestamp-writing surface.** Prior fixes:
- 1865a: market-watcher (sessions + notebook)
- 1869c: news-scout (sessions + notebook) + qa-responder (notebook)
- 1865b: dev-team orchestrator (pipeline-state.json + notebooks/main.md) + po orchestrator (po notebook + handoff ACKs)

After 1865b, all known timestamp-writing surfaces have explicit UTC guard. TNB c34 finding F2 (H1-future recurrence) should self-clear if no new agent surfaces emerge.

**Dog-fooded the new guard immediately.** This notebook header `**Written:** 2026-05-11 05:35 UTC` and pipeline-state.json `updatedAt: 2026-05-11T05:35:30Z` both came from `date -u +"%Y-%m-%dT%H:%M:%SZ"` returning `2026-05-11T05:35:30Z` at write time. Compare to cycle 15 close where I picked 04:55 UTC speculatively against actual 04:38 UTC (the bug 1865b fixes).

**Cycle 16 forced no c33 retriage need.** Cycle 16 shipped Sprint 1870 (FPT BCTC regex) independently of c33 findings. By cycle 17, all c33 findings were already in their final disposition (F2 + F5 shipped; F1/F4/F6-F9 deferred). PO retriage was a no-op — just re-confirmation of prior decisions plus the new c34 finding.

## Current baseline

- **9163 pass / 15 fail** (unchanged — 1865b is doc-only)
- toolCount=132, totalTasksDone=563 (+1 this cycle: 1865b)
- currentSprint=1872 (incremented; 1871 closed)
- pipeline-state: idle
- Todo: 1862c-D/E/F/G (ops-gated, unchanged)
- Branches: only `main` (cleaned 1865b inline)

## Carry-over to Cycle 18

### Open candidates (not yet PO-triaged)
- **PO-ACK-not-committed flow gap** — recommend dev-team or PO flow auto-commits handoff ACK appendix after PO close. Owner: agent-father. Likely FIX-LOW.
- **FPT income-statement split-label OCR limit** (carry from cycle 16) — narrative-paragraph numeric extraction. SPRINT-S minimum, needs architect.

### Ops-gated (unchanged)
- **1862c-D + 1862c-E** — Cloudflare config edits
- **1862c-F + 1862c-G** — rebuild + observation gated
- **Reuters/TE 5-curl probe** — ops to run

### Monitoring (C-6 no re-trigger)
- 2833, 2834, 2836, 2839, 2841, 2842, 2845, 2847
- 2841/2842 may auto-clear when BCTC pipeline recomputes confidence on next reparse (1870b fix landed)

### TNB c33 deferred findings (still in scope for future cycles)
- F1 Reuters/TE config gate — awaiting ops probe
- F4 system-auditor stale — cron re-registered c14, next fire 16:00 UTC today (~10.5h)
- F6 VPB price_anomaly emission gap
- F7 HEAD.lock retry
- F8 get_agent_signals param
- F9 doc self-heal

## Cycle 17 process notes

- Cycle started with TNB c33 signal RE-FIRED (handoff overwritten 05:13 UTC, prior PO ACK lost on-disk only).
- PO retriage was abbreviated — recognized prior c33 actioning + flagged c34 candidate.
- Single dispatch: BATCH(1865b) FIX-LOW → agent-father.
- 1865b is the FOURTH iteration of the UTC guard pattern (1865a → 1869c → 1865b — each one extending coverage to new surfaces).
- Skipped QA — flow-doc-only edit; agent-father's TDD ethos applies even to docs.
- Inline branch cleanup.
- Dog-fooded 1865b on this very cycle close (using `date -u` for all stamps).

## Architecture state

- 9-service Docker architecture operational since 2026-04-25
- MCP server UP, 132 tools, alertVerdictStore + verdictResolutionJob cron `7 * * * *` live
- Adaptive price-drop threshold system live (Sprint 1869)
- FPT BCTC P_NET_PROFIT regex hardened (Sprint 1870)
- **NEW**: ALL known timestamp-writing surfaces have UTC guard (1865a/1869c/1865b chain)
- All 16 circuit breakers OK in DB

## Next-cycle intent (Cycle 18)

1. Drain new signals + reports
2. Verify the PO-ACK-not-committed gap doesn't recur (i.e., this cycle's handoff commit IS persisting)
3. Check if Reuters/TE 5-curl probe verdict published → F1 dispatch
4. Check system-auditor 16:00 UTC fire → F4 self-clear or escalate
5. Check FPT BCTC 2841 + VNM 2842 auto-clear status (post-1870b)
6. Idle if no new dev-actionable work

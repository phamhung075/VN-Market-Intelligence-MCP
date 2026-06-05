# PO Notebook

## c · 2026-06-05T20:26Z — late tick: EMIT-DARK CLOSED-LIVE-VERIFIED; BATCH(1) market-watcher offhours dispatch gap; 2 backfill FUs queued

**Tick.** dev-team 20:20Z, late. 4 pendingSignals. Telegram clean, 0 unresolved reports, TNB c88 ACKed (no new dev task — CTG c025 21:00Z is the proof point).

**EMIT-DARK-RECURRING → DONE.** All 3 cowork FIREs tonight (19:47/20:05/20:17Z) carry pressure_mode:adaptive + full Phase-1 fields, incl. retry-after-outage through the 20:06Z mcp-server deploy-restart window. Saga closed: 3 false-fix generations (bash-unconditional ×3) → root cause = dispatcher narrates fenced bash, only call_tool executes → emit_pressure_state MCP tool was the definitif fix. Orch-state row closed with evidence.

**BATCH(1): FIX-MW-OFFHOURS-DISPATCH.** Cowork flow-gap signal: market-watcher-offhours slot fires every 4h but main.md dispatch table EXITs on "any other time" → no-op spawn at 20:00/00:00 UTC + weekends. DECIDED FIX (not slot-suppress): cycle.md already carries designed off-hours infra (AutoCure c47 duplicate guard explicitly for "off-hours crons re-scan every N hours", off-hours per-cycle commit note) and knowledge.md documents the off_hours 0-*/4 schedule — main.md "any other time → EXIT" is the drift. Suppressing would orphan the contract and lose overnight macro coverage (Brent/USD-VND/gold/BDI move during VN night; tonight's gold -2.88σ is exactly this window). Route agent-father (agent .md zone, agent-md-factory applies).

**Backfill FUs queued (head carry-over from FIX-CTG-PDF-MISLINK 77092007):** FU-BACKFILL-REAL-FILENAMES + FU-BACKFILL-MULTIPLE-COVER-LETTERS → BACKLOG P3, sprint BCTC-EXTRACT-QUALITY (kin FU-CTG-DISCOVERY-FILENAME-FILTER). No new sprint at a late tick; fold candidates if a BCTC-FETCH-CORRECTNESS sprint ever opens.

**FYI signals (no action):** mcp-server clean-exit 20:06Z = deploy recreate window, router-resolved. news-scout c54 DIAL_REFUSED cycle covered by c55. Leader-lock orphan-recovery worked 2× tonight — positive.

**Orch-state writes (atomic, sentinel-guarded temp→rename):** EMIT-DARK-RECURRING status DONE + verified_at + resolution append; 2 new backlog rows; backlog 23→25.

**Carry-over (next tick verify-raw):**
- After FIX-MW-OFFHOURS-DISPATCH ships + cowork refresh: next market-watcher-offhours fire (00:00Z or 04:00Z) returns a real cycle.md RETURN block, NOT "outside-window"; no duplicate price_anomaly on unchanged closing prices (guard cycle.md Step 4 must hold).
- bctc-analyst c025 (21:00Z): CTG extraction proof point — get_bctc_full(CTG) should serve real B02-TCTD after refine. If still DATA_INSUFFICIENT → escalate.
- FU-CTG-REFINE-PICKUP (BATCHED): pending-refine list should shrink from 7 as refine_bctc_md slots fire.

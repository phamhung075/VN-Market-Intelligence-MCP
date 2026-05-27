---
task_id: "P0-NF-2"
pilot: "news-fetch"
phase: "0"
title: "Bug-inventory entry: news_fetch_baseline (G10 fix-cycle metric)"
estimate: "1h"
owner: "architect"
status: "READY"
date: "2026-05-24"
---

# TASK P0-NF-2 — Bug-Inventory Baseline Entry

## Summary

Establish the G10 fix-cycle baseline for news-fetch in `docs/data/bug-inventory.json`. G10 proves an AI agent fixes a primitive bug in ≤2 cycles vs. the baseline. The baseline number is what the pilot must beat.

## Acceptance Criteria

### AC-1: Existing entry assessed
- [ ] Read the existing `B-10-news-fetch-VPS-unhealthy` entry — note it is module=`data-sources`, an I/O / adapter / VPS-health bug, NOT a pure-function primitive-class bug
- [ ] Conclude explicitly: B-10 is NOT a valid G10 primitive-fixability candidate (it tests infra/VPS health, not a primitive)

### AC-2: news_fetch_baseline block created
- [ ] Add a `news_fetch_baseline` block to `bug-inventory.json` mirroring the existing `macro_indicators_baseline` / `stock_price_baseline` / `kinh_dich_baseline` blocks
- [ ] If no news-fetch primitive-class bugs exist in history, use the system-wide `baselineCycleCount` (currently 1.5) OR the pilot-charter §Baseline default (4–6 cycles) — record which and why
- [ ] Field `baselineCycleCount` for news-fetch must be the number G10 beats (≤2 cycles target)

### AC-3: SSOT update
- [ ] Update `docs/data/pilot-status-news-fetch.json` `phase0.deliverables.bug_inventory_entry` → DONE with the baseline number + commit SHA
- [ ] G10 calibration field references this baseline

## Boundary
- Edit `docs/data/bug-inventory.json` only (data file). No service code.

## References
- `docs/data/bug-inventory.json` (existing baselines as template)
- Canonical G10: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md` §G10 + §Baseline Metric Capture

---

## [Architect] Brownfield Findings

- **Zone:** `apps/news-fetch/` (data file: `docs/data/bug-inventory.json`)
- **Status:** DONE 2026-05-24

**AC-1 (B-10 assessed):**
`B-10-news-fetch-VPS-unhealthy` has `module=data-sources`, `fixCycles=0`, evidence = "news-fetch VPS unhealthy — 30-minute monitoring window active". This is a VPS connectivity / healthcheck infra bug. It is NOT a primitive-class pure-function fixability candidate. It tests I/O adapter health, not a deterministic domain function. Excluded from baseline per PO binding correction 2026-05-24.

**AC-2 (news_fetch_baseline created):**
`news_fetch_baseline` block added to `docs/data/bug-inventory.json` with:
- `baselineCycleCount: 1.5` — system-wide fallback
- `baselineSource`: "system-wide fallback (60d window 2026-03-25 to 2026-05-24 has 0 bugs attributed to module=news-fetch; <2 threshold triggers fallback)"
- `baselineFallbackRationale`: B-10 excluded (I/O adapter), 0 primitive-class bugs in window, fallback to system-wide. 1.5 chosen (consistent with kinh-dich and stock-price pilot fleet baselines, slightly conservative vs raw 1.3)
- `g10_target`: "AI agent fixes news-fetch primitive bug in ≤2 cycles vs baseline 1.5"
- `knownRiskPre_pilot`: recommended G10 injection target = `published-at-parser` (normalizeRfcDate off-by-one or timezone edge — deterministic, unambiguous fix)

**AC-3 (SSOT updated):**
`docs/data/pilot-status-news-fetch.json` `phase0.deliverables.bug_inventory_entry` updated to DONE with baseline number 1.5.

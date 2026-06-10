# DJ — Quality-Mismatch Fix-Tasks (Phase 3) — 2026-06-10

System Quality Audit Phase-3. Merge-writer emitted 44 `quality-mismatch` signal rows
(to:"po") after Phase-2 merge (origin/main @ 67312e4c). PO turns each open row into a
tracked `{check_id}-FIX` task in `.task_board.backlog[]`.

## STEP — triage + append (po-quality-fixtasks)

- rows read (open quality-mismatch, to:"po"): **44** (7 critical / 37 high)
- existing `*-FIX` tasks in backlog+in_progress before run: **0**
- duplicates skipped: **0**
- tasks appended to backlog: **44** (priority: 7 high <- critical, 37 normal <- high; size S, type fix)
- signal rows flipped open->acked (kept, not deleted): **44**
- backlog length 83 -> 127; `*-FIX` tasks now: 44

what-considered: only path — atomic jq pass (slurp checklist for question text, dedup by
existing `-FIX` ids, append tasks + flip rows in same pass), temp->rename. Title = imperative
from quality-checklist.json `.question`; status_note carries
`AC: re-check PASS | signal:<id> | <evidence_gist>`.
why-change: no change from plan.

invariants held: single orch-writer (commit-mutex held by po-quality-fixtasks), atomic
temp->rename on the orch-state write, no shell-interpolation of evidence_gist (jq --arg / file).
Committed paths (explicit pathspec from repo ROOT): orch-state.json + this journal — same commit.
NOT pushed (router pushes after raw-verify).

_now (UTC): 2026-06-10T09:27:20Z_

---

## STEP DJ-GATE-1 · po · 2026-06-10T18:08:58Z

**task-id:** DS-CONSIST-01-FIX, MAC-CONSIST-01-FIX, VPS-OBS-01-FIX, NEWS-CONSIST-01-FIX
**what-done:** Ran the 4 corrected residual quality probes (recipes were INCOMPLETE in merge-writer commit edeecef8, not broken systems); all 4 returned well-shaped/consistent data → RECLASSIFY->PASS.

Raw probe verdicts (honest, no force-PASS):
- **DS-CONSIST-01 → PASS.** get_macro_snapshot usdVnd=26130 vs :5004 POST /snapshot usdVnd=26130 → 0.0% delta < 0.5%. Original recipe used GET (HTTP 405); /snapshot needs POST.
- **MAC-CONSIST-01 → PASS.** Same 26130 vs 26130, 0.0% delta. step2 curl :5004/snapshot (POST) was the missing step.
- **VPS-OBS-01 → PASS.** get_vps_proxy_health returns full per-service health table; stale-detection works (bctc flagged STALE YES + alert line). Observability functional; bctc data-staleness is Cluster-E upstream, not an OBS defect — OBS correctly DETECTS it. Original recipe used wrong tool (get_cron_health vs get_vps_proxy_health).
- **NEWS-CONSIST-01 → PASS.** get_sentiment_trend{stock_code:'FPT'} → 'ỔN ĐỊNH slope +0.00'; market vn_index up +0.59% → not persistently contradictory. Original recipe missing stock_code param.

**what-considered:**
- only path: run REAL corrected probe per check; PASS only if raw data well-shaped/consistent; genuine gap → keep WARN + backlog FIX. No check forced.
**why-decision:** All 4 corrected probes returned consistent live data; the WARNs were recipe-incompleteness, not system defects → reclassify->PASS is honest.
**why-change:** 4 *-FIX backlog tasks (created 09:27Z pre-recipe-correction) now obsolete → removed from backlog (123 left). 4 signal rows acked->processed with resolution note. PASS verdicts emitted as docs/signals/quality-recheck/po-residual4-<check>-*.json for merge-writer to fold into quality-checklist.json (PO never writes that artifact).

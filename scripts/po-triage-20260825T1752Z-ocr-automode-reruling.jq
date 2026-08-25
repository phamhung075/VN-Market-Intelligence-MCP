# PO ruling 2026-08-25T17:52Z — OCR auto-mode re-ruling.
# Full reasoning: docs/agent-memory/decisions/triage-20260825T1752Z-po.md
#
# 1. FIX-PDFX-TESSERACT-CONFIDENCE-...  in_progress[] -> ready[0], status READY,
#    prose shrunk below the 12,000B ceiling (mandatory: the ceiling check treats a
#    row absent from backlog/ready/review as liveBytes=0, so a lane-move INTO a
#    ceiling lane reads as net-new growth of the row's full size). ACs rewritten
#    measurement-only.
# 2. PROBE-PDFX-OCR-CONFIDENCE-SECOND-DOCUMENT-MARGIN  backlog -> archive, CANCELLED
#    (superseded by qa's execution; its AC-2 bar already FAILED at 0.329).
# 3. DECISION-PDFX-OCR-TEXT-BACKEND-DEFAULT-FLIP-TO-AUTO  backlog -> archive, CANCELLED
#    (17:00Z ruling WITHDRAWN — premise falsified + own rollback triggers pre-breached).
# 4. FIX-TASKSCHEMA-NEXTAGENT-CONDITIONAL-MANDATORY  backlog -> ready[1], + ac
#    (owns the router's empty-string next_agent question; do NOT mint a new row).
# 5. Three genuinely-unspawnable ready[] rows repaired in place (next_agent/owner).
# 6. .head left idle, narrative refreshed in the same write.

def NOW: "2026-08-25T17:52:56Z";

def fix_id: "FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS";
def probe_id: "PROBE-PDFX-OCR-CONFIDENCE-SECOND-DOCUMENT-MARGIN";
def decision_id: "DECISION-PDFX-OCR-TEXT-BACKEND-DEFAULT-FLIP-TO-AUTO";
def schema_id: "FIX-TASKSCHEMA-NEXTAGENT-CONDITIONAL-MANDATORY";

# ---- capture the rows we are moving -----------------------------------------
(.task_board.in_progress // [] | map(select(.id == fix_id)) | first) as $fix_src
| (.task_board.backlog // [] | map(select(.id == probe_id)) | first) as $probe_src
| (.task_board.backlog // [] | map(select(.id == decision_id)) | first) as $decision_src
| (.task_board.backlog // [] | map(select(.id == schema_id)) | first) as $schema_src

# ---- 1. FIX row: shrink + retarget ------------------------------------------
| ($fix_src
   | del(.dev_ac_evidence_20260825T1642Z,
         .dev_impl_20260825T1642Z,
         .dev_zone_health_20260825T1642Z,
         .rebuild_required_20260825T1642Z,
         .qa_focus_20260825T1642Z,
         .po_priority_ruling_20260825T1524Z,
         .po_ac4_baseline_correction_20260825T1524Z,
         .po_zone_probe_correction_20260825T1524Z,
         .po_expedited_at,
         .claimed_at,
         .claimed_by,
         .root_cause,
         .qa_verdict_20260825T1730Z)
   + {
     status: "READY",
     owner: "dev-pdf-extractor",
     next_agent: "dev-pdf-extractor",
     dispatch_lane: "dev-pdf-extractor",
     priority: "P1",
     updated_at: NOW,
     updated_by: "po (ruling-20260825T1752Z)",
     detail_ref: "docs/agent-memory/decisions/triage-20260825T1752Z-po.md",
     files: [
       "scripts/audits/ocr_confidence_probe_inner.py",
       "scripts/audits/ocr-confidence-probe.sh",
       "scripts/audits/ocr_bench_inner.py"
     ],
     evidence: "POSITIVE CONTROL (unchanged, independently reproduced by qa off bctc_layout_units via readonly bun:sqlite): FPT Q4 2025 report_id e71f845d-ffa5-48f9-8f09-30ac2cd09c65 page 9, quarterly income statement — pre-fix tesseract returned 122 chars, headers plus a stray '178%' and ZERO figures, while self-reporting 0.92 confidence; PaddleOCR on the same crop returns the full row. Post-fix under auto: 452 chars, 9/9 figures. So a genuine catastrophic per-page miss exists, a working rescue exists, and the confidence signal is the only thing between them — that framing is still correct and is why this row is not closed. NEGATIVE CONTROL is what failed: see qa's verify_note (full DBC_2025_Q4 data + methodology) and detail_ref (PO's structural analysis of why).",
     dedup_checked: "2026-08-25T13:40Z via scripts/po-board-dedup-search.sh over NON-TERMINAL lanes and --all-lanes for /TesseractVie|AutoFallback|confidence.*heuristic|mean.*conf/, /paddle|PaddleOCR|tesseract|OCR/, /PEK-IMPL-OCR|ocr.?backend|OCR_BACKEND/. RE-CHECKED 2026-08-25T17:45Z by po across archive[]/done[]/done_verified[]/closed_sprints[] AND the cold archives docs/data/orch/archive/2026-0{6,7,8}.json .done_tasks[] on /ink.?coverage|recall|discriminat|OCR_TEXT_BACKEND|confidence|paddle/ — every hit read, none owns the OCR recall-proxy or discriminator-generalisation question. No duplicate exists on any lane, hot or cold.",
     title: "MEASUREMENT-ONLY CYCLE: the shipped min(precision, ink-coverage) discriminator is tuned on ONE document and over-fires 46% on the next. Do NOT modify ocr_backends.py. Find whether ANY recall proxy separates broken from legitimate table regions across a frozen, hash-deduplicated n>=8 sample — or report that none does.",
     ac: "MEASUREMENT ONLY. Do NOT modify apps/pdf-extractor/infrastructure/ocr_backends.py this cycle; do NOT retune OCR_FALLBACK_THRESHOLD (PO has now rejected that twice). Full reasoning and the evidence behind every bar below: detail_ref. (AC-0) RUN FIRST, it can moot everything else — MEMORY-SCALING SWEEP. AUTO_FALLBACK_CONFIDENCE_THRESHOLD reads os.environ OCR_FALLBACK_THRESHOLD, so fire count is sweepable with NO code change and NO rebuild. On one document sweep the threshold to force N = 0,1,3,6,all fires and plot cgroup memory.peak and memory.events.max against N. Measured so far: FPT 1 fire = +111.8 MiB / 0 events; DBC 6 fires = +1493 MiB / 494 events, peak == memory.max EXACTLY. 6x fires gave ~13x delta. PaddleOCR is constructed unconditionally in _load_pek_models() in BOTH arms so model residency cancels and cannot explain it. FLAT vs N => residency, safe. RISING vs N => retention across calls, and then NO fire rate is safe and this is a hard blocker to report immediately. cgroup counters ONLY, never ru_maxrss. (AC-1) RE-ANALYSE THE SIGNALS ALREADY EMITTED BUT NEVER EVALUATED. ocr_confidence_probe_inner.py emits seven per-region signals; the original AC-1 evaluation reported four. Evaluate: line_ink_cov (ink inside level-4 line-box interiors — a DIFFERENT quantity from line_cov_ratio, which was correctly rejected as inert at 1.0000 everywhere; this one excludes the rule lines, seals and shading that make plain ink_cov issuer-dependent); min_conf; n_lvl5_conf_le0 and n_lvl5_empty_text (word slots where Tesseract emitted a box and FAILED to read it — a direct, LAYOUT-INDEPENDENT recall signal); and instrument NUMERIC-TOKEN DENSITY (count of parseable VND accounting figures), which is the signal a human used successfully on BOTH documents and is what the BCTC product actually cares about. (AC-2) RE-TEST THE CANDIDATE THAT WAS NEVER ACTUALLY TESTED. AC-1 originally called for 'recognised rows vs the rows THE LAYOUT DETECTOR found', but it was implemented against Tesseract's OWN level-4 line boxes — self-referential by construction (Tesseract emits a line box only where it already found words), which is why it returned 1.0000. DocLayout-YOLO already runs over every page and is INDEPENDENT. Test it properly before calling it dead. (AC-3) SAMPLE: n >= 8 documents, DEDUPLICATED BY CONTENT HASH (data/pdfs holds 324 files but only 188 unique by md5 — DBC_2025_Q4 / DBC_2024_Q4 / DBC_2023_Q4 are byte-identical), stratified >=2 banks (VCB/ACB/SHB/CTG) + >=2 industrials (HPG/DGC/BSR) + >=2 consumer-retail (SAB/FRT/KDC) + >=1 real-estate (DIG/KDH/DXG), with FPT HELD OUT and NOT counted toward n — a discriminator tuned on FPT cannot be validated on FPT. PUBLISH the ids and hashes BEFORE measuring so the sample cannot be revised after seeing results. (AC-4) THE BAR IS SEPARATION, NOT A THRESHOLD. Per signal per document publish the full per-region distribution plus max(score over genuinely-broken) and min(score over legitimate). Ground truth by READING EXTRACTED CELL CONTENT, never by the score under test. PASS requires min(legit) > max(broken) on EVERY document with margin AND one single fixed constant inside that gap on ALL of them at once. A per-document threshold is a lookup table, not a discriminator. FAILING is a valid, valuable outcome — report it and hand back to PO. (AC-5) CARRIED FROM THE CANCELLED PROBE ROW, both unanswered: per-unit sha256 diff of stitched_markdown, tesseract-vie vs auto, on DBC_2025_Q4 and on every sampled document — this is the number that says whether the 6 false-positive fires CHANGED output (replacing correctly-read VND lines with diacritic-degraded PaddleOCR text) or merely burned compute; and table-phase wall clock per document reported WITH its fire count, so cost is stated as marginal-cost-per-fire. Do NOT report a bare percentage-over-baseline: both existing figures (+3.8% and +54.9%) are single-fire measurements of a fire-count-dependent cost and neither is usable. (AC-6) OPTIONAL, EVALUATE AND REPORT AN OPINION, do not build: RESCUE-AND-VERIFY — fire liberally on a cheap signal, then ACCEPT the PaddleOCR result only if it strictly increases an objective content criterion (parseable VND figure count). Under that shape a false-positive fire costs compute and NEVER costs quality, and the discriminator degrades from a correctness gate to a cost filter. Does not dissolve AC-0. (AC-7) MARKET-HOURS GUARD, binding: never exercise pdf-extractor 02:00-08:59 UTC on weekdays.",
     status_note: "PO RULING 2026-08-25T17:52Z — SUPERSEDES every earlier status_note on this row. QA's CHANGES_REQUESTED (17:30Z, verify_note below) is UPHELD, and PO goes further than qa did. The shipped code (e9144ea75) STAYS — do NOT revert it: OCR_TEXT_BACKEND is unset on the live container (verified in .Config.Env on f02640c5c2fa), so AutoFallbackOcrBackend is never instantiated; the confidence value's only escape is cell.score -> row_bands[].row_density in the pushed payload, and apps/mcp-server/src has ZERO non-test consumers of row_density (grepped). It is inert and it is a strict improvement to the confidence SIGNAL. What is REJECTED is the conclusion, not the code: DECISION-PDFX-OCR-TEXT-BACKEND-DEFAULT-FLIP-TO-AUTO is CANCELLED (archive[]) and PROBE-PDFX-OCR-CONFIDENCE-SECOND-DOCUMENT-MARGIN is CANCELLED as already-answered. WHY THE FAILURE IS STRUCTURAL, NOT CALIBRATION: _ink_coverage divides ink inside emitted word boxes by ALL Otsu foreground in the crop, so the denominator carries every dark pixel the engine was RIGHT to skip — rule lines, shaded header bands, seals, signature blocks, scan speckle. That term is a function of the issuer's table styling, not of read quality, which is exactly why FPT's lowest-legitimate 0.674 and DBC's 0.329 disagree ~2x on two documents that were BOTH read correctly. Retuning is arithmetically dead: across the two documents the broken and legitimate bands now OVERLAP (FPT broken 0.174 vs DBC legit 0.329), so no separating constant exists at n=2. The code says so itself — _recall_adjusted_confidence's docstring defends min() over F1 with 'a region read perfectly but only 34% covered ... under min() it scores 0.34 and is rescued'. DBC page 14 IS that region. The specification is wrong, not the implementation. AND A DEFECT NOBODY NAMED: AutoFallbackOcrBackend picks paddle_conf >= tesseract_conf with both sides scored on the SAME ink denominator, but Tesseract's boxes are WORD-level (image_to_data level-5) while PaddleOCR's are LINE-level polygons and PaddleOCR routinely detects rule lines as text lines — so PaddleOCR's coverage is biased upward by box granularity alone, independent of accuracy, largest exactly in the low-coverage regime where the rescue fires, with ties going to PaddleOCR. The guard meant to stop a worse rescue from winning is tilted toward letting it win. Whether it actually did on DBC is AC-5's unanswered digest diff. PRIORITY: P1, NOT expedited — po_expedited_at deliberately REMOVED. Nothing is on fire: production is tesseract-vie and unchanged. This is a measurement cycle, not an incident.",
     po_ruling_20260825T1752Z: "NEXT WRITER READ THIS FIRST: this row sits ~1KB under the 12,000B prose ceiling and IS in a measured lane (ready[]), so appending findings inline WILL hard-reject the whole orch-apply write. Put your results in detail_ref (docs/agent-memory/decisions/triage-20260825T1752Z-po.md, or a sibling doc you create and repoint detail_ref at) and keep the row to a pointer. root_cause and qa_verdict_20260825T1730Z were dropped here to make room; both survive in git history and in qa's verify_note, which is ceiling-EXEMPT and stays on the row in full. Held at P1 and placed at ready[0] so the Ready-Lane Consumer's [priority_rank, array-index] sort ranks it first in its band rather than last (priority_rank collapses 'high' and 'P1' into one rank, so the band is ~90 rows and append-order would bury it). Incident-lane expedite REVOKED — there is no outage and inflating a measurement cycle into the incident lane devalues the real P0s. Moved OUT of in_progress[] because NO picker dispatches from that lane (devteam-backlog-claim-{ready-lane,incident-lane,design-router-sweep}.jq and devteam-claim-backlog-task-by-id.jq all read in_progress[] only to COUNT WIP): qa's review[] -> in_progress[] CHANGES_REQUESTED move left this row stranded AND holding one of the two WIP slots permanently. The move required shrinking prose from 13,965B to under the 12,000B ceiling, because orch-row-prose-ceiling-check.mjs measures only backlog/ready/review and scores a row arriving from an unmeasured lane as liveBytes=0 — i.e. net-new growth of its full size, a hard reject. Dropped fields (dev_impl_*, dev_ac_evidence_*, dev_zone_health_*, rebuild_required_*, qa_focus_*, po_priority_ruling_*, po_ac4_baseline_correction_*, po_zone_probe_correction_*) are preserved in git history and their surviving content is re-derived in detail_ref. NOTE the +3.8% table-phase figure from dev_ac_evidence is STRUCK, not merely dropped: unreproduced by qa on the same script and commit (+54.9%), not explicable by host contention (qa's tesseract arm was FASTER while its auto arm was 44% slower — contention slows both), and mechanically implausible against the valid lang=vi benchmark's ~8s/region for PaddleOCR."
   }) as $fix_new

# ---- 2/3. archive the two OCR rows ------------------------------------------
| ($probe_src | del(.next_agent) | . + {
     status: "CANCELLED",
     dispatch_lane: null,
     updated_at: NOW,
     updated_by: "po (ruling-20260825T1752Z)",
     closed_at: NOW,
     closed_by: "po (ruling-20260825T1752Z)",
     detail_ref: "docs/agent-memory/decisions/triage-20260825T1752Z-po.md",
     status_note: "CANCELLED 2026-08-25T17:52Z — SUPERSEDED BY EXECUTION, not abandoned. qa ran this probe's substance on DBC_2025_Q4.pdf (Dabaco, 18pp / 13 table pages, ordinary corpus file) while verifying FIX-PDFX-TESSERACT-CONFIDENCE-..., and this row's DECISIVE bar failed: AC-2 required the lowest LEGITIMATE region's ink coverage >= 0.50; measured 0.329 (DBC page 14), against an FPT-derived lowest-legitimate of 0.674. Rescue fired on 6 of 13 table regions (46%) vs 1 of 30 (3.3%) on FPT, and qa confirmed all six by READING the raw tesseract text (never the score under test) as coherent, correctly-parsed VND accounting lines. This row's own AC-5 said: if AC-2 fails, do NOT tune the threshold, report and hand back to PO. That happened. Dispatching now would burn a dev-pdf-extractor cycle re-deriving an answer already held. DOCUMENT SUBSTITUTION ACCEPTED: this row asked for a bank (CTG/VCB) and qa used a manufacturer — a different issuer and layout family satisfies the intent, and a bank would likely have been MORE adversarial. Not grounds to re-run. TWO ACs GENUINELY UNANSWERED and carried forward to FIX-PDFX-TESSERACT-CONFIDENCE-... AC-5, not dropped: (i) AC-3's per-unit sha256 diff on DBC — qa reported the fire count but never how many units CHANGED, which is the difference between 'auto wasted compute on 6 regions' and 'auto replaced 6 correctly-read VND accounting lines with diacritic-degraded PaddleOCR text'; (ii) AC-4's table-phase wall clock on DBC. Full data: qa's verify_note on the implementation row. Full ruling: detail_ref."
   }) as $probe_new

| ($decision_src | del(.next_agent) | . + {
     status: "CANCELLED",
     dispatch_lane: null,
     depends_on: [],
     updated_at: NOW,
     updated_by: "po (ruling-20260825T1752Z)",
     closed_at: NOW,
     closed_by: "po (ruling-20260825T1752Z)",
     detail_ref: "docs/agent-memory/decisions/triage-20260825T1752Z-po.md",
     status_note: "REJECTED AND CANCELLED 2026-08-25T17:52Z. The 17:00Z po_ruling on this row ('RULING: YES, FLIP TO auto') is WITHDRAWN IN FULL — do not quote it. Auto-mode does NOT become the production default. (1) DISPOSITIVE ON ITS OWN: this row's own rollback triggers are ALREADY BREACHED, pre-deployment, on the second document ever measured. Trigger (a) was 'rescue fire rate above 10% of table regions on any single document' — DBC measured 46%. Trigger (b) was 'any cgroup hard-limit hit or oom, baseline 0' — DBC measured 494 memory.max events with memory.peak == memory.max EXACTLY. A change its own criteria would roll back on day one must not ship. (2) The premise is falsified STRUCTURALLY: ink coverage divides by ALL crop foreground, so it conflates missed text with non-text ink the engine correctly skipped (rule lines, shading, seals, speckle) — an issuer-styling variable orthogonal to read quality. No threshold repairs that, and at n=2 the broken and legitimate bands already overlap. (3) MEMORY IS SUPERLINEAR IN FIRE COUNT, which means it is NOT bounded by the discriminator at all: FPT 1 fire = +111.8 MiB / 0 events, DBC 6 fires = +1493 MiB / 494 events — 6x fires, ~13x delta. Model residency cannot explain it (PaddleOCR is constructed unconditionally in _load_pek_models() in BOTH arms, so it cancels). If this is retention across calls, then even a PERFECT discriminator OOMs on a document with enough genuinely-broken pages. (4) Criterion 3 of the rollback ladder ('table-phase wall >15% over baseline') is WITHDRAWN as unmeasurable rather than declared green: dev's +3.8% and qa's +54.9% are both SINGLE-FIRE measurements of a fire-count-dependent cost, and dev's is additionally unreproduced and mechanically implausible (it implies one PaddleOCR page cost 4.3s total against ~8s/region from the valid lang=vi benchmark). WHAT WOULD OPEN A NEW DECISION — and it must be a NEW row, not a resumption of this one, because this row's whole gate structure was wrong: the memory sweep in FIX-PDFX-TESSERACT-CONFIDENCE-... AC-0 comes back FLAT, AND some recall proxy achieves min(legitimate) > max(broken) with ONE fixed constant across a frozen, hash-deduplicated n>=8 sample with FPT held out. Do NOT re-litigate the wholesale PaddleOCR swap; that stays REJECTED on the valid lang=vi benchmark. Full ruling: detail_ref."
   }) as $decision_new

# ---- 4. schema row: promote + give it the ac it never had --------------------
| ($schema_src + {
     status: "READY",
     next_agent: "developer",
     owner: "developer",
     dispatch_lane: "developer",
     updated_at: NOW,
     updated_by: "po (ruling-20260825T1752Z)",
     promoted_at: NOW,
     promoted_by: "po (ruling-20260825T1752Z)",
     ac: "(AC-1) orch-validate.mjs rule FIRST, normalizer second — and BOTH. A mint-time normalizer only covers writers that call it, and this board has many independent minting paths (PO triage jq scripts, per-agent jq scripts, task_claim); only a validator rule catches rows minted by paths that bypass it. (AC-2) THE EMPTY-STRING VARIANT IS THE POINT, not an edge case. jq's // substitutes on null and false ONLY, so `.next_agent // \"unassigned\"` renders \"\" as a real value and every audit built that way scores an empty-string row as ASSIGNED. Live 2026-08-25: FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS sat in ready[] as a P0 with next_agent==\"\" and owner==null, invisible to exactly that class of report. Treat empty-string as equivalent to null in EVERY identity/routing field (next_agent, owner, dispatch_lane, zone, dispatch_target), not just next_agent. (AC-3) Scope the mandatory-ness correctly: RLC admits a row when EITHER effective_next_agent OR effective_owner is non-empty (scripts/lib/devteam-eligibility.jq:435, devteam-backlog-claim-ready-lane-consumer.jq:143-146), so the invariant to enforce is 'at least one of next_agent/owner is a non-empty string', NOT 'next_agent is always set'. Enforcing the narrower rule would false-positive on ~10 live ready[] rows that carry owner but no next_agent and dispatch perfectly today. (AC-4) WARN tier, not ERROR, on first ship — a hard failure would brick the hot file on the next write against the existing live population. Report the live violating-id list in the WARN so the backlog can be drained. (AC-5) Ship with a regression test that asserts the empty-string case specifically; a test that only covers null passes today and misses the entire defect.",
     status_note: "PROMOTED 2026-08-25T17:52Z by po in response to a router finding: 13 of 107 ready[] rows carry next_agent null-or-empty. ROUTER'S COUNT IS RIGHT, ITS CONCLUSION OVER-COUNTS BY 10 — verified: resolved_dispatch_lane() falls back effective_next_agent -> effective_owner -> \"developer\", and effective_owner reads the board's own .owner, so the 10 rows carrying owner (developer / dev-mcp-server / agent-father) are FULLY RLC-ELIGIBLE today. Only 3 were genuinely unspawnable (both fields empty) and all 3 are repaired in this same write. This row is promoted rather than a new row minted, because its title already covers BOTH halves the router asked about ('conditionally mandatory at mint time + a WARN-tier orch-validate check'); it simply had NO ac at all until now. Do NOT mint a duplicate. Sibling data-cleanup row CLEAN-ORCHSTATE-DUP-ROWS-NULL-NEXTAGENT-UNSPAWNABLE-READY-SLOTS (backlog, P3) stays where it is. Reasoning: docs/agent-memory/decisions/triage-20260825T1752Z-po.md section 6."
   }) as $schema_new

# ---- apply lane moves --------------------------------------------------------
| .task_board.in_progress = ((.task_board.in_progress // []) | map(select(.id != fix_id)))
| .task_board.backlog = ((.task_board.backlog // [])
    | map(select(.id != probe_id and .id != decision_id and .id != schema_id)))
| .task_board.archive = ((.task_board.archive // []) + [$probe_new, $decision_new])
| .task_board.ready = ([$fix_new, $schema_new] + (.task_board.ready // []))

# ---- 5. repair the 3 genuinely-unspawnable ready[] rows ----------------------
| .task_board.ready = (.task_board.ready | map(
    if .id == "FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS" then
      . + { next_agent: "developer", owner: "developer", dispatch_lane: "developer",
            updated_at: NOW, updated_by: "po (ruling-20260825T1752Z: unspawnable-repair)" }
    elif .id == "FIX-MARKET-MESSAGES-TIMESTAMP-FORMAT"
      or .id == "FIX-ORCHSTATE-TASKBOARD-HEAD-REINFLATION-GUARD" then
      . + { next_agent: "architect", owner: "architect", dispatch_lane: "architect",
            updated_at: NOW, updated_by: "po (ruling-20260825T1752Z: unspawnable-repair)" }
    else . end))

# ---- 6. head stays idle, narrative refreshed in the same write ---------------
| .head = {
    status: "idle",
    active_task_id: null,
    next_agent: null,
    next_action: "PO ruling 17:52Z: auto-mode OCR REJECTED as production default (DECISION-PDFX-OCR-TEXT-BACKEND-DEFAULT-FLIP-TO-AUTO -> archive[] CANCELLED; its own >10%-fire-rate and zero-cgroup-hit rollback triggers were pre-breached at 46% and 494 events on the 2nd document). PROBE-PDFX-OCR-CONFIDENCE-SECOND-DOCUMENT-MARGIN -> archive[] CANCELLED, already answered by qa (AC-2 bar FAILED at 0.329 vs 0.50). FIX-PDFX-TESSERACT-CONFIDENCE-... un-stranded from in_progress[] (no picker dispatches that lane) -> ready[0], READY, next_agent=dev-pdf-extractor, rewritten as a MEASUREMENT-ONLY cycle; code e9144ea75 stays, it is inert in production. FIX-TASKSCHEMA-NEXTAGENT-CONDITIONAL-MANDATORY -> ready[1] with the ac it never had. 3 unspawnable ready[] rows repaired (router's 13 was an over-count of 10 — effective_owner resolves the other 10). Head left IDLE so the head-idle dispatch chain stays reachable.",
    updated_at: NOW,
    updated_by: "po (ruling-20260825T1752Z)"
  }
| ._updated_at = NOW
| ._updated_by = "po (ruling-20260825T1752Z)"

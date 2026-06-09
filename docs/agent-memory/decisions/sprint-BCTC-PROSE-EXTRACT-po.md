# Decision Journal — Sprint BCTC-PROSE-EXTRACT · po

**Sprint goal:** BCTC extractor must extract ALL page content — table pages -> table rows (existing), prose/non-table pages (Thuyet minh notes-to-FS) -> PROSE TEXT, never dropped. Close 46-vs-35 OCR coverage gap. Root-cause fix not symptom patch.
**Agent:** po
**Started:** 2026-06-09T21:42:04Z

---

### STEP po-S1 · po · 2026-06-09T21:42:04Z
**task-id:** BPE-BA-1
**what-done:** Triaged user BUG REPORT (prose/non-table pages silently dropped) into new high-pri sprint BCTC-PROSE-EXTRACT; seeded BA task BPE-BA-1; head -> ba.
**what-considered:**
- Extend closed BCTC-EXTRACT-QUALITY sprint (DONE-WITH-CAVEATS) — REJECTED: distinct root-cause, separate sprint cleaner for tracking.
- Direct FIX to dev-pdf-extractor — REJECTED: recurring-bug-escalation (7+ prior commits + SPIKEs on producer module family) demands ba->architect root-cause first.
**why-decision:** Producer-side root-cause locus raw-verified (extract_layout_first_usecase only emits TABLE units; prose pages = zone-metadata only; inspector PROSE-DEV-1 fallback empty because producer emits no prose text + 46-vs-35 OCR gap). User asked for full chain to DONE not a slice; escalation policy mandates architect.
**why-change:** No change from plan — straight triage to full ba->architect->pm->dev->qa chain as user requested.

### STEP po-S2 · po · 2026-06-09T23:06:19Z
**task-id:** BPE-SPIKE-1
**what-done:** Re-triaged sprint after re-flow: kept 2 shipped commits (32e9571a producer prose-stitch, 338ec4c8 serving), re-opened sprint (NOT closing on slice), added mandatory architect root-cause SPIKE BPE-SPIKE-1 gating dev/ops/qa chain.
**what-considered:**
- Close sprint on 2 GREEN commits — REJECTED: Stop-hook goal unmet (page 12 still serves "No OCR text"); fixes correct-but-insufficient.
- Open fresh follow-up sprint — REJECTED: same user defect + same goal; sprint goal already names "close 46-vs-35 gap"; EXTEND is cleaner tracking.
- Direct dev patch (COUNT->MAX) — REJECTED: recurring-bug escalation (root moved upstream twice: prose-stitch->serving-filter->OCR-coverage); mandates architect SPIKE first.
**why-decision:** Raw-verified: GAP-1 (handler L538/L585 COUNT(*) vs MAX page_number) confirmed in code; pdfOcrWorker L254 iterates 1..min(46,80) so OCR worker is NOT range-truncated — GAP-3 (pages 11-22 absent) is genuine OCR-skip/image/misalign, CONTRADICTING architect BLOCKER-2 "benign/irrelevant" ruling. Architect MUST revisit before any patch.
**why-change:** Plan extended past original BA chain — re-diagnosis pushed root upstream into apps/mcp-server zone (was apps/pdf-extractor); route shifts to dev-mcp-server + ops OCR re-run.

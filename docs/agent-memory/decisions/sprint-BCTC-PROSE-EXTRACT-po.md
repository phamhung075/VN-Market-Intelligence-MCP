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

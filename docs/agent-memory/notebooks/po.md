# PO Notebook

## 2026-08-25T13:45-14:05Z — I ruled against the standing OCR goal, then found the bigger lever behind it

27-envelope triage + the PaddleOCR ruling. Journal: `docs/agent-memory/decisions/triage-20260825T1345Z-po.md`.
**10 minted · 4 folded · 1 dispatched · 1 P0 acceptance probe RUN and FAILED · inbox 27→0.**

### The ruling
**Do not adopt `paddleocr`. Do not adopt `auto`. Keep `tesseract-vie`.** The directive said "improve quality of
extraction BCTC" and PaddleOCR *strips Vietnamese diacritics on nearly every word* — it fails the goal's own
objective. Also 1.8x slower and peaks **2790 MiB against a 2560 MiB cap** (the specialist called that
"98.5-100%"; it is *over*). Zero deploy needed: `OCR_TEXT_BACKEND` is unset in every compose/env file and on the
live container, so the default already IS `tesseract-vie`.

But the data supports a conclusion nobody drew. Paddle's one win (page 9: tesseract lost 100% of the
revenue/profit figures) is **not** an argument for the backend — it is proof that a catastrophic per-page miss
exists and *nothing detects it*. `auto` was byte-identical on 30/30 units because the rescue never fired. I read
`ocr_backends.py` myself: confidence is `mean(conf)` over the rows it **found**, so recall is invisible by
construction and 3 header words at conf 92 score 0.92 on a page that lost 40 rows. The question was never
"which backend" — it was "why is the trigger blind". `FIX-PDFX-TESSERACT-CONFIDENCE-...-TOTAL-PAGE-MISS` now
carries the goal.

### The bigger lever, found by accident
`pek_engine_adapter.py` ~1146-1165: when a pluggable backend is injected — the live config for **every**
backend — the whole table region collapses into ONE cell carrying the *region* bbox. The legacy `paddle_table`
branch it replaced iterated per-line results. So PEK-IMPL-OCR traded table structure for pluggability
fleet-wide, tesseract included. That is a strictly larger BCTC-quality lever than the backend choice ever was,
and it independently explains the 30/30 byte-identical result. Routed to architect — the port signature
literally cannot express what the caller needs, so it is a contract decision, not an edit.

### I ran the probe instead of re-filing it
QA said subtask-4 of `FIX-ORPHAN-FR4-FR5` "needs a gateway-capable session". I am one. Ran it: the FR-2 Rung B
shape returns **`released:0`** and the lock stays held; the control (release under the dead session's own id)
returns `released:1`. `original_owner_client_session` is accepted and **ignored**. The doc half landed, so the
row looks complete on inspection while being dead — 15 days of review missed it. **This falsifies
`feedback_orphan_signal_unreleasable_null_client_session_and_activesprints_only_flip`.** Second finding: the AC
demands "a real NULL-owner orphan-signal row" and there are **0** live — as written it needs a production death
to satisfy. Restated as a synthetic-fixture probe.

### Carry-over
- **I was wrong once this tick and recorded it.** `task_list_held` filters on `kind`, NOT `task_kind` (the
  latter is silently ignored → returns everything; response field is `task_kind`, the trap is real). CARD.md is
  CORRECT there. Its actual bugs: `payload={...}` must be a string, and Phase A omits required `owner_agent`.
- **Prose ceiling is now a starvation mechanism, not an annoyance.** manual-dispatch Step 2 could not stamp
  ranks 0/2/3 (34589B/12249B/12156B); the sweep is the *only* dispatch path for that class, and the longer a row
  is stranded the more prose it accretes. Could not fold onto the row that owns the sibling symptom — it is
  **11967B, 33 bytes under the ceiling**. Candidate set 127→146 in 9h.
- Before folding anything: **size-check the target first.** 4 of my intended folds were impossible; those
  dispositions went to the journal and one `signal_queue` row to qa instead.
- 22 of 27 envelopes were already covered by earlier ticks today. Envelope 16 claimed "zero board row tracks
  it" — false. Envelope 17 asks a question already decided **three times**; the real bug is the emitter's
  missing liveness predicate, so it will re-ask forever.
- INCIDENT_CAP slot 2 still free — nothing this tick justified overriding that. `.head` untouched.
- Standing push disarm in force — committed, nothing pushed.

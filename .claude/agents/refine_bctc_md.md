---
name: refine_bctc_md
color: cyan
description: >
  BCTC refine leaf worker (Option-C). Reads OCR text + page images. Produces trusted markdown
  per FR-13 contract (numbers←OCR, structure←image, flag disagreements). Runtime: Haiku.
  Authored by Opus (one-time). Processes one CHUNK (≤7 windows) per invocation, resumable
  across fires via get_bctc_refined skip-set. Pushes results via push_bctc_refined_unit +
  finalize_bctc_refine (DB pathway). NEVER writes docs/refine-output/ files. NEVER nested-spawn.
tools: Read, Write, mcp__gateway__call_tool
model: haiku
---

Read `docs/agents/refine_bctc_md/init.md` immediately — it is your initial-phase bootstrap.

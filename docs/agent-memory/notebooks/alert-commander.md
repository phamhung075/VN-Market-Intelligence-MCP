# Alert Commander — Notebook

**Last updated:** 2026-07-29 04:43 UTC | **Sprint:** idle

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history (2026-07-23 → 2026-07-25, one perpetual `## This session` heading with `### Alert Cycle` sub-blocks — 198L/124374B, structurally immune to the drop-oldest-`## `-section pruner since it never had a second `## ` to drop) archived verbatim → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. `docs/agents/alert-commander/flow/stage-dispatch-log.md` § 5 now writes one top-level `## c<NNN> · <ISO-timestamp>` section per cycle instead — do NOT resume the old sub-block shape. File currently has 0 `## ` sections (blank-state); the next cycle's write lands as `## c1` per skill AC-4.

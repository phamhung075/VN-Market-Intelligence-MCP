# FB Market Poster — Notebook

**Last updated:** 2026-05-29 (bootstrap — no cycle run yet)

## Current state

Newly created agent. No cycles run. Awaiting first scheduled invocation (M-F 13:07 UTC / 20:07 VN).

## Last cycle

No cycles run yet.

## Lessons learned

- LESSON: Read unified-agent notebook [This session] / [LATEST] entry for today's CHEF dish — contains VN-Index, sector moves, macro context already synthesized
- LESSON: If unified-agent notebook has no [This session] entry, EOD dish not yet published — cycle too early; exit gracefully

## Known patterns

- Post runs at 13:07 UTC (20:07 VN), after EOD dish (08:37 UTC). Data is ~4.5 hours fresh.
- Feedback sink: docs/social/fb-feedback.md — user appends manually, agent reads Phase 2
- Deliverable path: docs/social/fb-post-YYYY-MM-DD.md

## Cross-team notes

- [unified-agent] CHEF dishes published: morning 05:23 UTC + EOD 08:37 UTC + evening 19:37 UTC (conditional). Read before this agent runs.
- [news-scout] Cycle every 15 min (market) / 60 min (off). Notebook has day's top news.

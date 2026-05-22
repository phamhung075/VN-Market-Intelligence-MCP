## Task Report 1968d-P01

changed: [.claude/skills/handoff-delta-read/SKILL.md:1-77, .claude/flows/qa/main.md (Step 0c + RETURN blocks), .claude/flows/developer/main.md (Step 0c + RETURN block), .claude/flows/fixer/main.md (Step 0c + RETURN block)]
tests: N/A (smart-skip — .claude/ only, no .ts changes) | tsc: N/A | ddd: PASS | security: PASS
verdict: CHANGES_REQUESTED

### Issues

- `.claude/skills/handoff-delta-read/SKILL.md:11` — prose states "(no space between `##` and `§`)" i.e. `##§N-slug`, but code block examples on lines 14-18 show `## §1-spec` (WITH space after `##`). The anchor format is contradictory.
- `.claude/skills/handoff-delta-read/SKILL.md:22` — grep pattern `^##§[0-9]` (no space) does NOT match the code block examples `## §1-spec` (space). Agents following the code block format would produce anchors the grep pattern cannot detect, causing fallback rule #1 (`File has NO ##§ anchors → anchor_out=null`) to misfire even when anchors are present.
- `.claude/skills/handoff-delta-read/SKILL.md:48` — fallback rule #1 uses `##§` (no-space) for "no anchor" detection. If handoff files use `## §` (space) format as shown in code examples, this check fails silently: returns `anchor_out=null` on every read, defeating the delta optimization entirely.

### Fix Required

Pick ONE canonical format and apply consistently throughout the skill:
- Option A: `##§N-slug` (no space) — fix code block examples on lines 14-18 to match.
- Option B: `## §N-slug` (space) — fix prose on line 11, grep pattern on line 22, JSON examples on lines 58+64, and fallback detection on line 48 to match.

Either option restores consistency. Option B aligns with the BA spec AC-1 example (`## §1-spec`, `## §2-impl`).

### Notes

- Zone: zero `apps/` files in commit d2ca7c4f. PASS.
- Smoke test math (7.6% = 628/8234 bytes): formula verified correct.
- Backward compat (null anchor → full-read, stale >24h → full-read, anchor-not-found → full-read): all three paths correctly documented in the skill.
- AC-2 (qa flow Step 0c), AC-3 (developer flow Step 0c), AC-3 fixer: all present and correctly structured.
- HANDOFF_DELTA field in all 3 RETURN blocks: PRESENT and correctly structured.
- The blocking issue is documentation-only (no runtime crash — fallback preserves function). However, the inconsistency means the delta optimization is unreliable until fixed.

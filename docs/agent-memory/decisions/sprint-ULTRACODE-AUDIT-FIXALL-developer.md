# Decision Journal — Sprint ULTRACODE-AUDIT-FIXALL · developer

**Sprint goal:** Drain confirmed proposals from docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md
**Agent:** developer
**Started:** 2026-07-15T18:15:50Z

---

### STEP developer-S1 · developer · 2026-07-15T18:15:50Z
**task-id:** UC-RDL-P5
**what-done:** Replaced CLAUDE.md:7-26 (20L condensed Phase A/A.5/B pseudocode) with an 8-line pointer to
`.claude/skills/dispatch-claim/SKILL.md` + Phase B `task_claim` call + a 3-row outcome table
(claimed / re-entrant same-session / peer-collision), commit `aef457f38`.
**what-considered:**
- Rewrite the table with 2 outcomes (claimed/peer) matching the OLD prose — rejected: the brief's whole
  point is the missing re-entrant branch was the bug; a 2-row table reproduces the same defect.
- Move Phase A/A.5 detail inline in a shorter form vs pure pointer — rejected: brief explicitly says
  "shrink to a pointer"; inline detail duplicates the canonical SKILL and re-creates the drift the P4
  sibling proposal (sprint-task:/task: prefix) already flagged as a duplication class.
**why-decision:** Brief's exact replacement text + SKILL.md:250-256 re-entrant pattern (heartbeat+proceed,
do NOT exit) is the authoritative source; table format keeps all 3 outcomes scannable while the pointer
carries Step 0a/Phase A/A.5 detail without re-duplicating it in always-loaded CLAUDE.md context.
**why-change:** No change from plan — applied brief's spec verbatim, kept owner_client_session/ttl/
task_claim contract and peer-EXIT wording intact per brief's risk note.

### STEP developer-S2 · developer · 2026-07-15T20:05:54Z
**task-id:** UC-DTL-P2
**what-done:** Added Step 5.5 board-hygiene to `dev-team-tick-preflight.sh` (relocates post-cycle.md
Step 4.2 cold-eviction so it runs on every lock-winning tick); 34 new tests, 89/89 GREEN.
**what-considered:** Router paraphrase named the wrong script (context-bloat-backstop.sh — unrelated
file-line-cap governance) and asked for SKIP/ERROR firing, which the brief's own verifier explicitly
forbids (peer already owns hygiene on SKIP; lock state undefined on ERROR).
**why-decision:** Followed the architecture brief (authoritative "full acceptance criteria" source
per the dispatch prompt) over the router's paraphrase — full reasoning in
`docs/agent-memory/decisions/sprint-UC-DTL-P2-developer.md`.
**why-change:** Corrected target script + scoped firing to RUN/RUN-IDLE only (documented deviation).

### STEP developer-S3 · developer · 2026-07-15T22:26:00Z
**task-id:** UC-CDC-P2
**what-done:** Ported the mktemp stderr-separation idiom into `cowork-guaranteed-slot-firer.sh:183`
run_firer (`raw=$(eval "$SLOT_MATCHER_CMD" 2>&1)` -> `2>"$slot_err"` mktemp file); added T13 regression
(stderr diagnostic + valid stdout JSON, guaranteed slot still fires); 28/28 GREEN, shellcheck clean.
**what-considered:** Router's inline text pointed at `log()`'s `tee` (line 97) as root cause; the
linked architecture brief (cowork-dispatcher-cron-P2, Verifier-confirmed w/ 34 live "non-JSON output"
log errors incl. a missed chef-eod slot) names line 183's `SLOT_MATCHER_CMD` capture instead.
**why-decision:** Followed the brief (authoritative, evidence-verified) over the router's paraphrase —
`log()`'s tee never feeds a command-substitution JSON parse in this file, confirmed by grep audit; the
`2>&1` on the matcher eval is the only real stdout/stderr merge point feeding `jq` in this script.
**why-change:** Fixed line 183 (not line 97) — same bug class, correct location; no new pattern invented.

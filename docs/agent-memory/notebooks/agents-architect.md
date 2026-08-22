# agents-architect — Notebook

## 2026-08-15T11:21:35Z

**Brief:** `docs/architecture-briefs/2026-08-15-cowork-cron-registration-sibling-process-defer.md`

Router-dispatched: user's hand-authored defer note sat inert in the wrong file (`cron-detect-loop/register.md`, governs a different skill's 4 jobs). Root-caused the real bug: `cron-cowork-team/SKILL.md` Step 1a's fast path keys only on `owner_client_session`; two OS processes sharing one `$CLAUDE_CODE_SESSION_ID` (4 distinct `claude` processes confirmed live on this host via `ps` this session) both pass it and each independently local-`CronCreate`s, invisible to each other. Corrected the router's own evidence: `owner_session` is the MCP **server's** own process/boot diagnostic (`taskClaimTool.ts:25-30`), not a client-terminal discriminator — cannot resolve this; session-presence's "1 live row" is equally uninformative (per-session singleton by construction). New finding, flagged not fixed here: the same shared-UUID gap also defeats the P3 fire-election's RE-ENTRANT branch (leader-lock.md + dev-team + auditor tiers + router's own dispatch-claim hot path) — a double-dispatch correctness bug, recommended to PO as a separate follow-up given blast radius. Fix designed (agent-father's own `.md` zone, no MCP schema change): client-side `$PPID`+`lstart` fingerprint (empirically verified stable this session) stored in the existing marker's free-form payload, compared on Step 1a; mismatch → defer + WORK telegram, with a `heartbeat_at`-based self-heal so a genuinely-dead sibling doesn't permanently block re-arm. Rejected reintroducing the retired human "defer" convention as primary (would silently reverse P3's rationale) — kept as an explicit, narrowly-scoped fallback subsection instead.

**Signal dropped:** `docs/signals/2026-08-15-cowork-cron-registration-sibling-process-defer.json` → agent-father

---

## 2026-08-22T16:20:35Z

**Brief:** `docs/architecture-briefs/2026-08-22-cowork-detect-loop-flow-review.md`

User-requested observe-and-report review (not a fix cycle): mermaid diagram + per-agent mechanics for the cowork-team dispatch loop and the anomaly-detection→dev-team-planning loop, plus a live correctness check. Confirmed the `signal_queue` junction hypothesis but scoped it (only `to==po` rows cross loops; `to∈{tnb,unified-agent,alert-commander}` stay inside cowork). Live-verified a real multi-day host-suspension backlog (3 undrained signal_queue rows, 7d-stale `.head`, no cowork-schedule fire since 08-15 — corroborated by system-auditor's own c104 notebook entry) and freshly-reclaimed cron-registration markers (~9min old at read time) whose underlying `CronList` entries I could not independently verify (no tool route). Found the guaranteed-slot launchd backstop is real and bridged the outage but never stamps `cowork-schedule.json.last_fired`, desyncing that field from reality; found a stale `TODO`-vs-`BACKLOG` doc contradiction in `anomaly-task-bridge/SKILL.md`; found an 8-day-unread signal addressed to this agent's own id re: Step 2.4 TTL. No wiring defects — nothing fixed, 2 small doc/script follow-ups recommended to agent-father, 2 more flagged to PO for awareness.

**Signal dropped:** `docs/signals/2026-08-22-cowork-detect-loop-flow-review.json` → agent-father

---

## 2026-08-22T19:08:49Z

**Brief:** `docs/architecture-briefs/2026-08-22-cowork-detect-loop-flow-review.md` (update)

Restructured §A per coordinator feedback: the original single combined mermaid diagram placed Loop 1/Loop 2 as sibling subgraphs (renderer free to lay them side-by-side) and fanned one node into 10 parallel edges — rendered far wider than a normal screen despite `flowchart TD`. Split into two independent stacked diagrams; collapsed the 9-agent spawn fan-out and LAUNCHD's 4 dashed backstop targets into single grouped nodes (per-agent mechanics already live in §B prose); kept the `SQ`/`SQ2` signal_queue junction node in both, with a prose note that they're the same physical array. Verified narrow programmatically (wrote a dagre-style longest-path rank simulation over the parsed edge lists, not eyeballed): max width = 2 nodes at any rank in both diagrams (11 nodes/10 edges and 14 nodes/14 edges respectively). §B and §C untouched.

**Signal dropped:** none new — prior entry's signal (`docs/signals/2026-08-22-cowork-detect-loop-flow-review.json`) still stands, payload unchanged.

---

## 2026-08-22T19:19:23Z

**Brief:** `docs/architecture-briefs/2026-08-22-cowork-detect-loop-flow-review.vi.md` (new — Vietnamese translation)

One-off ad-hoc request (not a standing-convention change — engineering briefs stay English by default): full Vietnamese translation of the English brief, created as a NEW sibling file, original left untouched and still SSOT (linked back via a top-of-file note). Translated all prose (title, §A explanatory text + both mermaid diagrams' human-readable labels, §B per-agent mechanics, §C findings F1-F8 + legend + bottom line); left code-like tokens untranslated (file paths, cron expressions, tool/function names, JSON field/status values, agent ids, mermaid node IDs). Re-ran the same programmatic dagre-style rank-width check against the translated diagrams to confirm topology/narrowness parity with the English original (both diagrams: 11n/10e and 14n/14e, max width 2 — identical to source).

**Signal dropped:** none new — same signal as prior entries, payload unchanged; this is a translation artifact, not a new architectural finding.

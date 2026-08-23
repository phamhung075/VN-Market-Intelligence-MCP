# agents-architect — Notebook

## 2026-08-22T19:19:23Z

**Brief:** `docs/architecture-briefs/2026-08-22-cowork-detect-loop-flow-review.vi.md` (new — Vietnamese translation)

One-off ad-hoc request (not a standing-convention change — engineering briefs stay English by default): full Vietnamese translation of the English brief, created as a NEW sibling file, original left untouched and still SSOT (linked back via a top-of-file note). Translated all prose (title, §A explanatory text + both mermaid diagrams' human-readable labels, §B per-agent mechanics, §C findings F1-F8 + legend + bottom line); left code-like tokens untranslated (file paths, cron expressions, tool/function names, JSON field/status values, agent ids, mermaid node IDs). Re-ran the same programmatic dagre-style rank-width check against the translated diagrams to confirm topology/narrowness parity with the English original (both diagrams: 11n/10e and 14n/14e, max width 2 — identical to source).

**Signal dropped:** none new — same signal as prior entries, payload unchanged; this is a translation artifact, not a new architectural finding.

---

## 2026-08-22T19:50:40Z

**Brief:** `docs/architecture-briefs/2026-08-22-cowork-detect-loop-flow-review.md` (update — new §D, English only, `.vi.md` sibling deliberately not touched)

New operational fact from user: whole fleet runs on their personal PC, ~1 week vacation coming with sleep and/or full shutdown, exceeding the 2 confirmed sleep-outages (2.5d/4d) that self-healed. Added §D (F9-F12 + checklist): F9 only `com.vn-market.cowork-guaranteed-slot-firer` survives a full shutdown+reboot (real launchd LaunchAgent, confirmed via `~/Library/LaunchAgents/`); everything else in both loops is session-only `CronCreate`. F10 (new, significant): the designed guaranteed-slot catch-up module (`cowork-catchup-predicate.js`) is built and wired into `cowork-match-slots.js`'s output, but grep-confirmed zero live consumers reference `catchup_raw` — dispatcher's own planned Step 4.55 sub-flow was never created, preflight script's planned Step 6.5 never added, and the launchd firer itself never wired despite the original design brief naming it the most relevant plane. Consequence: guaranteed dishes missed during any host-down window (including possibly the return day itself, given re-arm is an unscheduled human action vs. the ±2min match window) are silently and permanently skipped, no catch-up, no miss-alert. F11: no duplicate-publish/stale-as-fresh risk either way (sleep self-heals via CronCreate's own native missed-fire replay through the real marker-gated flow, proven 2x; shutdown just resumes from "now" with no burst at all) — reassuring but for the wrong reason (silent loss, not correct recovery). F12: confirmed zero SessionStart hook or any automated long-gap→re-arm detection anywhere (checked both settings files) — 100% human/router-memory-dependent, no self-alert fallback even from system-auditor (which would itself be dark).

**Signal dropped:** `docs/signals/2026-08-22-cowork-detect-loop-vacation-resilience-addendum.json` → agent-father (F10 + F12 follow-ups, P2/backlog, routed for PO prioritization — not implemented here)

---

## 2026-08-23T11:01:46Z

**Task:** `FIX-QA-VC-LANEMOVE-PROSE-ONLY-NO-ORCHAPPLY-ACTUATOR` (P0, dev-team Design-Router Sweep dispatch) — no new brief authored (`po_scope_note` on the row: design already fully specified in `desc`, one-hop signal only; independently re-verified before honoring that ruling).

Re-verified live at source: `docs/agents/qa/flow/main.md` vc-approved/vc-changes Direct-Commit-Verify exits (L189/L198 per the row, L205/L214 in current file) are both still prose-only board mutations, no `orch-apply.sh` pipe — matches desc verbatim, in-file WF-1 block (L30-33) already shows a working local precedent. Dropped signal `docs/signals/2026-08-23-qa-vc-lanemove-orchapply-actuator.json` → agent-father with copy-executable jq+orch-apply.sh patches for AC-1/AC-2 (test-executed against synthetic fixtures, both pass) + AC-3 self-verify shape, mirroring the FIX-PO-BATCH-MINT-NO-WRITE-ACTUATOR template (commit 3ce726a6e); flagged AC-4/AC-5 as outside agent-father's commit_zone (`scripts/`) — same split as that precedent, hand to a developer-owned row. Flagged, not folded in: AC-2's qa[]→review[] move crosses into a `scripts/orch-row-prose-ceiling-check.mjs` guarded lane from an unguarded one — same D3 defect already tracked separately (`FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS`, ready[], next_agent=developer). Routed the task_board row `next_agent`/`owner` → `po` (not `agent-father` directly — off the DRS allowlist, unreachable by automated dispatch, precedent `FIX-COMMITCONVENTION-MANDATES-BARE-COMMIT`); `.head` idle-reset in the same write.

**Signal dropped:** `docs/signals/2026-08-23-qa-vc-lanemove-orchapply-actuator.json` → agent-father

---

## 2026-08-23T14:04:55Z

**Brief:** `docs/architecture-briefs/2026-08-23-fix-cowork-published-marker-ttl-cadence-mismatch-design.md`

Row `FIX-COWORK-PUBLISHED-MARKER-TTL-28H-EXCEEDS-24H-DAILY-CADENCE`: root-caused to Step 2.4's prefix-only match in `dispatch-claim/SKILL.md` (not chef.md's own exact-match gate, not any `MARKER_TTL` constant — that gate compares exact per-period strings and never collides). Ruled Axis D (cadence-bounded prefix match, keyed on `cowork-schedule.json`'s already-live `publish_date_basis` field, zero date-basis duplication, zero `apps/mcp-server` change) landed together with Axis C (AC-3/AC-5 stale-owner presence check) in one Step 2.4 revision — Axis D closes AC-1 deterministically where presence-only would only close it contingent on the claiming dispatcher session having died. New finding: `digest-sunday` carries the identical latent overlap defect at weekly scale (691200s TTL vs 604800s cadence = 86400s/week window), closed for free by the same fix.

**Signal dropped:** `docs/signals/fix-cowork-published-marker-ttl-cadence-mismatch-2026-08-23T14:04:55Z.json` → pm

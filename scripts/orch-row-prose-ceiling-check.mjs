#!/usr/bin/env bun
/**
 * scripts/orch-row-prose-ceiling-check.mjs — growth-only row-level inline-
 * prose ceiling guard for orch-state.json writes.
 *
 * Task:   FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT
 * Brief:  docs/architecture-briefs/2026-08-09-fix-orchstate-hotfile-inline-prose-ceiling.md §2.4
 *
 * PURPOSE:
 *   Compares a CANDIDATE orch-state document against the LIVE file's current
 *   per-row "prose bytes" (see measurement convention below) for every row in
 *   backlog[]/ready[]/review[] (the 3 flat lanes this task measured — see
 *   brief §3 non-goals for why active_sprints[]/in_progress[]/qa[]/done[]/
 *   done_verified[] are deliberately out of scope). A row already over the
 *   ceiling that is NOT growing this write is a non-blocking WARN
 *   (grandfathered — 34/623 rows measured over ceiling on 2026-08-09, see
 *   brief §0). A row whose CANDIDATE prose bytes exceed the ceiling AND
 *   exceed that SAME row's LIVE prose bytes (net new inline growth) is a
 *   hard reject — this is the durable write-time counterpart the brief
 *   proves (b) alone (a one-time backlog-stub sweep) cannot survive without
 *   (F-1/F-2: prose re-accretes under freshly-invented field names within
 *   days of any one-time sweep).
 *
 * PLACEMENT DECISION (brief §2.4): a NEW sibling to orch-conservation-check.mjs
 *   (deliberately NOT an extension of orch-validate.mjs — candidate-only, no
 *   live-file comparison capability; NOT an extension of
 *   orch-stamp-updated-at.mjs — already has the right live-vs-candidate
 *   row-diff primitives, but mid-extension for the unrelated in-flight
 *   FIX-ORCHAPPLY-SELECTOR-MISS-SILENT-NOOP fix). Mirrors
 *   orch-conservation-check.mjs's `(liveFilePath, candidateFilePath)` CLI
 *   contract and read-only assert-and-exit shape — both are "diff live vs
 *   candidate, apply a circuit-breaker rule, never mutate" checks.
 *
 * MEASUREMENT CONVENTION ("prose bytes"):
 *   A row's JSON byte length (UTF-8) after excluding a fixed
 *   structural/routing/lifecycle field set (STRUCTURAL_FIELDS below — the
 *   exact list from brief §0's footnote, a superset of
 *   scripts/orch-backlog-stub.sh's STUB_FIELDS plus the lifecycle/provenance
 *   fields STUB_FIELDS deliberately never strips). This is a MEASUREMENT
 *   convention local to this script, not a validation rule — it does not
 *   touch TaskSchema/.passthrough() at all (that stays
 *   SSOT-W1-SERVER-ENFORCE's separately-owned, still-pending .strict()
 *   promotion — see brief F-2).
 *
 * ROW IDENTITY: id-keyed, LANE-AGNOSTIC (mirrors orch-stamp-updated-at.mjs's
 *   diff-unit choice) — a row's id is looked up across ALL 3 configured
 *   lanes on the LIVE side, so a lane-move (e.g. backlog[]->review[]) does
 *   not get treated as "new row, live baseline 0" merely because it changed
 *   lanes; only a genuinely absent id gets the 0 baseline (brief's own
 *   "brand-new row minted with >12KB prose on first write -> exit 1" case).
 *
 * INVOCATION:
 *   bun scripts/orch-row-prose-ceiling-check.mjs <liveFilePath> <candidateFilePath>
 *
 * ENV:
 *   ORCH_ROW_PROSE_CEILING_BYTES  default 12000 (12KB) — data-driven, approx
 *                                 p90 across all 3 lanes on 2026-08-09's live
 *                                 distribution (review[] p90=11.7KB,
 *                                 backlog[] p90=5.9KB, ready[] p90=12.8KB) —
 *                                 grandfathers ~90-95% of rows untouched.
 *                                 NOT asserted as permanently correct;
 *                                 env-tunable, no redeploy needed to retune,
 *                                 same pattern as ORCH_HOT_CEILING_BYTES /
 *                                 CONSERVATION_FLOOR_RATIO /
 *                                 CONSERVATION_MIN_BASELINE elsewhere in this
 *                                 write-gate family.
 *
 * EXIT CODES:
 *   0 = no violation (may still print non-fatal WARN lines to stderr for
 *       pre-existing over-ceiling rows that did NOT grow this write —
 *       informational only, mirrors orch-validate.mjs Stage 1g's
 *       non-fatal-report precedent).
 *   1 = at least one row's CANDIDATE prose bytes exceed
 *       ORCH_ROW_PROSE_CEILING_BYTES AND exceed that row's own LIVE prose
 *       bytes (net new inline growth past ceiling) — ABORT, live file
 *       untouched by the caller (scripts/orch-apply.sh), message names every
 *       violating id + live/candidate byte counts + points at detail_ref.
 *   3 = usage error (missing args / file not found / unreadable /
 *       unparseable) — matches orch-conservation-check.mjs's usage-error
 *       exit class.
 *
 * HARD CONSTRAINTS:
 *   - GROWTH-ONLY. Never blocks a row that is already over ceiling and stays
 *     flat or shrinks — only blocks NET NEW inline growth past the ceiling.
 *     This is what makes it impossible to brick routine writes on already-
 *     oversized rows (the exact brick-risk class PO's own D-4 ruling
 *     rejected for the sibling whole-file FIX-ORCHAPPLY-NO-HOTFILE-SIZE-
 *     TELEMETRY-WARN task — see brief §1 "Rejected: (a) alone").
 *   - NO BYPASS ENV VAR. Unlike ORCH_APPLY_ALLOW_SHRINK (protects a
 *     legitimate, structurally-necessary operation — bulk eviction), there
 *     is no legitimate reason to inline-grow a row past ceiling: detail_ref
 *     is already the sanctioned escape hatch (see scripts/orch-backlog-stub.sh).
 *   - Never duplicate this measurement/violation logic elsewhere — this
 *     script is the single source of truth, wired into
 *     scripts/orch-apply.sh Stage 2.5.
 */

import { existsSync, readFileSync } from 'node:fs';

const CEILING_BYTES = Number(process.env.ORCH_ROW_PROSE_CEILING_BYTES ?? '12000');

/** The 3 flat lanes this task measured (brief §0) — see file header for why
 * active_sprints[]/in_progress[]/qa[]/done[]/done_verified[] are excluded.
 * @type {string[]} */
const PROSE_CEILING_LANES = ['backlog', 'ready', 'review'];

/**
 * Structural/routing/lifecycle exclude-set — verbatim from brief §0's
 * footnote. Superset of scripts/orch-backlog-stub.sh's STUB_FIELDS plus the
 * lifecycle/provenance fields STUB_FIELDS deliberately never strips.
 * Everything NOT in this set counts as "prose" for ceiling purposes.
 *
 * secondary_claimed_at/secondary_claimed_by/secondary_dispatch_target/
 * dispatch_target (added FIX-PROSECEILING-SECONDARY-CLAIM-STAMP-FIELDS-
 * MISSING-FROM-STRUCTURAL-EXCLUDE-SET, 2026-08-15, same-day follow-up to
 * 4513c45df): claimed_at/claimed_by were already excluded as PRIMARY
 * QA-Drain's claim-stamp coordination metadata, but the SECONDARY-Drain
 * sweep (scripts/devteam-review-claim-secondary-drain.jq) stamps this
 * *_secondary_* prefixed family in place inside review[] and none of them
 * were in the set — the claim stamp itself counted as prose growth on an
 * already-over-ceiling row, hard-rejecting the write every tick
 * (deterministic livelock — see FIX-PROSECEILING-SECONDARY-CLAIM-STAMP-
 * FIELDS-MISSING-FROM-STRUCTURAL-EXCLUDE-SET for the full trace). Same
 * class of field as claimed_at/claimed_by by construction — coordination
 * metadata, not author-written prose.
 * @type {Set<string>}
 */
const STRUCTURAL_FIELDS = new Set([
  'id',
  'title',
  'status',
  'owner',
  'zone',
  'priority',
  'size',
  'type',
  'depends',
  'depends_on',
  'blocked_by',
  'wave',
  'detail_ref',
  'task_id',
  'owner_agent',
  'next_agent',
  'sprint',
  'sprint_id',
  'created_at',
  'closed_at',
  'created_by',
  'updated_at',
  'updated_by',
  'claimed_at',
  'claimed_by',
  'secondary_claimed_at',
  'secondary_claimed_by',
  'secondary_dispatch_target',
  'dispatch_target',
  'promoted_at',
  'promoted_by',
  'dispatch_lane',
  'supervised',
  'plan_only',
  'review_lane',
  'qa',
  'verify_note',
]);

/**
 * "Prose bytes" for one row: UTF-8 byte length of the row's JSON
 * representation after excluding STRUCTURAL_FIELDS.
 * @param {unknown} row
 * @returns {number}
 */
function proseBytes(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return 0;
  /** @type {Record<string, unknown>} */
  const proseOnly = {};
  for (const [key, value] of Object.entries(/** @type {Record<string, unknown>} */ (row))) {
    if (!STRUCTURAL_FIELDS.has(key)) proseOnly[key] = value;
  }
  return Buffer.byteLength(JSON.stringify(proseOnly), 'utf-8');
}

/**
 * Collect every row across PROSE_CEILING_LANES into an id -> row map.
 * LANE-AGNOSTIC by design (see file header ROW IDENTITY note) — a row
 * present in more than one lane (should not happen; last-write-in-iteration-
 * order wins, harmless since ids are meant to be globally unique) is not
 * specially guarded against here — that is orch-validate.mjs's job.
 * @param {unknown} doc
 * @returns {Map<string, unknown>}
 */
function collectRowsById(doc) {
  /** @type {Map<string, unknown>} */
  const map = new Map();
  const tb = /** @type {Record<string, unknown>} */ (doc && typeof doc === 'object' ? doc.task_board : undefined);
  if (!tb) return map;
  for (const lane of PROSE_CEILING_LANES) {
    const arr = tb[lane];
    if (!Array.isArray(arr)) continue;
    for (const row of arr) {
      const id = row && typeof row === 'object' ? /** @type {Record<string, unknown>} */ (row).id : undefined;
      if (typeof id === 'string' && id.length > 0) map.set(id, row);
    }
  }
  return map;
}

/**
 * Load + parse a JSON document, exiting 3 on any failure (usage error class —
 * matches orch-conservation-check.mjs's own loadDoc()).
 * @param {string} path
 * @param {string} label
 * @returns {unknown}
 */
function loadDoc(path, label) {
  if (!existsSync(path)) {
    process.stderr.write(`[orch-row-prose-ceiling-check] ERROR: ${label} file not found: ${path}\n`);
    process.exit(3);
  }
  let text;
  try {
    text = readFileSync(path, 'utf-8');
  } catch (err) {
    process.stderr.write(
      `[orch-row-prose-ceiling-check] ERROR: cannot read ${label} file: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(3);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    process.stderr.write(
      `[orch-row-prose-ceiling-check] ERROR: ${label} file is not valid JSON: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(3);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

const [, , liveArg, candidateArg] = process.argv;

if (!liveArg || !candidateArg) {
  process.stderr.write(
    '[orch-row-prose-ceiling-check] USAGE: bun scripts/orch-row-prose-ceiling-check.mjs <liveFilePath> <candidateFilePath>\n'
  );
  process.exit(3);
}

const liveDoc = loadDoc(liveArg, 'live');
const candidateDoc = loadDoc(candidateArg, 'candidate');

const liveRows = collectRowsById(liveDoc);
const candidateRows = collectRowsById(candidateDoc);

/** @type {{id: string, liveBytes: number, candidateBytes: number}[]} */
const violations = [];
/** @type {{id: string, liveBytes: number, candidateBytes: number}[]} */
const warnings = [];

for (const [id, candidateRow] of candidateRows) {
  const candidateBytes = proseBytes(candidateRow);
  if (candidateBytes <= CEILING_BYTES) continue; // under ceiling — no interest either way

  const liveRow = liveRows.get(id);
  const liveBytes = liveRow !== undefined ? proseBytes(liveRow) : 0;

  if (candidateBytes > liveBytes) {
    // Net new inline growth past ceiling — hard reject.
    violations.push({ id, liveBytes, candidateBytes });
  } else {
    // Already over ceiling, not growing this write — grandfathered WARN.
    warnings.push({ id, liveBytes, candidateBytes });
  }
}

if (violations.length === 0) {
  for (const w of warnings) {
    process.stderr.write(
      `[orch-row-prose-ceiling-check] WARN — id=${w.id} already over ceiling ` +
        `(live=${w.liveBytes}B candidate=${w.candidateBytes}B > ${CEILING_BYTES}B) but NOT growing this write — grandfathered, non-blocking.\n`
    );
  }
  process.stdout.write(
    `[orch-row-prose-ceiling-check] OK — 0 net-new-growth violation(s)` +
      (warnings.length > 0 ? `, ${warnings.length} pre-existing over-ceiling WARN(s) (see stderr)\n` : `\n`)
  );
  process.exit(0);
}

process.stderr.write(
  `\n[orch-row-prose-ceiling-check] ABORTED — ${violations.length} row(s) with net new inline growth past ` +
    `ORCH_ROW_PROSE_CEILING_BYTES=${CEILING_BYTES}:\n`
);
for (const v of violations) {
  process.stderr.write(`  id=${v.id} live=${v.liveBytes}B -> candidate=${v.candidateBytes}B\n`);
}
process.stderr.write(
  `  fix: route this row's new/updated prose through its detail_ref cold store instead of growing it inline ` +
    `(scripts/orch-backlog-stub.sh — LANES=backlog,ready,review) — do NOT split the write into smaller pieces to ` +
    `dodge this check, that just relocates the same bytes across more writes. If ` +
    `ORCH_ROW_PROSE_CEILING_BYTES=${CEILING_BYTES} is genuinely miscalibrated, retune the env var (no redeploy ` +
    `needed) rather than bypassing — there is no bypass env var for this check by design (detail_ref is already ` +
    `the sanctioned escape hatch).\n`
);
process.exit(1);

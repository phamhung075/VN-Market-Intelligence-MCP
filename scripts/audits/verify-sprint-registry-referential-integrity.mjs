#!/usr/bin/env bun
/**
 * scripts/audits/verify-sprint-registry-referential-integrity.mjs
 *
 * Task:  FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE
 * Brief: docs/architecture-briefs/2026-08-08-fix-sprint-registry-dangling-ids-reconciliation-design.md §11
 * Corrections (BINDING, supersede the brief on conflict): board row `po_review_note`
 *   2026-08-22 PO re-ratification — B1 (STEP 0 sprint_goal-entry guard + self-
 *   referential STRIP), B2 (terminality-before-lane), Q4 (closed liveness-token
 *   set ruling).
 *
 * READ-ONLY CLASSIFICATION / REPLAY TOOL — makes NO orch-state.json write. Real
 * classification logic lives in apps/mcp-server/src/infrastructure/orchStateSchema.ts
 * `classifySprintRegistryDanglingIds()` (§15) — this script is a thin CLI wrapper
 * that resolves the cold-archive inputs (fs reads) and prints the regenerated
 * table, exactly mirroring scripts/orch-validate.mjs's "import the real .ts
 * function directly, never reimplement" convention (bun transpiles .ts on the fly).
 *
 * PO GATE (per the board row's supervision note, po_goahead_20260822T201220Z):
 * the actual dangling-id/active-sprint reconciliation write to the LIVE
 * orch-state.json requires a SEPARATE PO sign-off pass on this script's
 * regenerated output — this script never applies it. §11.8's corrected
 * sequencing (B3) places the archiver closed-id-derivation correction, the
 * AC-4 third-state branch, and the Stage 1h validator AFTER that data write —
 * none of those ship in this script; it is step 2 of the corrected order only
 * ("build the classification/replay script ... -> run it -> PO signs its
 * output -> data write -> ...").
 *
 * Usage:
 *   bun scripts/audits/verify-sprint-registry-referential-integrity.mjs [path/to/orch-state.json]
 *
 * Exit code: always 0 (report tool, never blocks / never mutates).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifySprintRegistryDanglingIds } from '../../apps/mcp-server/src/infrastructure/orchStateSchema.ts';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPTS_DIR, '../..');
const DEFAULT_TARGET = 'docs/data/orch/orch-state.json';

const targetArg = process.argv[2] ?? DEFAULT_TARGET;
const absPath = resolve(PROJECT_ROOT, targetArg);

if (!existsSync(absPath)) {
  process.stderr.write(`[verify-sprint-registry-referential-integrity] ERROR: not found: ${absPath}\n`);
  process.exit(3);
}

let data;
try {
  data = JSON.parse(readFileSync(absPath, 'utf-8'));
} catch (err) {
  process.stderr.write(`[verify-sprint-registry-referential-integrity] ERROR: JSON parse failed: ${err}\n`);
  process.exit(3);
}

// ── Cold-archive resolution (fs access lives here, not in the pure function) ──
//
// §11.2 A1: coldClosedSprintIds is STRICT — closed_sprints[].id / closed_sprint_goals
// sprint ids ONLY. `.done_tasks[].sprint` is deliberately EXCLUDED from this set
// (the weak signal demoted by §2.3/§11.2 — never sole justification for "resolved").
// coldDoneTasks (id + own .sprint) is collected separately and used ONLY for
// STEP 0's task-id-universe / own-.sprint resolution (§11.3 A2).
const archiveDir = resolve(PROJECT_ROOT, 'docs/data/orch/archive');
const coldClosedSprintIds = new Set();
const coldDoneTasks = [];

try {
  const archiveFiles = readdirSync(archiveDir).filter((f) => /^\d{4}-\d{2}\.json$/.test(f));
  for (const af of archiveFiles) {
    try {
      const archiveDoc = JSON.parse(readFileSync(resolve(archiveDir, af), 'utf-8'));
      for (const s of archiveDoc.closed_sprints ?? []) {
        if (s && typeof s.id === 'string' && s.id) coldClosedSprintIds.add(s.id);
      }
      const goals = archiveDoc.closed_sprint_goals;
      if (Array.isArray(goals)) {
        for (const g of goals) {
          const sid = g?.sprint_id;
          if (typeof sid === 'string' && sid) coldClosedSprintIds.add(sid);
        }
      } else if (goals && typeof goals === 'object') {
        for (const sid of Object.keys(goals)) coldClosedSprintIds.add(sid);
      }
      for (const t of archiveDoc.done_tasks ?? []) {
        if (t && typeof t.id === 'string' && t.id) {
          coldDoneTasks.push({ id: t.id, sprint: typeof t.sprint === 'string' ? t.sprint : null });
        }
      }
    } catch {
      // fail-soft: one unreadable/malformed monthly archive file must not block this report.
    }
  }
} catch {
  // fail-soft: archive dir missing entirely — report runs with hot-only known-ids.
}

const result = classifySprintRegistryDanglingIds(data, {
  coldClosedSprintIds,
  coldDoneTasks,
});

// ── Print regenerated classification table ─────────────────────────────────
process.stdout.write(
  `[verify-sprint-registry-referential-integrity] target=${absPath}\n` +
  `[verify-sprint-registry-referential-integrity] cold_closed_ids=${coldClosedSprintIds.size} cold_done_tasks=${coldDoneTasks.length}\n\n`
);

const byKind = { LIVE: 0, FINISHED: 0, RELABEL: 0, NEVER_WAS: 0, PRE_SPRINT_LABEL: 0 };
for (const row of result.rows) byKind[row.classification] = (byKind[row.classification] ?? 0) + 1;

result.rows.forEach((row, i) => {
  const laneSummary = row.taskRefs.length
    ? row.taskRefs.map((r) => `${r.lane}:${r.status}(${r.taskId})`).join(', ')
    : '(none)';
  process.stdout.write(
    `[${i + 1}] id=${row.id}\n` +
    `    goal_status=${row.goalStatus ?? '(none)'}\n` +
    `    task_refs=${laneSummary}\n` +
    `    classification=${row.classification} action=${row.action}` +
    `${row.relabelTarget ? ` relabel_target=${row.relabelTarget}` : ''}\n` +
    `    detail: ${row.detail}\n`
  );
});

const countedViolations = result.rows.filter((r) => r.classification !== 'PRE_SPRINT_LABEL').length;

process.stdout.write(
  `\n[verify-sprint-registry-referential-integrity] SUMMARY strict_dangling=${result.strictDanglingCount} ` +
  `LIVE=${byKind.LIVE} FINISHED=${byKind.FINISHED} RELABEL=${byKind.RELABEL} NEVER_WAS=${byKind.NEVER_WAS} ` +
  `PRE_SPRINT_LABEL=${byKind.PRE_SPRINT_LABEL} counted_violations=${countedViolations}\n` +
  `[verify-sprint-registry-referential-integrity] violations=${countedViolations}\n` +
  `[verify-sprint-registry-referential-integrity] READ-ONLY — no orch-state.json write performed. ` +
  `PO sign-off on this table required before scripts/orch-apply.sh applies any reconciliation.\n`
);

process.exit(0);

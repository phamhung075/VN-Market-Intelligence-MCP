/**
 * tasksMdJanitorJob — Step R-4b: 2-consecutive-cycle debounce gate on R-2/R-3
 * candidates (FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE —
 * docs/agents/system-auditor/handlers.md §Step R-4b). Ledger rides on the
 * system-auditor notebook's "D4 candidates:" line — no new state file (D4's
 * own header comment: "No writes to coordination.db").
 *
 * Split out of tasksMdJanitorJob.ts (FIX-SIZELINT-TASKSMDJANITORJOB-1012L,
 * 2026-08-24).
 */

import type { D4Candidate, DivergenceRow } from "./tasksMdJanitorTypes.js";

/**
 * Parse the most recent prior "D4 candidates:" line out of the system-auditor
 * notebook content. This repo's notebook convention prepends the newest `## `
 * section at the top (see docs/agent-memory/notebooks/system-auditor.md — newest
 * section is first), so sections are scanned top-to-bottom and the FIRST one
 * containing a "D4 candidates:" line wins (intervening Tier-1/Tier-2 sections have
 * no such line at all).
 *
 * Returns null when no "D4 candidates:" line is found anywhere (cold start) — the
 * caller MUST treat null as "zero prior candidates, do not emit this cycle".
 * Returns an empty Set when a prior line reads "none" (checked previously, found
 * nothing) — behaviorally identical to null for matching purposes, kept distinct
 * only for notebook-read transparency.
 */
export function parsePriorD4Candidates(notebookContent: string): Set<string> | null {
  const sectionRe = /^## .*$/gm;
  const matches = [...notebookContent.matchAll(sectionRe)];
  if (matches.length === 0) return null;

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i]!.index!;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : notebookContent.length;
    const sectionBody = notebookContent.slice(start, end);
    const lineMatch = sectionBody.match(/^D4 candidates:\s*(.*)$/m);
    if (lineMatch) {
      const raw = lineMatch[1]!.trim();
      if (raw === "" || raw.toLowerCase() === "none") return new Set();
      return new Set(
        raw
          .split(",")
          .map(s => s.trim())
          .filter(Boolean),
      );
    }
  }
  return null;
}

/** Format this cycle's ledger-seed section (machine-appended, ≤3 lines). */
export function formatD4LedgerSection(nowIsoStr: string, candidateKeys: string[]): string {
  const keysStr = candidateKeys.length > 0 ? candidateKeys.join(",") : "none";
  return `## d4-auto · ${nowIsoStr}\nD4 candidates: ${keysStr}\n`;
}

/**
 * Insert the ledger section at the position of the topmost `## ` section (i.e.
 * BEFORE it — this repo prepends newest sections first) or append to end if the
 * notebook has no sections yet (blank-state fallback).
 */
export function insertD4LedgerSection(notebookContent: string, section: string): string {
  const firstSectionMatch = notebookContent.match(/^## /m);
  if (!firstSectionMatch) {
    const sep = notebookContent.trim().length > 0 ? "\n\n" : "";
    return notebookContent + sep + section;
  }
  const idx = firstSectionMatch.index!;
  return notebookContent.slice(0, idx) + section + "\n" + notebookContent.slice(idx);
}

/**
 * Apply Step R-4b to this cycle's R-2/R-3 candidates: candidates that PERSISTED
 * from the prior cycle's ledger emit as divergences this cycle; first-occurrence
 * candidates are suppressed and re-armed via the freshly-seeded ledger. The ledger
 * write is best-effort (a write failure does not fail the job — the debounce
 * fail-safe default is "do not emit", which a missing ledger already achieves).
 */
export function applyR4bDebounce(
  candidates: D4Candidate[],
  notebookPath: string,
  readFile: (p: string) => string,
  writeFile: (p: string, s: string) => void,
  fileExists: (p: string) => boolean,
  nowIsoStr: string,
): DivergenceRow[] {
  let priorContent = "";
  let priorCandidates: Set<string> | null = null;

  try {
    if (fileExists(notebookPath)) {
      priorContent = readFile(notebookPath);
      priorCandidates = parsePriorD4Candidates(priorContent);
    }
  } catch {
    priorCandidates = null; // fail-safe: treat unreadable notebook as cold start
  }

  const emitted: DivergenceRow[] = [];
  for (const c of candidates) {
    if (priorCandidates !== null && priorCandidates.has(c.key)) {
      emitted.push(c.div);
    }
  }

  try {
    const section = formatD4LedgerSection(nowIsoStr, candidates.map(c => c.key));
    writeFile(notebookPath, insertD4LedgerSection(priorContent, section));
  } catch {
    // best-effort — a ledger write failure must not fail the D4 job
  }

  return emitted;
}

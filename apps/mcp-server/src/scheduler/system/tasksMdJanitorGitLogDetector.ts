/**
 * tasksMdJanitorJob — Step R-4: git log concurrent-commit detection (AC-5).
 *
 * Split out of tasksMdJanitorJob.ts (FIX-SIZELINT-TASKSMDJANITORJOB-1012L,
 * 2026-08-24).
 */

interface CommitEntry {
  hash: string;
  tsEpoch: number;
}

/**
 * Parse git log output into commit entries.
 * Expected format per line: "<hash> <ISO-8601-date>"
 * e.g. "a1b2c3d 2026-05-21 02:58:10 +0000"
 */
export function parseGitLog(output: string): CommitEntry[] {
  const entries: CommitEntry[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // hash is first token; rest is datetime
    const spaceIdx = trimmed.indexOf(" ");
    if (spaceIdx === -1) continue;
    const hash = trimmed.slice(0, spaceIdx);
    const dateStr = trimmed.slice(spaceIdx + 1).trim();
    const tsMs = Date.parse(dateStr);
    if (!isNaN(tsMs)) {
      entries.push({ hash, tsEpoch: Math.floor(tsMs / 1000) });
    }
  }
  return entries;
}

/**
 * Find pairs of commits that landed within windowSeconds of each other.
 */
export function findConcurrentCommits(
  entries: CommitEntry[],
  windowSeconds = 30,
): Array<{ hash1: string; hash2: string; delta: number }> {
  const pairs: Array<{ hash1: string; hash2: string; delta: number }> = [];
  // entries should be sorted newest-first by git log; sort ascending for comparison
  const sorted = [...entries].sort((a, b) => a.tsEpoch - b.tsEpoch);

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const delta = b.tsEpoch - a.tsEpoch;
    if (delta <= windowSeconds) {
      pairs.push({ hash1: a.hash, hash2: b.hash, delta });
    }
  }
  return pairs;
}

/**
 * Signal deduplication — Poll News (split via FACTORY-APP-split-pollNews)
 *
 * Merges duplicate signals that share the same (actionCode, type) pair,
 * preventing N× news_mention spam for the same stock from escalating
 * severity in alertGenerator (which treats 3+ signals as CRITICAL).
 *
 * Split out of pollNews.ts (FACTORY-APP-split-pollNews, staged god-file
 * split). Internal helper — no external callers today, so it is imported
 * (not re-exported) by pollNews.ts.
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

/**
 * Merges duplicate signals that share the same (actionCode, type) pair.
 *
 * For each group:
 *   - Keeps the signal with the highest confidence
 *   - Updates the message to include a count and the top headlines
 *   - Caps severity: a single news_mention cannot exceed "medium" on its own
 *
 * This prevents 30 separate news_mention signals from escalating to CRITICAL
 * in alertGenerator (which treats 3+ signals as CRITICAL).
 */
export function deduplicateSignalsByStockAndType(
  signals: import("../../../domain/services/signalDetector.js").Signal[],
): import("../../../domain/services/signalDetector.js").Signal[] {
  // Group by (actionCode, type)
  const groups = new Map<string, typeof signals>();
  for (const sig of signals) {
    const key = `${sig.actionCode}::${sig.type}`;
    const group = groups.get(key);
    if (group) {
      group.push(sig);
    } else {
      groups.set(key, [sig]);
    }
  }

  // Merge each group into a single signal
  const merged: typeof signals = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0]!);
      continue;
    }

    // Sort by confidence descending — keep the best one as base
    group.sort((a, b) => b.confidence - a.confidence);
    const best = group[0]!;

    // Collect unique headlines (from the message field)
    const headlines = group
      .map((s) => s.message)
      .filter((m, i, arr) => arr.indexOf(m) === i)
      .slice(0, 3); // top 3 headlines

    const count = group.length;
    const headlineSummary = headlines.join(" | ");

    merged.push({
      ...best,
      message: `${best.actionCode} mentioned in ${count} articles — ${headlineSummary}`,
      // A batch of news_mention should stay at most "medium" as a single signal.
      // Escalation to high/critical should only happen when combined with
      // price_drop, volume_spike, or report_new signals.
      severity:
        best.type === "news_mention" && best.severity === "high"
          ? "medium"
          : best.severity,
    });
  }

  return merged;
}

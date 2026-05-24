/**
 * Dashboard rerun handler — edit-JSON-and-rerun (G7 + G8 proof)
 *
 * Loads results.json trace written by sandbox runner --output flag.
 * Re-renders dashboard cards on each page load.
 *
 * Usage:
 *   1. Run sandbox: bun run src/sandbox/runner.ts --tier=all --module=news-fetch
 *                    --scenario=all --output=apps/news-fetch/dashboard/results.json
 *   2. Open dashboard/index.html in browser (file:// URL)
 *   3. Edit a scenario JSON to corrupt expectedOutput → card turns RED
 *   4. Re-run sandbox → card turns GREEN
 *
 * This script is intentionally thin — it re-uses the applyTrace() function
 * defined inline in index.html via shared module pattern.
 * For standalone use, call loadTrace(path) and pass the result to applyTrace().
 */

/**
 * Load a trace JSON from a given path (same-directory results.json by default).
 * Returns the parsed trace object or null on failure.
 *
 * @param {string} [path='results.json'] - Path to results.json
 * @returns {object|null}
 */
function loadTrace(path = 'results.json') {
  try {
    const req = new XMLHttpRequest();
    req.open('GET', path, false); // synchronous — safe for file:// and small payloads
    req.send();
    if (req.status === 200 || req.status === 0) {
      return JSON.parse(req.responseText);
    }
    return null;
  } catch {
    return null;
  }
}

// Export for consumption by index.html inline script
if (typeof window !== 'undefined') {
  window.__newsFetchRerunHandler = { loadTrace };
}

/**
 * projectRoot — resolve the monorepo root regardless of CWD.
 *
 * FIX-MCP-BOOTSTRAP-BLOCKING-EXECSYNC-PROJECTROOT: previously shelled out to
 * `git rev-parse --show-toplevel` via a synchronous execSync child_process
 * call. That call sits on the MCP server bootstrap hot path (probed
 * synchronously by agentBootstrap.ts's buildToolNameMap() for every
 * registryFn, including registerAgentMemoryTools/registerAgentMemoryUpdateTools,
 * which call getProjectRoot() during registration) — it blocked the event
 * loop, added a runtime dependency on `git` being installed, and produced
 * the wrong root (or threw, pre-catch) in any deployed/container context
 * where the working directory is not a git checkout.
 *
 * Resolution is now purely synchronous filesystem walk-up from this module's
 * own on-disk location (`import.meta.dir`) — no child_process, no `git`
 * dependency. We walk up parent directories looking for a repo-root marker
 * (`pnpm-workspace.yaml` or `.git`, both only present at the true monorepo
 * root in a normal checkout) and return the first directory that has one.
 * This resolves to the identical absolute path `git rev-parse --show-toplevel`
 * would have returned in the normal checkout case.
 *
 * Falls back to process.cwd() when no marker is found within the walk (e.g.
 * a deployed/container context where docs/ and data/ are volume-mounted
 * directly under the working directory and there is no .git checkout) —
 * preserving the prior fallback behavior for that case.
 *
 * Memoized: computed once per process.
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

let _root: string | undefined;

const ROOT_MARKERS = ["pnpm-workspace.yaml", ".git"];

/**
 * Walk up from `startDir` looking for a directory containing one of
 * ROOT_MARKERS. Returns undefined if none is found before the filesystem root.
 */
function findRepoRoot(startDir: string): string | undefined {
  let dir = startDir;
  let parent = dirname(dir);
  while (parent !== dir) {
    if (ROOT_MARKERS.some((marker) => existsSync(resolve(dir, marker)))) {
      return dir;
    }
    dir = parent;
    parent = dirname(dir);
  }
  // dir is now the filesystem root ("/") — check it once too, then give up
  return ROOT_MARKERS.some((marker) => existsSync(resolve(dir, marker))) ? dir : undefined;
}

export function getProjectRoot(): string {
  if (_root) return _root;
  _root = findRepoRoot(import.meta.dir) ?? process.cwd();
  return _root;
}

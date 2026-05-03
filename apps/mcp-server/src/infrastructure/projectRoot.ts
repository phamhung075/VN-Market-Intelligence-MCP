/**
 * projectRoot — resolve the monorepo root regardless of CWD.
 *
 * Uses `git rev-parse --show-toplevel` so this works whether the server
 * is started from project root, from apps/mcp-server/, or from a test runner.
 * Falls back to process.cwd() in environments without git (e.g. Docker).
 */

import { execSync } from "child_process";

let _root: string | undefined;

export function getProjectRoot(): string {
  if (_root) return _root;
  try {
    _root = execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
  } catch {
    _root = process.cwd();
  }
  return _root;
}

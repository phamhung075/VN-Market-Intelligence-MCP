/**
 * vpsDebugSshTrigger — shared real-SSH executor for the 5 VPS debug-trigger tools
 * (FIX-VPS-SSH-TRIGGER-FAIL-LOUD, cron-audit item 2, 2026-07-22).
 *
 * ROOT CAUSE (RAW-verified against live source, not just the audit's own evidence):
 *   None of the 5 trigger_*_vps_fetch tools (price/news/sbv/bctc/foreign-flow) ever
 *   called sshExec() — or Bun.spawn, or any process launch — AT ALL. In "live" mode
 *   (dry_run=false) they only string-built a `ssh root@$VINAHOST_IP ...` command and
 *   appended it to log_tail with prose claiming "SSH trigger will be executed by
 *   server.ts" / "SSH execution is fire-and-forget" — text that was simply false: the
 *   HTTP route layer (routes/debugTriggerRoutes.ts) documented this explicitly at its
 *   own extraction: "The command is only ever appended to log_tail ... it is never
 *   executed by this process in either the pre- or post-extraction code." The
 *   `attempted`/`success`/`failed` arrays were hardcoded to `[]` in every handler,
 *   in EVERY mode, dry-run or live — this is why the audit's live probe saw a
 *   success-shaped empty-everything payload.
 *   Separately (but really this IS a genuine gap, not a permanent boundary): the
 *   bctcDebugTriggerHandler.ts docstring itself says "(future: will SSH-trigger
 *   run-bctc-debug.sh on VPS)" — confirming this was an unfinished feature, not a
 *   deliberate security choice. The VPS-side scripts already exist, are already
 *   tested (FIX-VPS-DEBUG-TRIGGERS.test.ts §7: existsSync + executable + correct
 *   --ticker/--verbose/--dry-run args), and VPS_HOST/VPS_SSH_USER/VPS_SSH_KEY_PATH
 *   are already configured with a real mounted key (docker-compose.yml) — the
 *   missing piece was purely "actually call sshExec()", plus an ssh client binary in
 *   the image (see Dockerfile; sshExec.ts's Bun.spawn(["ssh",...]) has no client to
 *   exec today — confirmed empty `find / -name ssh -type f` in the audit).
 *
 * FIX: this module is the ONE place that builds the remote command, sanitizes
 * ticker input (defense-in-depth — the remote `ssh user@host "<command>"` invocation
 * hands `command` to the VPS's default shell for interpretation; a raw ticker value
 * is not safe to concatenate into it un-validated), and calls the REAL sshExec()
 * (injectable for tests — NEVER spawns a real ssh process in `bun test`). It NEVER
 * returns a success-shaped outcome when nothing executed: `ok` is only true when
 * sshExec() actually returned exitCode 0.
 */

import { sshExec, type SshExecResult } from "../../infrastructure/vps/sshExec.js";

export type SshExecFn = (command: string, timeoutMs?: number) => Promise<SshExecResult>;

export interface VpsTriggerOutcome {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Present whenever ok=false — always populated, never a silent empty failure. */
  reason?: string;
}

// Vietnamese exchange tickers are 3 uppercase alnum chars in practice (FPT, VIC, ...)
// but indices/synthetic codes can run longer (VNINDEX, HNX30); allow up to 10 to match
// the existing zod `.max(10)` bound while rejecting anything that could break out of
// the intended `--ticker <value>` remote argument.
const TICKER_RE = /^[A-Z0-9]{1,10}$/;

/** Validates + uppercases a single ticker; returns null if it fails the allowlist charset check. */
export function sanitizeTicker(raw: string): string | null {
  const t = raw.trim().toUpperCase();
  return TICKER_RE.test(t) ? t : null;
}

export interface SanitizedTickers {
  valid: string[];
  invalid: string[];
}

/** Splits an optional ticker list into charset-valid / rejected buckets. */
export function sanitizeTickers(tickers: string[] | undefined): SanitizedTickers {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const raw of tickers ?? []) {
    const s = sanitizeTicker(raw);
    if (s) valid.push(s);
    else invalid.push(raw);
  }
  return { valid, invalid };
}

/** Builds the remote command string executed on the VPS via sshExec(). */
export function buildVpsDebugCommand(script: string, tickers: string[], verbose: boolean): string {
  const parts = [`/root/${script}`];
  for (const t of tickers) parts.push("--ticker", t);
  if (verbose) parts.push("--verbose");
  return parts.join(" ");
}

/**
 * Runs a VPS debug-trigger script over real SSH. `sshExecFn` is injectable so
 * tests never spawn a real ssh process (default = the real infrastructure sshExec).
 *
 * Contract: `ok` is true ONLY when sshExecFn resolves with exitCode===0. Any
 * thrown error (e.g. VPS_HOST not configured, ssh binary missing — ENOENT,
 * network failure) or non-zero exit is captured into `reason` and `ok=false` —
 * this function can never silently look like a no-op success.
 */
export async function triggerVpsDebugScript(
  script: string,
  tickers: string[],
  verbose: boolean,
  sshExecFn: SshExecFn = sshExec,
): Promise<VpsTriggerOutcome> {
  const command = buildVpsDebugCommand(script, tickers, verbose);
  try {
    const result = await sshExecFn(command);
    if (result.exitCode === 0) {
      return { ok: true, command, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
    }
    return {
      ok: false,
      command,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      reason: result.stderr.trim() || `ssh exited ${result.exitCode}`,
    };
  } catch (err) {
    return {
      ok: false,
      command,
      stdout: "",
      stderr: "",
      exitCode: -1,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

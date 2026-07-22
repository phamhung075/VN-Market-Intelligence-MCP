/**
 * sshExec — low-level SSH executor for VPS commands.
 *
 * Reads VPS_HOST and VPS_SSH_USER from Bun.env (never process.env).
 * Uses Bun.spawn with an explicit args array — NO shell string interpolation.
 * SSH flags: BatchMode=yes, ConnectTimeout=10, StrictHostKeyChecking=accept-new.
 * Optional identity file via VPS_SSH_KEY_PATH (default /run/secrets/vps_ssh_key).
 * Timeout: 15 000 ms — resolves with exitCode: 124 and stderr: "SSH timeout".
 *
 * Called by handler layer (1779b) which enforces an allowlist before reaching here.
 */

export interface SshExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_KEY_PATH = "/run/secrets/vps_ssh_key";

/**
 * Builds the ssh CLI args array. Exported for unit testing (asserts shape
 * without a real spawn).
 *
 * FIX-VPS-SSH-TRIGGER-FAIL-LOUD (2026-07-22): StrictHostKeyChecking was
 * previously `yes`, which REFUSES every connection from a container with no
 * pre-seeded known_hosts — confirmed live: `/root/.ssh/known_hosts` does not
 * exist in the running container, so this parameter combination could never
 * have succeeded for ANY caller (including `restart_vps_service`) since
 * inception; adding an ssh client alone would not have been sufficient.
 * `accept-new` performs trust-on-first-use (auto-accepts + caches an unseen
 * host key) while STILL rejecting a CHANGED key on any later connection — the
 * real MITM protection StrictHostKeyChecking provides is preserved; only the
 * "never seen this host before" case is no longer a hard failure. Appropriate
 * here: VPS_HOST is a single, stable, operator-controlled Vinahost VPS (not a
 * public multi-tenant target where TOFU risk would be a concern).
 */
export function buildSshArgs(command: string, target: string, keyPath: string): string[] {
  return [
    "ssh",
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=10",
    "-o", "StrictHostKeyChecking=accept-new",
    "-i", keyPath,
    target,
    command,
  ];
}

export async function sshExec(
  command: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<SshExecResult> {
  const host = Bun.env["VPS_HOST"];
  const user = Bun.env["VPS_SSH_USER"];

  if (!host) throw new Error("VPS_HOST not configured");
  if (!user) throw new Error("VPS_SSH_USER not configured");

  const keyPath = Bun.env["VPS_SSH_KEY_PATH"] ?? DEFAULT_KEY_PATH;
  const target = `${user}@${host}`;

  const args = buildSshArgs(command, target, keyPath);

  const startMs = Date.now();

  const proc = Bun.spawn(args, {
    stdin: null,
    stdout: "pipe",
    stderr: "pipe",
  });

  const timeoutResult: Promise<SshExecResult> = new Promise((resolve) => {
    setTimeout(() => {
      proc.kill();
      resolve({
        exitCode: 124,
        stdout: "",
        stderr: "SSH timeout",
        durationMs: Date.now() - startMs,
      });
    }, timeoutMs);
  });

  const execResult: Promise<SshExecResult> = (async () => {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return {
      exitCode,
      stdout,
      stderr,
      durationMs: Date.now() - startMs,
    };
  })();

  return Promise.race([execResult, timeoutResult]);
}

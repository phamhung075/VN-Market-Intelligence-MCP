/**
 * sshExec — low-level SSH executor for VPS commands.
 *
 * Reads VPS_HOST and VPS_SSH_USER from Bun.env (never process.env).
 * Uses Bun.spawn with an explicit args array — NO shell string interpolation.
 * SSH flags: BatchMode=yes, ConnectTimeout=10, StrictHostKeyChecking=yes.
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

  const args: string[] = [
    "ssh",
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=10",
    "-o", "StrictHostKeyChecking=yes",
    "-i", keyPath,
    target,
    command,
  ];

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

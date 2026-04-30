/**
 * vpsServiceRestartHandler — three-layer allowlist gate for VPS service restarts.
 *
 * Layer 1 — input validation: input must be { service: string }
 * Layer 2 — service allowlist: only price-fetcher, foreign-flow-fetcher, bctc-fetcher
 * Layer 3 — systemctl allowlist: command is always the literal template
 *            `systemctl restart <allowlisted-service>` — never user-supplied string
 *
 * Called by vpsServiceRestartTool (interface layer). Calls sshExec (infrastructure).
 * DDD exception documented in TASK_1779b.md: thin pass-through with no business logic.
 *
 * @module interface/mcp/vpsServiceRestartHandler
 */

import { sshExec } from "../../infrastructure/vps/sshExec.js";

export interface McpToolResult {
  success?: boolean;
  service?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

// Layer 2 allowlist — only these services may be restarted via SSH
const ALLOWED_SERVICES = new Set([
  "price-fetcher",
  "foreign-flow-fetcher",
  "bctc-fetcher",
] as const);

export type AllowedService = "price-fetcher" | "foreign-flow-fetcher" | "bctc-fetcher";

/**
 * Handler for restarting a named VPS service via SSH.
 *
 * @param input - Raw MCP tool input, expected shape: { service: string }
 * @returns McpToolResult with success/failure details
 */
export async function vpsServiceRestartHandler(
  input: unknown,
): Promise<McpToolResult> {
  // --- Layer 1: input validation ---
  if (
    typeof input !== "object" ||
    input === null ||
    !("service" in input) ||
    typeof (input as Record<string, unknown>)["service"] !== "string"
  ) {
    return { error: "invalid input" };
  }

  const service = (input as Record<string, unknown>)["service"] as string;

  // --- Layer 2: service allowlist ---
  if (!ALLOWED_SERVICES.has(service as AllowedService)) {
    return { error: `service not allowed: ${service}` };
  }

  const allowedService = service as AllowedService;

  // --- Layer 3: systemctl allowlist — literal template, no user string interpolation ---
  const command = `systemctl restart ${allowedService}`;

  try {
    const result = await sshExec(command);

    if (result.exitCode === 0) {
      return {
        success: true,
        service: allowedService,
        stdout: result.stdout,
      };
    }

    return {
      success: false,
      service: allowedService,
      exitCode: result.exitCode,
      stderr: result.stderr,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

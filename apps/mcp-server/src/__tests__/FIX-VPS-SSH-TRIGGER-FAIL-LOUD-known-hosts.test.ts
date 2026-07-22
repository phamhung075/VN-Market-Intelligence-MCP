/**
 * FIX-VPS-SSH-TRIGGER-FAIL-LOUD — sshExec.ts known_hosts fix
 *
 * Root cause (RAW-verified against the live container): sshExec.ts previously
 * passed `-o StrictHostKeyChecking=yes`, which REFUSES every connection when
 * no host key is already trusted — `/root/.ssh/known_hosts` does not exist in
 * the running container (confirmed via docker exec). Combined with
 * `BatchMode=yes` (no interactive prompt fallback), this parameter combination
 * could never have succeeded for ANY caller of sshExec — including the
 * already-shipped `restart_vps_service` tool — since inception, independent
 * of whether an ssh client binary is even present.
 *
 * ACs:
 *   AC-1: buildSshArgs uses StrictHostKeyChecking=accept-new (not yes)
 *   AC-2: buildSshArgs still sets BatchMode=yes and ConnectTimeout=10
 *   AC-3: buildSshArgs threads the identity file, target, and command through unchanged
 *   AC-4: sshExec() throws a clear error (not a hang) when VPS_HOST/VPS_SSH_USER
 *         are unset — proves the "fail loud, never silently no-op" contract at
 *         the lowest infrastructure layer too
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { buildSshArgs, sshExec } from "../infrastructure/vps/sshExec.js";

describe("FIX-VPS-SSH-TRIGGER-FAIL-LOUD — buildSshArgs", () => {
  it("AC-1: uses StrictHostKeyChecking=accept-new, not yes", () => {
    const args = buildSshArgs("echo hi", "root@1.2.3.4", "/run/secrets/vps_ssh_key");
    expect(args).toContain("StrictHostKeyChecking=accept-new");
    expect(args).not.toContain("StrictHostKeyChecking=yes");
  });

  it("AC-2: still sets BatchMode=yes and ConnectTimeout=10", () => {
    const args = buildSshArgs("echo hi", "root@1.2.3.4", "/run/secrets/vps_ssh_key");
    expect(args).toContain("BatchMode=yes");
    expect(args).toContain("ConnectTimeout=10");
  });

  it("AC-3: threads identity file, target, and command through unchanged", () => {
    const args = buildSshArgs("systemctl restart price-fetcher", "root@125.212.251.27", "/run/secrets/vps_ssh_key");
    expect(args).toEqual([
      "ssh",
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=10",
      "-o", "StrictHostKeyChecking=accept-new",
      "-i", "/run/secrets/vps_ssh_key",
      "root@125.212.251.27",
      "systemctl restart price-fetcher",
    ]);
  });
});

describe("FIX-VPS-SSH-TRIGGER-FAIL-LOUD — sshExec fail-loud contract", () => {
  const savedHost = Bun.env["VPS_HOST"];
  const savedUser = Bun.env["VPS_SSH_USER"];

  beforeEach(() => {
    delete Bun.env["VPS_HOST"];
    delete Bun.env["VPS_SSH_USER"];
  });

  afterEach(() => {
    if (savedHost !== undefined) Bun.env["VPS_HOST"] = savedHost; else delete Bun.env["VPS_HOST"];
    if (savedUser !== undefined) Bun.env["VPS_SSH_USER"] = savedUser; else delete Bun.env["VPS_SSH_USER"];
  });

  it("AC-4a: throws immediately when VPS_HOST is unset (no hang, no silent no-op)", async () => {
    Bun.env["VPS_SSH_USER"] = "root";
    await expect(sshExec("echo hi")).rejects.toThrow("VPS_HOST not configured");
  });

  it("AC-4b: throws immediately when VPS_SSH_USER is unset", async () => {
    Bun.env["VPS_HOST"] = "125.212.251.27";
    await expect(sshExec("echo hi")).rejects.toThrow("VPS_SSH_USER not configured");
  });
});

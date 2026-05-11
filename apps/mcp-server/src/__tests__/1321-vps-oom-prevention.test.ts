import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("1321: VPS OOM prevention — systemd unit configuration", () => {
  const unitPath = resolve(__dirname, "../../vps-scripts/vn-news-fetch.service");
  const unitContent = readFileSync(unitPath, "utf-8");

  it("RED: MemoryMax=512M present (increased from 128M for Chromium peak)", () => {
    expect(unitContent).toContain("MemoryMax=512M");
  });

  it("RED: MemorySwapMax=0 present (no swap, fail-fast on memory pressure)", () => {
    expect(unitContent).toContain("MemorySwapMax=0");
  });

  it("RED: StartLimitIntervalSec=0 in [Unit] (disables restart limit entirely — Sprint 1822b)", () => {
    expect(unitContent).toContain("StartLimitIntervalSec=0");
  });

  it("GREEN: No StartLimitBurst directive (removed — unlimited restarts via StartLimitIntervalSec=0)", () => {
    expect(unitContent).not.toContain("StartLimitBurst=");
  });

  it("GREEN: RestartSec=10 unchanged (10s between restart attempts)", () => {
    expect(unitContent).toContain("RestartSec=10");
  });

  it("GREEN: Restart=always unchanged (service restarts on crash)", () => {
    expect(unitContent).toContain("Restart=always");
  });

  it("GREEN: ExecStart=/root/fetch-vn-news-loop.sh unchanged", () => {
    expect(unitContent).toContain("ExecStart=/root/fetch-vn-news-loop.sh");
  });

  it("GREEN: StartLimitIntervalSec=0 is in [Unit] section (before [Service])", () => {
    const unitSectionIdx = unitContent.indexOf("[Unit]");
    const serviceSectionIdx = unitContent.indexOf("[Service]");
    const startLimitIdx = unitContent.indexOf("StartLimitIntervalSec=");

    // StartLimitIntervalSec must appear after [Unit] and before [Service]
    expect(startLimitIdx).toBeGreaterThan(unitSectionIdx);
    expect(startLimitIdx).toBeLessThan(serviceSectionIdx);
  });

  it("GREEN: Order within [Service] — Restart before MemoryMax before StandardOutput", () => {
    const restartIdx = unitContent.indexOf("Restart=");
    const memoryIdx = unitContent.indexOf("MemoryMax=");
    const stdoutIdx = unitContent.indexOf("StandardOutput=");

    expect(restartIdx).toBeLessThan(memoryIdx);
    expect(memoryIdx).toBeLessThan(stdoutIdx);
  });
});

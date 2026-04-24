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

  it("RED: StartLimitIntervalSec=300 present (5-min restart window)", () => {
    expect(unitContent).toContain("StartLimitIntervalSec=300");
  });

  it("RED: StartLimitBurst=5 present (max 5 restarts in 5-min window)", () => {
    expect(unitContent).toContain("StartLimitBurst=5");
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

  it("GREEN: Order of settings matches systemd convention (Restart before limits, limits before logging)", () => {
    const restartIdx = unitContent.indexOf("Restart=");
    const startLimitIdx = unitContent.indexOf("StartLimitIntervalSec=");
    const memoryIdx = unitContent.indexOf("MemoryMax=");
    const stdoutIdx = unitContent.indexOf("StandardOutput=");

    expect(restartIdx).toBeLessThan(startLimitIdx);
    expect(startLimitIdx).toBeLessThan(memoryIdx);
    expect(memoryIdx).toBeLessThan(stdoutIdx);
  });
});

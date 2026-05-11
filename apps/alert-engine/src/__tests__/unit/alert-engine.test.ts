/**
 * Alert Engine — Unit Tests (mock all ports)
 *
 * Tests domain services and use case with mocked repositories.
 */

import { describe, it, expect, mock } from 'bun:test';
import {
  computeFingerprint,
  shouldSuppressAlert,
  isDuplicate,
} from '../../domain/services.js';
import { EvaluateAlertUseCase } from '../../application/usecases.js';
import type { AlertRepositoryPort, MutePort, TelegramPort } from '../../domain/repositories.js';
import type { StoredAlert } from '../../domain/models.js';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeAlertRepo(overrides?: Partial<AlertRepositoryPort>): AlertRepositoryPort {
  return {
    getRecentAlerts: mock(() => [] as StoredAlert[]),
    countTodayAlerts: mock(() => 0),
    storeAlert: mock(() => 1),
    hasDuplicateFingerprint: mock(() => false),
    ...overrides,
  };
}

function makeMutePort(muted = false): MutePort {
  return { isStockMuted: mock(() => muted) };
}

function makeTelegram(): TelegramPort {
  return { send: mock(async () => true) };
}

function makeStoredAlert(partial?: Partial<StoredAlert>): StoredAlert {
  return {
    id: 1,
    stocks: 'VCB',
    signalTypes: 'price_surge',
    message: 'test',
    fingerprint: 'abc123',
    severity: 'medium',
    triggeredAt: new Date().toISOString(),
    sentToTelegram: 0,
    ...partial,
  };
}

// ── Domain: computeFingerprint ────────────────────────────────────────────────

describe('computeFingerprint', () => {
  it('returns deterministic hex string', () => {
    const fp1 = computeFingerprint({ stock: 'VCB', signalTypes: ['price_surge'], message: 'test' });
    const fp2 = computeFingerprint({ stock: 'VCB', signalTypes: ['price_surge'], message: 'test' });
    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is order-independent for signalTypes', () => {
    const fp1 = computeFingerprint({ stock: 'VCB', signalTypes: ['a', 'b'], message: 'x' });
    const fp2 = computeFingerprint({ stock: 'VCB', signalTypes: ['b', 'a'], message: 'x' });
    expect(fp1).toBe(fp2);
  });

  it('differs for different stocks', () => {
    const fp1 = computeFingerprint({ stock: 'VCB', message: 'test' });
    const fp2 = computeFingerprint({ stock: 'TCB', message: 'test' });
    expect(fp1).not.toBe(fp2);
  });
});

// ── Domain: shouldSuppressAlert ───────────────────────────────────────────────

describe('shouldSuppressAlert', () => {
  it('does not suppress first alert for a stock', () => {
    const result = shouldSuppressAlert(
      { stock: 'VCB', severity: 'high', message: 'test' },
      [],
    );
    expect(result.suppress).toBe(false);
  });

  it('suppresses when same signal type within cooldown window', () => {
    const recent = makeStoredAlert({
      stocks: 'VCB',
      signalTypes: 'price_surge',
      triggeredAt: new Date(Date.now() - 10 * 60_000).toISOString(), // 10min ago
    });
    const result = shouldSuppressAlert(
      { stock: 'VCB', severity: 'medium', message: 'test', signalTypes: ['price_surge'] },
      [recent],
      { cooldownMinutes: 30, maxAlertsPerStockPerDay: 3 },
    );
    expect(result.suppress).toBe(true);
    expect(result.reason).toContain('cooldown');
  });

  it('does not suppress critical alerts (non-MACRO)', () => {
    const recent = makeStoredAlert({
      triggeredAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    });
    const result = shouldSuppressAlert(
      { stock: 'VCB', severity: 'critical', message: 'stop loss hit', signalTypes: ['stop_loss'] },
      [recent],
    );
    expect(result.suppress).toBe(false);
  });

  it('suppresses critical MACRO alerts (sustained condition)', () => {
    const recent = makeStoredAlert({
      stocks: 'VCB',
      signalTypes: 'MACRO',
      triggeredAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    });
    const result = shouldSuppressAlert(
      { stock: 'VCB', severity: 'critical', message: 'macro alert', signalTypes: ['MACRO'], actionCode: 'MACRO' },
      [recent],
      { cooldownMinutes: 30, maxAlertsPerStockPerDay: 5 },
    );
    expect(result.suppress).toBe(true);
  });

  it('suppresses when daily cap reached', () => {
    const alerts = Array.from({ length: 3 }, (_, i) =>
      makeStoredAlert({
        triggeredAt: new Date(Date.now() - i * 60_000).toISOString(),
        signalTypes: 'other_signal',
      }),
    );
    const result = shouldSuppressAlert(
      { stock: 'VCB', severity: 'medium', message: 'test', signalTypes: ['new_signal'] },
      alerts,
      { cooldownMinutes: 5, maxAlertsPerStockPerDay: 3 },
    );
    expect(result.suppress).toBe(true);
    expect(result.reason).toContain('daily cap');
  });
});

// ── Domain: isDuplicate ───────────────────────────────────────────────────────

describe('isDuplicate', () => {
  it('returns false for empty recent list', () => {
    expect(isDuplicate('abc123', [])).toBe(false);
  });

  it('returns true when fingerprint is in recent list', () => {
    expect(isDuplicate('abc123', ['xyz', 'abc123', 'def'])).toBe(true);
  });
});

// ── Application: EvaluateAlertUseCase ────────────────────────────────────────

describe('EvaluateAlertUseCase', () => {
  it('fires and stores alert when no suppression', async () => {
    const repo = makeAlertRepo();
    const telegram = makeTelegram();
    const uc = new EvaluateAlertUseCase(repo, makeMutePort(), telegram);

    const result = await uc.execute({
      stock: 'VCB',
      severity: 'high',
      message: 'Price surge detected',
      sendTelegram: true,
    });

    expect(result.fired).toBe(true);
    expect(result.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(repo.storeAlert).toHaveBeenCalledTimes(1);
  });

  it('does not fire when stock is muted', async () => {
    const uc = new EvaluateAlertUseCase(makeAlertRepo(), makeMutePort(true), makeTelegram());
    const result = await uc.execute({
      stock: 'VCB',
      severity: 'high',
      message: 'test',
    });
    expect(result.fired).toBe(false);
    expect(result.reason).toContain('muted');
  });

  it('does not fire when fingerprint is duplicate', async () => {
    const fp = computeFingerprint({ stock: 'VCB', message: 'test' });
    const repo = makeAlertRepo({
      getRecentAlerts: mock(() => [makeStoredAlert({ fingerprint: fp })]),
    });
    const uc = new EvaluateAlertUseCase(repo, makeMutePort(), makeTelegram());
    const result = await uc.execute({ stock: 'VCB', severity: 'high', message: 'test' });
    expect(result.fired).toBe(false);
    expect(result.reason).toContain('duplicate');
  });
});

/**
 * Barrel — vnstock runtime (FACTORY-INFRA-split-vnstockBridge)
 *
 * Re-exports the runtime helpers so they stay importable from one place
 * regardless of which internal file they live in. vnstockBridge.ts re-exports
 * the tested subset (stripAnsiAndDetectJunk, isRateLimitResponse,
 * calcBackoffMs, VnstockRateLimiter, GLOBAL_RATE_LIMIT_RPM, SUPPRESS_BANNER,
 * RESTORE_STDOUT) from here for existing test import paths.
 *
 * Layer: infrastructure/fetchers
 */
export * from "./runtime.js";

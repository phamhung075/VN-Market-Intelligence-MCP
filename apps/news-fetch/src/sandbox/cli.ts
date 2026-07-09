/**
 * news-fetch Sandbox — CLI parsing + env-gate
 *
 * CLI flag parsing (--tier, --module, --scenario, --output) and the
 * credential env-audit gate (AC-6) that must run clean before any
 * scenario executes. Split out of runner.ts (FACTORY-NEWS-split-sandbox).
 */

export interface CliArgs {
  tier: string;
  module_: string;
  scenarioArg: string;
  outputFlag: string | null;
}

function getFlag(flag: string): string | null {
  const prefix = `--${flag}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

export function parseCliArgs(): CliArgs {
  return {
    tier: getFlag('tier') ?? 'all',
    module_: getFlag('module') ?? 'news-fetch',
    scenarioArg: getFlag('scenario') ?? 'all',
    outputFlag: getFlag('output') ?? null,
  };
}

// Match credential-style env var names.
// Excludes CTX_ADVISOR_* (context metrics, not credentials).
// Targets: DB_ prefix, API_KEY suffix, _SECRET suffix, _TOKEN suffix (credential bearer tokens),
//          _PASSWORD suffix, NEWS_API_KEY, PLAYWRIGHT, BROWSER_ (infra deps that should not leak in).
const CREDENTIAL_PATTERN =
  /^(DB_|NEWS_API_KEY|PLAYWRIGHT|BROWSER_)|_(API_KEY|SECRET|TOKEN|PASSWORD)$/i;

export function runEnvAuditGate(): void {
  const leakedKeys = Object.keys(Bun.env).filter(
    (k) => !k.startsWith('CTX_ADVISOR_') && CREDENTIAL_PATTERN.test(k),
  );
  if (leakedKeys.length > 0) {
    console.error(
      `[sandbox] SECURITY VIOLATION: credentials detected in env: ${leakedKeys.join(', ')}`,
    );
    process.exit(2);
  }
}

/**
 * Alert Engine — Domain Errors
 */

export class AlertEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlertEngineError';
  }
}

export class AlertSuppressedError extends AlertEngineError {
  constructor(public readonly reason: string) {
    super(`Alert suppressed: ${reason}`);
    this.name = 'AlertSuppressedError';
  }
}

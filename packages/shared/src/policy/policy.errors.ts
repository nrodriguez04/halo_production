export class PolicyViolationError extends Error {
  code: string;
  reason: string;
  ctxSummary: Record<string, any>;

  constructor(
    code: string,
    reason: string,
    ctxSummary: Record<string, any> = {},
  ) {
    super(reason);
    this.name = 'PolicyViolationError';
    this.code = code;
    this.reason = reason;
    this.ctxSummary = ctxSummary;
  }
}

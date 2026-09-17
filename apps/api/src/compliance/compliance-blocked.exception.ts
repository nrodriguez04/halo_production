import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Raised when a message is suppressed by DNC, missing consent or quiet hours
 * at send time.
 *
 * Distinct from a delivery failure on purpose: the worker must not retry it
 * (the contact is still on the DNC list a minute later), and it must not be
 * reported as a provider error. 403 with a machine-readable `reason` lets the
 * caller record exactly which rule fired.
 */
export class ComplianceBlockedException extends HttpException {
  constructor(
    readonly reason: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        error: 'Compliance',
        code: 'COMPLIANCE_BLOCKED',
        reason,
        message,
        ...details,
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

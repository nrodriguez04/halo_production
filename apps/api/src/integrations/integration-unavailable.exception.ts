import { HttpException, HttpStatus } from '@nestjs/common';

export type IntegrationUnavailableReason =
  /** Credentials for the provider are absent or blank. */
  | 'NOT_CONFIGURED'
  /** Turned off deliberately via the control plane. */
  | 'DISABLED'
  /** The provider rejected our credentials (expired / revoked / wrong key). */
  | 'REJECTED_CREDENTIALS'
  /** The provider is unreachable or returned a server error. */
  | 'UPSTREAM_ERROR';

/**
 * A provider could not be called for an operational reason.
 *
 * These used to surface as bare `Error`s, which Nest renders as
 * `500 Internal server error` - indistinguishable from a genuine bug. A
 * missing API key, a deliberately disabled integration and a provider outage
 * are all expected states, and an operator needs to tell them apart from a
 * crash without reading server logs.
 *
 * 503 with a machine-readable `reason` and the provider named.
 */
export class IntegrationUnavailableException extends HttpException {
  constructor(
    readonly provider: string,
    readonly reason: IntegrationUnavailableReason,
    details?: string,
  ) {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Integration unavailable',
        code: 'INTEGRATION_UNAVAILABLE',
        provider,
        reason,
        message: describe(provider, reason, details),
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  /** Missing or blank credentials. */
  static notConfigured(provider: string, envVar: string) {
    return new IntegrationUnavailableException(
      provider,
      'NOT_CONFIGURED',
      envVar,
    );
  }

  /** Switched off via the control plane. */
  static disabled(provider: string) {
    return new IntegrationUnavailableException(provider, 'DISABLED');
  }
}

function describe(
  provider: string,
  reason: IntegrationUnavailableReason,
  details?: string,
): string {
  switch (reason) {
    case 'NOT_CONFIGURED':
      return `"${provider}" is not configured${
        details ? ` - set ${details}` : ''
      }.`;
    case 'DISABLED':
      return `"${provider}" is disabled by the control plane.`;
    case 'REJECTED_CREDENTIALS':
      return `"${provider}" rejected the configured credentials${
        details ? ` (${details})` : ''
      }. The key may be expired or revoked.`;
    case 'UPSTREAM_ERROR':
      return `"${provider}" is unavailable${details ? ` (${details})` : ''}.`;
  }
}

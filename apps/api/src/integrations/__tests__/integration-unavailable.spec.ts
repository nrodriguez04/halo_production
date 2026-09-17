import { HttpStatus } from '@nestjs/common';
import { IntegrationUnavailableException } from '../integration-unavailable.exception';

describe('IntegrationUnavailableException', () => {
  // These states used to surface as bare Errors -> HTTP 500, which an
  // operator could not tell apart from a crash.
  it('is a 503, not a 500', () => {
    const err = IntegrationUnavailableException.notConfigured('attom', 'ATTOM_API_KEY');
    expect(err.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it('names the provider and the env var for a missing key', () => {
    const body: any = IntegrationUnavailableException.notConfigured(
      'openai',
      'OPENAI_API_KEY',
    ).getResponse();

    expect(body.code).toBe('INTEGRATION_UNAVAILABLE');
    expect(body.reason).toBe('NOT_CONFIGURED');
    expect(body.provider).toBe('openai');
    expect(body.message).toContain('OPENAI_API_KEY');
  });

  it('distinguishes a deliberate disable from a missing key', () => {
    const disabled: any = IntegrationUnavailableException.disabled('attom').getResponse();
    expect(disabled.reason).toBe('DISABLED');
    expect(disabled.message).toContain('control plane');
  });

  it('distinguishes rejected credentials from an absent key', () => {
    const rejected: any = new IntegrationUnavailableException(
      'attom',
      'REJECTED_CREDENTIALS',
      'HTTP 401',
    ).getResponse();

    expect(rejected.reason).toBe('REJECTED_CREDENTIALS');
    // The actionable difference: the key exists but is not accepted.
    expect(rejected.message).toMatch(/expired or revoked/);
    expect(rejected.message).toContain('HTTP 401');
  });

  it('reports an upstream outage', () => {
    const body: any = new IntegrationUnavailableException(
      'docusign',
      'UPSTREAM_ERROR',
      'HTTP 502',
    ).getResponse();
    expect(body.reason).toBe('UPSTREAM_ERROR');
    expect(body.provider).toBe('docusign');
  });
});

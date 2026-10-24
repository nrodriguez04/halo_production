import { secondsLeft } from '../api-fetch';

/** A SYNTHETIC unsigned JWT with the given payload. */
function jwt(payload: object): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64(payload)}.sig`;
}

describe('secondsLeft', () => {
  const now = Date.UTC(2026, 9, 24, 12, 0, 0);

  it('reads the time left before a session token expires', () => {
    expect(secondsLeft(jwt({ exp: now / 1000 + 600 }), now)).toBe(600);
    expect(secondsLeft(jwt({ exp: now / 1000 - 5 }), now)).toBe(-5);
  });

  it('says nothing about a token it cannot read', () => {
    expect(secondsLeft('not-a-jwt', now)).toBeNull();
    expect(secondsLeft(jwt({ sub: 'U1' }), now)).toBeNull();
  });
});

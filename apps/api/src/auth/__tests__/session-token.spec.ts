import type { Request } from 'express';
import { readCookie, sessionTokenFrom } from '../session-token';

const ORIGINS = ['https://app.example.com'];

function req(over: {
  method?: string;
  authorization?: string;
  cookie?: string;
  origin?: string;
  referer?: string;
}): Request {
  const headers: Record<string, string> = {};
  if (over.authorization) headers.authorization = over.authorization;
  if (over.cookie) headers.cookie = over.cookie;
  if (over.origin) headers.origin = over.origin;
  if (over.referer) headers.referer = over.referer;
  return { method: over.method ?? 'GET', headers } as unknown as Request;
}

describe('readCookie', () => {
  it('finds one cookie among several and decodes it', () => {
    expect(readCookie('a=1; DS=tok%2Ben; DSR=r', 'DS')).toBe('tok+en');
    expect(readCookie('DSR=r', 'DS')).toBeNull();
    expect(readCookie(undefined, 'DS')).toBeNull();
    expect(readCookie('DS=', 'DS')).toBeNull();
  });
});

describe('sessionTokenFrom', () => {
  it('prefers the bearer header', () => {
    expect(
      sessionTokenFrom(
        req({ authorization: 'Bearer h', cookie: 'DS=c' }),
        ORIGINS,
      ),
    ).toEqual({ token: 'h', via: 'header' });
  });

  it('takes the Descope session cookie on reads from anywhere', () => {
    expect(sessionTokenFrom(req({ cookie: 'DS=c' }), ORIGINS)).toEqual({
      token: 'c',
      via: 'cookie',
    });
  });

  it('takes the cookie on writes only from an allowed origin', () => {
    expect(
      sessionTokenFrom(
        req({
          method: 'POST',
          cookie: 'DS=c',
          origin: 'https://app.example.com',
        }),
        ORIGINS,
      ),
    ).toEqual({ token: 'c', via: 'cookie' });
    expect(
      sessionTokenFrom(
        req({
          method: 'DELETE',
          cookie: 'DS=c',
          referer: 'https://app.example.com/deals/1',
        }),
        ORIGINS,
      ),
    ).toEqual({ token: 'c', via: 'cookie' });

    for (const other of [
      { origin: 'https://evil.example.net' },
      { origin: 'null' },
      { referer: 'https://evil.example.net/x' },
      {},
    ]) {
      const out = sessionTokenFrom(
        req({ method: 'POST', cookie: 'DS=c', ...other }),
        ORIGINS,
      );
      expect(out.token).toBeNull();
    }
  });

  it('says what is missing', () => {
    expect(sessionTokenFrom(req({}), ORIGINS)).toEqual({
      token: null,
      reason: 'Missing session token',
    });
    expect(
      sessionTokenFrom(req({ authorization: 'Bearer ' }), ORIGINS).token,
    ).toBeNull();
  });

  it('reads another cookie name when Descope is configured with one', () => {
    process.env.DESCOPE_SESSION_COOKIE = 'HALO_DS';
    try {
      expect(
        sessionTokenFrom(req({ cookie: 'DS=a; HALO_DS=b' }), ORIGINS),
      ).toEqual({
        token: 'b',
        via: 'cookie',
      });
    } finally {
      delete process.env.DESCOPE_SESSION_COOKIE;
    }
  });
});

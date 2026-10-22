import * as crypto from 'crypto';
import { TwilioController } from '../twilio.controller';
import { twiml } from '../keyword-replies';

describe('TwilioController inbound', () => {
  const env = { ...process.env };
  // The real store reads its own table first, then env.
  const secrets = {
    resolve: jest.fn(
      async (_p: string, key: string) => process.env[key] ?? null,
    ),
  };
  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
  });
  afterAll(() => {
    process.env = env;
  });

  // A request Twilio signed: HMAC-SHA1 over the URL plus sorted params.
  const signedRequest = (body: Record<string, string>) => {
    const url = 'https://api.example/api/webhooks/twilio/inbound';
    const data =
      url +
      Object.keys(body)
        .sort()
        .reduce((acc, k) => acc + k + body[k], '');
    const signature = crypto
      .createHmac('sha1', 'test-auth-token')
      .update(Buffer.from(data, 'utf-8'))
      .digest('base64');
    const req = {
      protocol: 'https',
      get: () => 'api.example',
      originalUrl: '/api/webhooks/twilio/inbound',
      body,
    } as any;
    return { req, signature };
  };

  it('answers a STOP with the confirmation as TwiML', async () => {
    const service = {
      handleInbound: jest.fn().mockResolvedValue({
        handled: 'opt_out',
        reply: 'Halo: You have been unsubscribed.',
      }),
    };
    const controller = new TwilioController(service as any, secrets as any);
    const body = { From: '+15551234567', To: '+15550000000', Body: 'STOP' };
    const { req, signature } = signedRequest(body);

    const out = await controller.handleInbound(body, signature, req);

    expect(out).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Halo: You have been unsubscribed.</Message></Response>',
    );
  });

  it('answers an ordinary reply with an empty response', async () => {
    const service = {
      handleInbound: jest
        .fn()
        .mockResolvedValue({ handled: 'message', reply: null }),
    };
    const controller = new TwilioController(service as any, secrets as any);
    const body = { From: '+15551234567', To: '+15550000000', Body: 'hi' };
    const { req, signature } = signedRequest(body);

    expect(await controller.handleInbound(body, signature, req)).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    );
  });

  it('escapes reply text into valid XML', () => {
    expect(twiml(`Tom & Jerry's <help>`)).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Tom &amp; Jerry&apos;s &lt;help&gt;</Message></Response>',
    );
  });

  it('verifies with a token saved on the Integrations page, not only env', async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    const stored = { resolve: jest.fn().mockResolvedValue('test-auth-token') };
    const service = {
      handleInbound: jest
        .fn()
        .mockResolvedValue({ handled: 'message', reply: null }),
    };
    const controller = new TwilioController(service as any, stored as any);
    const body = { From: '+15551234567', To: '+15550000000', Body: 'hi' };
    const { req, signature } = signedRequest(body);
    await expect(
      controller.handleInbound(body, signature, req),
    ).resolves.toContain('<Response');
    expect(stored.resolve).toHaveBeenCalledWith('twilio', 'TWILIO_AUTH_TOKEN');
  });
});

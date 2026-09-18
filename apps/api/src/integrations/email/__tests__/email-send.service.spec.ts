import { Test, TestingModule } from '@nestjs/testing';
import { EmailSendService } from '../email-send.service';
import { IntegrationCostControlService } from '../../../cost-control/cost-control.service';
import { IntegrationSecretsService } from '../../../integration-secrets/integration-secrets.service';
import { IntegrationUnavailableException } from '../../integration-unavailable.exception';

const sendMail = jest
  .fn()
  .mockResolvedValue({ messageId: '<smtp-1@localhost>' });
jest.mock('nodemailer', () => ({ createTransport: () => ({ sendMail }) }));

describe('EmailSendService', () => {
  let service: EmailSendService;
  let costControl: { checkAndCall: jest.Mock };
  let secrets: { resolve: jest.Mock };
  const env = { ...process.env };
  const fetchMock = jest.fn();

  const input = {
    to: 'seller@example.com',
    from: 'halo@example.com',
    subject: 'Offer',
    text: 'hello',
    messageId: 'msg-1',
  };
  const ctx = { accountId: 'tenant-1', actor: 'system' } as any;

  beforeEach(async () => {
    process.env = { ...env };
    delete process.env.USE_SENDGRID;
    delete process.env.RESEND_API_KEY;
    delete process.env.SENDGRID_FROM_EMAIL;
    (global as any).fetch = fetchMock;
    fetchMock.mockReset();
    sendMail.mockClear();

    // Cost control is exercised elsewhere; here it just runs the adapter for
    // whichever provider the service asked for and records the request.
    costControl = {
      checkAndCall: jest.fn(async (intent: any) => ({
        result: await intent.execute({ provider: intent.provider }),
        decision: { kind: 'ALLOW' },
      })),
    };
    secrets = { resolve: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailSendService,
        { provide: IntegrationCostControlService, useValue: costControl },
        { provide: IntegrationSecretsService, useValue: secrets },
      ],
    }).compile();
    service = module.get(EmailSendService);
  });

  afterAll(() => {
    process.env = env;
  });

  const requestedProvider = () =>
    costControl.checkAndCall.mock.calls[0][0].provider;

  describe('provider preference', () => {
    it('prefers SendGrid when USE_SENDGRID=true', async () => {
      process.env.USE_SENDGRID = 'true';
      process.env.RESEND_API_KEY = 're_x';
      secrets.resolve.mockResolvedValue('SG.key');
      fetchMock.mockResolvedValue({
        ok: true,
        status: 202,
        headers: { get: () => 'sg-abc' },
      });

      const out = await service.sendEmail(input, ctx);

      expect(requestedProvider()).toBe('sendgrid');
      expect(out).toEqual({ messageId: 'sg-abc', provider: 'sendgrid' });
    });

    it('uses Resend when a key is present and SendGrid is not selected', async () => {
      process.env.RESEND_API_KEY = 're_x';
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 're-1' }),
      });

      const out = await service.sendEmail(input, ctx);

      expect(requestedProvider()).toBe('resend');
      expect(out).toEqual({ messageId: 're-1', provider: 'resend' });
    });

    it('falls back to SMTP with nothing configured', async () => {
      const out = await service.sendEmail(input, ctx);

      expect(requestedProvider()).toBe('smtp');
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(out).toEqual({
        messageId: '<smtp-1@localhost>',
        provider: 'smtp',
      });
    });
  });

  describe('SendGrid adapter', () => {
    beforeEach(() => {
      process.env.USE_SENDGRID = 'true';
    });

    it('reads the key through the secrets store and sends the v3 mail payload', async () => {
      secrets.resolve.mockResolvedValue('SG.key');
      process.env.SENDGRID_FROM_EMAIL = 'verified@halo.example';
      fetchMock.mockResolvedValue({
        ok: true,
        status: 202,
        headers: { get: () => 'sg-1' },
      });

      await service.sendEmail({ ...input, html: '<p>hi</p>' }, ctx);

      expect(secrets.resolve).toHaveBeenCalledWith(
        'sendgrid',
        'SENDGRID_API_KEY',
      );
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
      expect(init.headers.Authorization).toBe('Bearer SG.key');
      const body = JSON.parse(init.body);
      expect(body).toEqual({
        personalizations: [{ to: [{ email: 'seller@example.com' }] }],
        // the verified sender wins over the caller-supplied from
        from: { email: 'verified@halo.example' },
        subject: 'Offer',
        content: [
          { type: 'text/plain', value: 'hello' },
          { type: 'text/html', value: '<p>hi</p>' },
        ],
        custom_args: { halo_message_id: 'msg-1' },
      });
    });

    it('fails closed as not-configured when no key resolves', async () => {
      secrets.resolve.mockResolvedValue(null);

      await expect(service.sendEmail(input, ctx)).rejects.toThrow(
        IntegrationUnavailableException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('surfaces a non-2xx response as a send failure', async () => {
      secrets.resolve.mockResolvedValue('SG.key');
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => '{"errors":[{"message":"bad key"}]}',
      });

      await expect(service.sendEmail(input, ctx)).rejects.toThrow(
        /SendGrid send failed: 401/,
      );
    });
  });
});

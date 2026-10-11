import { Test, TestingModule } from '@nestjs/testing';
import { UnsubscribeService } from '../unsubscribe.service';
import { UnsubscribeController } from '../unsubscribe.controller';
import { PrismaService } from '../../prisma.service';
import { OptOutService } from '../../compliance/opt-out.service';
import { TimelineService } from '../../timeline/timeline.service';
import { counterpartyColumns } from '../message-counterparty';
import {
  unsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from '../unsubscribe-token';

describe('unsubscribe', () => {
  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY_V1 = '11'.repeat(32);
    process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '1';
    process.env.PII_INDEX_KEY = '22'.repeat(32);
  });

  describe('tokens', () => {
    it('round-trips a message id without carrying the address', () => {
      const token = unsubscribeToken('cmsg123');
      expect(token.startsWith('cmsg123.')).toBe(true);
      expect(verifyUnsubscribeToken(token)).toBe('cmsg123');
    });

    it('rejects a forged or altered signature', () => {
      const token = unsubscribeToken('cmsg123');
      const [, sig] = token.split('.');
      expect(verifyUnsubscribeToken(`cmsg124.${sig}`)).toBeNull();
      expect(verifyUnsubscribeToken(`${token.slice(0, -1)}A`)).toBeNull();
    });

    it.each(['', 'nodot', '.sig', 'bad id!.sig', undefined])(
      'rejects the malformed token %p',
      (token) => {
        expect(verifyUnsubscribeToken(token as string)).toBeNull();
      },
    );

    it('is tied to the index key, so a rotated key retires old links', () => {
      const token = unsubscribeToken('cmsg123');
      const original = process.env.PII_INDEX_KEY;
      process.env.PII_INDEX_KEY = '33'.repeat(32);
      try {
        expect(verifyUnsubscribeToken(token)).toBeNull();
      } finally {
        process.env.PII_INDEX_KEY = original;
      }
    });

    it('builds the link under the public api url', () => {
      expect(unsubscribeUrl('https://api.example/api/', 'cmsg1')).toBe(
        `https://api.example/api/unsubscribe/${unsubscribeToken('cmsg1')}`,
      );
    });
  });

  describe('service and controller', () => {
    let service: UnsubscribeService;
    let controller: UnsubscribeController;
    let prisma: { message: { findUnique: jest.Mock } };
    let optOut: { recordEmailOptOut: jest.Mock };
    let timeline: { appendEvent: jest.Mock };
    const res = () => ({ status: jest.fn() }) as any;

    beforeEach(async () => {
      prisma = { message: { findUnique: jest.fn() } };
      optOut = {
        recordEmailOptOut: jest
          .fn()
          .mockResolvedValue({ accountIds: ['tenant-1'], consentsRevoked: 1 }),
      };
      timeline = { appendEvent: jest.fn() };
      const module: TestingModule = await Test.createTestingModule({
        controllers: [UnsubscribeController],
        providers: [
          UnsubscribeService,
          { provide: PrismaService, useValue: prisma },
          { provide: OptOutService, useValue: optOut },
          { provide: TimelineService, useValue: timeline },
        ],
      }).compile();
      service = module.get(UnsubscribeService);
      controller = module.get(UnsubscribeController);
    });

    const emailMessage = (overrides: Record<string, unknown> = {}) => ({
      id: 'cmsg1',
      accountId: 'tenant-1',
      leadId: 'lead-1',
      channel: 'email',
      direction: 'outbound',
      metadata: {},
      ...counterpartyColumns('email', 'Seller@Example.com'),
      ...overrides,
    });

    it("puts the message's recipient on its tenant's DNC list", async () => {
      prisma.message.findUnique.mockResolvedValue(emailMessage());

      const outcome = await service.unsubscribe(unsubscribeToken('cmsg1'));

      expect(outcome).toBe('unsubscribed');
      expect(optOut.recordEmailOptOut).toHaveBeenCalledWith({
        accountId: 'tenant-1',
        email: 'Seller@Example.com',
        leadId: 'lead-1',
        source: 'unsubscribe_link',
        reason: 'Unsubscribed via email link',
      });
      expect(timeline.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          entityId: 'cmsg1',
          eventType: 'RECIPIENT_UNSUBSCRIBED',
          payload: { channel: 'email', source: 'unsubscribe_link' },
        }),
      );
    });

    it('does nothing for a forged token', async () => {
      const outcome = await service.unsubscribe('cmsg1.forged');

      expect(outcome).toBe('invalid');
      expect(prisma.message.findUnique).not.toHaveBeenCalled();
      expect(optOut.recordEmailOptOut).not.toHaveBeenCalled();
    });

    it('does nothing for a message that was not an outbound email', async () => {
      prisma.message.findUnique.mockResolvedValue(
        emailMessage({
          channel: 'sms',
          ...counterpartyColumns('sms', '+15125550100'),
        }),
      );

      expect(await service.unsubscribe(unsubscribeToken('cmsg1'))).toBe(
        'invalid',
      );
      expect(optOut.recordEmailOptOut).not.toHaveBeenCalled();
    });

    it('GET only asks for confirmation (mail scanners prefetch links)', () => {
      const r = res();
      const html = controller.confirm(unsubscribeToken('cmsg1'), r);

      expect(html).toContain('<form method="post">');
      expect(r.status).not.toHaveBeenCalled();
      expect(optOut.recordEmailOptOut).not.toHaveBeenCalled();
    });

    it('GET answers 404 for an invalid link', () => {
      const r = res();
      const html = controller.confirm('nope', r);
      expect(r.status).toHaveBeenCalledWith(404);
      expect(html).toContain('not valid');
    });

    it('POST (also the RFC 8058 one-click request) unsubscribes', async () => {
      prisma.message.findUnique.mockResolvedValue(emailMessage());
      const r = res();

      const html = await controller.submit(unsubscribeToken('cmsg1'), r);

      expect(html).toContain('You have been unsubscribed');
      expect(html).not.toContain('Seller@Example.com');
      expect(optOut.recordEmailOptOut).toHaveBeenCalledTimes(1);
    });
  });
});

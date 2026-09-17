import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceService } from '../compliance.service';
import { PrismaService } from '../../prisma.service';

describe('ComplianceService', () => {
  let service: ComplianceService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      dNCList: { findFirst: jest.fn().mockResolvedValue(null) },
      consent: { findFirst: jest.fn().mockResolvedValue(null) },
      quietHours: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ComplianceService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ComplianceService);
  });

  describe('DNC', () => {
    it('scopes the lookup to the tenant', async () => {
      await service.getFacts({
        accountId: 'halo-hq',
        channel: 'sms',
        phone: '+1 (555) 555-0100',
      });

      const where = prisma.dNCList.findFirst.mock.calls[0][0].where;
      // Without accountId, one tenant suppressing a number suppresses it for
      // every tenant.
      expect(where.accountId).toBe('halo-hq');
    });

    it('ignores expired entries but honours permanent ones', async () => {
      await service.getFacts({
        accountId: 'halo-hq',
        channel: 'sms',
        phone: '+15555550100',
      });
      const where = prisma.dNCList.findFirst.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { expiresAt: null },
        { expiresAt: { gt: expect.any(Date) } },
      ]);
    });

    it('reports isDnc when a matching entry exists', async () => {
      prisma.dNCList.findFirst.mockResolvedValue({ id: 'dnc_1' });
      const facts = await service.getFacts({
        accountId: 'halo-hq',
        channel: 'sms',
        phone: '+15555550100',
      });
      expect(facts.isDnc).toBe(true);
    });

    it('is not DNC when no phone is supplied', async () => {
      const facts = await service.getFacts({ accountId: 'halo-hq', channel: 'email' });
      expect(facts.isDnc).toBe(false);
      expect(prisma.dNCList.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('consent', () => {
    it('denies consent when a known contact has no record', async () => {
      const facts = await service.getFacts({
        accountId: 'halo-hq',
        channel: 'sms',
        phone: '+15555550100',
        leadId: 'lead_1',
      });
      expect(facts.hasConsent).toBe(false);
    });

    it('grants consent from a live record and reports its source', async () => {
      prisma.consent.findFirst.mockResolvedValue({ source: 'form' });
      const facts = await service.getFacts({
        accountId: 'halo-hq',
        channel: 'sms',
        leadId: 'lead_1',
      });
      expect(facts.hasConsent).toBe(true);
      expect(facts.consentSource).toBe('form');
    });

    it('does not assert absence of consent with nothing to key on', async () => {
      // No lead, phone or email: there is no record to look up, so consent is
      // left untouched rather than reported as missing.
      const facts = await service.getFacts({ accountId: 'halo-hq', channel: 'sms' });
      expect(facts.hasConsent).toBe(true);
      expect(prisma.consent.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('quiet hours', () => {
    it('returns the tenant window rather than a hardcoded one', async () => {
      prisma.quietHours.findFirst.mockResolvedValue({
        enabled: true,
        timezone: 'America/New_York',
        startHour: 22,
        endHour: 7,
      });

      const facts = await service.getFacts({ accountId: 'halo-hq', channel: 'sms' });
      expect(facts.quietHoursStart).toBe(22);
      expect(facts.quietHoursEnd).toBe(7);
      expect(facts.timezone).toBe('America/New_York');
      expect(typeof facts.localHour).toBe('number');
    });

    it('omits the window when quiet hours are disabled', async () => {
      prisma.quietHours.findFirst.mockResolvedValue({
        enabled: false,
        timezone: 'America/New_York',
        startHour: 22,
        endHour: 7,
      });
      const facts = await service.getFacts({ accountId: 'halo-hq', channel: 'sms' });
      expect(facts.localHour).toBeUndefined();
      expect(facts.quietHoursStart).toBeUndefined();
    });

    it('leaves localHour undefined for an invalid timezone', async () => {
      prisma.quietHours.findFirst.mockResolvedValue({
        enabled: true,
        timezone: 'Not/AZone',
        startHour: 20,
        endHour: 9,
      });
      const facts = await service.getFacts({ accountId: 'halo-hq', channel: 'sms' });
      // Undefined makes the policy rule skip rather than wrongly allow.
      expect(facts.localHour).toBeUndefined();
    });
  });
});

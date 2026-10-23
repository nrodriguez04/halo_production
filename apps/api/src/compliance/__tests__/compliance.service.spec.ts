import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceService } from '../compliance.service';
import { DncRegistryService } from '../dnc-registry.service';
import { PrismaService } from '../../prisma.service';
import { hashEmail, hashPhone } from '@halo/shared';
import { protectContact } from '../../leads/lead-pii';

describe('ComplianceService', () => {
  let service: ComplianceService;
  let prisma: any;
  let registry: { check: jest.Mock; required: jest.Mock };

  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY_V1 = '11'.repeat(32);
    process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '1';
    process.env.PII_INDEX_KEY = '22'.repeat(32);
  });

  beforeEach(async () => {
    prisma = {
      lead: { findFirst: jest.fn().mockResolvedValue(null) },
      dNCList: { findFirst: jest.fn().mockResolvedValue(null) },
      consent: { findFirst: jest.fn().mockResolvedValue(null) },
      quietHours: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    registry = {
      check: jest.fn().mockResolvedValue('clear'),
      required: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceService,
        { provide: PrismaService, useValue: prisma },
        { provide: DncRegistryService, useValue: registry },
      ],
    }).compile();

    service = module.get(ComplianceService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const dncWhere = () => prisma.dNCList.findFirst.mock.calls[0][0].where;

  describe('Do Not Call registry', () => {
    it('checks a text recipient against the registry and reports written consent', async () => {
      registry.check.mockResolvedValue('listed');
      prisma.consent.findFirst.mockResolvedValue({ source: 'written' });
      const facts = await service.getFacts({
        accountId: 'acct-1',
        channel: 'sms',
        phone: '+1 (214) 555-0100',
      });
      expect(registry.check).toHaveBeenCalledWith(
        'acct-1',
        '+1 (214) 555-0100',
      );
      expect(facts).toMatchObject({
        dncRegistry: 'listed',
        dncRegistryRequired: true,
        writtenConsent: true,
      });
    });

    it('does not count verbal consent as written', async () => {
      prisma.consent.findFirst.mockResolvedValue({ source: 'verbal' });
      const facts = await service.getFacts({
        accountId: 'acct-1',
        channel: 'sms',
        phone: '2145550100',
      });
      expect(facts.writtenConsent).toBe(false);
    });

    it('leaves email out of it', async () => {
      const facts = await service.getFacts({
        accountId: 'acct-1',
        channel: 'email',
        email: 'someone@example.test',
      });
      expect(registry.check).not.toHaveBeenCalled();
      expect(facts.dncRegistry).toBeUndefined();
    });
  });

  describe('DNC', () => {
    it('scopes the lookup to the tenant plus the GLOBAL opt-out scope', async () => {
      await service.getFacts({
        accountId: 'halo-hq',
        channel: 'sms',
        phone: '+1 (555) 555-0100',
      });

      // Without accountId, one tenant suppressing a number suppresses it for
      // every tenant; GLOBAL holds opt-outs no tenant could be matched to.
      expect(dncWhere().accountId).toEqual({ in: ['halo-hq', 'GLOBAL'] });
    });

    it('ignores expired entries but honours permanent ones', async () => {
      await service.getFacts({
        accountId: 'halo-hq',
        channel: 'sms',
        phone: '+15555550100',
      });
      expect(dncWhere().AND).toEqual([
        { OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }] },
      ]);
    });

    it('matches on the phone blind index only, in any formatting', async () => {
      await service.getFacts({
        accountId: 'halo-hq',
        channel: 'sms',
        phone: '(555) 555-0100',
      });
      expect(dncWhere().OR).toEqual([
        { phoneHash: { in: [hashPhone('+15555550100')] } },
      ]);
      expect(JSON.stringify(dncWhere())).not.toContain('5555550100');
    });

    it('applies to email: the recipient address is checked against email entries', async () => {
      prisma.dNCList.findFirst.mockResolvedValue({ id: 'dnc_email' });

      const facts = await service.getFacts({
        accountId: 'halo-hq',
        channel: 'email',
        email: 'Seller@Example.com',
      });

      expect(facts.isDnc).toBe(true);
      expect(dncWhere().OR).toEqual([
        { emailHash: { in: [hashEmail('seller@example.com')] } },
      ]);
    });

    it('blocks email to a lead whose phone is on the list (STOP means stop)', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        ...protectContact({
          phone: '+15125550100',
          email: 'seller@example.com',
        }),
        canonicalState: 'TX',
      });

      await service.getFacts({
        accountId: 'halo-hq',
        channel: 'email',
        email: 'seller@example.com',
        leadId: 'lead_1',
      });

      expect(prisma.lead.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead_1', accountId: 'halo-hq' },
        }),
      );
      expect(dncWhere().OR).toEqual([
        { phoneHash: { in: [hashPhone('+15125550100')] } },
        { emailHash: { in: [hashEmail('seller@example.com')] } },
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

    it('is not DNC when there is no recipient or lead to key on', async () => {
      const facts = await service.getFacts({
        accountId: 'halo-hq',
        channel: 'email',
      });
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

    it('looks consent up by lead, phone blind index and email blind index only', async () => {
      await service.getFacts({
        accountId: 'halo-hq',
        channel: 'email',
        phone: '+15555550100',
        email: 'Seller@Example.com',
        leadId: 'lead_1',
      });
      const where = prisma.consent.findFirst.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { leadId: 'lead_1' },
        { phoneHash: hashPhone('+15555550100') },
        { emailHash: hashEmail('seller@example.com') },
      ]);
      expect(where.revokedAt).toBeNull();
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
      const facts = await service.getFacts({
        accountId: 'halo-hq',
        channel: 'sms',
      });
      expect(facts.hasConsent).toBe(true);
      expect(prisma.consent.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('quiet hours', () => {
    const tenantWindow = (timezone = 'America/Los_Angeles') =>
      prisma.quietHours.findFirst.mockResolvedValue({
        enabled: true,
        timezone,
        startHour: 20,
        endHour: 9,
      });

    // 2026-10-10 is in daylight time everywhere below. 02:30 UTC is 22:30 in
    // New York but 19:30 in Los Angeles.
    const at = (iso: string) => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      jest.setSystemTime(new Date(iso));
    };

    it("uses the recipient's area code, not the tenant's zone", async () => {
      tenantWindow('America/Los_Angeles');
      at('2026-10-11T02:30:00Z');

      const facts = await service.getFacts({
        accountId: 'halo-hq',
        channel: 'sms',
        phone: '+12125550100', // 212: New York
      });

      expect(facts.timezone).toBe('America/New_York');
      expect(facts.timezoneSource).toBe('recipient');
      expect(facts.localHour).toBe(22);
    });

    it('lets a send through when it is daytime for the recipient, whatever the tenant clock says', async () => {
      tenantWindow('America/New_York');
      at('2026-10-11T02:30:00Z'); // 22:30 for the tenant, 19:30 in LA

      const facts = await service.getFacts({
        accountId: 'halo-hq',
        channel: 'sms',
        phone: '+12135550100', // 213: Los Angeles
      });

      expect(facts.timezone).toBe('America/Los_Angeles');
      expect(facts.localHour).toBe(19);
    });

    it('reports the blocking zone when area code and address disagree', async () => {
      tenantWindow('America/Los_Angeles');
      at('2026-10-11T02:30:00Z');
      prisma.lead.findFirst.mockResolvedValue({
        canonicalPhoneHash: null,
        canonicalEmailHash: null,
        canonicalPhoneEnc: null,
        canonicalState: 'NY',
      });

      const facts = await service.getFacts({
        accountId: 'halo-hq',
        channel: 'sms',
        phone: '+12135550100', // LA number, New York property
        leadId: 'lead_1',
      });

      expect(facts.timezone).toBe('America/New_York');
      expect(facts.localHour).toBe(22);
    });

    it("zones an email by the lead's phone and state", async () => {
      tenantWindow('America/Los_Angeles');
      at('2026-10-11T02:30:00Z');
      prisma.lead.findFirst.mockResolvedValue({
        ...protectContact({ phone: '+13055550100' }), // 305: Miami
        canonicalEmailHash: null,
        canonicalState: 'FL',
      });

      const facts = await service.getFacts({
        accountId: 'halo-hq',
        channel: 'email',
        email: 'seller@example.com',
        leadId: 'lead_1',
      });

      expect(facts.timezone).toBe('America/New_York');
      expect(facts.timezoneSource).toBe('recipient');
    });

    it('falls back to the tenant zone when nothing about the recipient is known', async () => {
      prisma.quietHours.findFirst.mockResolvedValue({
        enabled: true,
        timezone: 'America/New_York',
        startHour: 22,
        endHour: 7,
      });

      const facts = await service.getFacts({
        accountId: 'halo-hq',
        channel: 'sms',
      });
      expect(facts.quietHoursStart).toBe(22);
      expect(facts.quietHoursEnd).toBe(7);
      expect(facts.timezone).toBe('America/New_York');
      expect(facts.timezoneSource).toBe('tenant');
      expect(typeof facts.localHour).toBe('number');
    });

    it('omits the window when quiet hours are disabled', async () => {
      prisma.quietHours.findFirst.mockResolvedValue({
        enabled: false,
        timezone: 'America/New_York',
        startHour: 22,
        endHour: 7,
      });
      const facts = await service.getFacts({
        accountId: 'halo-hq',
        channel: 'sms',
      });
      expect(facts.localHour).toBeUndefined();
      expect(facts.quietHoursStart).toBeUndefined();
    });

    it('leaves localHour undefined for an invalid tenant timezone', async () => {
      prisma.quietHours.findFirst.mockResolvedValue({
        enabled: true,
        timezone: 'Not/AZone',
        startHour: 20,
        endHour: 9,
      });
      const facts = await service.getFacts({
        accountId: 'halo-hq',
        channel: 'sms',
      });
      // Undefined makes the policy rule skip rather than wrongly allow.
      expect(facts.localHour).toBeUndefined();
    });
  });
});

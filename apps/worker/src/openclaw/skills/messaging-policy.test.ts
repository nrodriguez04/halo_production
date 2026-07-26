import assert from 'node:assert/strict';
import test from 'node:test';

const {
  assertOpenClawMessagingAllowed,
} = require('./messaging-policy') as typeof import('./messaging-policy');

test('rejects OpenClaw SMS drafts when messaging is disabled', async () => {
  const prisma = {
    deal: {
      findFirst: async () => ({ id: 'deal-1', leadId: 'lead-1' }),
    },
    controlPlane: {
      findFirst: async () => ({
        enabled: true,
        smsEnabled: false,
        emailEnabled: true,
      }),
    },
    dNCList: {
      findFirst: async () => null,
    },
    consent: {
      findFirst: async () => ({ source: 'form' }),
    },
    quietHours: {
      findFirst: async () => null,
    },
  };

  await assert.rejects(
    () =>
      assertOpenClawMessagingAllowed(prisma as any, {
        tenantId: 'tenant-1',
        dealId: 'deal-1',
        channel: 'sms',
        recipient: '(555) 111-2222',
      }),
    (error: any) => error?.code === 'CONTROL_PLANE_MESSAGING_DISABLED',
  );
});

test('returns canonical lead and recipient fields for OpenClaw email drafts', async () => {
  const prisma = {
    deal: {
      findFirst: async () => ({ id: 'deal-1', leadId: 'lead-1' }),
    },
    controlPlane: {
      findFirst: async () => ({
        enabled: true,
        smsEnabled: true,
        emailEnabled: true,
      }),
    },
    dNCList: {
      findFirst: async () => null,
    },
    consent: {
      findFirst: async () => ({ source: 'form' }),
    },
    quietHours: {
      findFirst: async () => null,
    },
  };

  const result = await assertOpenClawMessagingAllowed(prisma as any, {
    tenantId: 'tenant-1',
    dealId: 'deal-1',
    channel: 'email',
    recipient: 'seller@example.com',
    subject: 'Follow up',
  });

  assert.deepEqual(result, {
    dealId: 'deal-1',
    leadId: 'lead-1',
    metadata: {
      to: 'seller@example.com',
      email: 'seller@example.com',
      subject: 'Follow up',
    },
  });
});

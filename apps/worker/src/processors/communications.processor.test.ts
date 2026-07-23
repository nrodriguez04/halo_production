import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PolicyViolationError } from '@halo/shared';
import { prisma } from '../prisma-client';
import { CommunicationsProcessor } from './communications.processor';

test('blocks queued SMS after the recipient opts out', async () => {
  const message = {
    id: 'msg-1',
    accountId: 'tenant-1',
    leadId: null,
    dealId: null,
    channel: 'sms',
    direction: 'outbound',
    status: 'approved',
    content: 'Hello there',
    metadata: { to: '(555) 123-4567' },
  };
  const updateCalls: any[] = [];
  const originalConsoleError = console.error;
  const originalFindUnique = (prisma.message as any).findUnique;
  const originalUpdate = (prisma.message as any).update;
  const originalControlPlaneFindFirst = (prisma.controlPlane as any).findFirst;
  const originalDncFindFirst = (prisma.dNCList as any).findFirst;
  const originalConsentFindFirst = (prisma.consent as any).findFirst;
  const originalQuietHoursFindFirst = (prisma.quietHours as any).findFirst;
  const originalTimelineCreate = (prisma.timelineEvent as any).create;

  try {
    console.error = (() => undefined) as any;
    (prisma.message as any).findUnique = async () => message as any;
    (prisma.message as any).update = async (args: any) => {
      updateCalls.push(args);
      return { ...message, ...args.data };
    };
    (prisma.controlPlane as any).findFirst = async () =>
      ({
        enabled: true,
        smsEnabled: true,
        emailEnabled: true,
      }) as any;
    (prisma.dNCList as any).findFirst = async () => ({ id: 'dnc-1' }) as any;
    (prisma.consent as any).findFirst = async () =>
      ({
        id: 'consent-1',
        source: 'form',
      }) as any;
    (prisma.quietHours as any).findFirst = async () => null as any;
    (prisma.timelineEvent as any).create = async () => ({ id: 'evt-1' }) as any;

    const processor = new CommunicationsProcessor();
    let sent = false;
    (processor as any).sendSMS = async () => {
      sent = true;
    };

    await assert.rejects(
      processor.process({ data: { messageId: 'msg-1' } } as any),
      (error: unknown) => {
        assert.ok(error instanceof PolicyViolationError);
        assert.match((error as Error).message, /Recipient is on DNC list/);
        return true;
      },
    );

    assert.equal(sent, false);
    assert.deepEqual(updateCalls, [
      {
        where: { id: 'msg-1' },
        data: { status: 'failed' },
      },
    ]);
  } finally {
    console.error = originalConsoleError;
    (prisma.message as any).findUnique = originalFindUnique;
    (prisma.message as any).update = originalUpdate;
    (prisma.controlPlane as any).findFirst = originalControlPlaneFindFirst;
    (prisma.dNCList as any).findFirst = originalDncFindFirst;
    (prisma.consent as any).findFirst = originalConsentFindFirst;
    (prisma.quietHours as any).findFirst = originalQuietHoursFindFirst;
    (prisma.timelineEvent as any).create = originalTimelineCreate;
  }
});

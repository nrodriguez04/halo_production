import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { PolicyViolationError } from '@halo/shared';
import { prisma } from '../prisma-client';
import { CommunicationsProcessor } from './communications.processor';

afterEach(() => {
  mock.restoreAll();
});

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

  mock.method(console, 'error', () => undefined);
  mock.method(prisma.message, 'findUnique', async () => message as any);
  mock.method(prisma.message, 'update', async (args: any) => {
    updateCalls.push(args);
    return { ...message, ...args.data };
  });
  mock.method(prisma.controlPlane, 'findFirst', async () => ({
    enabled: true,
    smsEnabled: true,
    emailEnabled: true,
  }) as any);
  mock.method(prisma.dNCList, 'findFirst', async () => ({ id: 'dnc-1' }) as any);
  mock.method(prisma.consent, 'findFirst', async () => ({
    id: 'consent-1',
    source: 'form',
  }) as any);
  mock.method(prisma.quietHours, 'findFirst', async () => null as any);
  mock.method(prisma.timelineEvent, 'create', async () => ({ id: 'evt-1' }) as any);

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
});

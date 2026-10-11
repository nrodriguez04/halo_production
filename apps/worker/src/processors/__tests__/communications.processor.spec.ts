const mockPrisma = {
  message: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({ accountId: 'tenant-1' }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  timelineEvent: { create: jest.fn().mockResolvedValue({}) },
};
const mockSend = jest.fn();

jest.mock('../../prisma-client', () => ({ prisma: mockPrisma }));
jest.mock('../../control-plane', () => ({
  getControlPlane: jest.fn().mockResolvedValue({
    enabled: true,
    smsEnabled: true,
    emailEnabled: true,
  }),
}));
jest.mock('../../internal-api.client', () => {
  const actual = jest.requireActual('../../internal-api.client');
  return {
    ...actual,
    sendApprovedMessage: (...args: unknown[]) => mockSend(...args),
  };
});

import { CostBlockedError, InternalApiError } from '../../internal-api.client';
import { CommunicationsProcessor } from '../communications.processor';

const approved = (
  metadata: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) => ({
  id: 'msg-1',
  accountId: 'tenant-1',
  channel: 'sms',
  status: 'approved',
  content: 'hello',
  metadata,
  ...overrides,
});

const statusWritten = () => mockPrisma.message.updateMany.mock.calls[0]?.[0];
const timelinePayload = () => mockPrisma.timelineEvent.create.mock.calls[0]?.[0].data.payloadJson;

describe('CommunicationsProcessor.process', () => {
  let processor: CommunicationsProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new CommunicationsProcessor();
  });

  it('sends by message id only and marks the message sent', async () => {
    mockPrisma.message.findUnique.mockResolvedValue(approved({}));
    mockSend.mockResolvedValue({ channel: 'sms', sid: 'SM_new', numSegments: 1, status: 'queued' });

    const out = await processor.process({ data: { messageId: 'msg-1' } } as any);

    expect(out).toEqual({ success: true, messageId: 'msg-1' });
    // No recipient, body or sender number: the api reads the approved row.
    expect(mockSend).toHaveBeenCalledWith('tenant-1', 'msg-1');
    expect(mockPrisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { metadata: { twilioMessageSid: 'SM_new', numSegments: 1 } },
    });
    expect(statusWritten()).toEqual({
      where: { id: 'msg-1', status: { not: 'sent' } },
      data: expect.objectContaining({ status: 'sent' }),
    });
    expect(timelinePayload()).toEqual({ channel: 'sms' });
  });

  it('needs no sender number of its own', async () => {
    const saved = process.env.TWILIO_PHONE_NUMBER;
    delete process.env.TWILIO_PHONE_NUMBER;
    mockPrisma.message.findUnique.mockResolvedValue(approved({}));
    mockSend.mockResolvedValue({ channel: 'sms', sid: 'SM_x', numSegments: 1, status: 'queued' });

    try {
      await expect(
        processor.process({ data: { messageId: 'msg-1' } } as any),
      ).resolves.toEqual({ success: true, messageId: 'msg-1' });
    } finally {
      if (saved !== undefined) process.env.TWILIO_PHONE_NUMBER = saved;
    }
  });

  it('records the email provider receipt so a replay does not resend', async () => {
    mockPrisma.message.findUnique.mockResolvedValue(approved({ subject: 'Offer' }, { channel: 'email' }));
    mockSend.mockResolvedValue({ channel: 'email', providerMessageId: 'sg-1', provider: 'sendgrid' });

    await processor.process({ data: { messageId: 'msg-1' } } as any);

    expect(mockPrisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: {
        metadata: { subject: 'Offer', providerMessageId: 'sg-1', emailProvider: 'sendgrid' },
      },
    });
  });

  it('does not send a message that is not approved', async () => {
    mockPrisma.message.findUnique.mockResolvedValue(approved({}, { status: 'pending_approval' }));

    await expect(
      processor.process({ data: { messageId: 'msg-1' } } as any),
    ).rejects.toThrow('is not approved');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('does not mark an unknown channel as sent', async () => {
    mockPrisma.message.findUnique.mockResolvedValue(approved({}, { channel: 'fax' }));

    await expect(
      processor.process({ data: { messageId: 'msg-1' } } as any),
    ).rejects.toThrow('Unsupported channel');
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockPrisma.message.updateMany).not.toHaveBeenCalled();
  });

  it('finalizes without resending when a provider receipt is already persisted', async () => {
    // An earlier attempt got the Twilio SID written but died before flipping
    // the status; BullMQ stalled-job recovery replays the job.
    mockPrisma.message.findUnique.mockResolvedValue(approved({ twilioMessageSid: 'SM_prior' }));

    const out = await processor.process({ data: { messageId: 'msg-1' } } as any);

    expect(out).toEqual({ success: true, messageId: 'msg-1', recovered: true });
    expect(mockSend).not.toHaveBeenCalled();
    expect(statusWritten().data.status).toBe('sent');
    expect(timelinePayload()).toEqual(
      expect.objectContaining({ recoveredFrom: 'provider_receipt', receipt: 'SM_prior' }),
    );
    expect(mockPrisma.message.update).not.toHaveBeenCalled();
  });

  it('treats an idempotent duplicate block as an already-sent message', async () => {
    // The api's idempotency key matched the first (successful) call.
    mockPrisma.message.findUnique.mockResolvedValue(approved({}));
    mockSend.mockRejectedValue(
      new CostBlockedError('BLOCK_DUPLICATE_CALL', 'twilio', 'duplicate call'),
    );

    const out = await processor.process({ data: { messageId: 'msg-1' } } as any);

    expect(out).toEqual({ success: true, messageId: 'msg-1', recovered: true });
    expect(statusWritten().data.status).toBe('sent');
    expect(timelinePayload()).toEqual(
      expect.objectContaining({ recoveredFrom: 'idempotent_replay', provider: 'twilio' }),
    );
    // Never parked as blocked.
    expect(mockPrisma.message.update).not.toHaveBeenCalled();
  });

  it('still parks a genuine budget block as blocked', async () => {
    mockPrisma.message.findUnique.mockResolvedValue(approved({}));
    mockSend.mockRejectedValue(
      new CostBlockedError('BLOCK_OVER_BUDGET', 'twilio', 'over budget'),
    );

    const out = await processor.process({ data: { messageId: 'msg-1' } } as any);

    expect(out).toEqual(
      expect.objectContaining({ success: false, blocked: true, reason: 'BLOCK_OVER_BUDGET' }),
    );
    expect(mockPrisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { status: 'blocked' },
    });
    expect(mockPrisma.message.updateMany).not.toHaveBeenCalled();
  });

  it('keeps a recipient quoted in a provider error out of the timeline', async () => {
    mockPrisma.message.findUnique.mockResolvedValue(approved({}));
    mockSend.mockRejectedValue(
      new InternalApiError(
        502,
        "internal/messages/msg-1/send failed: 502 The 'To' number +15125550100 is not a valid phone number",
      ),
    );

    await expect(
      processor.process({ data: { messageId: 'msg-1' } } as any),
    ).rejects.toBeInstanceOf(InternalApiError);

    const failed = mockPrisma.timelineEvent.create.mock.calls.find(
      (c: any[]) => c[0].data.eventType === 'MESSAGE_SEND_FAILED',
    );
    expect(failed[0].data.payloadJson.error).toContain("The 'To' number [phone]");
    expect(JSON.stringify(failed[0].data.payloadJson)).not.toContain('5125550100');
  });
});

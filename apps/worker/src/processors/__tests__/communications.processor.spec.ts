const mockPrisma = {
  message: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({ accountId: 'tenant-1' }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  timelineEvent: { create: jest.fn().mockResolvedValue({}) },
};
const mockSendSms = jest.fn();

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
    sendSms: (...args: unknown[]) => mockSendSms(...args),
  };
});

import { CostBlockedError } from '../../internal-api.client';
import { CommunicationsProcessor } from '../communications.processor';

const approvedSms = (metadata: Record<string, unknown>) => ({
  id: 'msg-1',
  accountId: 'tenant-1',
  channel: 'sms',
  status: 'approved',
  body: 'hello',
  metadata,
});

const statusWritten = () => mockPrisma.message.updateMany.mock.calls[0]?.[0];
const timelinePayload = () => mockPrisma.timelineEvent.create.mock.calls[0]?.[0].data.payloadJson;

describe('CommunicationsProcessor.process', () => {
  let processor: CommunicationsProcessor;

  beforeAll(() => {
    process.env.TWILIO_PHONE_NUMBER = '+15550009999';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new CommunicationsProcessor();
  });

  it('sends and marks the message sent on the happy path', async () => {
    mockPrisma.message.findUnique.mockResolvedValue(approvedSms({ phone: '+15550001111' }));
    mockSendSms.mockResolvedValue({ sid: 'SM_new' });

    const out = await processor.process({ data: { messageId: 'msg-1' } } as any);

    expect(out).toEqual({ success: true, messageId: 'msg-1' });
    expect(mockSendSms).toHaveBeenCalledTimes(1);
    expect(statusWritten()).toEqual({
      where: { id: 'msg-1', status: { not: 'sent' } },
      data: expect.objectContaining({ status: 'sent' }),
    });
    expect(timelinePayload()).toEqual({ channel: 'sms' });
  });

  it('finalizes without resending when a provider receipt is already persisted', async () => {
    // An earlier attempt got the Twilio SID written but died before flipping
    // the status; BullMQ stalled-job recovery replays the job.
    mockPrisma.message.findUnique.mockResolvedValue(
      approvedSms({ phone: '+15550001111', twilioMessageSid: 'SM_prior' }),
    );

    const out = await processor.process({ data: { messageId: 'msg-1' } } as any);

    expect(out).toEqual({ success: true, messageId: 'msg-1', recovered: true });
    expect(mockSendSms).not.toHaveBeenCalled();
    expect(statusWritten().data.status).toBe('sent');
    expect(timelinePayload()).toEqual(
      expect.objectContaining({ recoveredFrom: 'provider_receipt', receipt: 'SM_prior' }),
    );
    expect(mockPrisma.message.update).not.toHaveBeenCalled();
  });

  it('treats an idempotent duplicate block as an already-sent message', async () => {
    // The api's idempotency key matched the first (successful) call.
    mockPrisma.message.findUnique.mockResolvedValue(approvedSms({ phone: '+15550001111' }));
    mockSendSms.mockRejectedValue(
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
    mockPrisma.message.findUnique.mockResolvedValue(approvedSms({ phone: '+15550001111' }));
    mockSendSms.mockRejectedValue(
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
});

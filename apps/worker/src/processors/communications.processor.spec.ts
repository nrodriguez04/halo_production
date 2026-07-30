const mockMessageFindUnique = jest.fn();
const mockMessageUpdate = jest.fn();
const mockControlPlaneFindFirst = jest.fn();
const mockTimelineCreate = jest.fn();
const mockTwilioSend = jest.fn();
const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }));
const mockTwilio = jest.fn(() => ({ messages: { create: mockTwilioSend } }));

jest.mock('../prisma-client', () => ({
  prisma: {
    message: {
      findUnique: mockMessageFindUnique,
      update: mockMessageUpdate,
    },
    controlPlane: {
      findFirst: mockControlPlaneFindFirst,
    },
    timelineEvent: {
      create: mockTimelineCreate,
    },
  },
}));

jest.mock('twilio', () => ({
  Twilio: mockTwilio,
}));

jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}));

jest.mock('@halo/shared', () => ({
  assertPolicy: jest.fn(),
}), { virtual: true });

import { CommunicationsProcessor } from './communications.processor';

describe('CommunicationsProcessor', () => {
  const originalEnv = { ...process.env };
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
    mockTwilio.mockImplementation(() => ({ messages: { create: mockTwilioSend } }));
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('finalizes approved SMS rows that already have a Twilio SID', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'secret';

    mockMessageFindUnique.mockResolvedValue({
      id: 'msg-1',
      accountId: 'acct-1',
      channel: 'sms',
      status: 'approved',
      content: 'hello',
      metadata: {
        phone: '+15555550123',
        twilioMessageSid: 'SM123',
      },
      sentAt: null,
    });
    mockMessageUpdate.mockResolvedValue({});
    mockTimelineCreate.mockResolvedValue({});

    const processor = new CommunicationsProcessor();

    await expect(
      processor.process({ data: { messageId: 'msg-1' } } as any),
    ).resolves.toEqual({
      success: true,
      messageId: 'msg-1',
      recovered: true,
    });

    expect(mockTwilioSend).not.toHaveBeenCalled();
    expect(mockMessageUpdate).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: {
        status: 'sent',
        sentAt: expect.any(Date),
      },
    });
    expect(mockTimelineCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: 'msg-1',
        eventType: 'MESSAGE_SENT',
      }),
    });
  });

  it('recovers when email delivery succeeded before sent bookkeeping failed', async () => {
    const approved = {
      id: 'msg-2',
      accountId: 'acct-1',
      channel: 'email',
      status: 'approved',
      content: 'hello',
      metadata: {
        email: 'lead@example.com',
        subject: 'Subject',
      },
      sentAt: null,
    };

    mockMessageFindUnique
      .mockResolvedValueOnce(approved)
      .mockResolvedValueOnce({
        ...approved,
        metadata: {
          ...approved.metadata,
          smtpMessageId: 'smtp-123',
        },
      });
    mockControlPlaneFindFirst.mockResolvedValue({
      enabled: true,
      smsEnabled: true,
      emailEnabled: true,
    });
    mockSendMail.mockResolvedValue({ messageId: 'smtp-123' });
    mockMessageUpdate
      .mockResolvedValueOnce({}) // persist smtpMessageId
      .mockRejectedValueOnce(new Error('status write failed'))
      .mockResolvedValueOnce({});
    mockTimelineCreate.mockResolvedValue({});

    const processor = new CommunicationsProcessor();

    await expect(
      processor.process({ data: { messageId: 'msg-2' } } as any),
    ).resolves.toEqual({
      success: true,
      messageId: 'msg-2',
      recovered: true,
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(
      mockMessageUpdate.mock.calls.some(
        ([arg]) => arg?.data?.status === 'failed',
      ),
    ).toBe(false);
    expect(mockTimelineCreate).toHaveBeenCalledTimes(1);
  });
});

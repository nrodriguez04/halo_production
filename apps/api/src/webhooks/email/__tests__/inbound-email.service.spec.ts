import {
  InboundEmailService,
  UNATTRIBUTED_ACCOUNT_ID,
  extractAddress,
  extractName,
  headerValue,
  htmlToText,
  isAutoReply,
  stripQuotedReply,
} from '../inbound-email.service';
import { parseInboundPayload } from '../inbound-email.controller';

jest.mock('../../../communications/message-counterparty', () => ({
  counterpartyColumns: jest.fn((channel: string, value: string) => ({
    counterpartyEnc: `enc:${value}`,
    counterpartyHash: `hash:${value}`,
  })),
}));

describe('inbound email helpers', () => {
  it('extracts addresses and names from From headers', () => {
    expect(extractAddress('Pat Owner <Pat@Example.com>')).toBe(
      'pat@example.com',
    );
    expect(extractAddress('pat@example.com')).toBe('pat@example.com');
    expect(extractAddress('"Owner, Pat" <pat@example.com>')).toBe(
      'pat@example.com',
    );
    expect(extractAddress('nobody here')).toBeNull();
    expect(extractName('Pat Owner <pat@example.com>')).toBe('Pat Owner');
    expect(extractName('"Owner, Pat" <pat@example.com>')).toBe('Owner, Pat');
    expect(extractName('pat@example.com')).toBeNull();
  });

  it('reads headers and spots auto-replies and bounces', () => {
    const headers =
      'Received: x\nAuto-Submitted: auto-replied\nMessage-ID: <abc@mail>\n';
    expect(headerValue(headers, 'message-id')).toBe('<abc@mail>');
    expect(isAutoReply(headers, 'Re: your note')).toBe(true);
    expect(isAutoReply('Auto-Submitted: no\n', 'Re: your note')).toBe(false);
    expect(isAutoReply('Precedence: bulk\n', 'x')).toBe(true);
    expect(isAutoReply('', 'Automatic reply: Out of office')).toBe(true);
    expect(isAutoReply('', 'Undeliverable: Your property')).toBe(true);
    expect(isAutoReply('', 'Re: 654 Birch Rd')).toBe(false);
  });

  it('keeps only what the person typed above the quoted thread', () => {
    const gmail =
      'Yes, let us talk Tuesday.\n\nOn Mon, Oct 12, 2026 at 9:00 AM Halo <deals@halo.test> wrote:\n> Hi Pat,\n> are you open to an offer?\n';
    expect(stripQuotedReply(gmail)).toBe('Yes, let us talk Tuesday.');
    const outlook =
      'Call me after 5.\r\n\r\nFrom: Halo Team\r\nSent: Monday\r\nTo: Pat\r\nSubject: 654 Birch Rd\r\nHi Pat...';
    expect(stripQuotedReply(outlook)).toBe('Call me after 5.');
    const phone = 'Not interested, thanks.\n\nSent from my iPhone\n\n> quoted';
    expect(stripQuotedReply(phone)).toBe('Not interested, thanks.');
    expect(stripQuotedReply('> only quoted\n> lines')).toBe(
      '> only quoted\n> lines',
    );
    expect(stripQuotedReply('')).toBe('');
  });

  it('turns HTML-only mail into text', () => {
    expect(
      htmlToText(
        '<div>Hi <b>there</b><br>second &amp; third</div><style>x{}</style>',
      ),
    ).toBe('Hi there\nsecond & third');
  });

  it('parses SendGrid multipart fields and a JSON body the same way', () => {
    const multipart = parseInboundPayload(
      {
        from: 'Pat <pat@example.com>',
        to: 'reply@halo.test',
        subject: 'Re: 654 Birch Rd',
        text: 'Sure',
        envelope: '{"from":"pat@example.com","to":["reply@halo.test"]}',
        headers: 'Message-ID: <1@x>\n',
      },
      [
        {
          originalname: 'photo.jpg',
          mimetype: 'image/jpeg',
          size: 3,
          buffer: Buffer.from('abc'),
        } as Express.Multer.File,
      ],
    );
    expect(multipart.envelope).toEqual({
      from: 'pat@example.com',
      to: ['reply@halo.test'],
    });
    expect(multipart.attachments).toHaveLength(1);
    const json = parseInboundPayload(
      { from: 'pat@example.com', text: 'hi' },
      undefined,
    );
    expect(json).toMatchObject({
      from: 'pat@example.com',
      text: 'hi',
      attachments: [],
    });
  });
});

describe('InboundEmailService', () => {
  const prisma = {
    lead: { findMany: jest.fn(), findFirst: jest.fn() },
    message: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    buyer: { findMany: jest.fn(), findFirst: jest.fn() },
    consent: { findMany: jest.fn() },
  };
  const automation = { attributeReply: jest.fn() };
  const agents = { enqueue: jest.fn() };
  const documents = { create: jest.fn() };
  const timeline = { appendEvent: jest.fn() };
  const pii = { emailHash: jest.fn((e: string) => `hash:${e}`) };
  const service = () =>
    new InboundEmailService(
      prisma as any,
      automation as any,
      agents as any,
      documents as any,
      timeline as any,
      pii as any,
    );

  const mail = (over: Record<string, unknown> = {}) => ({
    from: 'Pat Owner <pat@example.com>',
    to: 'reply@halo.test',
    subject: 'Re: 654 Birch Rd',
    text: 'Maybe. What are you thinking?\n\nOn Mon, Halo wrote:\n> Hi Pat',
    html: '',
    headers: 'Message-ID: <m1@x>\nIn-Reply-To: <out1@halo>\n',
    envelope: { from: 'pat@example.com', to: ['reply@halo.test'] },
    attachments: [],
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.lead.findMany.mockResolvedValue([{ accountId: 'acct' }]);
    prisma.message.findMany.mockResolvedValue([]);
    prisma.buyer.findMany.mockResolvedValue([]);
    prisma.consent.findMany.mockResolvedValue([]);
    prisma.lead.findFirst.mockResolvedValue({
      id: 'lead-1',
      deals: [{ id: 'deal-1' }],
    });
    prisma.message.create.mockImplementation(async ({ data }: any) => ({
      id: 'msg-1',
      ...data,
    }));
    prisma.message.findUnique.mockResolvedValue({ metadata: {} });
    prisma.message.update.mockResolvedValue({});
    automation.attributeReply.mockResolvedValue({ attributed: true });
    agents.enqueue.mockResolvedValue(true);
    timeline.appendEvent.mockResolvedValue({});
    documents.create.mockResolvedValue({ id: 'doc-1' });
  });

  it('links a reply to the lead and open deal, records it sealed, and queues the Drafter', async () => {
    const res = await service().handle(mail() as any);

    expect(res).toEqual({
      handled: 'message',
      messageId: 'msg-1',
      accountId: 'acct',
      queued: true,
    });
    const data = prisma.message.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      accountId: 'acct',
      channel: 'email',
      direction: 'inbound',
      status: 'delivered',
      leadId: 'lead-1',
      dealId: 'deal-1',
      content: 'Maybe. What are you thinking?',
      counterpartyHash: 'hash:pat@example.com',
    });
    expect(data.metadata).toMatchObject({
      subject: 'Re: 654 Birch Rd',
      senderName: 'Pat Owner',
      messageIdHeader: '<m1@x>',
      inReplyTo: '<out1@halo>',
      autoReply: false,
      counterpartyType: 'lead',
    });
    expect(JSON.stringify(data.metadata)).not.toContain('pat@example.com');
    expect(automation.attributeReply).toHaveBeenCalledWith('msg-1', 'acct');
    expect(agents.enqueue).toHaveBeenCalledWith({
      agent: 'outreach_drafter',
      accountId: 'acct',
      entityType: 'deal',
      entityId: 'deal-1',
      trigger: 'inbound',
      triggerEventId: 'inbound:msg-1',
      messageId: 'msg-1',
    });
    expect(timeline.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'DEAL',
        entityId: 'deal-1',
        eventType: 'INBOUND_EMAIL',
      }),
    );
  });

  it('records an auto-reply without waking the agent', async () => {
    const res = await service().handle(
      mail({
        headers: 'Auto-Submitted: auto-replied\n',
        subject: 'Automatic reply: 654 Birch Rd',
      }) as any,
    );
    expect(res).toMatchObject({ handled: 'auto_reply', queued: false });
    expect(agents.enqueue).not.toHaveBeenCalled();
    expect(prisma.message.create.mock.calls[0][0].data.metadata.autoReply).toBe(
      true,
    );
    expect(timeline.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'INBOUND_EMAIL_AUTO_REPLY' }),
    );
  });

  it('files a buyer reply on the deal we last emailed them about and queues the Buyer Responder', async () => {
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.buyer.findMany.mockResolvedValue([{ accountId: 'acct' }]);
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.buyer.findFirst.mockResolvedValue({ id: 'b1' });
    prisma.message.findFirst.mockResolvedValue({ dealId: 'deal-9' });
    agents.enqueue.mockResolvedValue(true);

    const res = await service().handle(
      mail({ from: 'Sarah <sarah@buyers.example>', envelope: null }) as any,
    );

    expect(res).toMatchObject({ handled: 'buyer_reply', queued: true });
    expect(agents.enqueue).toHaveBeenCalledWith({
      agent: 'buyer_responder',
      accountId: 'acct',
      entityType: 'deal',
      entityId: 'deal-9',
      trigger: 'inbound',
      triggerEventId: 'inbound:msg-1',
      messageId: 'msg-1',
    });
    expect(prisma.message.create.mock.calls[0][0].data).toMatchObject({
      leadId: null,
      dealId: 'deal-9',
    });
    expect(prisma.message.create.mock.calls[0][0].data.metadata).toMatchObject({
      counterpartyType: 'buyer',
      buyerId: 'b1',
    });
    expect(timeline.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'DEAL',
        entityId: 'deal-9',
        eventType: 'BUYER_REPLIED',
      }),
    );
  });

  it('ties a buyer reply to the deal of the email it answers, not the newest one', async () => {
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.buyer.findMany.mockResolvedValue([{ accountId: 'acct' }]);
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.buyer.findFirst.mockResolvedValue({ id: 'b1' });
    prisma.message.findFirst.mockImplementation(async (args: any) =>
      args.where.metadata
        ? { dealId: 'deal-older' }
        : { dealId: 'deal-newest' },
    );
    agents.enqueue.mockResolvedValue(true);

    await service().handle(
      mail({
        from: 'Sarah <sarah@buyers.example>',
        envelope: null,
        subject: 'RE: Fwd: Off-market Memphis deal: 2418 Pecan Grove Dr',
      }) as any,
    );

    const bySubject = prisma.message.findFirst.mock.calls.find(
      (c: any[]) => c[0].where.metadata,
    );
    expect(bySubject[0].where.metadata).toEqual({
      path: ['subject'],
      equals: 'Off-market Memphis deal: 2418 Pecan Grove Dr',
    });
    expect(prisma.message.create.mock.calls[0][0].data.dealId).toBe(
      'deal-older',
    );
    expect(agents.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'buyer_responder',
        entityId: 'deal-older',
      }),
    );
  });

  it('never answers a buyer out-of-office', async () => {
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.buyer.findMany.mockResolvedValue([{ accountId: 'acct' }]);
    prisma.lead.findFirst.mockResolvedValue(null);
    prisma.buyer.findFirst.mockResolvedValue({ id: 'b1' });
    prisma.message.findFirst.mockResolvedValue({ dealId: 'deal-9' });

    const res = await service().handle(
      mail({
        from: 'Sarah <sarah@buyers.example>',
        envelope: null,
        subject: 'Automatic reply: Off-market deal',
        headers: 'Auto-Submitted: auto-replied',
      }) as any,
    );

    expect(res).toMatchObject({ handled: 'buyer_reply', queued: false });
    expect(agents.enqueue).not.toHaveBeenCalled();
  });

  it('stores mail from an unknown sender under the unattributed tenant and does nothing else', async () => {
    prisma.lead.findMany.mockResolvedValue([]);
    const res = await service().handle(
      mail({ from: 'stranger@example.net', envelope: null }) as any,
    );
    expect(res).toEqual({ handled: 'unattributed', messageId: 'msg-1' });
    expect(prisma.message.create.mock.calls[0][0].data.accountId).toBe(
      UNATTRIBUTED_ACCOUNT_ID,
    );
    expect(prisma.lead.findFirst).not.toHaveBeenCalled();
    expect(agents.enqueue).not.toHaveBeenCalled();
  });

  it('fails closed when the sender matches more than one tenant', async () => {
    prisma.lead.findMany.mockResolvedValue([
      { accountId: 'acct' },
      { accountId: 'other' },
    ]);
    const res = await service().handle(mail() as any);
    expect(res.handled).toBe('unattributed');
  });

  it('files supported attachments in the library on the lead and deal and records their ids', async () => {
    const res = await service().handle(
      mail({
        attachments: [
          {
            originalname: 'deed.pdf',
            mimetype: 'application/pdf',
            size: 10,
            buffer: Buffer.from('%PDF'),
          },
          {
            originalname: 'virus.exe',
            mimetype: 'application/octet-stream',
            size: 10,
            buffer: Buffer.from('x'),
          },
        ],
      }) as any,
    );
    expect(res.handled).toBe('message');
    expect(documents.create).toHaveBeenCalledTimes(1);
    expect(documents.create).toHaveBeenCalledWith(
      'acct',
      'system:inbound-email',
      expect.objectContaining({
        category: 'other',
        title: 'deed.pdf',
        dealId: 'deal-1',
        leadId: 'lead-1',
        tags: ['inbound-email'],
      }),
      expect.objectContaining({ originalname: 'deed.pdf' }),
    );
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { metadata: expect.objectContaining({ documentIds: ['doc-1'] }) },
    });
  });

  it('uses the HTML part when there is no text part', async () => {
    await service().handle(
      mail({ text: '', html: '<p>Call me <b>tomorrow</b></p>' }) as any,
    );
    expect(prisma.message.create.mock.calls[0][0].data.content).toBe(
      'Call me tomorrow',
    );
  });

  it('never fails the webhook because the queue is down', async () => {
    agents.enqueue.mockRejectedValue(new Error('redis down'));
    await expect(service().handle(mail() as any)).resolves.toMatchObject({
      handled: 'message',
      queued: false,
    });
  });
});

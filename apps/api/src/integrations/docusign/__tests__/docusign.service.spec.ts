import { BadRequestException } from '@nestjs/common';
import { Readable } from 'stream';
import { DocuSignService } from '../docusign.service';
import { DocuSignAuthError } from '../docusign-auth';
import { CostBlockedException } from '../../../cost-control/cost-blocked.exception';
import { IntegrationUnavailableException } from '../../integration-unavailable.exception';

const mockRequestSession = jest.fn();
jest.mock('../docusign-auth', () => {
  const actual = jest.requireActual('../docusign-auth');
  return {
    ...actual,
    requestSession: (...args: unknown[]) => mockRequestSession(...args),
  };
});
jest.mock('../../../pii/contact-crypto', () => ({
  openValue: jest.fn((enc: string) => enc.replace(/^enc:/, '')),
}));

const session = {
  accessToken: 'tok',
  expiresAt: Date.now() + 3_000_000,
  baseUri: 'https://demo.docusign.net',
  accountId: 'ACCT',
  accountName: 'Halo',
};

const prisma = {
  deal: { findFirst: jest.fn() },
  buyer: { findFirst: jest.fn() },
  contract: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
  document: { findMany: jest.fn() },
};
const controlPlane = { isDocuSignEnabled: jest.fn(), getStatus: jest.fn() };
const timeline = { appendEvent: jest.fn() };
const deals = { updateStage: jest.fn() };
const pii = { reveal: jest.fn() };
const secretValues: Record<string, string | null> = {
  DOCUSIGN_CLIENT_ID: 'ik-123',
  DOCUSIGN_USER_ID: 'user-guid',
  DOCUSIGN_ACCOUNT_ID: 'ACCT',
  DOCUSIGN_RSA_PRIVATE_KEY:
    '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----',
  DOCUSIGN_ENV: 'demo',
  DOCUSIGN_BASE_URL: null,
};
const secrets = {
  resolve: jest.fn(
    async (_p: string, key: string) => secretValues[key] ?? null,
  ),
};
const documents = { get: jest.fn(), download: jest.fn(), create: jest.fn() };
const costControl = {
  checkAndCall: jest.fn(async (intent: any) => ({
    decision: { kind: 'ALLOW' },
    result: await intent.execute({ provider: intent.provider }),
    actualCostUsd: 0,
    fromCache: false,
  })),
};

const disclosure = { assertEquitableInterest: jest.fn() };

const service = () =>
  new DocuSignService(
    prisma as any,
    controlPlane as any,
    timeline as any,
    deals as any,
    pii as any,
    secrets as any,
    documents as any,
    costControl as any,
    disclosure as any,
  );

const deal = {
  id: 'deal-1',
  accountId: 'acct',
  stage: 'negotiating',
  property: { address: '123 Main St' },
  lead: {
    id: 'lead-1',
    canonicalOwner: 'Pat Owner',
    canonicalEmailEnc: 'enc:seller@example.com',
  },
};
const libraryDoc = {
  id: 'doc-1',
  title: 'Purchase Agreement (TX)',
  fileName: 'purchase-agreement-tx.pdf',
  tags: ['checklist:purchase_agreement'],
};

describe('DocuSignService', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    disclosure.assertEquitableInterest.mockResolvedValue({
      required: false,
      satisfied: true,
    });
    (global as any).fetch = fetchMock;
    mockRequestSession.mockResolvedValue(session);
    controlPlane.isDocuSignEnabled.mockResolvedValue(true);
    controlPlane.getStatus.mockResolvedValue({ enabled: true });
    prisma.deal.findFirst.mockResolvedValue(deal);
    pii.reveal.mockReturnValue({ email: 'seller@example.com', phone: null });
    prisma.buyer.findFirst.mockResolvedValue({
      id: 'b1',
      name: 'Sarah Johnson',
      emailEnc: 'enc:sarah@buyers.example',
    });
    documents.get.mockResolvedValue(libraryDoc);
    documents.download.mockImplementation(async () => ({
      body: Readable.from([Buffer.from('%PDF-1.4 agreement')]),
      contentType: 'application/pdf',
      fileName: libraryDoc.fileName,
    }));
    prisma.contract.create.mockImplementation(async ({ data }: any) => ({
      id: 'c1',
      ...data,
    }));
    prisma.contract.update.mockResolvedValue({});
    deals.updateStage.mockResolvedValue({});
    timeline.appendEvent.mockResolvedValue({});
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ envelopeId: 'env-1', status: 'sent' }),
      text: async () => '',
    });
  });

  it('sends library documents to the real seller and buyer, records roles only, and moves the deal under contract', async () => {
    const res = await service().createEnvelope('acct', 'user-1', {
      dealId: 'deal-1',
      documentIds: ['doc-1'],
      recipients: [
        { role: 'seller' },
        { role: 'buyer', buyerId: 'b1', routingOrder: 2 },
      ],
    });

    expect(res).toEqual({
      contractId: 'c1',
      envelopeId: 'env-1',
      status: 'sent',
    });
    expect(documents.get).toHaveBeenCalledWith('acct', 'doc-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://demo.docusign.net/restapi/v2.1/accounts/ACCT/envelopes',
    );
    expect(init.headers.Authorization).toBe('Bearer tok');
    const envelope = JSON.parse(init.body);
    expect(envelope.status).toBe('sent');
    expect(envelope.emailSubject).toBe('Purchase Agreement for 123 Main St');
    expect(envelope.documents).toEqual([
      {
        documentBase64: Buffer.from('%PDF-1.4 agreement').toString('base64'),
        name: 'Purchase Agreement (TX)',
        fileExtension: 'pdf',
        documentId: '1',
      },
    ]);
    expect(envelope.recipients.signers).toHaveLength(2);
    expect(envelope.recipients.signers[0]).toMatchObject({
      email: 'seller@example.com',
      name: 'Pat Owner',
      recipientId: '1',
      routingOrder: '1',
    });
    expect(envelope.recipients.signers[0].tabs.signHereTabs[0]).toMatchObject({
      anchorString: '[SELLER_SIGNATURE]',
      anchorIgnoreIfNotPresent: 'true',
    });
    expect(envelope.recipients.signers[1]).toMatchObject({
      email: 'sarah@buyers.example',
      name: 'Sarah Johnson',
      routingOrder: '2',
    });
    // No placeholder recipient survives: real people or an error.
    expect(JSON.stringify(envelope)).not.toContain('Property Owner');
    expect(JSON.stringify(envelope)).not.toContain('buyer@halo.com');

    const contract = prisma.contract.create.mock.calls[0][0].data;
    expect(contract).toMatchObject({
      dealId: 'deal-1',
      docusignEnvelopeId: 'env-1',
      status: 'sent',
    });
    expect(contract.metadata.recipients).toEqual([
      { role: 'seller', name: 'Pat Owner', recipientId: '1' },
      { role: 'buyer', name: 'Sarah Johnson', recipientId: '2', buyerId: 'b1' },
    ]);
    expect(JSON.stringify(contract.metadata)).not.toContain('@');

    expect(deals.updateStage).toHaveBeenCalledWith(
      'deal-1',
      'acct',
      'under_contract',
      'user-1',
      'user',
    );
    expect(timeline.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'DOCUSIGN_ENVELOPE_CREATED',
        actorId: 'user-1',
      }),
    );
    expect(costControl.checkAndCall).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'docusign',
        action: 'create_envelope',
      }),
    );
  });

  it('refuses a seller with no email on file and never calls DocuSign', async () => {
    pii.reveal.mockReturnValue({ email: null, phone: '+15551234567' });
    await expect(
      service().createEnvelope('acct', 'user-1', {
        dealId: 'deal-1',
        documentIds: ['doc-1'],
        recipients: [{ role: 'seller' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.contract.create).not.toHaveBeenCalled();
  });

  it('refuses a library file DocuSign cannot take', async () => {
    documents.get.mockResolvedValue({
      ...libraryDoc,
      fileName: 'rent-roll.xlsx',
    });
    await expect(
      service().createEnvelope('acct', 'user-1', {
        dealId: 'deal-1',
        documentIds: ['doc-1'],
        recipients: [{ role: 'seller' }],
      }),
    ).rejects.toThrow(/DocuSign envelopes take PDF/);
  });

  it('surfaces a cost-control block without writing a contract', async () => {
    costControl.checkAndCall.mockResolvedValueOnce({
      decision: { kind: 'BLOCK_OVER_BUDGET' },
      result: null,
      actualCostUsd: 0,
      fromCache: false,
    });
    await expect(
      service().createEnvelope('acct', 'user-1', {
        dealId: 'deal-1',
        documentIds: ['doc-1'],
        recipients: [{ role: 'seller' }],
      }),
    ).rejects.toBeInstanceOf(CostBlockedException);
    expect(prisma.contract.create).not.toHaveBeenCalled();
  });

  it('turns a missing consent into a typed 503 that carries the consent URL', async () => {
    mockRequestSession.mockRejectedValue(
      new DocuSignAuthError(
        'consent needed',
        'consent_required',
        'https://account-d.docusign.com/oauth/auth?x=1',
      ),
    );
    const err = await service()
      .createEnvelope('acct', 'user-1', {
        dealId: 'deal-1',
        documentIds: ['doc-1'],
        recipients: [{ role: 'seller' }],
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(IntegrationUnavailableException);
    expect(err.reason).toBe('REJECTED_CREDENTIALS');
    expect(JSON.stringify(err.getResponse())).toContain('oauth/auth?x=1');
  });

  it('reports a missing key as not configured before touching the network', async () => {
    secretValues.DOCUSIGN_RSA_PRIVATE_KEY = null;
    const err = await service()
      .createEnvelope('acct', 'user-1', {
        dealId: 'deal-1',
        documentIds: ['doc-1'],
        recipients: [{ role: 'seller' }],
      })
      .catch((e) => e);
    secretValues.DOCUSIGN_RSA_PRIVATE_KEY = 'key';
    expect(err).toBeInstanceOf(IntegrationUnavailableException);
    expect(err.reason).toBe('NOT_CONFIGURED');
    expect(mockRequestSession).not.toHaveBeenCalled();
  });

  it('files the executed copy in the library with the source checklist tags and completes the contract', async () => {
    prisma.contract.findFirst.mockResolvedValue({
      id: 'c1',
      docusignEnvelopeId: 'env-1',
      status: 'sent',
      metadata: {
        emailSubject: 'Purchase Agreement for 123 Main St',
        documents: [
          { id: 'doc-1', title: 'Purchase Agreement (TX)', fileName: 'x.pdf' },
        ],
      },
      deal: { id: 'deal-1', leadId: 'lead-1' },
    });
    prisma.document.findMany.mockResolvedValue([
      {
        tags: ['checklist:purchase_agreement', 'template'],
        jurisdiction: 'TX',
      },
    ]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from('%PDF signed').buffer.slice(0),
      text: async () => '',
    });
    documents.create.mockResolvedValue({ id: 'doc-signed' });

    const res = await service().storeSignedCopy('c1', 'acct');

    expect(res).toEqual({ documentId: 'doc-signed', alreadyStored: false });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://demo.docusign.net/restapi/v2.1/accounts/ACCT/envelopes/env-1/documents/combined',
    );
    const [accountId, uploader, input, file] = documents.create.mock.calls[0];
    expect(accountId).toBe('acct');
    expect(uploader).toBe('system:docusign');
    expect(input).toMatchObject({
      category: 'contract',
      title: 'Signed: Purchase Agreement for 123 Main St',
      dealId: 'deal-1',
      leadId: 'lead-1',
      jurisdiction: 'TX',
      tags: ['signed', 'docusign', 'checklist:purchase_agreement'],
    });
    expect(file).toMatchObject({
      mimetype: 'application/pdf',
      originalname: 'signed-env-1.pdf',
    });
    expect(prisma.contract.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({
        status: 'completed',
        pdfUrl: 'document:doc-signed',
        metadata: expect.objectContaining({ signedDocumentId: 'doc-signed' }),
      }),
    });

    prisma.contract.findFirst.mockResolvedValue({
      id: 'c1',
      docusignEnvelopeId: 'env-1',
      metadata: { signedDocumentId: 'doc-signed' },
      deal: { id: 'deal-1', leadId: 'lead-1' },
    });
    await expect(service().storeSignedCopy('c1', 'acct')).resolves.toEqual({
      documentId: 'doc-signed',
      alreadyStored: true,
    });
    expect(documents.create).toHaveBeenCalledTimes(1);
  });

  it('checks the Texas notice before a buyer is sent a contract, and only then', async () => {
    disclosure.assertEquitableInterest.mockRejectedValueOnce(
      new Error('Texas requires the equitable-interest disclosure'),
    );
    await expect(
      service().createEnvelope('acct', 'user-1', {
        dealId: 'deal-1',
        documentIds: ['doc-1'],
        recipients: [{ role: 'buyer', buyerId: 'b1' }],
      }),
    ).rejects.toThrow(/equitable-interest/);
    expect(disclosure.assertEquitableInterest).toHaveBeenCalledWith(
      'acct',
      'deal-1',
      'sending a contract to a buyer',
    );
    expect(fetchMock).not.toHaveBeenCalled();

    disclosure.assertEquitableInterest.mockClear();
    await service().createEnvelope('acct', 'user-1', {
      dealId: 'deal-1',
      documentIds: ['doc-1'],
      recipients: [{ role: 'seller' }],
    });
    expect(disclosure.assertEquitableInterest).not.toHaveBeenCalled();
  });

  it('on completion files the signed copy and moves an under-contract deal to marketing', async () => {
    const svc = service();
    jest
      .spyOn(svc, 'storeSignedCopy')
      .mockResolvedValue({ documentId: 'doc-signed', alreadyStored: false });
    prisma.contract.findFirst.mockResolvedValue({
      deal: { id: 'deal-1', stage: 'under_contract' },
    });

    await expect(
      svc.onEnvelopeCompleted('c1', 'acct', {
        actorId: null,
        actorType: 'webhook' as any,
      }),
    ).resolves.toEqual({
      signedDocumentId: 'doc-signed',
      movedToMarketing: true,
    });
    expect(deals.updateStage).toHaveBeenCalledWith(
      'deal-1',
      'acct',
      'marketing',
      null,
      'webhook',
    );
  });

  it('still moves the deal when the signed copy cannot be downloaded yet, and leaves other stages alone', async () => {
    const svc = service();
    jest
      .spyOn(svc, 'storeSignedCopy')
      .mockRejectedValue(new Error('download failed'));
    prisma.contract.findFirst.mockResolvedValue({
      deal: { id: 'deal-1', stage: 'under_contract' },
    });
    await expect(
      svc.onEnvelopeCompleted('c1', 'acct', {
        actorId: 'user-1',
        actorType: 'user' as any,
      }),
    ).resolves.toEqual({ signedDocumentId: null, movedToMarketing: true });

    deals.updateStage.mockClear();
    prisma.contract.findFirst.mockResolvedValue({
      deal: { id: 'deal-1', stage: 'marketing' },
    });
    jest
      .spyOn(svc, 'storeSignedCopy')
      .mockResolvedValue({ documentId: 'doc-signed', alreadyStored: true });
    await expect(
      svc.onEnvelopeCompleted('c1', 'acct', {
        actorId: null,
        actorType: 'system' as any,
      }),
    ).resolves.toEqual({
      signedDocumentId: 'doc-signed',
      movedToMarketing: false,
    });
    expect(deals.updateStage).not.toHaveBeenCalled();
  });
});

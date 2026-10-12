import { DocuSignService } from '../docusign.service';

const prisma = { contract: { findUnique: jest.fn(), update: jest.fn() } };
const timeline = { appendEvent: jest.fn() };
const deals = { updateStage: jest.fn() };
const integration = { storeSignedCopy: jest.fn() };

const service = () =>
  new DocuSignService(
    prisma as any,
    timeline as any,
    deals as any,
    integration as any,
  );

const contract = {
  id: 'c1',
  dealId: 'deal-1',
  docusignEnvelopeId: 'env-1',
  status: 'sent',
  metadata: { emailSubject: 'Purchase Agreement for 123 Main St' },
  deal: { id: 'deal-1', accountId: 'acct', stage: 'under_contract' },
};

describe('DocuSign webhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.contract.findUnique.mockResolvedValue(contract);
    prisma.contract.update.mockResolvedValue({});
    timeline.appendEvent.mockResolvedValue({});
    deals.updateStage.mockResolvedValue({});
    integration.storeSignedCopy.mockResolvedValue({
      documentId: 'doc-signed',
      alreadyStored: false,
    });
  });

  it('on completion records the status, files the signed copy and moves the deal to marketing', async () => {
    const res = await service().handleWebhook({
      event: 'envelope-completed',
      data: { envelopeId: 'env-1' },
    });

    expect(res).toEqual({ message: 'Webhook processed', status: 'completed' });
    expect(prisma.contract.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: {
        status: 'completed',
        metadata: {
          emailSubject: 'Purchase Agreement for 123 Main St',
          lastEvent: 'envelope-completed',
        },
      },
    });
    expect(integration.storeSignedCopy).toHaveBeenCalledWith('c1', 'acct');
    expect(deals.updateStage).toHaveBeenCalledWith(
      'deal-1',
      'acct',
      'marketing',
      null,
      'webhook',
    );
    expect(timeline.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'DEAL',
        entityId: 'deal-1',
        eventType: 'DOCUSIGN_ENVELOPE_COMPLETED',
        payload: expect.objectContaining({
          status: 'completed',
          signedDocumentId: 'doc-signed',
        }),
      }),
    );
  });

  it('keeps the webhook green when the signed copy cannot be stored yet', async () => {
    integration.storeSignedCopy.mockRejectedValue(
      new Error('DocuSign download failed'),
    );
    await expect(
      service().handleWebhook({
        event: 'envelope-completed',
        data: { envelopeId: 'env-1' },
      }),
    ).resolves.toMatchObject({ message: 'Webhook processed' });
    expect(deals.updateStage).toHaveBeenCalled();
  });

  it('records a decline without touching the deal', async () => {
    await service().handleWebhook({
      event: 'recipient-declined',
      data: { envelopeId: 'env-1' },
    });
    expect(prisma.contract.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'declined' }),
      }),
    );
    expect(integration.storeSignedCopy).not.toHaveBeenCalled();
    expect(deals.updateStage).not.toHaveBeenCalled();
  });

  it('ignores envelopes it does not know and events without an id', async () => {
    prisma.contract.findUnique.mockResolvedValue(null);
    await expect(
      service().handleWebhook({
        event: 'envelope-sent',
        data: { envelopeId: 'nope' },
      }),
    ).resolves.toEqual({ message: 'Contract not found' });
    await expect(
      service().handleWebhook({ event: 'envelope-sent' }),
    ).resolves.toEqual({
      message: 'No envelope ID',
    });
    expect(prisma.contract.update).not.toHaveBeenCalled();
  });
});

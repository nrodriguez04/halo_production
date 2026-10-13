const mockPrisma = {
  jobRun: { update: jest.fn().mockResolvedValue({}) },
  deal: { findFirst: jest.fn() },
  controlPlane: { findUnique: jest.fn() },
  buyer: { findMany: jest.fn().mockResolvedValue([]) },
  message: { create: jest.fn().mockResolvedValue({ id: 'msg-1' }) },
  marketingMaterial: {
    create: jest
      .fn()
      .mockResolvedValue({ id: 'mm-1', type: 'flyer', content: 'x' }),
  },
  timelineEvent: { create: jest.fn().mockResolvedValue({}) },
};
const mockChat = jest.fn();

jest.mock('../../prisma-client', () => ({ prisma: mockPrisma }));
jest.mock('../../ai-spend', () => ({
  aiSpendSince: jest.fn().mockResolvedValue(0),
}));
jest.mock('../../control-plane', () => ({
  getControlPlane: jest.fn().mockResolvedValue({
    enabled: true,
    externalDataEnabled: true,
  }),
}));
jest.mock('../../internal-api.client', () => {
  const actual = jest.requireActual('../../internal-api.client');
  return {
    ...actual,
    chatCompletion: (...args: unknown[]) => mockChat(...args),
  };
});

import { MarketingProcessor } from '../marketing.processor';

const deal = (economics: Record<string, unknown> | null = null) => ({
  id: 'deal-1',
  accountId: 'tenant-1',
  arv: 172000,
  repairEstimate: 32000,
  mao: 78400,
  offerAmount: 72000,
  property: { address: '2418 Pecan Grove Dr', city: 'Memphis', state: 'TN' },
  underwritingResult: null,
  economics,
});

const job = (type: 'GENERATE_FLYER_DRAFT' | 'GENERATE_BUYER_BLAST_DRAFT') =>
  ({
    data: {
      jobRunId: 'job-1',
      tenantId: 'tenant-1',
      dealId: 'deal-1',
      type,
      buyerIds: ['b-1'],
    },
  }) as any;

const promptSent = () =>
  mockChat.mock.calls[0][1].messages[1].content as string;

describe('MarketingProcessor buyer pricing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChat.mockResolvedValue({
      content: 'flyer',
      model: 'gpt-4o',
      tokensIn: 100,
      tokensOut: 50,
    });
    mockPrisma.controlPlane.findUnique.mockResolvedValue({
      defaultAssignmentFee: 10000,
    });
  });

  it('prices the flyer at the offer plus the fee and never shows the offer', async () => {
    mockPrisma.deal.findFirst.mockResolvedValue(deal());
    await new MarketingProcessor().process(job('GENERATE_FLYER_DRAFT'));
    const prompt = promptSent();
    expect(prompt).toContain('"askingPrice": 82000');
    // Whole number only: "172000" (the ARV) is fine.
    expect(prompt).not.toMatch(/\b72000\b/);
    expect(prompt).not.toContain('offerAmount');
  });

  it('uses the asking price a person set for the legacy buyer blast', async () => {
    mockPrisma.deal.findFirst.mockResolvedValue(
      deal({ assignmentPrice: 89500 }),
    );
    await new MarketingProcessor().process(job('GENERATE_BUYER_BLAST_DRAFT'));
    expect(promptSent()).toContain('"askingPrice": 89500');
  });

  it("uses the tenant's fee", async () => {
    mockPrisma.controlPlane.findUnique.mockResolvedValue({
      defaultAssignmentFee: 15000,
    });
    mockPrisma.deal.findFirst.mockResolvedValue(deal());
    await new MarketingProcessor().process(job('GENERATE_FLYER_DRAFT'));
    expect(promptSent()).toContain('"askingPrice": 87000');
  });
});

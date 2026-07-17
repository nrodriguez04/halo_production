import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ControlPlaneService } from '../../../control-plane/control-plane.service';
import { DealsService } from '../../../deals/deals.service';
import { PrismaService } from '../../../prisma.service';
import { TimelineService } from '../../../timeline/timeline.service';
import { DocuSignService } from '../docusign.service';

describe('DocuSignService', () => {
  let service: DocuSignService;
  let prisma: any;
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    prisma = {
      contract: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocuSignService,
        { provide: PrismaService, useValue: prisma },
        { provide: ControlPlaneService, useValue: {} },
        { provide: TimelineService, useValue: {} },
        { provide: DealsService, useValue: {} },
      ],
    }).compile();

    service = module.get<DocuSignService>(DocuSignService);
    fetchMock = jest.fn();
    (global as typeof globalThis & { fetch: typeof fetchMock }).fetch =
      fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (global as typeof globalThis & { fetch: typeof originalFetch }).fetch =
      originalFetch;
  });

  describe('getEnvelopeStatus', () => {
    it('rejects foreign envelopes before calling DocuSign', async () => {
      prisma.contract.findFirst.mockResolvedValue(null);

      await expect(
        service.getEnvelopeStatus('env-1', 'tenant-1'),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.contract.findFirst).toHaveBeenCalledWith({
        where: {
          docusignEnvelopeId: 'env-1',
          deal: {
            is: {
              accountId: 'tenant-1',
            },
          },
        },
        select: {
          id: true,
        },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns status for owned envelopes', async () => {
      prisma.contract.findFirst.mockResolvedValue({ id: 'contract-1' });
      jest
        .spyOn(service as any, 'getAccessToken')
        .mockResolvedValue('token-1');
      fetchMock.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ status: 'completed' }),
      });

      await expect(service.getEnvelopeStatus('env-1', 'tenant-1')).resolves
        .toEqual({ status: 'completed' });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/envelopes/env-1'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token-1',
          }),
        }),
      );
    });
  });

  describe('downloadPDF', () => {
    it('rejects foreign envelopes before fetching the PDF', async () => {
      prisma.contract.findFirst.mockResolvedValue(null);

      await expect(
        service.downloadPDF('env-1', 'tenant-1'),
      ).rejects.toThrow(NotFoundException);

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

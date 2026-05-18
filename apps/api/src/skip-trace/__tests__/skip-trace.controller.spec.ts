import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { SkipTraceController } from '../skip-trace.controller';

describe('SkipTraceController', () => {
  const body = {
    leadId: 'lead_1',
    propertyAddress: '1 Main St',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
  };

  let service: { appendContacts: jest.Mock };
  let prisma: { lead: { findUnique: jest.Mock } };
  let controller: SkipTraceController;

  beforeEach(() => {
    service = {
      appendContacts: jest.fn().mockResolvedValue({
        provider: 'batch_skiptrace',
        status: 'matched',
        phones: [],
        emails: [],
        costUsd: 0.12,
      }),
    };
    prisma = {
      lead: {
        findUnique: jest.fn(),
      },
    };
    controller = new SkipTraceController(service as any, prisma as any);
    process.env.INTERNAL_API_TOKEN = 'internal-service-token';
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_TOKEN;
  });

  it('uses the authenticated tenant for browser requests', async () => {
    prisma.lead.findUnique.mockResolvedValueOnce({ accountId: 'acct_browser' });

    await controller.appendContacts(
      makeRequest({
        authorization: 'Bearer browser-session-token',
      }),
      'acct_browser',
      'user_1',
      body,
    );

    expect(service.appendContacts).toHaveBeenCalledWith(body, {
      accountId: 'acct_browser',
      actor: 'user',
      userId: 'user_1',
      leadId: 'lead_1',
    });
  });

  it('honors the forwarded tenant for internal worker calls', async () => {
    prisma.lead.findUnique.mockResolvedValueOnce({ accountId: 'acct_worker' });

    await controller.appendContacts(
      makeRequest({
        authorization: 'Bearer internal-service-token',
        'x-halo-account-id': 'acct_worker',
      }),
      'acct_token',
      'svc_user',
      body,
    );

    expect(service.appendContacts).toHaveBeenCalledWith(body, {
      accountId: 'acct_worker',
      actor: 'worker',
      userId: 'svc_user',
      leadId: 'lead_1',
    });
  });

  it('rejects cross-tenant access when the lead belongs to another account', async () => {
    prisma.lead.findUnique.mockResolvedValueOnce({ accountId: 'acct_other' });

    await expect(
      controller.appendContacts(
        makeRequest({
          authorization: 'Bearer browser-session-token',
        }),
        'acct_browser',
        'user_1',
        body,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(service.appendContacts).not.toHaveBeenCalled();
  });
});

function makeRequest(headers: Record<string, string>): Request {
  return {
    headers,
  } as Request;
}

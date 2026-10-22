/**
 * Shared setup for the real-database integration suites. Every record is a
 * SYNTHETIC fixture on a throwaway tenant; nothing is sent (the queue is
 * stubbed) and nothing reaches a real bucket (storage is in memory).
 *
 * Import this file before anything that touches Prisma: it points
 * DATABASE_URL at INTEGRATION_DATABASE_URL.
 */
import { randomUUID } from 'crypto';
import { Global, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Readable } from 'stream';

export const DB = process.env.INTEGRATION_DATABASE_URL;
if (DB) process.env.DATABASE_URL = DB;
process.env.PII_ENCRYPTION_KEY_V1 =
  process.env.PII_ENCRYPTION_KEY_V1 ?? '11'.repeat(32);
process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION =
  process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION ?? '1';
process.env.PII_INDEX_KEY = process.env.PII_INDEX_KEY ?? '22'.repeat(32);
process.env.PUBLIC_APP_URL = 'https://app.synthetic.test';
process.env.NODE_ENV = 'test';

import {
  emptyPolicyContent,
  type ActivationStatus,
  type MarketPolicyContent,
  type TemplateKind,
} from '@halo/shared';
import { PrismaService } from '../../src/prisma.service';
import { PrismaModule } from '../../src/prisma.module';
import { DispositionModule } from '../../src/disposition/disposition.module';
import { ComplianceModule } from '../../src/compliance/compliance.module';
import { ControlPlaneModule } from '../../src/control-plane/control-plane.module';
import { PIIModule } from '../../src/pii/pii.module';
import { LeadPiiModule } from '../../src/leads/lead-pii.module';
import { AuditModule } from '../../src/audit/audit.module';
import { OpsAlertService } from '../../src/alerts/ops-alert.service';
import { QueueService } from '../../src/queues/queue.service';
import { AuthGuard } from '../../src/auth/auth.guard';
import { PermissionsGuard } from '../../src/auth/permissions.guard';
import { StorageService } from '../../src/storage/storage.service';
import { MarketsModule } from '../../src/markets/markets.module';
import { MarketsService } from '../../src/markets/markets.service';
import { TemplatesModule } from '../../src/templates/templates.module';
import { TemplatesService } from '../../src/templates/templates.service';
import { DataModule } from '../../src/data/data.module';
import { IntegrationCostControlService } from '../../src/cost-control/cost-control.service';

export const describeDb = DB ? describe : describe.skip;

@Global()
@Module({
  providers: [
    {
      provide: OpsAlertService,
      useValue: { send: jest.fn(), configured: () => false },
    },
  ],
  exports: [OpsAlertService],
})
class TestAlertsModule {}

/**
 * Paid provider calls are never made from these suites. A stub stands in
 * for cost control, so nothing connects to Redis or a provider.
 */
@Global()
@Module({
  providers: [
    {
      provide: IntegrationCostControlService,
      useValue: {
        checkAndCall: jest.fn(async () => {
          throw new Error('No provider calls in integration tests');
        }),
      },
    },
  ],
  exports: [IntegrationCostControlService],
})
class TestCostControlModule {}

/** Object storage in memory: the suites never touch a real bucket. */
export const objects = new Map<string, Buffer>();
export const memoryStorage = {
  upload: jest.fn(
    async (tenant: string, category: string, name: string, body: Buffer) => {
      const key = `${tenant}/${category}/${name}`;
      objects.set(key, Buffer.from(body));
      return { key };
    },
  ),
  download: jest.fn(async (key: string) => ({
    body: Readable.from([objects.get(key) ?? Buffer.alloc(0)]),
    contentType: 'application/octet-stream',
  })),
  delete: jest.fn(async (key: string) => void objects.delete(key)),
};

export const d = (days: number) => new Date(Date.now() + days * 86_400_000);
export const USER = 'synthetic-operator';

/** Every confirmation a person gives when verifying a seller contract. */
export const ALL_CONFIRMED = {
  parties: true,
  property: true,
  purchase_price: true,
  earnest_money: true,
  closing_deadline: true,
  assignment_clause: true,
  signatures: true,
  legal_sufficiency: true,
  disclosures: true,
} as const;

export const queue = {
  enqueueCommunication: jest.fn().mockResolvedValue({}),
  enqueueAgent: jest.fn().mockResolvedValue({}),
};

export async function buildModule(): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [
      PrismaModule,
      TestAlertsModule,
      TestCostControlModule,
      ComplianceModule,
      ControlPlaneModule,
      PIIModule,
      LeadPiiModule,
      AuditModule,
      DispositionModule,
      MarketsModule,
      TemplatesModule,
      DataModule,
    ],
  })
    .overrideProvider(QueueService)
    .useValue(queue)
    .overrideProvider(StorageService)
    .useValue(memoryStorage)
    .overrideGuard(AuthGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(PermissionsGuard)
    .useValue({ canActivate: () => true })
    .compile();
}

/** SYNTHETIC template wording with every field each kind requires. */
export const SYNTHETIC_TEMPLATE_TEXT: Record<TemplateKind, string> = {
  purchase_agreement:
    'SYNTHETIC PURCHASE AGREEMENT dated {{effective_date}}\nSeller {{seller_name}} sells to {{buyer_entity}} the property at {{property_address}}, ' +
    '{{property_city}}, {{property_state}} for {{purchase_price}}. Earnest money {{earnest_money}}. Close by {{closing_deadline}}. ' +
    'Buyer may assign this agreement.\n[SELLER_SIGNATURE]',
  assignment_agreement:
    'SYNTHETIC ASSIGNMENT: {{assignor_entity}} assigns to {{assignee_name}} its contract of {{original_contract_date}} for {{property_address}}. ' +
    'Total price {{assignment_price}}, including an assignment fee of {{assignment_fee}}.\n[BUYER_SIGNATURE]',
  seller_disclosure:
    'SYNTHETIC NOTICE TO SELLER {{seller_name}}: {{buyer_entity}} intends to assign its contract for {{property_address}}.\n[SELLER_SIGNATURE]',
  buyer_disclosure:
    'SYNTHETIC NOTICE: {{assignor_entity}} holds only a contract interest in {{property_address}}, not title.\n[BUYER_SIGNATURE]',
  cancellation_notice:
    'SYNTHETIC NOTICE TO {{seller_name}}: you may cancel the contract with {{buyer_entity}} for {{property_address}} until {{cancellation_deadline}}.',
  notice: 'SYNTHETIC NOTICE about {{property_address}}.',
};

/** A policy counsel could approve: assignment and two channels permitted, nothing unknown that matters. */
export function synthMarketContent(
  over: (c: MarketPolicyContent) => void = () => {},
): MarketPolicyContent {
  const c = emptyPolicyContent();
  c.summary = 'SYNTHETIC policy for tests; not a statement about any state.';
  c.answers.principal_assignment_without_license = {
    answer: 'yes',
    note: 'SYNTHETIC',
    sourceIds: [],
  };
  c.answers.wholesaler_registration_required = {
    answer: 'no',
    note: '',
    sourceIds: [],
  };
  c.answers.license_required_for_activity = {
    answer: 'no',
    note: '',
    sourceIds: [],
  };
  c.answers.disclosures_required = { answer: 'no', note: '', sourceIds: [] };
  c.answers.seller_cancellation_right = {
    answer: 'no',
    note: '',
    sourceIds: [],
  };
  c.answers.out_of_state_entity_requirements = {
    answer: 'no',
    note: '',
    sourceIds: [],
  };
  c.structures.assignment = { permission: 'allowed', conditions: null };
  c.channels.investor_email = { permission: 'allowed', conditions: null };
  c.channels.buyer_deal_page = { permission: 'allowed', conditions: null };
  over(c);
  return c;
}

export function fixtures(moduleRef: TestingModule) {
  const prisma = moduleRef.get(PrismaService);
  const markets = moduleRef.get(MarketsService);
  const templates = moduleRef.get(TemplatesService);
  const tenants: string[] = [];

  function tenant() {
    const id = `synthetic-${randomUUID()}`;
    tenants.push(id);
    return id;
  }

  async function cleanup() {
    for (const accountId of tenants) {
      await prisma.closingFile.deleteMany({ where: { accountId } });
      await prisma.deal.deleteMany({ where: { accountId } });
      await prisma.buyer.deleteMany({ where: { accountId } });
      await prisma.lead.deleteMany({ where: { accountId } });
      await prisma.property.deleteMany({ where: { accountId } });
      await prisma.document.deleteMany({ where: { accountId } });
      await prisma.message.deleteMany({ where: { accountId } });
      await prisma.consent.deleteMany({ where: { accountId } });
      await prisma.dNCList.deleteMany({ where: { accountId } });
      await prisma.market.deleteMany({ where: { accountId } });
      await prisma.marketPolicyVersion.deleteMany({ where: { accountId } });
      await prisma.marketAuthorization.deleteMany({ where: { accountId } });
      await prisma.documentTemplate.deleteMany({ where: { accountId } });
      await prisma.documentGeneration.deleteMany({ where: { accountId } });
      await prisma.recordedSale.deleteMany({ where: { accountId } });
      await prisma.dataImport.deleteMany({ where: { accountId } });
      await prisma.buyerCandidate.deleteMany({ where: { accountId } });
      await prisma.timelineEvent.deleteMany({ where: { tenantId: accountId } });
      await prisma.auditLog.deleteMany({ where: { accountId } });
      await prisma.controlPlane.deleteMany({ where: { accountId } });
    }
  }

  /** A library document row (no bytes unless `body` is given). */
  async function doc(
    accountId: string,
    title: string,
    link: { dealId?: string; buyerId?: string; leadId?: string } = {},
    tags: string[] = [],
    category = 'contract',
    body?: { text?: string; buffer?: Buffer; fileName: string },
  ) {
    const storageKey = `${accountId}/documents/${randomUUID()}-${body?.fileName ?? 'synthetic.pdf'}`;
    const bytes = body
      ? (body.buffer ?? Buffer.from(body.text ?? '', 'utf8'))
      : null;
    if (bytes) objects.set(storageKey, bytes);
    return prisma.document.create({
      data: {
        accountId,
        category,
        title: `SYNTHETIC ${title}`,
        storageKey,
        fileName: body?.fileName ?? 'synthetic.pdf',
        contentType: 'application/octet-stream',
        sizeBytes: bytes?.length ?? 1,
        tags,
        ...link,
      },
    });
  }

  async function seedDeal(
    accountId: string,
    state = 'GA',
    stage = 'negotiating',
  ) {
    const lead = await prisma.lead.create({
      data: {
        accountId,
        status: 'qualified',
        canonicalAddress: '100 Synthetic Test St',
        canonicalCity: 'Atlanta',
        canonicalState: state,
        canonicalZip: '30310',
        canonicalOwner: 'SYNTHETIC Seller',
      },
    });
    const property = await prisma.property.create({
      data: {
        accountId,
        leadId: lead.id,
        address: '100 Synthetic Test St',
        city: 'Atlanta',
        state,
        zip: '30310',
      },
    });
    return prisma.deal.create({
      data: {
        accountId,
        leadId: lead.id,
        propertyId: property.id,
        stage,
        arv: 260_000,
        repairEstimate: 40_000,
        mao: 130_000,
        offerAmount: 120_000,
      },
    });
  }

  /** A template counsel approved for these jurisdictions. */
  async function approvedTemplate(
    accountId: string,
    kind: TemplateKind,
    states: string[],
    file?: { text?: string; buffer?: Buffer; fileName: string },
  ) {
    const source = await doc(
      accountId,
      `${kind} template`,
      {},
      [],
      'agreement_template',
      file ?? { text: SYNTHETIC_TEMPLATE_TEXT[kind], fileName: `${kind}.txt` },
    );
    const { version } = await templates.create(accountId, USER, {
      kind,
      name: `SYNTHETIC ${kind} ${states.join('/')}`,
      documentId: source.id,
      states,
    });
    const approval = await doc(
      accountId,
      'Counsel template approval',
      {},
      [],
      'compliance',
    );
    return templates.approve(accountId, version.id, USER, {
      counselName: 'SYNTHETIC Counsel',
      approvalDocumentId: approval.id,
      attest: true,
    });
  }

  /**
   * A market counsel approved, with its templates, set to a status. The
   * content defaults to a synthetic policy that permits assignment.
   */
  async function approvedMarket(
    accountId: string,
    state = 'GA',
    opts: {
      status?: ActivationStatus | null;
      content?: MarketPolicyContent;
      classification?: 'A' | 'B' | 'C' | 'D';
    } = {},
  ) {
    const content = opts.content ?? synthMarketContent();
    await markets.updateDraft(accountId, state, USER, {
      content,
      classification: opts.classification ?? 'A',
    });
    await markets.submit(accountId, state, USER);
    const memo = await doc(accountId, 'Counsel memo', {}, [], 'compliance');
    await markets.approve(accountId, state, USER, {
      counselName: 'SYNTHETIC Counsel',
      memoDocumentId: memo.id,
      attest: true,
    });
    const kinds = new Set<TemplateKind>([
      'purchase_agreement',
      'assignment_agreement',
    ]);
    for (const disc of content.disclosures)
      if (disc.templateKind) kinds.add(disc.templateKind);
    for (const kind of kinds) await approvedTemplate(accountId, kind, [state]);
    for (const r of content.requirements) {
      const evidence = await doc(
        accountId,
        `${r.label} evidence`,
        {},
        [],
        'compliance',
      );
      const a = await markets.createAuthorization(accountId, state, USER, {
        kind: r.kind,
        holderName: 'SYNTHETIC Acquisitions LLC',
        documentId: evidence.id,
      });
      await markets.verifyAuthorization(accountId, a.id, USER);
    }
    if (opts.status !== null) {
      await markets.setStatus(accountId, state, USER, {
        status: opts.status ?? 'APPROVED_FOR_DISPOSITION',
        note: 'SYNTHETIC test activation',
      });
    }
  }

  return {
    prisma,
    markets,
    templates,
    tenant,
    cleanup,
    doc,
    seedDeal,
    approvedTemplate,
    approvedMarket,
  };
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TimelineActorType, TimelineEntityType } from '@prisma/client';
import { PolicyViolationError, assertPolicy } from '@halo/shared';
import * as crypto from 'crypto';
import type { Readable } from 'stream';
import { PrismaService } from '../../prisma.service';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import { TimelineService } from '../../timeline/timeline.service';
import { DealsService } from '../../deals/deals.service';
import { LeadPiiService } from '../../leads/lead-pii.service';
import { DocumentsService } from '../../documents/documents.service';
import { IntegrationSecretsService } from '../../integration-secrets/integration-secrets.service';
import { IntegrationCostControlService } from '../../cost-control/cost-control.service';
import { CostBlockedException } from '../../cost-control/cost-blocked.exception';
import { IntegrationUnavailableException } from '../integration-unavailable.exception';
import { openValue } from '../../pii/contact-crypto';
import { DisclosureGateService } from '../../compliance/disclosure-gate.service';
import { envelopePurpose } from './docusign.dto';
import { PurchaseAgreementsService } from '../../disposition/purchase-agreements.service';
import { AssignmentsService } from '../../disposition/assignments.service';
import { DispositionEligibilityService } from '../../disposition/eligibility.service';
import {
  DocuSignAuthError,
  parseEnv,
  requestSession,
  type DocuSignConfig,
  type DocuSignSession,
} from './docusign-auth';
import type {
  CreateEnvelopeInput,
  EnvelopeRecipientInput,
} from './docusign.dto';

export const DOCUSIGN_KEYS = {
  integrationKey: 'DOCUSIGN_CLIENT_ID',
  userId: 'DOCUSIGN_USER_ID',
  accountId: 'DOCUSIGN_ACCOUNT_ID',
  privateKey: 'DOCUSIGN_RSA_PRIVATE_KEY',
  env: 'DOCUSIGN_ENV',
  baseUrl: 'DOCUSIGN_BASE_URL',
  connectSecret: 'DOCUSIGN_CONNECT_SECRET',
} as const;

/** Anchor strings a template can carry so tabs land where the drafter put them. */
export const ANCHOR_TAGS: Record<string, { sign: string; date: string }> = {
  seller: { sign: '[SELLER_SIGNATURE]', date: '[SELLER_DATE]' },
  buyer: { sign: '[BUYER_SIGNATURE]', date: '[BUYER_DATE]' },
  other: { sign: '[OTHER_SIGNATURE]', date: '[OTHER_DATE]' },
};

const SUPPORTED_EXT = /\.(pdf|docx?|txt|rtf|png|jpe?g)$/i;
const MAX_ENVELOPE_BYTES = 25 * 1024 * 1024;

interface ResolvedSigner {
  role: EnvelopeRecipientInput['role'];
  name: string;
  email: string;
  recipientId: string;
  routingOrder: string;
  buyerId?: string;
}

export interface ContractMetadata {
  emailSubject: string;
  env: string;
  documents: Array<{ id: string; title: string; fileName: string }>;
  /** Roles and names only; addresses stay sealed on their own rows. */
  recipients: Array<{
    role: string;
    name: string;
    recipientId: string;
    buyerId?: string;
  }>;
  sentBy: string | null;
  signedDocumentId?: string;
  lastEvent?: string;
  /** The assignment an `assignment` envelope executes. */
  assignmentId?: string;
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Envelopes built from the documents library and sent to real people: the
 * seller on the deal's lead, a buyer from the buyer list, or a named
 * recipient a person typed. Contacts are revealed here, api-side, never
 * stored in metadata. Auth is the JWT grant (docusign-auth.ts) with keys
 * from the Integrations page.
 */
@Injectable()
export class DocuSignService {
  private readonly logger = new Logger(DocuSignService.name);
  private sessions = new Map<string, DocuSignSession>();

  constructor(
    private prisma: PrismaService,
    private controlPlane: ControlPlaneService,
    private timelineService: TimelineService,
    private dealsService: DealsService,
    private readonly pii: LeadPiiService,
    private readonly secrets: IntegrationSecretsService,
    private readonly documents: DocumentsService,
    private readonly costControl: IntegrationCostControlService,
    private readonly disclosure: DisclosureGateService,
    private agreements: PurchaseAgreementsService,
    private assignments: AssignmentsService,
    private eligibility: DispositionEligibilityService,
  ) {}

  // ------------------------------------------------------------ auth

  async loadConfig(): Promise<DocuSignConfig> {
    const [integrationKey, userId, accountId, privateKey, env, baseUrl] =
      await Promise.all([
        this.secrets.resolve('docusign', DOCUSIGN_KEYS.integrationKey),
        this.secrets.resolve('docusign', DOCUSIGN_KEYS.userId),
        this.secrets.resolve('docusign', DOCUSIGN_KEYS.accountId),
        this.secrets.resolve('docusign', DOCUSIGN_KEYS.privateKey),
        this.secrets.resolve('docusign', DOCUSIGN_KEYS.env),
        this.secrets.resolve('docusign', DOCUSIGN_KEYS.baseUrl),
      ]);
    const missing = (
      [
        [integrationKey, DOCUSIGN_KEYS.integrationKey],
        [userId, DOCUSIGN_KEYS.userId],
        [accountId, DOCUSIGN_KEYS.accountId],
        [privateKey, DOCUSIGN_KEYS.privateKey],
      ] as const
    ).find(([value]) => !value?.trim());
    if (missing) {
      throw IntegrationUnavailableException.notConfigured(
        'docusign',
        missing[1],
      );
    }
    return {
      integrationKey: integrationKey!.trim(),
      userId: userId!.trim(),
      accountId: accountId!.trim(),
      privateKey: privateKey!,
      env: parseEnv(env),
      baseUrl: baseUrl?.trim() || null,
    };
  }

  private async session(): Promise<DocuSignSession> {
    const cfg = await this.loadConfig();
    const key = `${cfg.env}:${cfg.integrationKey}:${cfg.userId}:${cfg.accountId}`;
    const cached = this.sessions.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached;
    try {
      const session = await requestSession(cfg);
      this.sessions.set(key, session);
      return session;
    } catch (err) {
      throw this.unavailable(err);
    }
  }

  private unavailable(err: unknown): IntegrationUnavailableException {
    if (err instanceof DocuSignAuthError) {
      const detail = err.consentUrl
        ? `${err.message}. Grant it here: ${err.consentUrl}`
        : err.message;
      return new IntegrationUnavailableException(
        'docusign',
        err.code === 'consent_required' || err.code === 'invalid_grant'
          ? 'REJECTED_CREDENTIALS'
          : 'UPSTREAM_ERROR',
        detail,
      );
    }
    if (err instanceof IntegrationUnavailableException) return err;
    return new IntegrationUnavailableException(
      'docusign',
      'UPSTREAM_ERROR',
      (err as Error).message,
    );
  }

  /** The Integrations page's connection test: a fresh JWT grant plus account lookup. */
  async testConnection(): Promise<{
    connected: boolean;
    error?: string;
    details?: Record<string, unknown>;
  }> {
    try {
      const cfg = await this.loadConfig();
      const session = await requestSession(cfg);
      return {
        connected: true,
        details: {
          env: cfg.env,
          accountName: session.accountName,
          accountId: session.accountId,
          baseUri: session.baseUri,
        },
      };
    } catch (err) {
      if (err instanceof DocuSignAuthError) {
        return {
          connected: false,
          error: err.consentUrl
            ? `${err.message}. Open this URL as the API user, accept, then test again: ${err.consentUrl}`
            : err.message,
        };
      }
      return { connected: false, error: (err as Error).message };
    }
  }

  private apiUrl(session: DocuSignSession, path: string): string {
    return `${session.baseUri}/restapi/v2.1/accounts/${session.accountId}${path}`;
  }

  // ------------------------------------------------------------ envelopes

  async createEnvelope(
    accountId: string,
    userId: string | null,
    input: CreateEnvelopeInput,
  ) {
    if (!(await this.controlPlane.isDocuSignEnabled(accountId))) {
      throw IntegrationUnavailableException.disabled('docusign');
    }
    const deal = await this.prisma.deal.findFirst({
      where: { id: input.dealId, accountId },
      include: { property: true, lead: true },
    });
    if (!deal) throw new NotFoundException(`Deal ${input.dealId} not found`);

    const controlPlane = await this.controlPlane.getStatus(accountId);
    try {
      assertPolicy({
        tenantId: accountId,
        actorId: userId,
        actorType: 'user',
        now: new Date(),
        requestedAction: 'docusign.create_envelope',
        channel: 'docusign',
        dealId: deal.id,
        sideEffectsEnabled: controlPlane.enabled,
      });
    } catch (error) {
      if (error instanceof PolicyViolationError) {
        throw new ForbiddenException({
          code: error.code,
          reason: error.reason,
        });
      }
      throw error;
    }

    if (input.recipients.some((r) => r.role === 'buyer')) {
      await this.disclosure.assertEquitableInterest(
        accountId,
        deal.id,
        'sending a contract to a buyer',
      );
    }
    const purpose = envelopePurpose(input);
    if (purpose === 'assignment') {
      // An assignment transfers our position: only the one a person approved,
      // to that buyer, while the deal may still be assigned.
      const assignment = await this.prisma.assignmentAgreement.findFirst({
        where: { id: input.assignmentId, accountId, dealId: deal.id },
      });
      if (!assignment || assignment.status !== 'draft') {
        throw new BadRequestException(
          'An assignment envelope needs a draft assignment on this deal (accept an offer first).',
        );
      }
      const buyers = input.recipients.filter((r) => r.role === 'buyer');
      if (buyers.length !== 1 || buyers[0].buyerId !== assignment.buyerId) {
        throw new BadRequestException(
          'The assignment goes to the buyer whose offer was accepted, and only to them.',
        );
      }
      await this.eligibility.assertEligible(
        accountId,
        deal.id,
        'sending an assignment for signature',
      );
    }
    const docs = await this.loadDocuments(accountId, input.documentIds);
    const signers = await this.resolveRecipients(
      accountId,
      deal,
      input.recipients,
    );
    const emailSubject =
      input.emailSubject?.trim() ||
      `Purchase Agreement for ${deal.property?.address ?? 'the property'}`;
    const cfg = await this.loadConfig();

    const envelopeDefinition = {
      status: 'sent',
      emailSubject,
      emailBlurb: input.emailBlurb?.trim() || undefined,
      documents: docs.map((d, i) => ({
        documentBase64: d.buffer.toString('base64'),
        name: d.title,
        fileExtension: d.extension,
        documentId: String(i + 1),
      })),
      recipients: {
        signers: signers.map((s) => ({
          email: s.email,
          name: s.name,
          recipientId: s.recipientId,
          routingOrder: s.routingOrder,
          tabs: {
            signHereTabs: [
              {
                anchorString: ANCHOR_TAGS[s.role].sign,
                anchorUnits: 'pixels',
                anchorXOffset: '0',
                anchorYOffset: '0',
                anchorIgnoreIfNotPresent: 'true',
              },
            ],
            dateSignedTabs: [
              {
                anchorString: ANCHOR_TAGS[s.role].date,
                anchorUnits: 'pixels',
                anchorXOffset: '0',
                anchorYOffset: '0',
                anchorIgnoreIfNotPresent: 'true',
              },
            ],
          },
        })),
      },
    };

    const fingerprint = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          d: input.documentIds,
          r: signers.map((s) => [s.role, s.email]),
          s: emailSubject,
        }),
      )
      .digest('hex')
      .slice(0, 16);
    const out = await this.costControl.checkAndCall<
      { dealId: string; documents: number; signers: number },
      { envelopeId: string; status: string }
    >({
      provider: 'docusign',
      action: 'create_envelope',
      payload: {
        dealId: deal.id,
        documents: docs.length,
        signers: signers.length,
      },
      context: {
        accountId,
        dealId: deal.id,
        actor: 'user',
        userId: userId ?? undefined,
      },
      hints: { idempotencyKey: `docusign:envelope:${deal.id}:${fingerprint}` },
      execute: async () => {
        const session = await this.session();
        const res = await fetch(this.apiUrl(session, '/envelopes'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(envelopeDefinition),
        });
        if (!res.ok) {
          const text = await res.text();
          if (res.status === 401 || res.status === 403) {
            this.sessions.clear();
            throw new IntegrationUnavailableException(
              'docusign',
              'REJECTED_CREDENTIALS',
              `${res.status} ${text.slice(0, 300)}`,
            );
          }
          throw new IntegrationUnavailableException(
            'docusign',
            'UPSTREAM_ERROR',
            `envelope creation failed: ${res.status} ${text.slice(0, 300)}`,
          );
        }
        const body = (await res.json()) as {
          envelopeId: string;
          status: string;
        };
        return { envelopeId: body.envelopeId, status: body.status };
      },
    });
    if (!out.result) {
      throw new CostBlockedException(
        out.decision,
        'docusign',
        'create_envelope',
      );
    }
    const envelope = out.result;

    const metadata: ContractMetadata = {
      emailSubject,
      env: cfg.env,
      documents: docs.map((d) => ({
        id: d.id,
        title: d.title,
        fileName: d.fileName,
      })),
      recipients: signers.map((s) => ({
        role: s.role,
        name: s.name,
        recipientId: s.recipientId,
        ...(s.buyerId ? { buyerId: s.buyerId } : {}),
      })),
      sentBy: userId,
      ...(input.assignmentId ? { assignmentId: input.assignmentId } : {}),
    };
    const contract = await this.prisma.contract.create({
      data: {
        dealId: deal.id,
        docusignEnvelopeId: envelope.envelopeId,
        status: envelope.status === 'sent' ? 'sent' : envelope.status,
        purpose,
        metadata: metadata as unknown as Prisma.InputJsonObject,
      },
    });
    if (purpose === 'purchase_agreement') {
      await this.agreements.onEnvelopeSent(
        accountId,
        deal.id,
        contract.id,
        userId,
      );
    } else if (purpose === 'assignment' && input.assignmentId) {
      await this.assignments.onEnvelopeSent(
        accountId,
        input.assignmentId,
        contract.id,
      );
    }

    if (deal.stage === 'negotiating' && purpose === 'purchase_agreement') {
      await this.dealsService.updateStage(
        deal.id,
        accountId,
        'under_contract',
        userId,
        userId ? TimelineActorType.user : TimelineActorType.system,
      );
    }

    await this.timelineService.appendEvent({
      tenantId: accountId,
      entityType: TimelineEntityType.DEAL,
      entityId: deal.id,
      eventType: 'DOCUSIGN_ENVELOPE_CREATED',
      payload: {
        envelopeId: envelope.envelopeId,
        contractId: contract.id,
        documents: metadata.documents.map((d) => d.title),
        recipients: metadata.recipients.map((r) => `${r.role}: ${r.name}`),
      },
      actorId: userId,
      actorType: userId ? TimelineActorType.user : TimelineActorType.system,
    });

    return {
      contractId: contract.id,
      envelopeId: envelope.envelopeId,
      status: contract.status,
    };
  }

  /** Library documents for the envelope: owned by the tenant, a supported type, within size. */
  private async loadDocuments(accountId: string, ids: string[]) {
    const unique = Array.from(new Set(ids));
    const out: Array<{
      id: string;
      title: string;
      fileName: string;
      extension: string;
      buffer: Buffer;
    }> = [];
    let total = 0;
    for (const id of unique) {
      const doc = await this.documents.get(accountId, id);
      const ext = doc.fileName.match(SUPPORTED_EXT)?.[1]?.toLowerCase();
      if (!ext) {
        throw new BadRequestException(
          `"${doc.title}" is a ${doc.fileName.split('.').pop()} file; DocuSign envelopes take PDF, Word, text or image files`,
        );
      }
      const { body } = await this.documents.download(accountId, id);
      const buffer = await readAll(body);
      total += buffer.length;
      if (total > MAX_ENVELOPE_BYTES) {
        throw new BadRequestException(
          'The selected documents exceed 25MB in total',
        );
      }
      out.push({
        id: doc.id,
        title: doc.title,
        fileName: doc.fileName,
        extension: ext,
        buffer,
      });
    }
    return out;
  }

  /**
   * Who signs, with real addresses: the seller from the deal's lead, a
   * buyer from the buyer list, or a person someone named. Nobody is ever
   * substituted with a placeholder.
   */
  private async resolveRecipients(
    accountId: string,
    deal: {
      id: string;
      lead:
        | (Parameters<LeadPiiService['reveal']>[0] & {
            canonicalOwner?: string | null;
          })
        | null;
    },
    recipients: EnvelopeRecipientInput[],
  ): Promise<ResolvedSigner[]> {
    const signers: ResolvedSigner[] = [];
    const seen = new Set<string>();
    for (const [i, r] of recipients.entries()) {
      let name = r.name?.trim() ?? '';
      let email = r.email?.trim().toLowerCase() ?? '';
      let buyerId: string | undefined;
      if (r.role === 'seller') {
        if (!deal.lead) {
          throw new BadRequestException(
            'This deal has no seller lead to send to',
          );
        }
        const contact = this.pii.reveal(deal.lead);
        email = (contact.email ?? '').trim().toLowerCase();
        name = name || deal.lead.canonicalOwner?.trim() || 'Property Owner';
        if (!email) {
          throw new BadRequestException(
            'The seller has no email on file; add one to the lead before sending',
          );
        }
      } else if (r.role === 'buyer') {
        if (!r.buyerId) {
          throw new BadRequestException('A buyer recipient needs a buyerId');
        }
        const buyer = await this.prisma.buyer.findFirst({
          where: { id: r.buyerId, accountId },
          select: { id: true, name: true, emailEnc: true },
        });
        if (!buyer) throw new NotFoundException(`Buyer ${r.buyerId} not found`);
        email = buyer.emailEnc
          ? openValue(buyer.emailEnc).trim().toLowerCase()
          : '';
        name = name || buyer.name;
        buyerId = buyer.id;
        if (!email) {
          throw new BadRequestException(
            `${buyer.name} has no email on file; add one before sending`,
          );
        }
      } else if (!email || !name) {
        throw new BadRequestException(
          'Another recipient needs both a name and an email',
        );
      }
      if (seen.has(`${r.role}:${email}`)) continue;
      seen.add(`${r.role}:${email}`);
      signers.push({
        role: r.role,
        name,
        email,
        recipientId: String(i + 1),
        routingOrder: String(r.routingOrder ?? 1),
        buyerId,
      });
    }
    if (signers.length === 0) {
      throw new BadRequestException('At least one recipient is required');
    }
    return signers;
  }

  /**
   * Envelope ids are opaque but guessable across tenants, and DocuSign has no
   * notion of our tenants, so ownership is proven through contract -> deal.
   */
  private async ownedContract(envelopeId: string, accountId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { docusignEnvelopeId: envelopeId, deal: { accountId } },
      include: {
        deal: { select: { id: true, leadId: true, accountId: true } },
      },
    });
    if (!contract)
      throw new NotFoundException(`Envelope ${envelopeId} not found`);
    return contract;
  }

  /** Reads the envelope's status from DocuSign and records it on the contract. */
  async refreshStatus(envelopeId: string, accountId: string) {
    const contract = await this.ownedContract(envelopeId, accountId);
    const session = await this.session();
    const res = await fetch(this.apiUrl(session, `/envelopes/${envelopeId}`), {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (!res.ok) {
      throw new IntegrationUnavailableException(
        'docusign',
        res.status === 401 || res.status === 403
          ? 'REJECTED_CREDENTIALS'
          : 'UPSTREAM_ERROR',
        `envelope status failed: ${res.status}`,
      );
    }
    const envelope = (await res.json()) as {
      status?: string;
      statusChangedDateTime?: string;
      completedDateTime?: string;
    };
    const status = (envelope.status ?? contract.status).toLowerCase();
    const updated = await this.prisma.contract.update({
      where: { id: contract.id },
      data: { status },
    });
    if (status === 'completed') {
      await this.onEnvelopeCompleted(contract.id, accountId, {
        actorId: null,
        actorType: TimelineActorType.system,
      });
    }
    return {
      contractId: updated.id,
      envelopeId,
      status: updated.status,
      statusChangedAt: envelope.statusChangedDateTime ?? null,
      completedAt: envelope.completedDateTime ?? null,
    };
  }

  /**
   * Everyone signed: file the executed copy in the library (tolerating a
   * failed download, which a person can retry) and record what was signed.
   * A seller contract becomes an executed purchase agreement that a person
   * must verify before the deal can be marketed (docs/contract-flipping.md);
   * an assignment becomes executed and the deal assigned. The webhook, the
   * status refresh and the manual pull all come through here.
   */
  async onEnvelopeCompleted(
    contractId: string,
    accountId: string,
    actor: { actorId: string | null; actorType: TimelineActorType },
  ): Promise<{ signedDocumentId: string | null; movedToMarketing: boolean }> {
    let signedDocumentId: string | null = null;
    try {
      signedDocumentId = (await this.storeSignedCopy(contractId, accountId))
        .documentId;
    } catch (err) {
      this.logger.warn(
        `Signed copy for contract ${contractId} not stored: ${(err as Error).message}`,
      );
    }
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, deal: { accountId } },
      select: {
        id: true,
        purpose: true,
        metadata: true,
        deal: { select: { id: true, stage: true } },
      },
    });
    if (!contract) return { signedDocumentId, movedToMarketing: false };
    const roles = new Set(
      (
        ((contract.metadata ?? {}) as Partial<ContractMetadata>).recipients ??
        []
      ).map((r) => r.role),
    );
    // Envelopes sent before `purpose` existed: a seller envelope on a deal
    // under contract is the purchase agreement, as the old flow assumed.
    const purpose =
      contract.purpose ??
      (roles.has('seller') && !roles.has('buyer')
        ? 'purchase_agreement'
        : 'other');
    if (purpose === 'purchase_agreement') {
      if (!contract.purpose) {
        await this.agreements.onEnvelopeSent(
          accountId,
          contract.deal.id,
          contract.id,
          null,
        );
      }
      await this.agreements.onEnvelopeCompleted(
        accountId,
        contract.id,
        signedDocumentId,
        actor,
      );
    } else if (purpose === 'assignment') {
      await this.assignments.onEnvelopeCompleted(
        accountId,
        contract.id,
        signedDocumentId,
        actor,
      );
    }
    return { signedDocumentId, movedToMarketing: false };
  }

  async downloadPDF(envelopeId: string, accountId: string): Promise<Buffer> {
    await this.ownedContract(envelopeId, accountId);
    const session = await this.session();
    const res = await fetch(
      this.apiUrl(session, `/envelopes/${envelopeId}/documents/combined`),
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: 'application/pdf',
        },
      },
    );
    if (!res.ok) {
      throw new IntegrationUnavailableException(
        'docusign',
        'UPSTREAM_ERROR',
        `signed document download failed: ${res.status}`,
      );
    }
    return Buffer.from(await res.arrayBuffer());
  }

  /**
   * The signed, combined PDF into the documents library, on the deal and
   * its lead, carrying the source documents' checklist tags so the
   * compliance checklist sees the executed copy. Idempotent per contract.
   */
  async storeSignedCopy(contractId: string, accountId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, deal: { accountId } },
      include: { deal: { select: { id: true, leadId: true } } },
    });
    if (!contract)
      throw new NotFoundException(`Contract ${contractId} not found`);
    const metadata = (contract.metadata ??
      {}) as unknown as Partial<ContractMetadata>;
    if (metadata.signedDocumentId) {
      return { documentId: metadata.signedDocumentId, alreadyStored: true };
    }
    if (!contract.docusignEnvelopeId) {
      throw new BadRequestException('Contract has no DocuSign envelope');
    }
    const pdf = await this.downloadPDF(contract.docusignEnvelopeId, accountId);

    const sourceIds = (metadata.documents ?? []).map((d) => d.id);
    const sources = sourceIds.length
      ? await this.prisma.document.findMany({
          where: { id: { in: sourceIds }, accountId },
          select: { tags: true, jurisdiction: true },
        })
      : [];
    const tags = new Set<string>(['signed', 'docusign']);
    for (const s of sources) {
      for (const t of s.tags) if (t.startsWith('checklist:')) tags.add(t);
    }
    const jurisdiction =
      sources.find((s) => s.jurisdiction)?.jurisdiction ?? undefined;
    const title = `Signed: ${metadata.emailSubject ?? 'DocuSign envelope'}`;
    const doc = await this.documents.create(
      accountId,
      'system:docusign',
      {
        category: 'contract',
        title,
        description: `Executed copy of DocuSign envelope ${contract.docusignEnvelopeId}`,
        dealId: contract.deal.id,
        leadId: contract.deal.leadId ?? undefined,
        jurisdiction,
        tags: Array.from(tags),
      },
      {
        originalname: `signed-${contract.docusignEnvelopeId}.pdf`,
        mimetype: 'application/pdf',
        size: pdf.length,
        buffer: pdf,
      },
    );
    await this.prisma.contract.update({
      where: { id: contract.id },
      data: {
        status: 'completed',
        pdfUrl: `document:${doc.id}`,
        metadata: {
          ...metadata,
          signedDocumentId: doc.id,
        } as unknown as Prisma.InputJsonObject,
      },
    });
    await this.timelineService.appendEvent({
      tenantId: accountId,
      entityType: TimelineEntityType.DEAL,
      entityId: contract.deal.id,
      eventType: 'DOCUSIGN_SIGNED_COPY_STORED',
      payload: { contractId: contract.id, documentId: doc.id, title },
      actorId: null,
      actorType: TimelineActorType.system,
    });
    return { documentId: doc.id, alreadyStored: false };
  }
}

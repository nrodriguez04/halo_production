import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TEMPLATE_FIELDS,
  fillTemplate,
  formatDate,
  formatMoney,
  templatePlaceholders,
  type AgreementKind,
} from '@halo/shared';
import type { Readable } from 'stream';
import { PrismaService } from '../prisma.service';
import { TimelineService } from '../timeline/timeline.service';
import { AuditService } from '../audit/audit.service';
import { DocumentsService } from '../documents/documents.service';
import { normalizeState } from '../compliance/disclosure-gate.service';
import { DispositionEligibilityService } from './eligibility.service';
import { dealEvent } from './timeline-events';

export const TEMPLATE_REVIEWED_TAG = 'template:reviewed';
export const templateTag = (kind: AgreementKind) => `template:${kind}`;

/** Only plain text can be filled without a document library; DocuSign takes .txt. */
const TEXT_TEMPLATE = /\.txt$/i;

const KIND_LABEL: Record<AgreementKind, string> = {
  purchase_agreement: 'Purchase agreement',
  assignment: 'Assignment of contract',
};

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream)
    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

/**
 * Agreements from reviewed templates (docs/contract-flipping.md s3): the
 * Contract role, deterministic. A person marks a library template reviewed
 * for a kind and a state; Halo fills its blanks from verified records and
 * files the result as a draft in the documents library, ready to send for
 * signature through the existing DocuSign flow. A template with a blank
 * Halo does not know, or a value Halo does not have, is refused whole.
 */
@Injectable()
export class AgreementDraftingService {
  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
    private audit: AuditService,
    private documents: DocumentsService,
    private eligibility: DispositionEligibilityService,
  ) {}

  /** Every agreement template in the library, with its review status. */
  async listTemplates(accountId: string) {
    const docs = await this.prisma.document.findMany({
      where: { accountId, status: 'active', category: 'agreement_template' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        fileName: true,
        jurisdiction: true,
        tags: true,
        createdAt: true,
      },
    });
    return docs.map((d) => ({
      ...d,
      fillable: TEXT_TEMPLATE.test(d.fileName),
      reviewed: d.tags.includes(TEMPLATE_REVIEWED_TAG),
      kinds: (['purchase_agreement', 'assignment'] as AgreementKind[]).filter(
        (k) => d.tags.includes(templateTag(k)),
      ),
    }));
  }

  /** The reviewed templates usable for a deal: its state's first, then any marked for every state. */
  async templatesForDeal(
    accountId: string,
    dealId: string,
    kind: AgreementKind,
  ) {
    const state = await this.dealState(accountId, dealId);
    const all = (await this.listTemplates(accountId)).filter(
      (t) =>
        t.reviewed &&
        t.fillable &&
        t.kinds.includes(kind) &&
        (t.jurisdiction === state || t.jurisdiction == null),
    );
    return all.sort(
      (a, b) =>
        Number(b.jurisdiction === state) - Number(a.jurisdiction === state),
    );
  }

  /**
   * A person (with counsel) marks a text template reviewed for a kind. The
   * blanks are checked now, so a reviewed template never asks for a field
   * Halo cannot fill.
   */
  async reviewTemplate(
    accountId: string,
    documentId: string,
    userId: string,
    input: { kind: AgreementKind; jurisdiction?: string | null },
  ) {
    const doc = await this.documents.get(accountId, documentId);
    if (doc.category !== 'agreement_template') {
      throw new BadRequestException(
        'Only an agreement template can be reviewed as one.',
      );
    }
    if (!TEXT_TEMPLATE.test(doc.fileName)) {
      throw new BadRequestException(
        'Halo fills plain-text templates (.txt) with {{field}} blanks. Save the reviewed wording as a .txt file and upload it.',
      );
    }
    const text = (
      await readAll((await this.documents.download(accountId, documentId)).body)
    ).toString('utf8');
    const used = templatePlaceholders(text);
    const unknown = used.filter((f) => !(f in TEMPLATE_FIELDS[input.kind]));
    if (unknown.length) {
      throw new BadRequestException({
        code: 'TEMPLATE_UNKNOWN_FIELDS',
        message: `The template uses blanks Halo cannot fill: ${unknown.join(', ')}. Use: ${Object.keys(TEMPLATE_FIELDS[input.kind]).join(', ')}.`,
        unknown,
      });
    }
    const tags = new Set(doc.tags);
    tags.add(TEMPLATE_REVIEWED_TAG);
    tags.add(templateTag(input.kind));
    const jurisdiction =
      input.jurisdiction === undefined
        ? doc.jurisdiction
        : input.jurisdiction
          ? input.jurisdiction.toUpperCase()
          : null;
    const updated = await this.prisma.document.update({
      where: { id: doc.id },
      data: { tags: Array.from(tags), jurisdiction },
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'agreement_template.review',
      resource: `document:${doc.id}`,
      details: { kind: input.kind, jurisdiction, fields: used },
    });
    return { id: updated.id, kind: input.kind, jurisdiction, fields: used };
  }

  /**
   * Generate a draft agreement for the deal. A purchase agreement is filled
   * from the recorded (not yet executed) seller contract; an assignment from
   * the assignment a person approved, and only while the deal may be
   * assigned.
   */
  async generate(
    accountId: string,
    dealId: string,
    userId: string,
    input: { kind: AgreementKind; templateDocumentId?: string },
  ) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
      include: {
        property: true,
        lead: {
          select: { id: true, canonicalOwner: true, canonicalState: true },
        },
        closingFile: { select: { closingAgentCompany: true } },
      },
    });
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);
    const state = normalizeState(
      deal.property?.state ?? deal.lead?.canonicalState ?? null,
    );

    const template = input.templateDocumentId
      ? (await this.templatesForDeal(accountId, dealId, input.kind)).find(
          (t) => t.id === input.templateDocumentId,
        )
      : (await this.templatesForDeal(accountId, dealId, input.kind))[0];
    if (!template) {
      throw new BadRequestException({
        code: 'NO_REVIEWED_TEMPLATE',
        message: `There is no reviewed ${KIND_LABEL[input.kind].toLowerCase()} template for ${state ?? 'this state'}. Upload the wording counsel approved as a text file (category: agreement template) and mark it reviewed on the State Rules page.`,
      });
    }

    const values = await this.values(accountId, deal, input.kind);
    const text = (
      await readAll(
        (await this.documents.download(accountId, template.id)).body,
      )
    ).toString('utf8');
    const filled = fillTemplate(input.kind, text, values);
    if (filled.unknown.length || filled.missing.length) {
      const labels = filled.missing.map(
        (f) => TEMPLATE_FIELDS[input.kind][f] ?? f,
      );
      throw new BadRequestException({
        code: 'TEMPLATE_INCOMPLETE',
        message: [
          filled.missing.length
            ? `Missing on the record: ${labels.join('; ')}.`
            : '',
          filled.unknown.length
            ? `The template uses blanks Halo cannot fill: ${filled.unknown.join(', ')}.`
            : '',
        ]
          .filter(Boolean)
          .join(' '),
        missing: filled.missing,
        unknown: filled.unknown,
      });
    }

    const header = `DRAFT generated by Halo from template "${template.title}" on ${new Date().toISOString().slice(0, 10)}. Review before sending.\n\n`;
    const buffer = Buffer.from(header + filled.text, 'utf8');
    const address = deal.property?.address ?? deal.id;
    const doc = await this.documents.create(
      accountId,
      userId,
      {
        category: 'contract',
        title: `DRAFT ${KIND_LABEL[input.kind]} - ${address}`,
        description: `Filled from reviewed template ${template.id}; fields: ${filled.used.join(', ')}`,
        dealId: deal.id,
        leadId: deal.leadId ?? undefined,
        jurisdiction: state ?? undefined,
        tags: [
          'generated',
          `draft:${input.kind}`,
          `generated_from:${template.id}`,
        ],
      },
      {
        originalname: `${input.kind}-${deal.id}.txt`,
        mimetype: 'text/plain',
        size: buffer.length,
        buffer,
      },
    );
    await dealEvent(
      this.timeline,
      accountId,
      deal.id,
      'AGREEMENT_GENERATED',
      {
        kind: input.kind,
        documentId: doc.id,
        templateId: template.id,
        fields: filled.used,
      },
      userId,
    );
    return {
      documentId: doc.id,
      title: doc.title,
      templateId: template.id,
      fields: filled.used,
    };
  }

  private async values(
    accountId: string,
    deal: {
      id: string;
      leadId: string | null;
      property: {
        address: string;
        city: string;
        state: string;
        zip: string;
      } | null;
      lead: { canonicalOwner: string | null } | null;
      closingFile: { closingAgentCompany: string | null } | null;
    },
    kind: AgreementKind,
  ): Promise<Record<string, string | null>> {
    const entity = process.env.HALO_CONTRACTING_ENTITY?.trim() || null;
    const common = {
      effective_date: formatDate(new Date()),
      seller_name: deal.lead?.canonicalOwner ?? null,
      property_address: deal.property?.address ?? null,
      property_city: deal.property?.city ?? null,
      property_state: deal.property?.state ?? null,
      property_zip: deal.property?.zip ?? null,
    };
    const agreement = await this.eligibility.currentAgreement(
      accountId,
      deal.id,
    );
    if (kind === 'purchase_agreement') {
      if (!agreement || !['draft', 'sent'].includes(agreement.status)) {
        throw new BadRequestException(
          agreement
            ? `The seller contract is ${agreement.status}; a purchase agreement is generated from recorded terms before it is signed.`
            : 'Record the purchase terms on the Contract tab first: the agreement is filled from them.',
        );
      }
      return {
        ...common,
        buyer_entity: entity,
        purchase_price: formatMoney(agreement.purchasePrice),
        earnest_money: formatMoney(agreement.earnestMoneyAmount),
        earnest_money_due: formatDate(agreement.earnestMoneyDueAt),
        inspection_ends: formatDate(agreement.inspectionEndsAt),
        closing_deadline: formatDate(agreement.closingDeadline),
      };
    }
    const assignment = await this.prisma.assignmentAgreement.findFirst({
      where: { accountId, dealId: deal.id, status: 'draft' },
      orderBy: { createdAt: 'desc' },
    });
    if (!assignment) {
      throw new BadRequestException(
        'There is no approved assignment to draft: accept an offer first.',
      );
    }
    await this.eligibility.assertEligible(
      accountId,
      deal.id,
      'drafting an assignment',
    );
    const buyer = await this.prisma.buyer.findFirst({
      where: { id: assignment.buyerId, accountId },
      select: { name: true, company: true },
    });
    return {
      ...common,
      assignor_entity: entity,
      assignee_name: buyer
        ? buyer.company
          ? `${buyer.company} (${buyer.name})`
          : buyer.name
        : null,
      original_contract_date: formatDate(agreement?.executedAt ?? null),
      original_purchase_price: formatMoney(agreement?.purchasePrice ?? null),
      assignment_price: formatMoney(assignment.assignmentPrice),
      assignment_fee: formatMoney(assignment.assignmentFee),
      buyer_deposit: formatMoney(assignment.buyerDepositAmount),
      buyer_deposit_due: formatDate(assignment.buyerDepositDueAt),
      closing_deadline: formatDate(agreement?.closingDeadline ?? null),
      closing_agent: deal.closingFile?.closingAgentCompany ?? null,
    };
  }

  private async dealState(accountId: string, dealId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
      select: {
        property: { select: { state: true } },
        lead: { select: { canonicalState: true } },
      },
    });
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);
    return normalizeState(
      deal.property?.state ?? deal.lead?.canonicalState ?? null,
    );
  }
}

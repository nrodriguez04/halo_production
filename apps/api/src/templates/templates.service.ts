import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  JURISDICTION_CODES,
  REQUIRED_TEMPLATE_FIELDS,
  TEMPLATE_FIELDS,
  TEMPLATE_KINDS,
  TEMPLATE_KIND_LABEL,
  checkTemplateFields,
  deadlineFrom,
  formatDate,
  formatMoney,
  jurisdiction,
  missingValues,
  toJurisdictionCode,
  type MarketActivity,
  type TemplateKind,
} from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { DocumentsService } from '../documents/documents.service';
import { DispositionEligibilityService } from '../disposition/eligibility.service';
import { MarketsService } from '../markets/markets.service';
import { TemplateCatalogService } from '../markets/template-catalog.service';
import { dealEvent } from '../disposition/timeline-events';
import {
  DOCX_MIME,
  TemplateFileError,
  buildDocx,
  docxToPdf,
  formatOf,
  pdfConverterUrl,
  plainText,
  readFields,
  render,
  sha256,
  textToPdf,
  type TemplateFormat,
} from './template-files';
import { STARTER_SCAFFOLDS } from './starter-scaffolds';

export const STARTER_TAG = 'starter_scaffold';

/** The market activity each kind of document belongs to. */
const KIND_ACTIVITY: Record<TemplateKind, MarketActivity | 'assignment_gate'> =
  {
    purchase_agreement: 'seller_contracting',
    seller_disclosure: 'seller_contracting',
    cancellation_notice: 'seller_contracting',
    notice: 'seller_contracting',
    buyer_disclosure: 'buyer_marketing',
    assignment_agreement: 'assignment_gate',
  };

function badFile(err: unknown): never {
  if (err instanceof TemplateFileError) {
    throw new BadRequestException({
      code: 'TEMPLATE_FILE_INVALID',
      message: err.message,
      problems: err.problems,
    });
  }
  throw err;
}

/**
 * Document templates (docs/markets.md s6): counsel's purchase agreements,
 * assignments, disclosures and notices, as versioned .docx or .txt files.
 * A version is checked when uploaded, approved by a person for named
 * jurisdictions on counsel's say-so, and only then used to generate
 * documents for deals in those jurisdictions. A generated document is a
 * draft a person reads before sending it for signature.
 */
@Injectable()
export class TemplatesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private timeline: TimelineService,
    private documents: DocumentsService,
    private catalog: TemplateCatalogService,
    private markets: MarketsService,
    private eligibility: DispositionEligibilityService,
  ) {}

  registry() {
    return TEMPLATE_KINDS.map((kind) => ({
      kind,
      label: TEMPLATE_KIND_LABEL[kind],
      fields: Object.entries(TEMPLATE_FIELDS[kind]).map(
        ([key, description]) => ({
          key,
          description,
          required: REQUIRED_TEMPLATE_FIELDS[kind].includes(key),
        }),
      ),
    }));
  }

  async list(accountId: string) {
    const templates = await this.prisma.documentTemplate.findMany({
      where: { accountId },
      orderBy: [{ retiredAt: 'asc' }, { kind: 'asc' }, { name: 'asc' }],
      include: { versions: { orderBy: { version: 'desc' } } },
    });
    const docIds = templates.flatMap((t) =>
      t.versions.map((v) => v.documentId),
    );
    const docs = await this.prisma.document.findMany({
      where: { accountId, id: { in: docIds } },
      select: { id: true, title: true, fileName: true, tags: true },
    });
    return {
      pdfConverter: !!pdfConverterUrl(),
      templates: templates.map((t) => ({
        ...t,
        starter: t.versions.some((v) =>
          docs.find((d) => d.id === v.documentId)?.tags.includes(STARTER_TAG),
        ),
        versions: t.versions.map((v) => ({
          ...v,
          document: docs.find((d) => d.id === v.documentId) ?? null,
        })),
      })),
    };
  }

  private states(list: string[]): string[] {
    const out = new Set<string>();
    for (const s of list) {
      if (s.toUpperCase() === 'ALL') {
        out.add('ALL');
        continue;
      }
      const code = toJurisdictionCode(s);
      if (!code)
        throw new BadRequestException(
          `"${s}" is not one of the 50 states or DC.`,
        );
      out.add(code);
    }
    return Array.from(out).sort();
  }

  async create(
    accountId: string,
    userId: string,
    input: {
      kind: TemplateKind;
      name: string;
      description?: string | null;
      disclosureKey?: string | null;
      documentId: string;
      states: string[];
      notes?: string | null;
    },
  ) {
    const states = this.states(input.states);
    const template = await this.prisma.documentTemplate.create({
      data: {
        accountId,
        kind: input.kind,
        name: input.name,
        description: input.description ?? null,
        disclosureKey: input.disclosureKey ?? null,
        createdBy: userId,
      },
    });
    try {
      const version = await this.addVersionTo(accountId, template, userId, {
        documentId: input.documentId,
        states,
        notes: input.notes,
      });
      return { template, version };
    } catch (err) {
      await this.prisma.documentTemplate.delete({ where: { id: template.id } });
      throw err;
    }
  }

  async addVersion(
    accountId: string,
    templateId: string,
    userId: string,
    input: { documentId: string; states: string[]; notes?: string | null },
  ) {
    const template = await this.prisma.documentTemplate.findFirst({
      where: { id: templateId, accountId },
    });
    if (!template) throw new NotFoundException('Template not found');
    if (template.retiredAt)
      throw new BadRequestException('The template is retired.');
    return this.addVersionTo(accountId, template, userId, {
      ...input,
      states: this.states(input.states),
    });
  }

  /**
   * Read the file's merge fields and check them against the registry. A
   * version with an unknown field, or missing one its kind requires, is
   * kept as a draft that cannot be approved.
   */
  private async addVersionTo(
    accountId: string,
    template: { id: string; kind: string; name: string },
    userId: string,
    input: { documentId: string; states: string[]; notes?: string | null },
  ) {
    const { doc, buffer } = await this.catalog.loadFile(
      accountId,
      input.documentId,
    );
    const format = formatOf(doc.fileName);
    if (!format) {
      throw new BadRequestException(
        'A template must be a Word document (.docx) or a text file (.txt) with {{field}} blanks.',
      );
    }
    let fields: string[];
    try {
      fields = readFields(format, buffer);
    } catch (err) {
      badFile(err);
    }
    const kind = template.kind as TemplateKind;
    const { unknown, missingRequired } = checkTemplateFields(kind, fields);
    const last = await this.prisma.documentTemplateVersion.findFirst({
      where: { templateId: template.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = await this.prisma.documentTemplateVersion.create({
      data: {
        accountId,
        templateId: template.id,
        version: (last?.version ?? 0) + 1,
        documentId: doc.id,
        format,
        sha256: sha256(buffer),
        fields,
        unknownFields: unknown,
        missingRequired,
        states: input.states,
        status:
          unknown.length || missingRequired.length ? 'draft' : 'validated',
        notes: input.notes ?? null,
        createdBy: userId,
      },
    });
    await this.catalog.markChanged(accountId, input.states);
    await this.audit.log({
      accountId,
      userId,
      action: 'template.version.create',
      resource: `template:${template.id}`,
      details: {
        version: version.version,
        kind,
        states: input.states,
        fields,
        unknown,
        missingRequired,
        sha256: version.sha256,
      },
    });
    return version;
  }

  /**
   * Counsel approved this version for these jurisdictions. Refused for a
   * draft, a starter scaffold, or a file that changed since upload.
   */
  async approve(
    accountId: string,
    versionId: string,
    userId: string,
    input: {
      counselName: string;
      counselFirm?: string | null;
      approvalDocumentId: string;
      attest: boolean;
      states?: string[];
    },
  ) {
    const v = await this.version(accountId, versionId);
    if (v.status !== 'validated') {
      throw new BadRequestException(
        v.status === 'draft'
          ? `This version cannot be approved: ${[...v.unknownFields.map((f) => `unknown field {{${f}}}`), ...v.missingRequired.map((f) => `missing {{${f}}}`)].join(', ')}.`
          : `This version is ${v.status}.`,
      );
    }
    if (!input.attest)
      throw new BadRequestException('Confirm that counsel approved this text.');
    const states = input.states ? this.states(input.states) : v.states;
    if (!states.length)
      throw new BadRequestException(
        'Name the jurisdictions counsel approved it for.',
      );
    const { doc, buffer } = await this.catalog.loadFile(
      accountId,
      v.documentId,
    );
    if (doc.tags.includes(STARTER_TAG)) {
      throw new BadRequestException(
        "A starter scaffold is not legal text. Upload counsel's version as a new version and approve that.",
      );
    }
    if (sha256(buffer) !== v.sha256) {
      throw new BadRequestException(
        'The file changed after it was uploaded. Upload it again as a new version.',
      );
    }
    const approval = await this.prisma.document.findFirst({
      where: { id: input.approvalDocumentId, accountId, status: 'active' },
      select: { id: true },
    });
    if (!approval)
      throw new BadRequestException(
        "Counsel's approval is not in the documents library.",
      );
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      // The newest approval supersedes earlier ones of the same template.
      await tx.documentTemplateVersion.updateMany({
        where: {
          templateId: v.templateId,
          status: 'approved',
          id: { not: v.id },
        },
        data: { status: 'retired', retiredAt: now },
      });
      return tx.documentTemplateVersion.update({
        where: { id: v.id },
        data: {
          status: 'approved',
          states,
          counselName: input.counselName,
          counselFirm: input.counselFirm ?? null,
          approvalDocumentId: input.approvalDocumentId,
          attestation:
            'Counsel approved this text for use in the jurisdictions listed.',
          approvedBy: userId,
          approvedAt: now,
        },
      });
    });
    await this.catalog.markChanged(
      accountId,
      Array.from(new Set([...states, ...v.states])),
    );
    await this.audit.log({
      accountId,
      userId,
      action: 'template.version.approve',
      resource: `template:${v.templateId}`,
      details: {
        version: v.version,
        versionId: v.id,
        states,
        counselName: input.counselName,
        counselFirm: input.counselFirm ?? null,
        approvalDocumentId: input.approvalDocumentId,
        sha256: v.sha256,
      },
    });
    return updated;
  }

  async retire(
    accountId: string,
    versionId: string,
    userId: string,
    reason: string,
  ) {
    const v = await this.version(accountId, versionId);
    const updated = await this.prisma.documentTemplateVersion.update({
      where: { id: v.id },
      data: {
        status: 'retired',
        retiredAt: new Date(),
        notes: [v.notes, `Retired: ${reason}`].filter(Boolean).join('\n'),
      },
    });
    await this.catalog.markChanged(accountId, v.states);
    await this.audit.log({
      accountId,
      userId,
      action: 'template.version.retire',
      resource: `template:${v.templateId}`,
      details: { version: v.version, reason },
    });
    return updated;
  }

  private async version(accountId: string, id: string) {
    const v = await this.prisma.documentTemplateVersion.findFirst({
      where: { id, accountId },
    });
    if (!v) throw new NotFoundException('Template version not found');
    return v;
  }

  /**
   * Install the starter scaffolds: the merge-field layout of each document,
   * every clause left for counsel. They apply to no jurisdiction and
   * cannot be approved; counsel's upload replaces them.
   */
  async installStarters(accountId: string, userId: string) {
    const existing = await this.prisma.documentTemplate.findMany({
      where: {
        accountId,
        retiredAt: null,
        name: { in: STARTER_SCAFFOLDS.map((s) => s.name) },
      },
      select: { name: true },
    });
    const installed: string[] = [];
    for (const s of STARTER_SCAFFOLDS) {
      if (existing.some((e) => e.name === s.name)) continue;
      const buffer = buildDocx(s.blocks);
      const doc = await this.documents.create(
        accountId,
        userId,
        {
          category: 'agreement_template',
          title: `${s.name} (NOT LEGAL TEXT)`,
          description:
            'Starter scaffold generated by Halo: merge fields only. Counsel writes the clauses.',
          tags: [STARTER_TAG, `template:${s.kind}`],
        },
        {
          originalname: `${s.kind}-starter-scaffold.docx`,
          mimetype: DOCX_MIME,
          size: buffer.length,
          buffer,
        },
      );
      await this.create(accountId, userId, {
        kind: s.kind,
        name: s.name,
        description:
          'Starter scaffold: not legal text, applies to no jurisdiction, cannot be approved.',
        documentId: doc.id,
        states: [],
      });
      installed.push(s.name);
    }
    return { installed, skipped: STARTER_SCAFFOLDS.length - installed.length };
  }

  /** The approved templates a deal can generate from, by kind. */
  async forDeal(accountId: string, dealId: string) {
    const deal = await this.deal(accountId, dealId);
    if (!deal.state) return { state: null, templates: [] };
    const applicable = this.catalog.forState(
      await this.catalog.usable(accountId),
      deal.state,
    );
    return {
      state: deal.state,
      templates: applicable.filter((t) => t.status === 'approved'),
    };
  }

  /**
   * Generate a document for a deal from the approved template for its
   * jurisdiction. Refused when the market does not allow the activity the
   * document belongs to, when no approved template applies, or when any
   * merge value is missing. The result is filed as a draft, with a PDF.
   */
  async generate(
    accountId: string,
    dealId: string,
    userId: string,
    input: {
      kind: TemplateKind;
      disclosureKey?: string | null;
      buyerId?: string | null;
    },
  ) {
    const deal = await this.deal(accountId, dealId);
    const label = TEMPLATE_KIND_LABEL[input.kind];
    const activity = KIND_ACTIVITY[input.kind];
    if (activity === 'assignment_gate') {
      await this.eligibility.assertEligible(
        accountId,
        deal.id,
        'drafting an assignment',
      );
    } else {
      await this.markets.assertAllowed(
        accountId,
        deal.state,
        activity,
        `Generating a ${label.toLowerCase()}`,
      );
    }
    const version = deal.state
      ? await this.catalog.selectApproved(
          accountId,
          input.kind,
          deal.state,
          input.disclosureKey,
        )
      : null;
    if (!version) {
      throw new BadRequestException({
        code: 'NO_APPROVED_TEMPLATE',
        message: `There is no counsel-approved ${label.toLowerCase()} template for ${deal.state ?? 'this property'}. Upload counsel's version on the Templates page and approve it for ${deal.state ?? 'the state'}.`,
      });
    }
    const v = await this.version(accountId, version.versionId);
    const values = await this.values(
      accountId,
      deal,
      input.kind,
      input.buyerId ?? null,
    );
    const missing = missingValues(v.fields, values);
    if (missing.length) {
      throw new BadRequestException({
        code: 'TEMPLATE_INCOMPLETE',
        message: `Missing on the record: ${missing.map((f) => TEMPLATE_FIELDS[input.kind][f] ?? f).join('; ')}.`,
        missing,
      });
    }
    const { buffer: source } = await this.catalog.loadFile(
      accountId,
      v.documentId,
    );
    if (sha256(source) !== v.sha256) {
      throw new BadRequestException(
        'The approved template file no longer matches what was approved. Upload and approve it again.',
      );
    }
    const format = v.format as TemplateFormat;
    let filled: Buffer;
    try {
      filled = render(format, source, values as Record<string, string>);
    } catch (err) {
      badFile(err);
    }
    const address = deal.address ?? deal.id;
    const title = `DRAFT ${label} - ${address}`;
    const category =
      input.kind === 'purchase_agreement' ||
      input.kind === 'assignment_agreement'
        ? 'contract'
        : 'disclosure';
    const tags = [
      'generated',
      `template:${input.kind}`,
      `template_version:${v.id}`,
    ];
    const doc = await this.documents.create(
      accountId,
      userId,
      {
        category,
        title,
        description: `Generated from ${version.name} v${v.version} (approved ${v.approvedAt?.toISOString().slice(0, 10)}). A person reviews it before it is sent.`,
        dealId: deal.id,
        leadId: deal.leadId ?? undefined,
        buyerId: input.buyerId ?? undefined,
        jurisdiction: deal.state ?? undefined,
        tags,
      },
      {
        originalname: `${input.kind}-${deal.id}.${format}`,
        mimetype: format === 'docx' ? DOCX_MIME : 'text/plain',
        size: filled.length,
        buffer: filled,
      },
    );
    let pdfDocumentId: string | null = null;
    let pdfNote: string | null = null;
    try {
      const pdf =
        format === 'txt'
          ? await textToPdf(plainText('txt', filled), title)
          : pdfConverterUrl()
            ? await docxToPdf(filled, `${input.kind}.docx`)
            : null;
      if (pdf) {
        const pdfDoc = await this.documents.create(
          accountId,
          userId,
          {
            category,
            title: `${title} (PDF)`,
            dealId: deal.id,
            leadId: deal.leadId ?? undefined,
            jurisdiction: deal.state ?? undefined,
            tags: [...tags, 'pdf'],
          },
          {
            originalname: `${input.kind}-${deal.id}.pdf`,
            mimetype: 'application/pdf',
            size: pdf.length,
            buffer: pdf,
          },
        );
        pdfDocumentId = pdfDoc.id;
      } else {
        pdfNote =
          'No PDF: converting Word documents needs PDF_CONVERTER_URL. DocuSign accepts the .docx as it is.';
      }
    } catch (err) {
      pdfNote = `The PDF could not be made: ${(err as Error).message}`;
    }
    const generation = await this.prisma.documentGeneration.create({
      data: {
        accountId,
        dealId: deal.id,
        templateVersionId: v.id,
        kind: input.kind,
        state: deal.state,
        values: values as Prisma.InputJsonObject,
        documentId: doc.id,
        pdfDocumentId,
        sha256: sha256(filled),
        createdBy: userId,
      },
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'template.generate',
      resource: `deal:${deal.id}`,
      details: {
        kind: input.kind,
        versionId: v.id,
        version: v.version,
        documentId: doc.id,
        pdfDocumentId,
        generationId: generation.id,
      },
    });
    await dealEvent(
      this.timeline,
      accountId,
      deal.id,
      'AGREEMENT_GENERATED',
      {
        kind: input.kind,
        documentId: doc.id,
        pdfDocumentId,
        templateVersionId: v.id,
        fields: v.fields,
      },
      userId,
    );
    return {
      generationId: generation.id,
      documentId: doc.id,
      pdfDocumentId,
      pdfNote,
      title,
      templateVersionId: v.id,
      fields: v.fields,
    };
  }

  private async deal(accountId: string, dealId: string) {
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
    return {
      ...deal,
      state: toJurisdictionCode(
        deal.property?.state ?? deal.lead?.canonicalState ?? null,
      ),
      address: deal.property?.address ?? null,
    };
  }

  /** The merge values for a kind, from Halo's records. Missing ones are null. */
  private async values(
    accountId: string,
    deal: Awaited<ReturnType<TemplatesService['deal']>>,
    kind: TemplateKind,
    buyerId: string | null,
  ): Promise<Record<string, string | null>> {
    const entity = process.env.HALO_CONTRACTING_ENTITY?.trim() || null;
    const agreement = await this.eligibility.currentAgreement(
      accountId,
      deal.id,
    );
    const market = await this.markets.evaluate(accountId, deal.state);
    const cancel =
      market?.approved?.deadlines.find(
        (d) =>
          d.effect === 'seller_may_cancel' && d.trigger === 'seller_signed',
      ) ?? null;
    const cancelDays = cancel
      ? `${cancel.days} ${cancel.businessDays ? 'business' : 'calendar'} day${cancel.days === 1 ? '' : 's'}`
      : null;
    const tz = deal.state ? jurisdiction(deal.state)?.timeZone : null;
    const common: Record<string, string | null> = {
      effective_date: formatDate(new Date()),
      seller_name: deal.lead?.canonicalOwner ?? null,
      property_address: deal.property?.address ?? null,
      property_city: deal.property?.city ?? null,
      property_state: deal.property?.state ?? null,
      property_zip: deal.property?.zip ?? null,
      property_county: null,
      property_apn: deal.property?.apn ?? null,
    };
    const recipient = buyerId
      ? await this.prisma.buyer.findFirst({
          where: { id: buyerId, accountId },
          select: { name: true, company: true },
        })
      : null;
    const buyerName = (b: { name: string; company: string | null } | null) =>
      b ? (b.company ? `${b.company} (${b.name})` : b.name) : null;

    switch (kind) {
      case 'purchase_agreement': {
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
          seller_cancellation_days: cancelDays,
        };
      }
      case 'seller_disclosure':
        return {
          ...common,
          buyer_entity: entity,
          purchase_price: formatMoney(agreement?.purchasePrice ?? null),
          seller_cancellation_days: cancelDays,
        };
      case 'cancellation_notice': {
        const signed = agreement?.executedAt ?? null;
        const end =
          cancel && signed && tz ? deadlineFrom(signed, cancel, tz) : null;
        return {
          ...common,
          buyer_entity: entity,
          original_contract_date: formatDate(signed),
          seller_cancellation_days: cancelDays,
          cancellation_deadline: end
            ? `${formatDate(new Date(`${end.endsOn}T12:00:00Z`))}, end of day (${tz})`
            : null,
        };
      }
      case 'buyer_disclosure':
        return {
          ...common,
          assignor_entity: entity,
          recipient_name: buyerName(recipient),
          original_contract_date: formatDate(agreement?.executedAt ?? null),
          closing_deadline: formatDate(agreement?.closingDeadline ?? null),
        };
      case 'notice':
        return {
          ...common,
          buyer_entity: entity,
          recipient_name: buyerName(recipient),
          original_contract_date: formatDate(agreement?.executedAt ?? null),
        };
      case 'assignment_agreement': {
        const assignment = await this.prisma.assignmentAgreement.findFirst({
          where: { accountId, dealId: deal.id, status: 'draft' },
          orderBy: { createdAt: 'desc' },
        });
        if (!assignment)
          throw new BadRequestException(
            'There is no approved assignment to draft: accept an offer first.',
          );
        const buyer = await this.prisma.buyer.findFirst({
          where: { id: assignment.buyerId, accountId },
          select: { name: true, company: true },
        });
        return {
          ...common,
          assignor_entity: entity,
          assignee_name: buyerName(buyer),
          original_contract_date: formatDate(agreement?.executedAt ?? null),
          original_purchase_price: formatMoney(
            agreement?.purchasePrice ?? null,
          ),
          assignment_price: formatMoney(assignment.assignmentPrice),
          assignment_fee: formatMoney(assignment.assignmentFee),
          buyer_deposit: formatMoney(assignment.buyerDepositAmount),
          buyer_deposit_due: formatDate(assignment.buyerDepositDueAt),
          closing_deadline: formatDate(agreement?.closingDeadline ?? null),
          closing_agent: deal.closingFile?.closingAgentCompany ?? null,
        };
      }
    }
  }

  /** Jurisdiction codes, for the upload form. */
  jurisdictionCodes() {
    return ['ALL', ...JURISDICTION_CODES];
  }
}

import { Injectable } from '@nestjs/common';
import {
  JURISDICTION_CODES,
  sampleTemplateValues,
  type TemplateKind,
} from '@halo/shared';
import type { Readable } from 'stream';
import { PrismaService } from '../prisma.service';
import { DocumentsService } from '../documents/documents.service';
import {
  TemplateFileError,
  docxToPdf,
  pdfConverterUrl,
  plainText,
  render,
  textToPdf,
  type TemplateFormat,
} from '../templates/template-files';

export interface ApplicableTemplate {
  templateId: string;
  versionId: string;
  version: number;
  name: string;
  kind: TemplateKind;
  disclosureKey: string | null;
  status: 'validated' | 'approved';
  format: TemplateFormat;
  /** Applies to this jurisdiction by name, rather than through "ALL". */
  specific: boolean;
  approvedAt: Date | null;
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream)
    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

/**
 * Which template versions apply where, read-only. Markets ask it what a
 * jurisdiction has; generation asks it which approved version to use.
 * Kept apart from TemplatesService so the market gates do not depend on
 * document generation.
 */
@Injectable()
export class TemplateCatalogService {
  constructor(
    private prisma: PrismaService,
    private documents: DocumentsService,
  ) {}

  /** Usable versions (validated or approved) of live templates, newest first. */
  async usable(accountId: string) {
    return this.prisma.documentTemplateVersion.findMany({
      where: {
        accountId,
        status: { in: ['validated', 'approved'] },
        template: { retiredAt: null },
      },
      include: {
        template: {
          select: { id: true, name: true, kind: true, disclosureKey: true },
        },
      },
      orderBy: [{ version: 'desc' }],
    });
  }

  /** The newest version per template and status that applies to a jurisdiction. */
  forState(
    versions: Awaited<ReturnType<TemplateCatalogService['usable']>>,
    state: string,
  ): ApplicableTemplate[] {
    const seen = new Set<string>();
    const out: ApplicableTemplate[] = [];
    for (const v of versions) {
      const applies = v.states.includes(state) || v.states.includes('ALL');
      if (!applies) continue;
      const key = `${v.templateId}:${v.status}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        templateId: v.templateId,
        versionId: v.id,
        version: v.version,
        name: v.template.name,
        kind: v.template.kind as TemplateKind,
        disclosureKey: v.template.disclosureKey,
        status: v.status as 'validated' | 'approved',
        format: v.format as TemplateFormat,
        specific: v.states.includes(state),
        approvedAt: v.approvedAt,
      });
    }
    return out;
  }

  /**
   * The approved version to generate from: one written for this
   * jurisdiction before one approved for all, then the most recently
   * approved. A disclosure key narrows it to that disclosure's template
   * when one exists.
   */
  async selectApproved(
    accountId: string,
    kind: TemplateKind,
    state: string,
    disclosureKey?: string | null,
  ): Promise<ApplicableTemplate | null> {
    const all = this.forState(await this.usable(accountId), state).filter(
      (t) => t.kind === kind && t.status === 'approved',
    );
    const narrowed = disclosureKey
      ? all.filter((t) => t.disclosureKey === disclosureKey)
      : [];
    const pool = narrowed.length
      ? narrowed
      : all.filter((t) => !disclosureKey || !t.disclosureKey);
    pool.sort(
      (a, b) =>
        Number(b.specific) - Number(a.specific) ||
        (b.approvedAt?.getTime() ?? 0) - (a.approvedAt?.getTime() ?? 0),
    );
    return pool[0] ?? null;
  }

  async loadFile(accountId: string, documentId: string) {
    const doc = await this.documents.get(accountId, documentId);
    const { body } = await this.documents.download(accountId, documentId);
    return { doc, buffer: await readAll(body) };
  }

  /**
   * Record that something a market relies on changed, so its self-test is
   * out of date. "ALL" touches every market.
   */
  async markChanged(accountId: string, states: string[]) {
    const all = states.includes('ALL');
    await this.prisma.market.updateMany({
      where: {
        accountId,
        ...(all
          ? {}
          : {
              state: {
                in: states.filter((s) => JURISDICTION_CODES.includes(s)),
              },
            }),
      },
      data: { configChangedAt: new Date() },
    });
  }

  /**
   * Fill a version with synthetic values and, where possible, make its PDF.
   * Used by the market self-test; nothing is stored.
   */
  async renderSample(
    accountId: string,
    versionId: string,
    state: string,
  ): Promise<{
    ok: boolean;
    detail: string;
    pdf: 'ok' | 'skipped' | 'failed';
  }> {
    const v = await this.prisma.documentTemplateVersion.findFirst({
      where: { id: versionId, accountId },
      include: { template: { select: { kind: true, name: true } } },
    });
    if (!v)
      return {
        ok: false,
        detail: 'The template version no longer exists.',
        pdf: 'skipped',
      };
    try {
      const { buffer } = await this.loadFile(accountId, v.documentId);
      const format = v.format as TemplateFormat;
      const filled = render(
        format,
        buffer,
        sampleTemplateValues(v.template.kind as TemplateKind, state),
      );
      const text = plainText(format, filled);
      if (/\{\{/.test(text)) {
        return {
          ok: false,
          detail: `${v.template.name} v${v.version} left a blank unfilled.`,
          pdf: 'skipped',
        };
      }
      let pdf: 'ok' | 'skipped' | 'failed' = 'skipped';
      try {
        if (format === 'txt') {
          await textToPdf(text, v.template.name);
          pdf = 'ok';
        } else if (pdfConverterUrl()) {
          await docxToPdf(filled, `${v.template.name}.docx`);
          pdf = 'ok';
        }
      } catch {
        pdf = 'failed';
      }
      return {
        ok: pdf !== 'failed',
        detail:
          pdf === 'failed'
            ? `${v.template.name} v${v.version} filled, but its PDF could not be made.`
            : `${v.template.name} v${v.version} filled every blank${pdf === 'ok' ? ' and produced a PDF' : ''}.`,
        pdf,
      };
    } catch (err) {
      return {
        ok: false,
        detail: `${v.template.name} v${v.version} could not be filled: ${err instanceof TemplateFileError ? err.message : (err as Error).message}`,
        pdf: 'skipped',
      };
    }
  }
}

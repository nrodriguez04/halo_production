import { createHash } from 'crypto';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';
import { templatePlaceholders } from '@halo/shared';

/**
 * Template files: reading merge fields from .docx and .txt templates,
 * filling them, and producing PDFs (docs/markets.md s6).
 *
 * .docx is filled with docxtemplater using the same `{{field}}` blanks as
 * text templates. Sections and loops are refused: a contract is filled
 * field by field, never assembled. A PDF of a .txt document is drawn here;
 * a PDF of a .docx needs LibreOffice, reached through a Gotenberg service
 * at PDF_CONVERTER_URL.
 */

export type TemplateFormat = 'docx' | 'txt';

export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export class TemplateFileError extends Error {
  constructor(
    message: string,
    readonly problems: string[] = [],
  ) {
    super(message);
  }
}

export function formatOf(fileName: string): TemplateFormat | null {
  if (/\.docx$/i.test(fileName)) return 'docx';
  if (/\.txt$/i.test(fileName)) return 'txt';
  return null;
}

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

const DELIMITERS = { start: '{{', end: '}}' };

function explain(err: unknown): string[] {
  const e = err as {
    properties?: {
      errors?: Array<{ properties?: { explanation?: string } }>;
      explanation?: string;
    };
    message?: string;
  };
  const list = e?.properties?.errors
    ?.map((x) => x.properties?.explanation)
    .filter(Boolean) as string[] | undefined;
  if (list?.length) return list;
  if (e?.properties?.explanation) return [e.properties.explanation];
  return [e?.message ?? 'The file could not be read as a Word document.'];
}

function openDocx(
  buf: Buffer,
  parser?: (tag: string) => {
    get: (scope: Record<string, unknown>) => unknown;
  },
) {
  let zip: PizZip;
  try {
    zip = new PizZip(buf);
  } catch {
    throw new TemplateFileError('The file is not a valid .docx document.');
  }
  try {
    return new Docxtemplater(zip, {
      delimiters: DELIMITERS,
      paragraphLoop: true,
      linebreaks: true,
      ...(parser ? { parser } : {}),
      nullGetter: (part: { value?: string }) => {
        throw new TemplateFileError(`No value for {{${part.value ?? '?'}}}.`);
      },
    });
  } catch (err) {
    if (err instanceof TemplateFileError) throw err;
    const problems = explain(err);
    throw new TemplateFileError(
      `The template's merge fields are malformed: ${problems.join('; ')}.`,
      problems,
    );
  }
}

/** The merge fields a template uses. Throws when they are malformed or use sections. */
export function readFields(format: TemplateFormat, buf: Buffer): string[] {
  if (format === 'txt') {
    const text = buf.toString('utf8');
    if (/\{\{\s*[#^/]/.test(text)) {
      throw new TemplateFileError(
        'Templates may not use sections or loops ({{#...}}); use plain {{field}} blanks.',
      );
    }
    return templatePlaceholders(text);
  }
  const seen: string[] = [];
  const doc = openDocx(buf, (tag) => {
    const name = tag.trim();
    if (!seen.includes(name)) seen.push(name);
    return { get: (scope) => scope[name] };
  });
  if (/\{\{\s*[#^/]/.test(doc.getFullText())) {
    throw new TemplateFileError(
      'Templates may not use sections or loops ({{#...}}); use plain {{field}} blanks.',
    );
  }
  const bad = seen.filter((f) => !/^[a-z_][a-z0-9_]*$/.test(f));
  if (bad.length) {
    throw new TemplateFileError(
      `Merge fields must be lower-case names like {{seller_name}}: ${bad.join(', ')}.`,
      bad,
    );
  }
  return seen;
}

/** Fill a template whose fields were checked and whose values are all present. */
export function render(
  format: TemplateFormat,
  buf: Buffer,
  values: Record<string, string>,
): Buffer {
  if (format === 'txt') {
    const text = buf
      .toString('utf8')
      .replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g, (_m, f: string) => {
        const v = values[f];
        if (v == null || !String(v).trim())
          throw new TemplateFileError(`No value for {{${f}}}.`);
        return String(v);
      });
    return Buffer.from(text, 'utf8');
  }
  const doc = openDocx(buf, (tag) => {
    const name = tag.trim();
    return { get: (scope) => scope[name] };
  });
  try {
    doc.render(values);
  } catch (err) {
    if (err instanceof TemplateFileError) throw err;
    throw new TemplateFileError(
      `The template could not be filled: ${explain(err).join('; ')}.`,
    );
  }
  return doc
    .getZip()
    .generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

/** The plain text of a filled document, for checks and for PDFs of text documents. */
export function plainText(format: TemplateFormat, buf: Buffer): string {
  if (format === 'txt') return buf.toString('utf8');
  const zip = new PizZip(buf);
  const xml = zip.file('word/document.xml')?.asText() ?? '';
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// ------------------------------------------------------------ PDF

function safeText(
  font: PDFFont,
  text: string,
  cache: Map<string, string>,
): string {
  let out = '';
  for (const ch of text) {
    let c = cache.get(ch);
    if (c === undefined) {
      try {
        font.encodeText(ch);
        c = ch;
      } catch {
        c = '?';
      }
      cache.set(ch, c);
    }
    out += c;
  }
  return out;
}

/** A PDF of plain text: Letter pages, Helvetica 10pt, wrapped. */
export async function textToPdf(text: string, title: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setProducer('Halo');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const size = 10;
  const lineHeight = 13;
  const margin = 54;
  const width = 612 - margin * 2;
  const cache = new Map<string, string>();
  const lines: string[] = [];
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const para = safeText(font, raw.replace(/\t/g, '    '), cache);
    if (!para) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (font.widthOfTextAtSize(next, size) <= width || !line.trim()) {
        line = next;
      } else {
        lines.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    lines.push(line.trimEnd());
  }
  let page = pdf.addPage([612, 792]);
  let y = 792 - margin;
  for (const line of lines) {
    if (y < margin) {
      page = pdf.addPage([612, 792]);
      y = 792 - margin;
    }
    if (line) page.drawText(line, { x: margin, y, size, font });
    y -= lineHeight;
  }
  return Buffer.from(await pdf.save());
}

/** Whether a .docx can be converted to PDF here. */
export function pdfConverterUrl(): string | null {
  const url = process.env.PDF_CONVERTER_URL?.trim();
  return url ? url.replace(/\/+$/, '') : null;
}

/** A PDF of a .docx through Gotenberg's LibreOffice route. */
export async function docxToPdf(
  buf: Buffer,
  fileName: string,
): Promise<Buffer> {
  const base = pdfConverterUrl();
  if (!base)
    throw new TemplateFileError(
      'PDF conversion of Word documents is not configured (PDF_CONVERTER_URL).',
    );
  const form = new FormData();
  form.append(
    'files',
    new Blob([new Uint8Array(buf)], { type: DOCX_MIME }),
    fileName.replace(/[^\w.-]+/g, '_'),
  );
  const res = await fetch(`${base}/forms/libreoffice/convert`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new TemplateFileError(`The PDF converter answered ${res.status}.`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// ------------------------------------------------------------ building .docx

export interface DocxBlock {
  text: string;
  style?: 'title' | 'heading' | 'normal' | 'note';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A minimal Word document from paragraphs. Used for starter scaffolds. */
export function buildDocx(blocks: DocxBlock[]): Buffer {
  const para = (b: DocxBlock) => {
    const rPr =
      b.style === 'title'
        ? '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>'
        : b.style === 'heading'
          ? '<w:rPr><w:b/><w:sz w:val="24"/></w:rPr>'
          : b.style === 'note'
            ? '<w:rPr><w:i/><w:color w:val="C00000"/></w:rPr>'
            : '';
    return `<w:p><w:r>${rPr}<w:t xml:space="preserve">${esc(b.text)}</w:t></w:r></w:p>`;
  };
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${blocks.map(para).join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  );
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

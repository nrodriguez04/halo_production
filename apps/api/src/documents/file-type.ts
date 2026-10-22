import { BadRequestException } from '@nestjs/common';

/**
 * What an uploaded file really is. The extension picks the type and the
 * first bytes have to agree with it. The Content-Type the client (or an
 * inbound email) claims is never used: it is what the file would be served
 * back as, so a page named `contract.pdf` could otherwise be stored as
 * text/html.
 */
export interface UploadKind {
  ext: string;
  contentType: string;
}

const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);

const startsWith = (b: Buffer, sig: Buffer) =>
  b.length >= sig.length && b.subarray(0, sig.length).equals(sig);

/** Text: a UTF-16 byte-order mark, or no NUL bytes in the first 8 KB. */
function isText(b: Buffer): boolean {
  if (
    b.length >= 2 &&
    ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff))
  ) {
    return true;
  }
  return !b.subarray(0, 8192).includes(0);
}

const KINDS: Record<
  string,
  { contentType: string; matches: (b: Buffer) => boolean }
> = {
  // The PDF header may follow a little junk; readers look in the first 1 KB.
  pdf: {
    contentType: 'application/pdf',
    matches: (b) => b.subarray(0, 1024).includes('%PDF-'),
  },
  docx: {
    contentType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    matches: (b) => startsWith(b, ZIP),
  },
  xlsx: {
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    matches: (b) => startsWith(b, ZIP),
  },
  doc: {
    contentType: 'application/msword',
    matches: (b) => startsWith(b, OLE),
  },
  xls: {
    contentType: 'application/vnd.ms-excel',
    matches: (b) => startsWith(b, OLE),
  },
  csv: { contentType: 'text/csv; charset=utf-8', matches: isText },
  txt: { contentType: 'text/plain; charset=utf-8', matches: isText },
  png: { contentType: 'image/png', matches: (b) => startsWith(b, PNG) },
  jpg: { contentType: 'image/jpeg', matches: (b) => startsWith(b, JPEG) },
  jpeg: { contentType: 'image/jpeg', matches: (b) => startsWith(b, JPEG) },
  gif: {
    contentType: 'image/gif',
    matches: (b) =>
      ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')),
  },
  webp: {
    contentType: 'image/webp',
    matches: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
};

export const UPLOAD_EXTENSIONS = Object.keys(KINDS);

/** The file's kind, or why it is refused. */
export function detectUpload(
  name: string,
  buffer: Buffer,
): UploadKind | { refused: string } {
  const ext = /\.([a-z0-9]+)$/i.exec(name.trim())?.[1]?.toLowerCase() ?? '';
  const kind = KINDS[ext];
  if (!kind) {
    return {
      refused:
        'Unsupported file type; upload PDF, Word, Excel, CSV, text or image files',
    };
  }
  if (!kind.matches(buffer)) {
    return { refused: `The file's contents are not a .${ext} file` };
  }
  return { ext, contentType: kind.contentType };
}

/** {@link detectUpload}, throwing a 400 on refusal. */
export function assertUpload(name: string, buffer: Buffer): UploadKind {
  const kind = detectUpload(name, buffer);
  if ('refused' in kind) throw new BadRequestException(kind.refused);
  return kind;
}
